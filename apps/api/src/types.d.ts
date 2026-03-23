import type { Pool } from 'mysql2/promise';

declare module 'fastify' {
  interface FastifyInstance {
    db: Pool;
    authenticate: (request: any, reply: any) => Promise<void>;
  }

  interface FastifyJWT {
    payload: { userId: number; username: string };
    user: { userId: number; username: string };
  }
}
