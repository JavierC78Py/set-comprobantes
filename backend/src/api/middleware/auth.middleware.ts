import { FastifyRequest, FastifyReply } from 'fastify';
import { findTenantIdsByUserId } from '../../db/repositories/user.repository';

export interface JwtPayload {
  id: string;
  username: string;
  nombre: string;
  rol: 'ADMIN' | 'USER';
}

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: JwtPayload;
    allowedTenants: string[] | null;
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const decoded = await request.jwtVerify<JwtPayload>();
    request.currentUser = decoded;
  } catch {
    return reply.status(401).send({ error: 'Token inválido o expirado' });
  }
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await authenticate(request, reply);
  if (reply.sent) return;
  if (request.currentUser.rol !== 'ADMIN') {
    return reply.status(403).send({ error: 'Acceso denegado: se requiere rol ADMIN' });
  }
}

export async function scopeTenants(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await authenticate(request, reply);
  if (reply.sent) return;

  if (request.currentUser.rol === 'ADMIN') {
    request.allowedTenants = null;
  } else {
    request.allowedTenants = await findTenantIdsByUserId(request.currentUser.id);
  }
}

export function checkTenantAccess(
  request: FastifyRequest,
  reply: FastifyReply
): boolean {
  const params = request.params as Record<string, string>;
  const tenantId = params.id || params.tenantId;
  if (!tenantId) return true;

  if (request.allowedTenants && !request.allowedTenants.includes(tenantId)) {
    reply.status(403).send({ error: 'No tienes acceso a esta empresa' });
    return false;
  }
  return true;
}
