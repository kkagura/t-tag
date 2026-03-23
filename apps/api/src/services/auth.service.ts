import { createHash, randomBytes } from 'crypto';
import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import { env } from '../config/env';

const ACCESS_TOKEN_EXPIRES_IN = '15m';
const REFRESH_TOKEN_EXPIRES_DAYS = 14;

function hashToken(token: string): string {
  return createHash('sha256').update(token + env.REFRESH_TOKEN_SECRET).digest('hex');
}

export async function registerUser(app: FastifyInstance, username: string, password: string) {
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  const [result] = await app.db.query(
    'INSERT INTO users (username, password_hash, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
    [username, passwordHash],
  );

  return result as { insertId: number };
}

export async function verifyUser(app: FastifyInstance, username: string, password: string) {
  const [rows] = await app.db.query(
    'SELECT id, username, password_hash FROM users WHERE username = ? LIMIT 1',
    [username],
  );

  const user = (rows as any[])[0];
  if (!user) return null;

  const ok = await argon2.verify(user.password_hash, password);
  if (!ok) return null;

  return { id: user.id as number, username: user.username as string };
}

export async function issueTokens(app: FastifyInstance, user: { id: number; username: string }) {
  const accessToken = await app.jwt.sign(
    { userId: user.id, username: user.username },
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN },
  );

  const refreshToken = randomBytes(48).toString('base64url');
  const tokenHash = hashToken(refreshToken);

  await app.db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), NOW())`,
    [user.id, tokenHash, REFRESH_TOKEN_EXPIRES_DAYS],
  );

  return { accessToken, refreshToken };
}

export async function rotateRefreshToken(
  app: FastifyInstance,
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const tokenHash = hashToken(refreshToken);
  const [rows] = await app.db.query(
    `SELECT id, user_id FROM refresh_tokens
     WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash],
  );

  const tokenRow = (rows as any[])[0];
  if (!tokenRow) return null;

  await app.db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [tokenRow.id]);

  const [userRows] = await app.db.query('SELECT id, username FROM users WHERE id = ? LIMIT 1', [
    tokenRow.user_id,
  ]);
  const user = (userRows as any[])[0];
  if (!user) return null;

  return issueTokens(app, { id: user.id, username: user.username });
}

export async function writeAuditLog(
  app: FastifyInstance,
  payload: {
    userId: number | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    ip: string | null;
    userAgent: string | null;
  },
) {
  await app.db.query(
    `INSERT INTO audit_logs (user_id, action, target_type, target_id, ip, ua, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [
      payload.userId,
      payload.action,
      payload.targetType,
      payload.targetId,
      payload.ip,
      payload.userAgent,
    ],
  );
}
