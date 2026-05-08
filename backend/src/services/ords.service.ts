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

interface OAuthToken {
  accessToken: string;
  expiresAt: number; // timestamp ms
}

// Cache de tokens OAuth2 por tenant_id
const tokenCache = new Map<string, OAuthToken>();

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

/**
 * Obtiene un access_token OAuth2 usando client_credentials.
 * Cachea el token y lo renueva automáticamente cuando expira.
 */
async function getOAuth2Token(
  tenantId: string,
  tokenEndpoint: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const cached = tokenCache.get(tenantId);
  // Renovar 60 segundos antes de que expire
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  logger.info('Solicitando nuevo token OAuth2 para ORDS', {
    tenant_id: tenantId,
    token_endpoint: tokenEndpoint,
  });

  const response = await axios.post(
    tokenEndpoint,
    'grant_type=client_credentials',
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      auth: { username: clientId, password: clientSecret },
      timeout: 10_000,
    }
  );

  const { access_token, expires_in } = response.data;
  if (!access_token) {
    throw new Error('OAuth2: respuesta sin access_token');
  }

  // expires_in viene en segundos, convertir a ms
  const expiresAt = Date.now() + (expires_in ?? 3600) * 1000;
  tokenCache.set(tenantId, { accessToken: access_token, expiresAt });

  logger.info('Token OAuth2 obtenido exitosamente', {
    tenant_id: tenantId,
    expires_in: expires_in ?? 3600,
  });

  return access_token;
}

interface DecryptedConfig extends TenantConfig {
  ords_password?: string;
  ords_token?: string;
  ords_client_secret?: string;
}

async function buildAxiosInstance(
  tenantId: string,
  config: DecryptedConfig
): Promise<AxiosInstance> {
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
  } else if (
    config.ords_tipo_autenticacion === 'CLIENT_CREDENTIALS' &&
    config.ords_token_endpoint &&
    config.ords_client_id &&
    config.ords_client_secret
  ) {
    const accessToken = await getOAuth2Token(
      tenantId,
      config.ords_token_endpoint,
      config.ords_client_id,
      config.ords_client_secret
    );
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  return axios.create({
    baseURL: config.ords_base_url ?? undefined,
    headers,
    timeout: 15000,
  });
}

async function sendWithRetry(
  tenantId: string,
  config: DecryptedConfig,
  endpoint: string,
  payload: OrdsPayload,
  maxRetries = 2
): Promise<OrdsResponse> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      // Reconstruir el axios instance en cada intento para obtener token fresco si expiró
      const axiosInstance = await buildAxiosInstance(tenantId, config);
      const response = await axiosInstance.post(endpoint, payload);
      return { success: true, data: response.data };
    } catch (err) {
      const axiosErr = err as AxiosError;

      // Si es 401 y usamos OAuth2, invalidar el token cacheado para forzar renovación
      if (
        axiosErr.response?.status === 401 &&
        config.ords_tipo_autenticacion === 'CLIENT_CREDENTIALS'
      ) {
        tokenCache.delete(tenantId);
        logger.warn('Token OAuth2 inválido, se forzará renovación en próximo intento', {
          tenant_id: tenantId,
        });
      }

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

    const decryptedConfig: DecryptedConfig = {
      ...tenantConfig,
      ords_password: tenantConfig.ords_password_encrypted
        ? decrypt(tenantConfig.ords_password_encrypted)
        : undefined,
      ords_token: tenantConfig.ords_token_encrypted
        ? decrypt(tenantConfig.ords_token_encrypted)
        : undefined,
      ords_client_secret: tenantConfig.ords_client_secret_encrypted
        ? decrypt(tenantConfig.ords_client_secret_encrypted)
        : undefined,
    };

    const payload = buildOrdsPayload(comprobante, tenantRuc);

    logger.info('Enviando comprobante a ORDS', {
      comprobante_id: comprobante.id,
      numero: comprobante.numero_comprobante,
      endpoint: tenantConfig.ords_endpoint_facturas,
      auth_type: tenantConfig.ords_tipo_autenticacion,
    });

    const result = await sendWithRetry(
      tenantConfig.tenant_id,
      decryptedConfig,
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
    batchSize = 50,
    fechaDesde?: string,
    fechaHasta?: string
  ): Promise<{ enviados: number; fallidos: number }> {
    const pendientes = await findPendingOrdsEnvios(tenantId, batchSize, fechaDesde, fechaHasta);
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
