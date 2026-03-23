import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import {
  issueTokens,
  registerUser,
  rotateRefreshToken,
  verifyUser,
  writeAuditLog,
} from '../services/auth.service';

const registerSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8).max(128),
});

const loginSchema = registerSchema;
const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Invalid request body', errors: parsed.error.issues });
    }

    const { username, password } = parsed.data;

    try {
      const result = await registerUser(app, username, password);
      await writeAuditLog(app, {
        userId: result.insertId,
        action: 'REGISTER',
        targetType: 'user',
        targetId: String(result.insertId),
        ip: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      });
      return reply.code(201).send({ id: result.insertId, username });
    } catch (error: any) {
      if (error?.code === 'ER_DUP_ENTRY') {
        return reply.code(409).send({ message: 'Username already exists' });
      }
      throw error;
    }
  });

  app.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Invalid request body', errors: parsed.error.issues });
    }

    const { username, password } = parsed.data;
    const user = await verifyUser(app, username, password);
    if (!user) {
      await writeAuditLog(app, {
        userId: null,
        action: 'LOGIN_FAILED',
        targetType: 'user',
        targetId: username,
        ip: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      });
      return reply.code(401).send({ message: 'Invalid username or password' });
    }

    const tokens = await issueTokens(app, user);
    await writeAuditLog(app, {
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      targetType: 'user',
      targetId: String(user.id),
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    });

    return reply.send(tokens);
  });

  app.post('/auth/refresh', async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Invalid request body', errors: parsed.error.issues });
    }

    const tokens = await rotateRefreshToken(app, parsed.data.refreshToken);
    if (!tokens) {
      return reply.code(401).send({ message: 'Invalid refresh token' });
    }

    return reply.send(tokens);
  });
};

export default authRoutes;
