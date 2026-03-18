import { logger } from '../config/logger';
import { findTenantConfig } from '../db/repositories/tenant.repository';
import {
  markEnviosOrdsPendingAfterSync,
  findComprobantesByTenant,
} from '../db/repositories/comprobante.repository';
import { createJob, countActiveJobsForTenant } from '../db/repositories/job.repository';
import { MarangatuService } from './marangatu.service';
import { OrdsService } from './ords.service';
import { EkuatiaService, enqueueXmlDownloads, obtenerPendientesXml, guardarXmlDescargado, marcarXmlJobFallido } from './ekuatia.service';
import { SyncJobPayload, EnviarOrdsJobPayload, DescargarXmlJobPayload, ConsultaComprobantesJobPayload } from '../types';
import { queryOne } from '../db/connection';
import { Tenant } from '../types';

export class SyncService {
  private marangatuService = new MarangatuService();
  private ordsService = new OrdsService();
  private ekuatiaService: EkuatiaService | null = null;

  private getEkuatiaService(solvecaptchaApiKey: string): EkuatiaService {
    if (!this.ekuatiaService || this.ekuatiaService.solveCaptchaApiKey !== solvecaptchaApiKey) {
      this.ekuatiaService = new EkuatiaService(solvecaptchaApiKey);
    }
    return this.ekuatiaService;
  }

  /**
   * Ejecuta la sincronización completa de comprobantes para un tenant.
   * Este método es llamado por el worker cuando procesa un job SYNC_COMPROBANTES.
   */
  async ejecutarSyncComprobantes(
    tenantId: string,
    payload: SyncJobPayload = {}
  ): Promise<void> {
    const tenantConfig = await findTenantConfig(tenantId);
    if (!tenantConfig) {
      throw new Error(`Configuración no encontrada para tenant ${tenantId}`);
    }

    const syncResult = await this.marangatuService.syncComprobantes(
      tenantId,
      tenantConfig,
      {
        mes: payload.mes,
        anio: payload.anio,
      }
    );

    logger.info('Sincronización Marangatu completada', {
      tenant_id: tenantId,
      resultado: syncResult,
    });

    const hayNuevos = syncResult.inserted > 0 || syncResult.updated > 0;

    if (hayNuevos) {
      await enqueueXmlDownloads(tenantId, 200);

      const pendientesXml = await obtenerPendientesXml(tenantId, 1);
      if (pendientesXml.length > 0) {
        const activeXml = await countActiveJobsForTenant(tenantId, 'DESCARGAR_XML');
        if (activeXml === 0) {
          await createJob({
            tenant_id: tenantId,
            tipo_job: 'DESCARGAR_XML',
            payload: { batch_size: 50 } as unknown as Record<string, unknown>,
            next_run_at: new Date(),
          });
          logger.info('Job DESCARGAR_XML encolado automáticamente post-sync', {
            tenant_id: tenantId,
          });
        }
      }

      // ENVIAR_A_ORDS se encola después de DESCARGAR_XML, no aquí
      // para asegurar que los XMLs estén completos antes del envío
    }
  }

  /**
   * Ejecuta el envío a ORDS para un tenant.
   * Este método es llamado por el worker cuando procesa un job ENVIAR_A_ORDS.
   */
  async ejecutarEnvioOrds(
    tenantId: string,
    payload: EnviarOrdsJobPayload = {}
  ): Promise<void> {
    const tenant = await queryOne<Tenant>(
      'SELECT * FROM tenants WHERE id = $1',
      [tenantId]
    );
    if (!tenant) throw new Error(`Tenant no encontrado: ${tenantId}`);

    const tenantConfig = await findTenantConfig(tenantId);
    if (!tenantConfig) {
      throw new Error(`Configuración no encontrada para tenant ${tenantId}`);
    }

    if (!tenantConfig.ords_base_url || !tenantConfig.ords_endpoint_facturas) {
      logger.warn('Tenant no tiene ORDS configurado, saltando envío', {
        tenant_id: tenantId,
      });
      return;
    }

    const result = await this.ordsService.procesarEnviosPendientes(
      tenantId,
      tenant.ruc,
      tenantConfig,
      payload.batch_size ?? 50
    );

    logger.info('Envío ORDS completado', {
      tenant_id: tenantId,
      ...result,
    });
  }

  /**
   * Ejecuta la descarga de XMLs desde eKuatia para comprobantes pendientes.
   * Este método es llamado por el worker cuando procesa un job DESCARGAR_XML.
   */
  async ejecutarDescargarXml(
    tenantId: string,
    payload: DescargarXmlJobPayload = {}
  ): Promise<void> {
    const tenantConfig = await findTenantConfig(tenantId);
    if (!tenantConfig) {
      throw new Error(`Configuración no encontrada para tenant ${tenantId}`);
    }

    const extraConfig = (tenantConfig as unknown as { extra_config?: Record<string, unknown> }).extra_config ?? {};
    const solvecaptchaApiKey = (extraConfig['solvecaptcha_api_key'] as string | undefined)
      ?? process.env['SOLVECAPTCHA_API_KEY'] ?? '';

    if (!solvecaptchaApiKey) {
      throw new Error('SolveCaptcha API key no configurada para este tenant');
    }

    if (payload.comprobante_id) {
      await enqueueXmlDownloads(tenantId, 1);
    }

    const batchSize = payload.batch_size ?? 20;
    const pendientes = await obtenerPendientesXml(tenantId, batchSize);

    if (pendientes.length === 0) {
      logger.info('No hay XMLs pendientes de descarga', { tenant_id: tenantId });
      return;
    }

    logger.info('Iniciando descarga de XMLs', {
      tenant_id: tenantId,
      cantidad: pendientes.length,
    });

    const ekuatia = this.getEkuatiaService(solvecaptchaApiKey);
    let exitosos = 0;
    let fallidos = 0;

    for (const pendiente of pendientes) {
      try {
        const result = await ekuatia.descargarXml(pendiente.cdc);

        await guardarXmlDescargado(
          pendiente.comprobante_id,
          result.xmlContenido,
          result.xmlUrl,
          result.detalles
        );
        exitosos++;

        logger.debug('XML descargado y guardado', {
          cdc: pendiente.cdc,
        });
      } catch (err) {
        const errorMsg = (err as Error).message;
        await marcarXmlJobFallido(pendiente.comprobante_id, errorMsg);
        fallidos++;
        logger.warn('Fallo al descargar XML', {
          comprobante_id: pendiente.comprobante_id,
          cdc: pendiente.cdc,
          error: errorMsg,
        });
      }
    }

    logger.info('Lote de descarga XML completado', {
      tenant_id: tenantId,
      exitosos,
      fallidos,
    });

    const restantes = await obtenerPendientesXml(tenantId, 1);
    if (restantes.length > 0) {
      const activeXml = await countActiveJobsForTenant(tenantId, 'DESCARGAR_XML');
      if (activeXml === 0) {
        await createJob({
          tenant_id: tenantId,
          tipo_job: 'DESCARGAR_XML',
          payload: { batch_size: batchSize } as unknown as Record<string, unknown>,
          next_run_at: new Date(),
        });
        logger.info('Job DESCARGAR_XML re-encolado para procesar restantes', {
          tenant_id: tenantId,
        });
      }
    } else {
      // Todos los XMLs descargados — encolar ENVIAR_A_ORDS si está configurado
      const tenantConfig = await findTenantConfig(tenantId);
      if (tenantConfig?.enviar_a_ords_automaticamente) {
        // Marcar comprobantes con XML como pendientes de envío ORDS
        const comprobantesConXml = await findComprobantesByTenant(
          tenantId,
          { xml_descargado: true },
          { page: 1, limit: 500 }
        );
        const ids = comprobantesConXml.data.map((c) => c.id);
        if (ids.length > 0) {
          await markEnviosOrdsPendingAfterSync(tenantId, ids);

          const activeOrds = await countActiveJobsForTenant(tenantId, 'ENVIAR_A_ORDS');
          if (activeOrds === 0) {
            await createJob({
              tenant_id: tenantId,
              tipo_job: 'ENVIAR_A_ORDS',
              payload: { batch_size: 100 } as unknown as Record<string, unknown>,
              next_run_at: new Date(),
            });
            logger.info('Job ENVIAR_A_ORDS encolado automáticamente (todos los XMLs descargados)', {
              tenant_id: tenantId,
            });
          }
        }
      }
    }
  }

  /**
   * Ejecuta la consulta de comprobantes registrados para un tenant.
   * Este método es llamado por el worker cuando procesa un job CONSULTA_COMPROBANTES.
   */
  async ejecutarConsultaComprobantes(
    tenantId: string,
    payload: ConsultaComprobantesJobPayload
  ): Promise<void> {
    const tenantConfig = await findTenantConfig(tenantId);
    if (!tenantConfig) {
      throw new Error(`Configuración no encontrada para tenant ${tenantId}`);
    }

    const consultaResult = await this.marangatuService.consultarComprobantes(
      tenantId,
      tenantConfig,
      {
        fechaDesde: payload.fecha_desde,
        fechaHasta: payload.fecha_hasta,
        tipoRegistro: payload.tipo_registro,
      }
    );

    logger.info('Consulta de comprobantes completada', {
      tenant_id: tenantId,
      resultado: consultaResult,
    });

    const hayNuevos = consultaResult.inserted > 0;

    if (hayNuevos) {
      await enqueueXmlDownloads(tenantId, 200);

      const pendientesXml = await obtenerPendientesXml(tenantId, 1);
      if (pendientesXml.length > 0) {
        const activeXml = await countActiveJobsForTenant(tenantId, 'DESCARGAR_XML');
        if (activeXml === 0) {
          await createJob({
            tenant_id: tenantId,
            tipo_job: 'DESCARGAR_XML',
            payload: { batch_size: 50 } as unknown as Record<string, unknown>,
            next_run_at: new Date(),
          });
          logger.info('Job DESCARGAR_XML encolado automáticamente post-consulta', {
            tenant_id: tenantId,
          });
        }
      }

      // ENVIAR_A_ORDS se encola después de DESCARGAR_XML, no aquí
      // para asegurar que los XMLs estén completos antes del envío
    }
  }

  /**
   * Encola un job de envío a ORDS para un tenant.
   */
  async encolarEnvioOrds(
    tenantId: string,
    payload: EnviarOrdsJobPayload = {}
  ): Promise<string> {
    const active = await countActiveJobsForTenant(tenantId, 'ENVIAR_A_ORDS');
    if (active > 0) {
      throw new Error(
        'Ya existe un job de envío ORDS activo para este tenant. ' +
        'Espere a que termine antes de encolar otro.'
      );
    }

    // Marcar comprobantes con XML descargado como pendientes de envío
    const comprobantesConXml = await findComprobantesByTenant(
      tenantId,
      { xml_descargado: true },
      { page: 1, limit: 500 }
    );
    const ids = comprobantesConXml.data.map((c) => c.id);
    if (ids.length > 0) {
      await markEnviosOrdsPendingAfterSync(tenantId, ids);
    }

    const job = await createJob({
      tenant_id: tenantId,
      tipo_job: 'ENVIAR_A_ORDS',
      payload: payload as Record<string, unknown>,
      next_run_at: new Date(),
    });

    logger.info('Job ENVIAR_A_ORDS encolado', {
      tenant_id: tenantId,
      job_id: job.id,
      comprobantes_pendientes: ids.length,
    });

    return job.id;
  }

  /**
   * Encola un job de consulta de comprobantes registrados para un tenant.
   */
  async encolarConsultaComprobantes(
    tenantId: string,
    payload: ConsultaComprobantesJobPayload
  ): Promise<string> {
    const active = await countActiveJobsForTenant(tenantId, 'CONSULTA_COMPROBANTES');
    if (active > 0) {
      throw new Error(
        'Ya existe un job de consulta activo para este tenant. ' +
        'Espere a que termine antes de encolar otro.'
      );
    }

    const job = await createJob({
      tenant_id: tenantId,
      tipo_job: 'CONSULTA_COMPROBANTES',
      payload: payload as unknown as Record<string, unknown>,
      next_run_at: new Date(),
    });

    logger.info('Job CONSULTA_COMPROBANTES encolado', {
      tenant_id: tenantId,
      job_id: job.id,
    });

    return job.id;
  }

  /**
   * Encola un job de sincronización de comprobantes para un tenant.
   * Verifica que no haya un job activo del mismo tipo antes de encolar.
   */
  async encolarSyncComprobantes(
    tenantId: string,
    payload: SyncJobPayload = {}
  ): Promise<string> {
    const active = await countActiveJobsForTenant(tenantId, 'SYNC_COMPROBANTES');
    if (active > 0) {
      throw new Error(
        'Ya existe un job de sincronización activo para este tenant. ' +
        'Espere a que termine antes de encolar otro.'
      );
    }

    const job = await createJob({
      tenant_id: tenantId,
      tipo_job: 'SYNC_COMPROBANTES',
      payload: payload as Record<string, unknown>,
      next_run_at: new Date(),
    });

    logger.info('Job SYNC_COMPROBANTES encolado', {
      tenant_id: tenantId,
      job_id: job.id,
    });

    return job.id;
  }
}
