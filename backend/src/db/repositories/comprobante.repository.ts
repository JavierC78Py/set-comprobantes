import { query, queryOne } from '../connection';
import { Comprobante, ComprobanteEnvioOrds, ComprobanteFilters, PaginationParams } from '../../types';
import { hashUnico } from '../../services/crypto.service';

export interface UpsertComprobanteInput {
  tenant_id: string;
  origen: 'ELECTRONICO' | 'VIRTUAL';
  ruc_vendedor: string;
  razon_social_vendedor?: string;
  cdc?: string;
  numero_comprobante: string;
  tipo_comprobante: string;
  fecha_emision: string;
  total_operacion: number;
  raw_payload: Record<string, unknown>;
}

export async function upsertComprobante(
  input: UpsertComprobanteInput
): Promise<{ comprobante: Comprobante; created: boolean }> {
  const hash = hashUnico(
    input.tenant_id,
    input.ruc_vendedor,
    input.numero_comprobante,
    input.fecha_emision
  );

  const rows = await query<Comprobante & { xmax: string }>(
    `INSERT INTO comprobantes (
       tenant_id, origen, ruc_vendedor, razon_social_vendedor,
       cdc, numero_comprobante, tipo_comprobante, fecha_emision,
       total_operacion, raw_payload, hash_unico
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (hash_unico) DO UPDATE SET
       razon_social_vendedor = EXCLUDED.razon_social_vendedor,
       raw_payload           = EXCLUDED.raw_payload,
       total_operacion       = EXCLUDED.total_operacion
     RETURNING *, (xmax = 0) AS created`,
    [
      input.tenant_id,
      input.origen,
      input.ruc_vendedor,
      input.razon_social_vendedor ?? null,
      input.cdc ?? null,
      input.numero_comprobante,
      input.tipo_comprobante,
      input.fecha_emision,
      input.total_operacion,
      JSON.stringify(input.raw_payload),
      hash,
    ]
  );

  if (!rows[0]) throw new Error('Error en upsert de comprobante');
  const { xmax: _xmax, ...comprobante } = rows[0];
  return { comprobante, created: rows[0].xmax === '0' };
}

export async function findComprobantesByTenant(
  tenantId: string,
  filters: ComprobanteFilters,
  pagination: PaginationParams
): Promise<{ data: Comprobante[]; total: number }> {
  const conditions: string[] = ['tenant_id = $1'];
  const params: unknown[] = [tenantId];
  let i = 2;

  if (filters.fecha_desde) {
    conditions.push(`fecha_emision >= $${i++}`);
    params.push(filters.fecha_desde);
  }
  if (filters.fecha_hasta) {
    conditions.push(`fecha_emision <= $${i++}`);
    params.push(filters.fecha_hasta);
  }
  if (filters.tipo_comprobante) {
    conditions.push(`tipo_comprobante = $${i++}`);
    params.push(filters.tipo_comprobante);
  }
  if (filters.ruc_vendedor) {
    conditions.push(`ruc_vendedor = $${i++}`);
    params.push(filters.ruc_vendedor);
  }
  if (filters.xml_descargado === true) {
    conditions.push(`xml_descargado_at IS NOT NULL`);
  } else if (filters.xml_descargado === false) {
    conditions.push(`xml_descargado_at IS NULL`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const countRows = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM comprobantes ${where}`,
    params
  );
  const total = parseInt(countRows[0]?.count ?? '0', 10);

  const limit = pagination.limit;
  const offset = (pagination.page - 1) * pagination.limit;

  const data = await query<Comprobante>(
    `SELECT * FROM comprobantes ${where}
     ORDER BY fecha_emision DESC
     LIMIT $${i++} OFFSET $${i++}`,
    [...params, limit, offset]
  );

  return { data, total };
}

export async function findComprobanteById(
  tenantId: string,
  comprobanteId: string
): Promise<Comprobante | null> {
  return queryOne<Comprobante>(
    'SELECT * FROM comprobantes WHERE id = $1 AND tenant_id = $2',
    [comprobanteId, tenantId]
  );
}

export async function findPendingOrdsEnvios(
  tenantId: string,
  limit = 50
): Promise<ComprobanteEnvioOrds[]> {
  return query<ComprobanteEnvioOrds>(
    `SELECT * FROM comprobante_envio_ords
     WHERE tenant_id = $1 AND estado_envio = 'PENDING'
     ORDER BY created_at ASC
     LIMIT $2`,
    [tenantId, limit]
  );
}

export async function upsertEnvioOrds(
  comprobanteId: string,
  tenantId: string
): Promise<ComprobanteEnvioOrds> {
  const rows = await query<ComprobanteEnvioOrds>(
    `INSERT INTO comprobante_envio_ords (comprobante_id, tenant_id)
     VALUES ($1, $2)
     ON CONFLICT (comprobante_id, tenant_id) DO NOTHING
     RETURNING *`,
    [comprobanteId, tenantId]
  );
  if (!rows[0]) {
    const existing = await queryOne<ComprobanteEnvioOrds>(
      'SELECT * FROM comprobante_envio_ords WHERE comprobante_id = $1 AND tenant_id = $2',
      [comprobanteId, tenantId]
    );
    if (!existing) throw new Error('Error al crear registro de envio ORDS');
    return existing;
  }
  return rows[0];
}

export async function updateEnvioOrdsSuccess(
  id: string,
  respuestaOrds: Record<string, unknown>
): Promise<void> {
  await query(
    `UPDATE comprobante_envio_ords
     SET estado_envio  = 'SENT',
         intentos      = intentos + 1,
         last_sent_at  = NOW(),
         error_message = NULL,
         respuesta_ords = $2
     WHERE id = $1`,
    [id, JSON.stringify(respuestaOrds)]
  );
}

export async function updateEnvioOrdsFailed(
  id: string,
  errorMessage: string
): Promise<void> {
  await query(
    `UPDATE comprobante_envio_ords
     SET estado_envio  = CASE WHEN intentos >= 3 THEN 'FAILED' ELSE 'PENDING' END,
         intentos      = intentos + 1,
         last_sent_at  = NOW(),
         error_message = $2
     WHERE id = $1`,
    [id, errorMessage]
  );
}

export async function markEnviosOrdsPendingAfterSync(
  tenantId: string,
  comprobanteIds: string[]
): Promise<void> {
  if (comprobanteIds.length === 0) return;

  const placeholders = comprobanteIds.map((_, idx) => `$${idx + 2}`).join(',');
  await query(
    `INSERT INTO comprobante_envio_ords (comprobante_id, tenant_id)
     SELECT id, $1 FROM comprobantes
     WHERE id IN (${placeholders}) AND tenant_id = $1
     ON CONFLICT (comprobante_id, tenant_id) DO NOTHING`,
    [tenantId, ...comprobanteIds]
  );
}
