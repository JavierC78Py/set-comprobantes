import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  findAllUsers,
  findUserById,
  createUser,
  updateUser,
  deleteUser,
  findTenantIdsByUserId,
} from '../../db/repositories/user.repository';
import { requireAdmin } from '../middleware/auth.middleware';

const createUserSchema = z.object({
  username: z.string().min(3).max(100),
  password: z.string().min(4),
  nombre: z.string().min(1).max(255),
  rol: z.enum(['ADMIN', 'USER']),
  tenant_ids: z.array(z.string().uuid()).optional(),
});

const updateUserSchema = z.object({
  username: z.string().min(3).max(100).optional(),
  password: z.string().min(4).optional(),
  nombre: z.string().min(1).max(255).optional(),
  rol: z.enum(['ADMIN', 'USER']).optional(),
  activo: z.boolean().optional(),
  tenant_ids: z.array(z.string().uuid()).optional(),
});

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin);

  app.get('/users', async (_req, reply) => {
    const users = await findAllUsers();
    const usersWithTenants = await Promise.all(
      users.map(async (u) => ({
        ...u,
        tenant_ids: await findTenantIdsByUserId(u.id),
      }))
    );
    return reply.send({ data: usersWithTenants });
  });

  app.get<{ Params: { id: string } }>('/users/:id', async (req, reply) => {
    const user = await findUserById(req.params.id);
    if (!user) {
      return reply.status(404).send({ error: 'Usuario no encontrado' });
    }
    const tenantIds = await findTenantIdsByUserId(user.id);
    return reply.send({
      data: {
        id: user.id,
        username: user.username,
        nombre: user.nombre,
        rol: user.rol,
        activo: user.activo,
        tenant_ids: tenantIds,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
    });
  });

  app.post('/users', async (req, reply) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.errors });
    }

    try {
      const user = await createUser(parsed.data);
      return reply.status(201).send({ data: user });
    } catch (err) {
      const error = err as Error;
      if (error.message.includes('unique') || error.message.includes('duplicate')) {
        return reply.status(409).send({ error: 'El nombre de usuario ya existe' });
      }
      throw err;
    }
  });

  app.put<{ Params: { id: string } }>('/users/:id', async (req, reply) => {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.errors });
    }

    const user = await updateUser(req.params.id, parsed.data);
    if (!user) {
      return reply.status(404).send({ error: 'Usuario no encontrado' });
    }

    const tenantIds = await findTenantIdsByUserId(user.id);
    return reply.send({ data: { ...user, tenant_ids: tenantIds } });
  });

  app.delete<{ Params: { id: string } }>('/users/:id', async (req, reply) => {
    if (req.params.id === req.currentUser.id) {
      return reply.status(400).send({ error: 'No puedes eliminar tu propio usuario' });
    }

    const deleted = await deleteUser(req.params.id);
    if (!deleted) {
      return reply.status(404).send({ error: 'Usuario no encontrado' });
    }

    return reply.send({ message: 'Usuario eliminado' });
  });
}
