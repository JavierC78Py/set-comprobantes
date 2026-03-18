import { useEffect, useState, useCallback } from 'react';
import {
  Users as UsersIcon,
  Plus,
  Edit3,
  Trash2,
  Shield,
  User as UserIcon,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { PageLoader, Spinner } from '../components/ui/Spinner';
import { api } from '../lib/api';
import { formatRelative } from '../lib/utils';
import type { UserRecord, Tenant } from '../types';

interface UsersProps {
  toastSuccess: (title: string, desc?: string) => void;
  toastError: (title: string, desc?: string) => void;
}

interface UserFormState {
  username: string;
  password: string;
  nombre: string;
  rol: 'ADMIN' | 'USER';
  activo: boolean;
  tenant_ids: string[];
}

const EMPTY_FORM: UserFormState = {
  username: '',
  password: '',
  nombre: '',
  rol: 'USER',
  activo: true,
  tenant_ids: [],
};

export function Users({ toastSuccess, toastError }: UsersProps) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [usersData, tenantsData] = await Promise.all([
        api.users.list(),
        api.tenants.list(),
      ]);
      setUsers(usersData);
      setTenants(tenantsData);
    } catch (e: unknown) {
      toastError('Error al cargar usuarios', e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toastError]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (user: UserRecord) => {
    setEditingUser(user);
    setForm({
      username: user.username,
      password: '',
      nombre: user.nombre,
      rol: user.rol,
      activo: user.activo,
      tenant_ids: user.tenant_ids,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.username.trim() || !form.nombre.trim()) return;
    if (!editingUser && !form.password.trim()) return;

    setFormLoading(true);
    try {
      if (editingUser) {
        const body: Record<string, unknown> = {
          username: form.username,
          nombre: form.nombre,
          rol: form.rol,
          activo: form.activo,
          tenant_ids: form.tenant_ids,
        };
        if (form.password.trim()) body.password = form.password;
        await api.users.update(editingUser.id, body);
        toastSuccess('Usuario actualizado');
      } else {
        await api.users.create({
          username: form.username,
          password: form.password,
          nombre: form.nombre,
          rol: form.rol,
          tenant_ids: form.tenant_ids,
        });
        toastSuccess('Usuario creado');
      }
      setModalOpen(false);
      await load(true);
    } catch (e: unknown) {
      toastError(
        editingUser ? 'Error al actualizar' : 'Error al crear',
        e instanceof Error ? e.message : undefined
      );
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.users.delete(id);
      toastSuccess('Usuario eliminado');
      setDeleteConfirm(null);
      await load(true);
    } catch (e: unknown) {
      toastError('Error al eliminar', e instanceof Error ? e.message : undefined);
    }
  };

  const toggleTenant = (tenantId: string) => {
    setForm((prev) => ({
      ...prev,
      tenant_ids: prev.tenant_ids.includes(tenantId)
        ? prev.tenant_ids.filter((id) => id !== tenantId)
        : [...prev.tenant_ids, tenantId],
    }));
  };

  if (loading) return <PageLoader />;

  return (
    <div className="animate-fade-in">
      <Header
        title="Usuarios"
        subtitle="Gestión de acceso al sistema"
        onRefresh={() => load(true)}
        refreshing={refreshing}
        actions={
          <button onClick={openCreate} className="btn-md btn-primary">
            <Plus className="w-3.5 h-3.5" /> Nuevo usuario
          </button>
        }
      />

      {users.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="w-5 h-5" />}
          title="Sin usuarios"
          description="Creá el primer usuario para habilitar el acceso"
          action={
            <button onClick={openCreate} className="btn-md btn-primary">
              <Plus className="w-3.5 h-3.5" /> Nuevo usuario
            </button>
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="table-th">Usuario</th>
                <th className="table-th">Rol</th>
                <th className="table-th">Empresas</th>
                <th className="table-th">Estado</th>
                <th className="table-th hidden lg:table-cell">Creado</th>
                <th className="table-th w-24" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="table-tr">
                  <td className="table-td">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center">
                        {u.rol === 'ADMIN' ? (
                          <Shield className="w-3.5 h-3.5 text-zinc-600" />
                        ) : (
                          <UserIcon className="w-3.5 h-3.5 text-zinc-400" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-zinc-900">{u.nombre}</p>
                        <p className="text-xs text-zinc-400 font-mono">{u.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="table-td">
                    <Badge variant={u.rol === 'ADMIN' ? 'info' : 'neutral'}>
                      {u.rol}
                    </Badge>
                  </td>
                  <td className="table-td">
                    {u.rol === 'ADMIN' ? (
                      <span className="text-xs text-zinc-500">Todas</span>
                    ) : u.tenant_ids.length > 0 ? (
                      <span className="text-xs text-zinc-600">{u.tenant_ids.length} empresa{u.tenant_ids.length !== 1 ? 's' : ''}</span>
                    ) : (
                      <span className="text-xs text-zinc-400">Ninguna</span>
                    )}
                  </td>
                  <td className="table-td">
                    <Badge variant={u.activo ? 'success' : 'neutral'} dot>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  <td className="table-td hidden lg:table-cell text-xs text-zinc-400">
                    {formatRelative(u.created_at)}
                  </td>
                  <td className="table-td">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(u)}
                        className="btn-sm btn-ghost px-2"
                        title="Editar"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(u.id)}
                        className="btn-sm btn-ghost px-2 text-rose-500 hover:text-rose-700"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal crear/editar usuario */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingUser ? 'Editar usuario' : 'Nuevo usuario'}
        size="md"
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className="btn-md btn-secondary" disabled={formLoading}>
              Cancelar
            </button>
            <button onClick={handleSubmit} disabled={formLoading} className="btn-md btn-primary">
              {formLoading && <Spinner size="xs" />}
              {editingUser ? 'Guardar' : 'Crear'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nombre</label>
              <input
                className="input"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Juan Pérez"
              />
            </div>
            <div>
              <label className="label">Usuario</label>
              <input
                className="input font-mono"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="juan.perez"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">
                {editingUser ? 'Contraseña (vacío = sin cambio)' : 'Contraseña'}
              </label>
              <input
                type="password"
                className="input"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder={editingUser ? '(sin cambios)' : '••••••••'}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="label">Rol</label>
              <select
                className="input"
                value={form.rol}
                onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value as 'ADMIN' | 'USER' }))}
              >
                <option value="USER">Usuario</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </div>
          </div>

          {editingUser && (
            <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-lg border border-zinc-200">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, activo: !f.activo }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  form.activo ? 'bg-zinc-900' : 'bg-zinc-300'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    form.activo ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
              <span className="text-xs font-medium text-zinc-700">
                {form.activo ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          )}

          {form.rol === 'USER' && (
            <div>
              <label className="label">Empresas asignadas</label>
              {tenants.length === 0 ? (
                <p className="text-xs text-zinc-400">No hay empresas disponibles</p>
              ) : (
                <div className="border border-zinc-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-zinc-100">
                  {tenants.map((t) => (
                    <label
                      key={t.id}
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-zinc-50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={form.tenant_ids.includes(t.id)}
                        onChange={() => toggleTenant(t.id)}
                        className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900/20"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-900 truncate">{t.nombre_fantasia}</p>
                        <p className="text-xs text-zinc-400 font-mono">{t.ruc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              {form.rol === 'USER' && form.tenant_ids.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Sin empresas asignadas el usuario no podrá ver datos
                </p>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Modal confirmar eliminación */}
      <Modal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Eliminar usuario"
        size="sm"
        footer={
          <>
            <button onClick={() => setDeleteConfirm(null)} className="btn-md btn-secondary">
              Cancelar
            </button>
            <button
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              className="btn-md bg-rose-600 text-white hover:bg-rose-700"
            >
              Eliminar
            </button>
          </>
        }
      >
        <p className="text-sm text-zinc-600">
          ¿Estás seguro de que querés eliminar este usuario? Esta acción no se puede deshacer.
        </p>
      </Modal>
    </div>
  );
}
