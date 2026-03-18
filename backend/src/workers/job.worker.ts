import { claimNextPendingJobTransaction, markJobDone, markJobFailed } from '../db/repositories/job.repository';
import { SyncService } from '../services/sync.service';
import { logger } from '../config/logger';
import { Job, SyncJobPayload, EnviarOrdsJobPayload, DescargarXmlJobPayload, ConsultaComprobantesJobPayload } from '../types';

const syncService = new SyncService();

async function processJob(job: Job): Promise<Record<string, unknown> | undefined> {
  logger.info('Procesando job', {
    job_id: job.id,
    tenant_id: job.tenant_id,
    tipo_job: job.tipo_job,
    intento: job.intentos,
  });

  switch (job.tipo_job) {
    case 'SYNC_COMPROBANTES': {
      const payload = job.payload as SyncJobPayload;
      return await syncService.ejecutarSyncComprobantes(job.tenant_id, payload);
    }
    case 'ENVIAR_A_ORDS': {
      const payload = job.payload as EnviarOrdsJobPayload;
      return await syncService.ejecutarEnvioOrds(job.tenant_id, payload);
    }
    case 'DESCARGAR_XML': {
      const payload = job.payload as DescargarXmlJobPayload;
      return await syncService.ejecutarDescargarXml(job.tenant_id, payload);
    }
    case 'CONSULTA_COMPROBANTES': {
      const payload = job.payload as unknown as ConsultaComprobantesJobPayload;
      return await syncService.ejecutarConsultaComprobantes(job.tenant_id, payload);
    }
    default: {
      throw new Error(`Tipo de job desconocido: ${String(job.tipo_job)}`);
    }
  }
}

export async function processSingleJob(): Promise<boolean> {
  const job = await claimNextPendingJobTransaction();
  if (!job) return false;

  try {
    const result = await processJob(job);
    await markJobDone(job.id, result);
    logger.info('Job completado exitosamente', {
      job_id: job.id,
      tenant_id: job.tenant_id,
      tipo_job: job.tipo_job,
    });
    return true;
  } catch (err) {
    const errorMessage = (err as Error).message;
    logger.error('Error procesando job', {
      job_id: job.id,
      tenant_id: job.tenant_id,
      tipo_job: job.tipo_job,
      error: errorMessage,
    });
    await markJobFailed(job.id, errorMessage, job.max_intentos);
    return true;
  }
}

export async function runWorkerLoop(
  pollIntervalMs: number,
  maxConcurrent: number,
  signal: AbortSignal
): Promise<void> {
  logger.info('Worker iniciado', { pollIntervalMs, maxConcurrent });

  while (!signal.aborted) {
    try {
      const tasks: Promise<boolean>[] = [];
      for (let i = 0; i < maxConcurrent; i++) {
        tasks.push(processSingleJob());
      }
      const results = await Promise.all(tasks);
      const processed = results.filter(Boolean).length;

      if (processed === 0) {
        await sleep(pollIntervalMs);
      }
    } catch (err) {
      logger.error('Error en loop principal del worker', {
        error: (err as Error).message,
      });
      await sleep(pollIntervalMs);
    }
  }

  logger.info('Worker detenido');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
