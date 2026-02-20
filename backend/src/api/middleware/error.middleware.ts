import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../../config/logger';

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  logger.error('Request error', {
    method: request.method,
    url: request.url,
    error: error.message,
    statusCode: error.statusCode,
  });

  if (error.validation) {
    void reply.status(400).send({
      error: 'Validation Error',
      message: 'Datos de entrada inválidos',
      details: error.validation,
    });
    return;
  }

  if (error.statusCode) {
    void reply.status(error.statusCode).send({
      error: error.name,
      message: error.message,
    });
    return;
  }

  void reply.status(500).send({
    error: 'Internal Server Error',
    message: 'Error interno del servidor',
  });
}
