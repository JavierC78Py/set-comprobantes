import { Pool, PoolClient } from 'pg';
import { config } from '../config/env';
import { logger } from '../config/logger';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.database.url,
      min: config.database.poolMin,
      max: config.database.poolMax,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      logger.error('Error inesperado en cliente inactivo del pool', { error: err.message });
    });

    pool.on('connect', () => {
      logger.debug('Nueva conexion al pool PostgreSQL establecida');
    });
  }
  return pool;
}

export async function query<T = unknown>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const client = getPool();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } catch (err) {
    const error = err as Error;
    logger.error('Error en query SQL', { sql: sql.substring(0, 100), error: error.message });
    throw error;
  }
}

export async function queryOne<T = unknown>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Pool de conexiones PostgreSQL cerrado');
  }
}
