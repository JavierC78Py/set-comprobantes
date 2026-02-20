import fs from 'fs';
import path from 'path';
import { getPool, closePool } from './connection';
import { logger } from '../config/logger';

async function runMigrations(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const version = file.replace('.sql', '');
      const existing = await client.query(
        'SELECT version FROM schema_migrations WHERE version = $1',
        [version]
      );

      if (existing.rowCount && existing.rowCount > 0) {
        logger.info(`Migración ya aplicada: ${version}`);
        continue;
      }

      logger.info(`Aplicando migración: ${version}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [version]
        );
        await client.query('COMMIT');
        logger.info(`Migración aplicada exitosamente: ${version}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    logger.info('Todas las migraciones completadas');
  } finally {
    client.release();
    await closePool();
  }
}

runMigrations().catch((err) => {
  logger.error('Error ejecutando migraciones', { error: (err as Error).message });
  process.exit(1);
});
