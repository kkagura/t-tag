import fp from 'fastify-plugin';
import mysql from 'mysql2/promise';
import { dbConfig } from '../config/env';

export default fp(async (app) => {
  const pool = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
  });

  app.decorate('db', pool);

  app.addHook('onClose', async () => {
    await pool.end();
  });
});
