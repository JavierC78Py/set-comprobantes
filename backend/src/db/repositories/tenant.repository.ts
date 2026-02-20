import { query, queryOne } from '../connection';
import { Tenant, TenantConfig, TenantWithConfig } from '../../types';
import { encrypt, decrypt } from '../../services/crypto.service';

export interface CreateTenantInput {
  nombre_fantasia: string;
  ruc: string;
  email_contacto?: string;
  timezone?: string;
}

export interface UpdateTenantInput {
  nombre_fantasia?: string;
  email_contacto?: string;
  timezone?: string;
  activo?: boolean;
}

export interface UpsertTenantConfigInput {
  ruc_login?: string;
  usuario_marangatu?: string;
  clave_marangatu?: string;
  marangatu_base_url?: string;
  ords_base_url?: string;
  ords_endpoint_facturas?: string;
  ords_tipo_autenticacion?: 'BASIC' | 'BEARER' | 'NONE';
  ords_usuario?: string;
  ords_password?: string;
  ords_token?: string;
  enviar_a_ords_automaticamente?: boolean;
  frecuencia_sincronizacion_minutos?: number;
  extra_config?: Record<string, unknown>;
}

export async function findAllTenants(): Promise<Tenant[]> {
  return query<Tenant>(
    'SELECT * FROM tenants ORDER BY nombre_fantasia ASC'
  );
}

export async function findTenantById(id: string): Promise<Tenant | null> {
  return queryOne<Tenant>(
    'SELECT * FROM tenants WHERE id = $1',
    [id]
  );
}

export async function findTenantByRuc(ruc: string): Promise<Tenant | null> {
  return queryOne<Tenant>(
    'SELECT * FROM tenants WHERE ruc = $1',
    [ruc]
  );
}

export async function findActiveTenants(): Promise<Tenant[]> {
  return query<Tenant>(
    'SELECT * FROM tenants WHERE activo = TRUE ORDER BY nombre_fantasia ASC'
  );
}

export async function createTenant(input: CreateTenantInput): Promise<Tenant> {
  const rows = await query<Tenant>(
    `INSERT INTO tenants (nombre_fantasia, ruc, email_contacto, timezone)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      input.nombre_fantasia,
      input.ruc,
      input.email_contacto ?? null,
      input.timezone ?? 'America/Asuncion',
    ]
  );
  if (!rows[0]) throw new Error('Error al crear tenant');
  return rows[0];
}

export async function updateTenant(
  id: string,
  input: UpdateTenantInput
): Promise<Tenant | null> {
  return queryOne<Tenant>(
    `UPDATE tenants
     SET nombre_fantasia  = COALESCE($2, nombre_fantasia),
         email_contacto   = COALESCE($3, email_contacto),
         timezone         = COALESCE($4, timezone),
         activo           = COALESCE($5, activo)
     WHERE id = $1
     RETURNING *`,
    [
      id,
      input.nombre_fantasia ?? null,
      input.email_contacto ?? null,
      input.timezone ?? null,
      input.activo ?? null,
    ]
  );
}

export async function findTenantConfig(tenantId: string): Promise<TenantConfig | null> {
  return queryOne<TenantConfig>(
    'SELECT * FROM tenant_config WHERE tenant_id = $1',
    [tenantId]
  );
}

export async function findTenantWithConfig(tenantId: string): Promise<TenantWithConfig | null> {
  const tenant = await findTenantById(tenantId);
  if (!tenant) return null;
  const config = await findTenantConfig(tenantId);
  return { ...tenant, config };
}

export async function createTenantConfig(
  tenantId: string,
  input: Required<Pick<UpsertTenantConfigInput, 'ruc_login' | 'usuario_marangatu' | 'clave_marangatu'>> &
    Omit<UpsertTenantConfigInput, 'ruc_login' | 'usuario_marangatu' | 'clave_marangatu'>
): Promise<TenantConfig> {
  const claveEncrypted = encrypt(input.clave_marangatu);
  const passwordEncrypted = input.ords_password ? encrypt(input.ords_password) : null;
  const tokenEncrypted = input.ords_token ? encrypt(input.ords_token) : null;

  const rows = await query<TenantConfig>(
    `INSERT INTO tenant_config (
       tenant_id, ruc_login, usuario_marangatu, clave_marangatu_encrypted,
       marangatu_base_url, ords_base_url, ords_endpoint_facturas,
       ords_tipo_autenticacion, ords_usuario, ords_password_encrypted,
       ords_token_encrypted, enviar_a_ords_automaticamente,
       frecuencia_sincronizacion_minutos, extra_config
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      tenantId,
      input.ruc_login,
      input.usuario_marangatu,
      claveEncrypted,
      input.marangatu_base_url ?? 'https://marangatu.set.gov.py',
      input.ords_base_url ?? null,
      input.ords_endpoint_facturas ?? null,
      input.ords_tipo_autenticacion ?? 'NONE',
      input.ords_usuario ?? null,
      passwordEncrypted,
      tokenEncrypted,
      input.enviar_a_ords_automaticamente ?? false,
      input.frecuencia_sincronizacion_minutos ?? 60,
      JSON.stringify(input.extra_config ?? {}),
    ]
  );
  if (!rows[0]) throw new Error('Error al crear configuración del tenant');
  return rows[0];
}

export async function updateTenantConfig(
  tenantId: string,
  input: UpsertTenantConfigInput
): Promise<TenantConfig> {
  const sets: string[] = [];
  const params: unknown[] = [tenantId];
  let i = 2;

  if (input.ruc_login !== undefined) {
    sets.push(`ruc_login = $${i++}`);
    params.push(input.ruc_login);
  }
  if (input.usuario_marangatu !== undefined) {
    sets.push(`usuario_marangatu = $${i++}`);
    params.push(input.usuario_marangatu);
  }
  if (input.clave_marangatu !== undefined) {
    sets.push(`clave_marangatu_encrypted = $${i++}`);
    params.push(encrypt(input.clave_marangatu));
  }
  if (input.marangatu_base_url !== undefined) {
    sets.push(`marangatu_base_url = $${i++}`);
    params.push(input.marangatu_base_url);
  }
  if (input.ords_base_url !== undefined) {
    sets.push(`ords_base_url = $${i++}`);
    params.push(input.ords_base_url);
  }
  if (input.ords_endpoint_facturas !== undefined) {
    sets.push(`ords_endpoint_facturas = $${i++}`);
    params.push(input.ords_endpoint_facturas);
  }
  if (input.ords_tipo_autenticacion !== undefined) {
    sets.push(`ords_tipo_autenticacion = $${i++}`);
    params.push(input.ords_tipo_autenticacion);
  }
  if (input.ords_usuario !== undefined) {
    sets.push(`ords_usuario = $${i++}`);
    params.push(input.ords_usuario);
  }
  if (input.ords_password !== undefined) {
    sets.push(`ords_password_encrypted = $${i++}`);
    params.push(encrypt(input.ords_password));
  }
  if (input.ords_token !== undefined) {
    sets.push(`ords_token_encrypted = $${i++}`);
    params.push(encrypt(input.ords_token));
  }
  if (input.enviar_a_ords_automaticamente !== undefined) {
    sets.push(`enviar_a_ords_automaticamente = $${i++}`);
    params.push(input.enviar_a_ords_automaticamente);
  }
  if (input.frecuencia_sincronizacion_minutos !== undefined) {
    sets.push(`frecuencia_sincronizacion_minutos = $${i++}`);
    params.push(input.frecuencia_sincronizacion_minutos);
  }
  if (input.extra_config !== undefined) {
    sets.push(`extra_config = $${i++}`);
    params.push(JSON.stringify(input.extra_config));
  }

  if (sets.length === 0) {
    const existing = await findTenantConfig(tenantId);
    if (!existing) throw new Error('No existe configuración para este tenant');
    return existing;
  }

  const rows = await query<TenantConfig>(
    `UPDATE tenant_config SET ${sets.join(', ')} WHERE tenant_id = $1 RETURNING *`,
    params
  );
  if (!rows[0]) throw new Error('No existe configuración para este tenant');
  return rows[0];
}

export async function upsertTenantConfig(
  tenantId: string,
  input: UpsertTenantConfigInput
): Promise<TenantConfig> {
  const existing = await findTenantConfig(tenantId);
  if (existing) {
    return updateTenantConfig(tenantId, input);
  }
  if (!input.ruc_login || !input.usuario_marangatu || !input.clave_marangatu) {
    throw new Error('Para crear la configuración se requieren ruc_login, usuario_marangatu y clave_marangatu');
  }
  return createTenantConfig(tenantId, {
    ...input,
    ruc_login: input.ruc_login,
    usuario_marangatu: input.usuario_marangatu,
    clave_marangatu: input.clave_marangatu,
  });
}

export function decryptTenantConfig(config: TenantConfig): TenantConfig & {
  clave_marangatu: string;
  ords_password?: string;
  ords_token?: string;
} {
  return {
    ...config,
    clave_marangatu: decrypt(config.clave_marangatu_encrypted),
    ords_password: config.ords_password_encrypted
      ? decrypt(config.ords_password_encrypted)
      : undefined,
    ords_token: config.ords_token_encrypted
      ? decrypt(config.ords_token_encrypted)
      : undefined,
  };
}
