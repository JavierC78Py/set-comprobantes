import { query, queryOne } from '../connection';
import bcrypt from 'bcryptjs';

export interface User {
  id: string;
  username: string;
  password_hash: string;
  nombre: string;
  rol: 'ADMIN' | 'USER';
  activo: boolean;
  created_at: Date;
  updated_at: Date;
}

export type UserSafe = Omit<User, 'password_hash'>;

export interface CreateUserInput {
  username: string;
  password: string;
  nombre: string;
  rol: 'ADMIN' | 'USER';
  tenant_ids?: string[];
}

export interface UpdateUserInput {
  username?: string;
  password?: string;
  nombre?: string;
  rol?: 'ADMIN' | 'USER';
  activo?: boolean;
  tenant_ids?: string[];
}

export async function findUserByUsername(username: string): Promise<User | null> {
  return queryOne<User>(
    'SELECT * FROM users WHERE username = $1',
    [username]
  );
}

export async function findUserById(id: string): Promise<User | null> {
  return queryOne<User>(
    'SELECT * FROM users WHERE id = $1',
    [id]
  );
}

export async function findAllUsers(): Promise<UserSafe[]> {
  return query<UserSafe>(
    `SELECT id, username, nombre, rol, activo, created_at, updated_at
     FROM users ORDER BY nombre ASC`
  );
}

export async function createUser(input: CreateUserInput): Promise<UserSafe> {
  const passwordHash = await bcrypt.hash(input.password, 10);

  const rows = await query<UserSafe>(
    `INSERT INTO users (username, password_hash, nombre, rol)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, nombre, rol, activo, created_at, updated_at`,
    [input.username, passwordHash, input.nombre, input.rol]
  );

  if (!rows[0]) throw new Error('Error al crear usuario');

  if (input.tenant_ids && input.tenant_ids.length > 0) {
    await setUserTenants(rows[0].id, input.tenant_ids);
  }

  return rows[0];
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<UserSafe | null> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  let i = 2;

  if (input.username !== undefined) {
    sets.push(`username = $${i++}`);
    params.push(input.username);
  }
  if (input.password !== undefined) {
    sets.push(`password_hash = $${i++}`);
    params.push(await bcrypt.hash(input.password, 10));
  }
  if (input.nombre !== undefined) {
    sets.push(`nombre = $${i++}`);
    params.push(input.nombre);
  }
  if (input.rol !== undefined) {
    sets.push(`rol = $${i++}`);
    params.push(input.rol);
  }
  if (input.activo !== undefined) {
    sets.push(`activo = $${i++}`);
    params.push(input.activo);
  }

  if (sets.length > 0) {
    const rows = await query<UserSafe>(
      `UPDATE users SET ${sets.join(', ')}
       WHERE id = $1
       RETURNING id, username, nombre, rol, activo, created_at, updated_at`,
      params
    );
    if (!rows[0]) return null;
  }

  if (input.tenant_ids !== undefined) {
    await setUserTenants(id, input.tenant_ids);
  }

  return queryOne<UserSafe>(
    `SELECT id, username, nombre, rol, activo, created_at, updated_at
     FROM users WHERE id = $1`,
    [id]
  );
}

export async function deleteUser(id: string): Promise<boolean> {
  const rows = await query(
    'DELETE FROM users WHERE id = $1 RETURNING id',
    [id]
  );
  return rows.length > 0;
}

export async function findTenantIdsByUserId(userId: string): Promise<string[]> {
  const rows = await query<{ tenant_id: string }>(
    'SELECT tenant_id FROM user_tenants WHERE user_id = $1',
    [userId]
  );
  return rows.map((r) => r.tenant_id);
}

export async function setUserTenants(userId: string, tenantIds: string[]): Promise<void> {
  await query('DELETE FROM user_tenants WHERE user_id = $1', [userId]);
  if (tenantIds.length === 0) return;

  const values = tenantIds.map((_, idx) => `($1, $${idx + 2})`).join(',');
  await query(
    `INSERT INTO user_tenants (user_id, tenant_id) VALUES ${values}
     ON CONFLICT (user_id, tenant_id) DO NOTHING`,
    [userId, ...tenantIds]
  );
}

export async function verifyPassword(user: User, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.password_hash);
}
