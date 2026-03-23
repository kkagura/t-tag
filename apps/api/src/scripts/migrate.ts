import { config as dotenvConfig } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import mysql from 'mysql2/promise';
import { dbConfig } from '../config/env';

dotenvConfig();

async function runMigrations() {
  const connection = await mysql.createConnection({
    ...dbConfig,
    multipleStatements: true,
  });

  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const migrationsDir = path.resolve(__dirname, '../../migrations');
    const files = (await fs.readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const [rows] = await connection.query('SELECT id FROM schema_migrations WHERE name = ? LIMIT 1', [
        file,
      ]);
      if ((rows as any[]).length > 0) {
        console.log(`skip: ${file}`);
        continue;
      }

      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
      console.log(`run: ${file}`);
      await connection.query(sql);
      await connection.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
    }

    console.log('migrations completed');
  } finally {
    await connection.end();
  }
}

runMigrations().catch((error) => {
  console.error(error);
  process.exit(1);
});
