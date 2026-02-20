import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable de entorno requerida no definida: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

function optionalEnvInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) return defaultValue;
  return parsed;
}

function optionalEnvBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  return raw.toLowerCase() === 'true';
}

export const config = {
  server: {
    port: optionalEnvInt('PORT', 4000),
    nodeEnv: optionalEnv('NODE_ENV', 'development'),
    debug: optionalEnvBool('DEBUG', false),
  },
  database: {
    url: requireEnv('DATABASE_URL'),
    poolMin: optionalEnvInt('DB_POOL_MIN', 2),
    poolMax: optionalEnvInt('DB_POOL_MAX', 10),
  },
  security: {
    encryptionKey: requireEnv('ENCRYPTION_KEY'),
  },
  worker: {
    pollIntervalMs: optionalEnvInt('WORKER_POLL_INTERVAL_MS', 5000),
    maxConcurrentJobs: optionalEnvInt('WORKER_MAX_CONCURRENT_JOBS', 3),
    cronSchedule: optionalEnv('CRON_SCHEDULE', '*/5 * * * *'),
    stuckJobTimeoutMinutes: optionalEnvInt('STUCK_JOB_TIMEOUT_MINUTES', 60),
  },
  puppeteer: {
    headless: optionalEnvBool('PUPPETEER_HEADLESS', true),
    timeoutMs: optionalEnvInt('PUPPETEER_TIMEOUT_MS', 30000),
    marangatuBaseUrl: optionalEnv('MARANGATU_BASE_URL', 'https://marangatu.set.gov.py'),
  },
} as const;

export type Config = typeof config;
