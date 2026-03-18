import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { errorHandler } from './middleware/error.middleware';
import { scopeTenants, checkTenantAccess } from './middleware/auth.middleware';
import { authRoutes } from './routes/auth.routes';
import { userRoutes } from './routes/user.routes';
import { tenantRoutes } from './routes/tenant.routes';
import { jobRoutes } from './routes/job.routes';
import { comprobanteRoutes } from './routes/comprobante.routes';

export async function buildServer() {
  const app = Fastify({
    logger: false,
    trustProxy: true,
  });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await app.register(fastifyJwt, {
    secret: config.security.jwtSecret,
    sign: { expiresIn: config.security.jwtExpiresIn },
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'DNIT Comprobantes API',
        description: 'API de automatización de comprobantes fiscales SET Paraguay - multitenant',
        version: '1.0.0',
      },
      servers: [
        { url: `http://localhost:${config.server.port}`, description: 'Desarrollo local' },
        ...(config.server.nodeEnv === 'production'
          ? [{ url: `http://${process.env.PUBLIC_HOST || 'localhost'}:${config.server.port}`, description: 'Producción' }]
          : []),
      ],
      tags: [
        { name: 'auth', description: 'Autenticación' },
        { name: 'users', description: 'Gestión de usuarios' },
        { name: 'tenants', description: 'Gestión de empresas' },
        { name: 'jobs', description: 'Cola de trabajos' },
        { name: 'comprobantes', description: 'Comprobantes fiscales' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list' },
  });

  app.setErrorHandler(errorHandler);

  // Rutas públicas
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  }));

  await app.register(authRoutes);

  // Rutas protegidas con autenticación + scoping de tenants
  await app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', scopeTenants);

    // Hook para verificar acceso a tenant en rutas con :id de tenant
    protectedApp.addHook('preHandler', async (request, reply) => {
      const params = request.params as Record<string, string>;
      if (params.id && request.url.includes('/tenants/')) {
        checkTenantAccess(request, reply);
      }
    });

    await protectedApp.register(tenantRoutes);
    await protectedApp.register(jobRoutes);
    await protectedApp.register(comprobanteRoutes);
  });

  // Rutas admin-only
  await app.register(userRoutes);

  logger.info('Servidor Fastify configurado');
  return app;
}
