import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  findAllTenants,
  findTenantById,
  createTenant,
  updateTenant,
  upsertTenantConfig,
  findTenantWithConfig,
} from '../../db/repositories/tenant.repository';

const createTenantSchema = z.object({
  nombre_fantasia: z.string().min(1).max(255),
  ruc: z.string().min(3).max(20),
  email_contacto: z.string().email().optional(),
  timezone: z.string().optional(),
  config: z.object({
    ruc_login: z.string().min(3),
    usuario_marangatu: z.string().min(1),
    clave_marangatu: z.string().min(1),
    marangatu_base_url: z.string().url().optional(),
    ords_base_url: z.string().url().optional(),
    ords_endpoint_facturas: z.string().optional(),
    ords_tipo_autenticacion: z.enum(['BASIC', 'BEARER', 'NONE']).optional(),
    ords_usuario: z.string().optional(),
    ords_password: z.string().optional(),
    ords_token: z.string().optional(),
    enviar_a_ords_automaticamente: z.boolean().optional(),
    frecuencia_sincronizacion_minutos: z.number().int().min(1).optional(),
    extra_config: z.record(z.unknown()).optional(),
  }).optional(),
});

const updateTenantSchema = z.object({
  nombre_fantasia: z.string().min(1).max(255).optional(),
  email_contacto: z.string().email().optional(),
  timezone: z.string().optional(),
  activo: z.boolean().optional(),
  config: z.object({
    ruc_login: z.string().min(3).optional(),
    usuario_marangatu: z.string().min(1).optional(),
    clave_marangatu: z.string().min(1).optional(),
    marangatu_base_url: z.string().url().optional(),
    ords_base_url: z.string().url().optional(),
    ords_endpoint_facturas: z.string().optional(),
    ords_tipo_autenticacion: z.enum(['BASIC', 'BEARER', 'NONE']).optional(),
    ords_usuario: z.string().optional(),
    ords_password: z.string().optional(),
    ords_token: z.string().optional(),
    enviar_a_ords_automaticamente: z.boolean().optional(),
    frecuencia_sincronizacion_minutos: z.number().int().min(1).optional(),
    extra_config: z.record(z.unknown()).optional(),
  }).optional(),
});

export async function tenantRoutes(app: FastifyInstance): Promise<void> {
  app.get('/tenants', async (_req, reply) => {
    const tenants = await findAllTenants();
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
      if (!configInput.ruc_login || !configInput.usuario_marangatu || !configInput.clave_marangatu) {
        return reply.status(400).send({
          error: 'Al crear un tenant, config requiere ruc_login, usuario_marangatu y clave_marangatu',
        });
      }
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
        enviar_a_ords_automaticamente: configInput.enviar_a_ords_automaticamente,
        frecuencia_sincronizacion_minutos: configInput.frecuencia_sincronizacion_minutos,
        extra_config: configInput.extra_config,
      });
    }

    return reply.send({ data: tenant });
  });
}
