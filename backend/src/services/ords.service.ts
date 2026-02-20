import axios, { AxiosError, AxiosInstance } from 'axios';
import { TenantConfig, OrdsPayload, Comprobante } from '../types';
import { decrypt } from './crypto.service';
import { logger } from '../config/logger';
import {
  findPendingOrdsEnvios,
  updateEnvioOrdsSuccess,
  updateEnvioOrdsFailed,
} from '../db/repositories/comprobante.repository';
import { queryOne } from '../db/connection';

interface OrdsResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

function buildOrdsPayload(
  comprobante: Comprobante,
  tenantRuc: string
): OrdsPayload {
  return {
    rucVendedor: comprobante.ruc_vendedor,
    razonSocialVendedor: comprobante.razon_social_vendedor,
    cdc: comprobante.cdc,
    numeroComprobante: comprobante.numero_comprobante,
    tipoComprobante: comprobante.tipo_comprobante,
    fechaEmision: comprobante.fecha_emision instanceof Date
      ? comprobante.fecha_emision.toISOString().split('T')[0]
      : String(comprobante.fecha_emision),
    totalOperacion: parseFloat(String(comprobante.total_operacion)),
    origen: comprobante.origen,
    tenantRuc,
    detalles: comprobante.detalles_xml,
    metadatos: comprobante.raw_payload,
  };
}

function buildAxiosInstance(
  config: TenantConfig & { ords_password?: string; ords_token?: string }
): AxiosInstance {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  if (config.ords_tipo_autenticacion === 'BASIC' && config.ords_usuario && config.ords_password) {
    const credentials = Buffer.from(
      `${config.ords_usuario}:${config.ords_password}`
    ).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
  } else if (config.ords_tipo_autenticacion === 'BEARER' && config.ords_token) {
    headers['Authorization'] = `Bearer ${config.ords_token}`;
  }

  return axios.create({
    baseURL: config.ords_base_url ?? undefined,
    headers,
    timeout: 15000,
  });
}

async function sendWithRetry(
  axiosInstance: AxiosInstance,
  endpoint: string,
  payload: OrdsPayload,
  maxRetries = 2
): Promise<OrdsResponse> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const response = await axiosInstance.post(endpoint, payload);
      return { success: true, data: response.data };
    } catch (err) {
      const axiosErr = err as AxiosError;
      lastError = new Error(
        axiosErr.response
          ? `HTTP ${axiosErr.response.status}: ${JSON.stringify(axiosErr.response.data)}`
          : axiosErr.message
      );

      if (attempt <= maxRetries) {
        const delay = attempt * 2000;
        logger.warn(`Reintento ${attempt}/${maxRetries} para ORDS en ${delay}ms`, {
          error: lastError.message,
        });
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  return { success: false, error: lastError?.message ?? 'Error desconocido' };
}

export class OrdsService {
  /**
   * Envía un único comprobante a la API ORDS del tenant.
   * Actualiza el estado en comprobante_envio_ords.
   */
  async enviarComprobante(
    envioId: string,
    comprobante: Comprobante,
    tenantConfig: TenantConfig,
    tenantRuc: string
  ): Promise<OrdsResponse> {
    if (!tenantConfig.ords_base_url || !tenantConfig.ords_endpoint_facturas) {
      return { success: false, error: 'ORDS no configurado para este tenant' };
    }

    const decryptedConfig = {
      ...tenantConfig,
      ords_password: tenantConfig.ords_password_encrypted
        ? decrypt(tenantConfig.ords_password_encrypted)
        : undefined,
      ords_token: tenantConfig.ords_token_encrypted
        ? decrypt(tenantConfig.ords_token_encrypted)
        : undefined,
    };

    const axiosInstance = buildAxiosInstance(decryptedConfig);

    // TODO: Ajustar el payload según el schema exacto que espera la API ORDS del cliente.
    // El método buildOrdsPayload() genera un JSON con campos estándar.
    // Si el endpoint ORDS requiere un wrapper o nombres de campos distintos,
    // modificar buildOrdsPayload() o agregar una transformación aquí.
    const payload = buildOrdsPayload(comprobante, tenantRuc);

    logger.info('Enviando comprobante a ORDS', {
      comprobante_id: comprobante.id,
      numero: comprobante.numero_comprobante,
      endpoint: tenantConfig.ords_endpoint_facturas,
    });

    const result = await sendWithRetry(
      axiosInstance,
      tenantConfig.ords_endpoint_facturas,
      payload
    );

    if (result.success) {
      await updateEnvioOrdsSuccess(envioId, result.data as Record<string, unknown> ?? {});
      logger.info('Comprobante enviado exitosamente a ORDS', {
        comprobante_id: comprobante.id,
      });
    } else {
      await updateEnvioOrdsFailed(envioId, result.error ?? 'Error desconocido');
      logger.warn('Fallo al enviar comprobante a ORDS', {
        comprobante_id: comprobante.id,
        error: result.error,
      });
    }

    return result;
  }

  /**
   * Procesa todos los envíos pendientes a ORDS para un tenant.
   * Llamado por el worker cuando tipo_job = ENVIAR_A_ORDS.
   */
  async procesarEnviosPendientes(
    tenantId: string,
    tenantRuc: string,
    tenantConfig: TenantConfig,
    batchSize = 50
  ): Promise<{ enviados: number; fallidos: number }> {
    const pendientes = await findPendingOrdsEnvios(tenantId, batchSize);
    let enviados = 0;
    let fallidos = 0;

    for (const envio of pendientes) {
      const comprobante = await queryOne<Comprobante>(
        'SELECT * FROM comprobantes WHERE id = $1',
        [envio.comprobante_id]
      );

      if (!comprobante) {
        logger.warn('Comprobante no encontrado para envio ORDS', {
          envio_id: envio.id,
          comprobante_id: envio.comprobante_id,
        });
        continue;
      }

      const result = await this.enviarComprobante(
        envio.id,
        comprobante,
        tenantConfig,
        tenantRuc
      );

      if (result.success) {
        enviados++;
      } else {
        fallidos++;
      }
    }

    logger.info('Lote de envíos ORDS completado', {
      tenant_id: tenantId,
      enviados,
      fallidos,
    });

    return { enviados, fallidos };
  }
}
