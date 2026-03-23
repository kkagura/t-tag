import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { encryptText } from '../utils/crypto';
import { writeAuditLog } from '../services/auth.service';

const listQuerySchema = z.object({
  keyword: z.string().optional(),
  tagId: z.coerce.number().int().positive().optional(),
});

const createSchema = z.object({
  title: z.string().min(1).max(120),
  account: z.string().min(1).max(256),
  password: z.string().min(1).max(256),
  note: z.string().max(5000).optional(),
  customFields: z.record(z.string()).optional(),
  tagIds: z.array(z.number().int().positive()).default([]),
});

const updateSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(120).optional(),
  account: z.string().min(1).max(256).optional(),
  password: z.string().min(1).max(256).optional(),
  note: z.string().max(5000).optional(),
  customFields: z.record(z.string()).optional(),
  tagIds: z.array(z.number().int().positive()).optional(),
});

const deleteSchema = z.object({
  id: z.number().int().positive(),
});

const vaultRoutes: FastifyPluginAsync = async (app) => {
  app.get('/vault-items', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Invalid query', errors: parsed.error.issues });
    }

    const userId = (request.user as { userId: number }).userId;
    const { keyword, tagId } = parsed.data;

    let sql = `
      SELECT vi.id, vi.title, vi.account_ciphertext, vi.password_ciphertext, vi.note_ciphertext,
             vi.custom_fields_ciphertext, vi.updated_at,
             GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR ',') AS tag_names
      FROM vault_items vi
      LEFT JOIN vault_item_tags vit ON vit.item_id = vi.id
      LEFT JOIN tags t ON t.id = vit.tag_id
      WHERE vi.user_id = ?
    `;

    const params: Array<number | string> = [userId];

    if (keyword) {
      sql += ' AND vi.title LIKE ?';
      params.push(`%${keyword}%`);
    }

    if (tagId) {
      sql += ' AND EXISTS (SELECT 1 FROM vault_item_tags x WHERE x.item_id = vi.id AND x.tag_id = ?)';
      params.push(tagId);
    }

    sql += ' GROUP BY vi.id ORDER BY vi.updated_at DESC';

    const [rows] = await app.db.query(sql, params);
    return reply.send(rows);
  });

  app.post('/vault-items', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Invalid request body', errors: parsed.error.issues });
    }

    const userId = (request.user as { userId: number }).userId;
    const payload = parsed.data;

    const [result] = await app.db.query(
      `INSERT INTO vault_items
      (user_id, title, account_ciphertext, password_ciphertext, note_ciphertext, custom_fields_ciphertext, crypto_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'v1', NOW(), NOW())`,
      [
        userId,
        payload.title,
        encryptText(payload.account),
        encryptText(payload.password),
        payload.note ? encryptText(payload.note) : null,
        payload.customFields ? encryptText(JSON.stringify(payload.customFields)) : null,
      ],
    );

    const insertId = (result as any).insertId as number;

    if (payload.tagIds.length > 0) {
      const values = payload.tagIds.map((tagId) => [insertId, tagId]);
      await app.db.query('INSERT INTO vault_item_tags (item_id, tag_id) VALUES ?', [values]);
    }

    await writeAuditLog(app, {
      userId,
      action: 'VAULT_ITEM_CREATE',
      targetType: 'vault_item',
      targetId: String(insertId),
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    });

    return reply.code(201).send({ id: insertId });
  });

  app.post('/vault-items/update', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Invalid request body', errors: parsed.error.issues });
    }

    const userId = (request.user as { userId: number }).userId;
    const { id, tagIds, ...rest } = parsed.data;

    const updates: string[] = [];
    const params: Array<string | number | null> = [];

    if (rest.title !== undefined) {
      updates.push('title = ?');
      params.push(rest.title);
    }
    if (rest.account !== undefined) {
      updates.push('account_ciphertext = ?');
      params.push(encryptText(rest.account));
    }
    if (rest.password !== undefined) {
      updates.push('password_ciphertext = ?');
      params.push(encryptText(rest.password));
    }
    if (rest.note !== undefined) {
      updates.push('note_ciphertext = ?');
      params.push(rest.note ? encryptText(rest.note) : null);
    }
    if (rest.customFields !== undefined) {
      updates.push('custom_fields_ciphertext = ?');
      params.push(encryptText(JSON.stringify(rest.customFields)));
    }

    updates.push('updated_at = NOW()');

    if (updates.length > 0) {
      params.push(id, userId);
      const [updateResult] = await app.db.query(
        `UPDATE vault_items SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
        params,
      );
      if ((updateResult as any).affectedRows === 0) {
        return reply.code(404).send({ message: 'Vault item not found' });
      }
    }

    if (tagIds) {
      await app.db.query(
        'DELETE vit FROM vault_item_tags vit INNER JOIN vault_items vi ON vi.id = vit.item_id WHERE vit.item_id = ? AND vi.user_id = ?',
        [id, userId],
      );
      if (tagIds.length > 0) {
        const values = tagIds.map((tagId) => [id, tagId]);
        await app.db.query('INSERT INTO vault_item_tags (item_id, tag_id) VALUES ?', [values]);
      }
    }

    await writeAuditLog(app, {
      userId,
      action: 'VAULT_ITEM_UPDATE',
      targetType: 'vault_item',
      targetId: String(id),
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    });

    return reply.send({ success: true });
  });

  app.post('/vault-items/delete', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = deleteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Invalid request body', errors: parsed.error.issues });
    }

    const userId = (request.user as { userId: number }).userId;
    const { id } = parsed.data;

    const [result] = await app.db.query('DELETE FROM vault_items WHERE id = ? AND user_id = ?', [id, userId]);
    if ((result as any).affectedRows === 0) {
      return reply.code(404).send({ message: 'Vault item not found' });
    }

    await writeAuditLog(app, {
      userId,
      action: 'VAULT_ITEM_DELETE',
      targetType: 'vault_item',
      targetId: String(id),
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    });

    return reply.send({ success: true });
  });
};

export default vaultRoutes;
