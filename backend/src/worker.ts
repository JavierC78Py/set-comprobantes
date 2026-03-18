import { config } from './config/env';
import { logger } from './config/logger';
import { closePool } from './db/connection';
import { runWorkerLoop } from './workers/job.worker';
import { startScheduler } from './workers/scheduler';
import { resetAllRunningJobs } from './db/repositories/job.repository';

async function main(): Promise<void> {
  logger.info('Iniciando proceso worker', {
    pollIntervalMs: config.worker.pollIntervalMs,
    maxConcurrentJobs: config.worker.maxConcurrentJobs,
  });

  const controller = new AbortController();
  let shuttingDown = false;

  startScheduler();

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Señal ${signal} recibida, deteniendo worker...`);
    controller.abort();
    try {
      const resetCount = await resetAllRunningJobs();
      if (resetCount > 0) {
        logger.info(`${resetCount} job(s) RUNNING reseteados a PENDING por shutdown`);
      }
    } catch (err) {
      logger.error('Error reseteando jobs RUNNING durante shutdown', {
        error: (err as Error).message,
      });
    }
    await closePool();
    logger.info('Worker detenido correctamente');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await runWorkerLoop(
    config.worker.pollIntervalMs,
    config.worker.maxConcurrentJobs,
    controller.signal
  );
}

void main();
