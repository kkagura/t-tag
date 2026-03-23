import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { env } from '../config/env';

export default fp(async (app) => {
  await app.register(fastifyJwt, {
    secret: env.ACCESS_TOKEN_SECRET,
  });

  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ message: 'Unauthorized' });
    }
  });
});
