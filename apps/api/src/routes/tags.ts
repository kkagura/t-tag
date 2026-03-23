import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { writeAuditLog } from '../services/auth.service';

const createTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().max(20).optional(),
});

const deleteTagSchema = z.object({
  id: z.number().int().positive(),
});

const tagRoutes: FastifyPluginAsync = async (app) => {
  app.get('/tags', { preHandler: app.authenticate }, async (request, reply) => {
    const userId = (request.user as { userId: number }).userId;
    const [rows] = await app.db.query(
      'SELECT id, name, color, created_at FROM tags WHERE user_id = ? ORDER BY id DESC',
      [userId],
    );
    return reply.send(rows);
  });

  app.post('/tags/create', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = createTagSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Invalid request body', errors: parsed.error.issues });
    }

    const userId = (request.user as { userId: number }).userId;

    try {
      const [result] = await app.db.query(
        'INSERT INTO tags (user_id, name, color, created_at) VALUES (?, ?, ?, NOW())',
        [userId, parsed.data.name, parsed.data.color ?? null],
      );
      const id = (result as any).insertId as number;

      await writeAuditLog(app, {
        userId,
        action: 'TAG_CREATE',
        targetType: 'tag',
        targetId: String(id),
        ip: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      });

      return reply.code(201).send({ id });
    } catch (error: any) {
      if (error?.code === 'ER_DUP_ENTRY') {
        return reply.code(409).send({ message: 'Tag name already exists' });
      }
      throw error;
    }
  });

  app.post('/tags/delete', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = deleteTagSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Invalid request body', errors: parsed.error.issues });
    }

    const userId = (request.user as { userId: number }).userId;
    const [result] = await app.db.query('DELETE FROM tags WHERE id = ? AND user_id = ?', [
      parsed.data.id,
      userId,
    ]);

    if ((result as any).affectedRows === 0) {
      return reply.code(404).send({ message: 'Tag not found' });
    }

    await writeAuditLog(app, {
      userId,
      action: 'TAG_DELETE',
      targetType: 'tag',
      targetId: String(parsed.data.id),
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    });

    return reply.send({ success: true });
  });
};

export default tagRoutes;
