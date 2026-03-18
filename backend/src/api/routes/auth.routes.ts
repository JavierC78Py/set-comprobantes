import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  findUserByUsername,
  findUserById,
  verifyPassword,
  findTenantIdsByUserId,
} from '../../db/repositories/user.repository';
import { authenticate, type JwtPayload } from '../middleware/auth.middleware';
import bcrypt from 'bcryptjs';
import { query } from '../../db/connection';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(4),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Usuario y contraseña son requeridos' });
    }

    const user = await findUserByUsername(parsed.data.username);
    if (!user || !user.activo) {
      return reply.status(401).send({ error: 'Credenciales inválidas' });
    }

    const valid = await verifyPassword(user, parsed.data.password);
    if (!valid) {
      return reply.status(401).send({ error: 'Credenciales inválidas' });
    }

    const tenantIds = user.rol === 'ADMIN'
      ? null
      : await findTenantIdsByUserId(user.id);

    const payload: JwtPayload = {
      id: user.id,
      username: user.username,
      nombre: user.nombre,
      rol: user.rol,
    };

    const token = app.jwt.sign(payload);

    return reply.send({
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          nombre: user.nombre,
          rol: user.rol,
          tenant_ids: tenantIds,
        },
      },
    });
  });

  app.get('/auth/me', { preHandler: [authenticate] }, async (req, reply) => {
    const user = await findUserById(req.currentUser.id);
    if (!user || !user.activo) {
      return reply.status(401).send({ error: 'Usuario no encontrado o inactivo' });
    }

    const tenantIds = user.rol === 'ADMIN'
      ? null
      : await findTenantIdsByUserId(user.id);

    return reply.send({
      data: {
        id: user.id,
        username: user.username,
        nombre: user.nombre,
        rol: user.rol,
        tenant_ids: tenantIds,
      },
    });
  });

  app.put('/auth/change-password', { preHandler: [authenticate] }, async (req, reply) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.errors });
    }

    const user = await findUserById(req.currentUser.id);
    if (!user) {
      return reply.status(404).send({ error: 'Usuario no encontrado' });
    }

    const valid = await verifyPassword(user, parsed.data.current_password);
    if (!valid) {
      return reply.status(401).send({ error: 'Contraseña actual incorrecta' });
    }

    const newHash = await bcrypt.hash(parsed.data.new_password, 10);
    await query('UPDATE users SET password_hash = $2 WHERE id = $1', [user.id, newHash]);

    return reply.send({ message: 'Contraseña actualizada' });
  });
}
