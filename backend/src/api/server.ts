import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { errorHandler } from './middleware/error.middleware';
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

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'SET Comprobantes API',
        description: 'API de automatización de comprobantes fiscales SET Paraguay - multitenant',
        version: '1.0.0',
      },
      servers: [
        { url: `http://localhost:${config.server.port}`, description: 'Local' },
      ],
      tags: [
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

  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  }));

  await app.register(tenantRoutes);
  await app.register(jobRoutes);
  await app.register(comprobanteRoutes);

  logger.info('Servidor Fastify configurado');
  return app;
}
