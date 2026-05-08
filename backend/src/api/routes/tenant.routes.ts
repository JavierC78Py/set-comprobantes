import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { logger } from '../../config/logger';
import {
  findAllTenants,
  findTenantById,
  createTenant,
  updateTenant,
  upsertTenantConfig,
  findTenantWithConfig,
  deleteTenant,
} from '../../db/repositories/tenant.repository';

// Helper: transform empty strings to undefined so optional validators pass
const emptyToUndefined = z.literal('').transform(() => undefined);

const optionalEmail = z.string().email().optional().or(emptyToUndefined);
const optionalUrl = z.string().url().optional().or(emptyToUndefined);
const optionalString = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());

const createTenantSchema = z.object({
  nombre_fantasia: z.string().min(1).max(255),
  ruc: z.string().min(3).max(20),
  email_contacto: optionalEmail,
  timezone: optionalString,
  config: z.object({
    ruc_login: z.string().min(3),
    usuario_marangatu: z.string().min(1).optional().or(emptyToUndefined),
    clave_marangatu: z.string().min(1).optional().or(emptyToUndefined),
    marangatu_base_url: optionalUrl,
    ords_base_url: optionalUrl,
    ords_endpoint_facturas: optionalString,
    ords_tipo_autenticacion: z.enum(['BASIC', 'BEARER', 'NONE', 'CLIENT_CREDENTIALS']).optional(),
    ords_usuario: optionalString,
    ords_password: optionalString,
    ords_token: optionalString,
    ords_client_id: optionalString,
    ords_client_secret: optionalString,
    ords_token_endpoint: optionalUrl,
    enviar_a_ords_automaticamente: z.boolean().optional(),
    frecuencia_sincronizacion_minutos: z.number().int().min(1).optional(),
    extra_config: z.record(z.unknown()).optional(),
  }).optional(),
});

const updateTenantSchema = z.object({
  nombre_fantasia: z.string().min(1).max(255).optional(),
  email_contacto: optionalEmail,
  timezone: optionalString,
  activo: z.boolean().optional(),
  config: z.object({
    ruc_login: z.string().min(3).optional().or(emptyToUndefined),
    usuario_marangatu: z.string().min(1).optional().or(emptyToUndefined),
    clave_marangatu: z.string().min(1).optional().or(emptyToUndefined),
    marangatu_base_url: optionalUrl,
    ords_base_url: optionalUrl,
    ords_endpoint_facturas: optionalString,
    ords_tipo_autenticacion: z.enum(['BASIC', 'BEARER', 'NONE', 'CLIENT_CREDENTIALS']).optional(),
    ords_usuario: optionalString,
    ords_password: optionalString,
    ords_token: optionalString,
    ords_client_id: optionalString,
    ords_client_secret: optionalString,
    ords_token_endpoint: optionalUrl,
    enviar_a_ords_automaticamente: z.boolean().optional(),
    frecuencia_sincronizacion_minutos: z.number().int().min(1).optional(),
    extra_config: z.record(z.unknown()).optional(),
  }).optional(),
});

export async function tenantRoutes(app: FastifyInstance): Promise<void> {
  app.get('/tenants', async (req, reply) => {
    let tenants = await findAllTenants();
    logger.info('GET /tenants', {
      user: req.currentUser?.username,
      rol: req.currentUser?.rol,
      allowedTenants: req.allowedTenants,
      totalBefore: tenants.length,
    });
    if (req.allowedTenants) {
      tenants = tenants.filter((t) => req.allowedTenants!.includes(t.id));
    }
    logger.info('GET /tenants filtered', { totalAfter: tenants.length });
    return reply.send({ data: tenants, total: tenants.length });
  });

  app.get<{ Params: { id: string } }>('/tenants/:id', async (req, reply) => {
    const tenant = await findTenantWithConfig(req.params.id);
    if (!tenant) {
      return reply.status(404).send({ error: 'Tenant no encontrado' });
    }
    const { config: cfg, ...tenantData } = tenant;
    const safeConfig = cfg ? {
      ...cfg,
      clave_marangatu_encrypted: undefined,
      ords_password_encrypted: undefined,
      ords_token_encrypted: undefined,
      ords_client_secret_encrypted: undefined,
    } : null;
    return reply.send({ data: { ...tenantData, config: safeConfig } });
  });

  app.post('/tenants', async (req, reply) => {
    const parsed = createTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.errors });
    }

    const { config: configInput, ...tenantInput } = parsed.data;
    const tenant = await createTenant(tenantInput);

    if (configInput) {
      await upsertTenantConfig(tenant.id, {
        ruc_login: configInput.ruc_login,
        usuario_marangatu: configInput.usuario_marangatu,
        clave_marangatu: configInput.clave_marangatu,
        marangatu_base_url: configInput.marangatu_base_url,
        ords_base_url: configInput.ords_base_url,
        ords_endpoint_facturas: configInput.ords_endpoint_facturas,
        ords_tipo_autenticacion: configInput.ords_tipo_autenticacion,
        ords_usuario: configInput.ords_usuario,
        ords_password: configInput.ords_password,
        ords_token: configInput.ords_token,
        ords_client_id: configInput.ords_client_id,
        ords_client_secret: configInput.ords_client_secret,
        ords_token_endpoint: configInput.ords_token_endpoint,
        enviar_a_ords_automaticamente: configInput.enviar_a_ords_automaticamente,
        frecuencia_sincronizacion_minutos: configInput.frecuencia_sincronizacion_minutos,
        extra_config: configInput.extra_config,
      });
    }

    return reply.status(201).send({ data: tenant });
  });

  app.put<{ Params: { id: string } }>('/tenants/:id', async (req, reply) => {
    const existing = await findTenantById(req.params.id);
    if (!existing) {
      return reply.status(404).send({ error: 'Tenant no encontrado' });
    }

    const parsed = updateTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.errors });
    }

    const { config: configInput, ...tenantInput } = parsed.data;

    // Usuarios no-admin: solo pueden cambiar credenciales Marangatu
    if (req.currentUser.rol !== 'ADMIN') {
      // No pueden cambiar datos del tenant (nombre, activo, etc.)
      if (tenantInput.nombre_fantasia || tenantInput.email_contacto || tenantInput.timezone || tenantInput.activo !== undefined) {
        return reply.status(403).send({ error: 'Solo un administrador puede modificar los datos de la empresa' });
      }
      // En config, solo pueden cambiar usuario_marangatu y clave_marangatu
      if (configInput) {
        const allowedKeys = new Set(['usuario_marangatu', 'clave_marangatu']);
        const configKeys = Object.keys(configInput).filter((k) => (configInput as Record<string, unknown>)[k] !== undefined);
        const forbidden = configKeys.filter((k) => !allowedKeys.has(k));
        if (forbidden.length > 0) {
          return reply.status(403).send({
            error: 'Solo podés modificar el usuario y la clave de Marangatu',
          });
        }
      }
    }
    const tenant = await updateTenant(req.params.id, tenantInput);

    if (configInput) {
      await upsertTenantConfig(req.params.id, {
        ruc_login: configInput.ruc_login,
        usuario_marangatu: configInput.usuario_marangatu,
        clave_marangatu: configInput.clave_marangatu,
        marangatu_base_url: configInput.marangatu_base_url,
        ords_base_url: configInput.ords_base_url,
        ords_endpoint_facturas: configInput.ords_endpoint_facturas,
        ords_tipo_autenticacion: configInput.ords_tipo_autenticacion,
        ords_usuario: configInput.ords_usuario,
        ords_password: configInput.ords_password,
        ords_token: configInput.ords_token,
        ords_client_id: configInput.ords_client_id,
        ords_client_secret: configInput.ords_client_secret,
        ords_token_endpoint: configInput.ords_token_endpoint,
        enviar_a_ords_automaticamente: configInput.enviar_a_ords_automaticamente,
        frecuencia_sincronizacion_minutos: configInput.frecuencia_sincronizacion_minutos,
        extra_config: configInput.extra_config,
      });
    }

    return reply.send({ data: tenant });
  });

  app.delete<{ Params: { id: string } }>('/tenants/:id', async (req, reply) => {
    if (req.currentUser.rol !== 'ADMIN') {
      return reply.status(403).send({ error: 'Solo un administrador puede eliminar empresas' });
    }

    const existing = await findTenantById(req.params.id);
    if (!existing) {
      return reply.status(404).send({ error: 'Tenant no encontrado' });
    }

    const deleted = await deleteTenant(req.params.id);
    if (!deleted) {
      return reply.status(500).send({ error: 'Error al eliminar la empresa' });
    }

    logger.info('DELETE /tenants/:id', {
      tenantId: req.params.id,
      tenantName: existing.nombre_fantasia,
      user: req.currentUser?.username,
    });

    return reply.send({ message: `Empresa "${existing.nombre_fantasia}" eliminada correctamente` });
  });
}
