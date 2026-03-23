import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { env } from './config/env';
import dbPlugin from './plugins/db';
import authPlugin from './plugins/auth';
import authRoutes from './routes/auth';
import vaultRoutes from './routes/vault';
import tagRoutes from './routes/tags';

async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(sensible);
  await app.register(cors, {
    origin: true,
    credentials: true,
  });
  await app.register(helmet);

  await app.register(dbPlugin);
  await app.register(authPlugin);

  await app.register(authRoutes, { prefix: '/api/v1' });
  await app.register(vaultRoutes, { prefix: '/api/v1' });
  await app.register(tagRoutes, { prefix: '/api/v1' });

  app.get('/health', async () => ({ status: 'ok' }));

  app.setErrorHandler((error: any, request, reply) => {
    request.log.error(error);
    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    reply.code(statusCode).send({
      message: statusCode === 500 ? 'Internal server error' : error.message,
    });
  });

  return app;
}

async function start() {
  const app = await buildServer();
  await app.listen({ host: '0.0.0.0', port: env.PORT });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});

