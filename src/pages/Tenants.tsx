import { useEffect, useState, useCallback } from 'react';
import {
  Building2,
  Plus,
  Search,
  MoreHorizontal,
  RefreshCw,
  Play,
  Edit3,
  X,
  ChevronRight,
  Download,
  Settings,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { PageLoader, Spinner } from '../components/ui/Spinner';
import { TenantForm, type TenantFormData } from '../components/tenants/TenantForm';
import { SyncModal } from '../components/tenants/SyncModal';
import { api } from '../lib/api';
import { formatDateTime, formatRelative } from '../lib/utils';
import type { Tenant, TenantWithConfig } from '../types';
import type { Page } from '../components/layout/Sidebar';

interface TenantsProps {
  onNavigate: (page: Page, params?: Record<string, string>) => void;
  toastSuccess: (title: string, desc?: string) => void;
  toastError: (title: string, desc?: string) => void;
  initialTenantId?: string;
  initialAction?: string;
}

type PanelView = 'list' | 'create' | 'detail' | 'edit';

export function Tenants({
  toastSuccess,
  toastError,
  initialTenantId,
  initialAction,
  onNavigate,
}: TenantsProps) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<PanelView>(initialTenantId ? 'detail' : 'list');
  const [selectedId, setSelectedId] = useState<string | null>(initialTenantId || null);
  const [selectedTenant, setSelectedTenant] = useState<TenantWithConfig | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [xmlModalOpen, setXmlModalOpen] = useState(false);
  const [xmlLoading, setXmlLoading] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const loadList = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await api.tenants.list();
      setTenants(data);
    } catch (e: unknown) {
      toastError('Error al cargar empresas', e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toastError]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const data = await api.tenants.get(id);
      setSelectedTenant(data);
    } catch (e: unknown) {
      toastError('Error al cargar empresa', e instanceof Error ? e.message : undefined);
    } finally {
      setDetailLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId && (view === 'detail' || view === 'edit')) {
      loadDetail(selectedId);
    }
  }, [selectedId, view, loadDetail]);

  useEffect(() => {
    if (initialTenantId && initialAction === 'sync') {
      setSyncModalOpen(true);
    }
  }, [initialTenantId, initialAction]);

  const openDetail = (id: string) => {
    setSelectedId(id);
    setView('detail');
  };

  const handleCreate = async (data: TenantFormData) => {
    setFormLoading(true);
    try {
      await api.tenants.create(data);
      toastSuccess('Empresa creada', data.nombre_fantasia);
      await loadList();
      setView('list');
    } catch (e: unknown) {
      toastError('Error al crear empresa', e instanceof Error ? e.message : undefined);
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdate = async (data: TenantFormData) => {
    if (!selectedId) return;
    setFormLoading(true);
    try {
      await api.tenants.update(selectedId, data);
      toastSuccess('Empresa actualizada');
      await loadList();
      await loadDetail(selectedId);
      setView('detail');
    } catch (e: unknown) {
      toastError('Error al actualizar empresa', e instanceof Error ? e.message : undefined);
    } finally {
      setFormLoading(false);
    }
  };

  const handleSync = async (mes?: number, anio?: number) => {
    if (!selectedId) return;
    setSyncLoading(true);
    try {
      await api.jobs.syncComprobantes(selectedId, mes && anio ? { mes, anio } : undefined);
      toastSuccess('Job encolado', 'El worker procesará la sincronización en breve');
      setSyncModalOpen(false);
      onNavigate('jobs');
    } catch (e: unknown) {
      toastError('Error al encolar sync', e instanceof Error ? e.message : undefined);
    } finally {
      setSyncLoading(false);
    }
  };

  const handleDescargarXml = async () => {
    if (!selectedId) return;
    setXmlLoading(true);
    try {
      await api.jobs.descargarXml(selectedId, { batch_size: 20 });
      toastSuccess('Job XML encolado', 'Se descargarán hasta 20 XMLs pendientes');
      setXmlModalOpen(false);
      onNavigate('jobs');
    } catch (e: unknown) {
      toastError('Error al encolar descarga XML', e instanceof Error ? e.message : undefined);
    } finally {
      setXmlLoading(false);
    }
  };

  const filtered = tenants.filter(
    (t) =>
      t.nombre_fantasia.toLowerCase().includes(search.toLowerCase()) ||
      t.ruc.includes(search)
  );

  const activeTenantName =
    selectedTenant?.nombre_fantasia ||
    tenants.find((t) => t.id === selectedId)?.nombre_fantasia ||
    '';

  if (loading) return <PageLoader />;

  return (
    <div className="animate-fade-in">
      <Header
        title="Empresas"
        subtitle="Gestión de tenants multitenant"
        onRefresh={() => loadList(true)}
        refreshing={refreshing}
        actions={
          <button onClick={() => setView('create')} className="btn-md btn-primary">
            <Plus className="w-3.5 h-3.5" />
            Nueva empresa
          </button>
        }
      />

      {view === 'list' && (
        <>
          <div className="flex items-center gap-3 mb-5">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input
                className="input pl-9"
                placeholder="Buscar por nombre o RUC..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="text-sm text-zinc-500 ml-auto">
              {filtered.length} empresa{filtered.length !== 1 ? 's' : ''}
            </p>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<Building2 className="w-5 h-5" />}
              title="Sin empresas"
              description="Registrá la primera empresa para comenzar a sincronizar comprobantes"
              action={
                <button onClick={() => setView('create')} className="btn-md btn-primary">
                  <Plus className="w-3.5 h-3.5" /> Nueva empresa
                </button>
              }
            />
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead className="bg-zinc-50 border-b border-zinc-200">
                  <tr>
                    <th className="table-th">Empresa</th>
                    <th className="table-th">RUC</th>
                    <th className="table-th">Estado</th>
                    <th className="table-th hidden lg:table-cell">Creado</th>
                    <th className="table-th w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((tenant) => (
                    <tr key={tenant.id} className="table-tr">
                      <td className="table-td">
                        <button
                          onClick={() => openDetail(tenant.id)}
                          className="flex items-center gap-3 group"
                        >
                          <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-zinc-600">
                              {tenant.nombre_fantasia.slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <div className="text-left">
                            <p className="font-medium text-zinc-900 group-hover:text-zinc-600">
                              {tenant.nombre_fantasia}
                            </p>
                            {tenant.email_contacto && (
                              <p className="text-xs text-zinc-400">{tenant.email_contacto}</p>
                            )}
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-300 opacity-0 group-hover:opacity-100" />
                        </button>
                      </td>
                      <td className="table-td">
                        <span className="tag">{tenant.ruc}</span>
                      </td>
                      <td className="table-td">
                        <Badge variant={tenant.activo ? 'success' : 'neutral'} dot>
                          {tenant.activo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      <td className="table-td hidden lg:table-cell text-zinc-400 text-xs">
                        {formatRelative(tenant.created_at)}
                      </td>
                      <td className="table-td">
                        <div className="relative">
                          <button
                            onClick={() =>
                              setOpenMenu(openMenu === tenant.id ? null : tenant.id)
                            }
                            className="btn-sm btn-ghost px-2"
                          >
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </button>
                          {openMenu === tenant.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setOpenMenu(null)}
                              />
                              <div className="absolute right-0 top-8 z-20 w-44 card shadow-md py-1 animate-fade-in">
                                <button
                                  onClick={() => {
                                    setSelectedId(tenant.id);
                                    setSyncModalOpen(true);
                                    setOpenMenu(null);
                                  }}
                                  className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                                >
                                  <Play className="w-3.5 h-3.5" /> Sincronizar
                                </button>
                                <button
                                  onClick={() => {
                                    openDetail(tenant.id);
                                    setOpenMenu(null);
                                  }}
                                  className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                                >
                                  <Settings className="w-3.5 h-3.5" /> Ver detalles
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {view === 'create' && (
        <div>
          <button onClick={() => setView('list')} className="btn-sm btn-ghost mb-6 -ml-1">
            <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Volver
          </button>
          <div className="max-w-2xl">
            <h2 className="text-base font-semibold text-zinc-900 mb-1">Nueva empresa</h2>
            <p className="text-sm text-zinc-500 mb-6">
              Completá los datos básicos y configurá las credenciales de Marangatu
            </p>
            <div className="card p-6">
              <TenantForm onSubmit={handleCreate} loading={formLoading} />
            </div>
          </div>
        </div>
      )}

      {(view === 'detail' || view === 'edit') && selectedTenant && (
        <div>
          <button onClick={() => setView('list')} className="btn-sm btn-ghost mb-6 -ml-1">
            <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Volver
          </button>

          {view === 'detail' && (
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center">
                    <span className="text-sm font-bold text-zinc-600">
                      {selectedTenant.nombre_fantasia.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-900">
                      {selectedTenant.nombre_fantasia}
                    </h2>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="tag">{selectedTenant.ruc}</span>
                      <Badge variant={selectedTenant.activo ? 'success' : 'neutral'} dot>
                        {selectedTenant.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSyncModalOpen(true)}
                    className="btn-md btn-emerald"
                  >
                    <Play className="w-3.5 h-3.5" /> Sincronizar
                  </button>
                  <button
                    onClick={() => setXmlModalOpen(true)}
                    className="btn-md btn-secondary"
                  >
                    <Download className="w-3.5 h-3.5" /> Descargar XML
                  </button>
                  <button
                    onClick={() => setView('edit')}
                    className="btn-md btn-secondary"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Editar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="card p-5">
                  <h3 className="section-title">Información general</h3>
                  <dl className="space-y-3">
                    <Row label="Nombre" value={selectedTenant.nombre_fantasia} />
                    <Row label="RUC" value={<span className="tag">{selectedTenant.ruc}</span>} />
                    <Row
                      label="Email"
                      value={selectedTenant.email_contacto || <span className="text-zinc-400">—</span>}
                    />
                    <Row label="Timezone" value={selectedTenant.timezone} />
                    <Row
                      label="Creado"
                      value={formatDateTime(selectedTenant.created_at)}
                    />
                    <Row
                      label="Actualizado"
                      value={formatDateTime(selectedTenant.updated_at)}
                    />
                  </dl>
                </div>

                {selectedTenant.config && (
                  <div className="card p-5">
                    <h3 className="section-title">Configuración Marangatu</h3>
                    <dl className="space-y-3">
                      <Row label="Usuario" value={selectedTenant.config.usuario_marangatu} />
                      <Row label="RUC login" value={<span className="tag">{selectedTenant.config.ruc_login}</span>} />
                      <Row
                        label="Clave"
                        value={
                          <span className="flex items-center gap-1.5 text-emerald-600 text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Cifrada AES-256
                          </span>
                        }
                      />
                      <Row
                        label="URL base"
                        value={
                          <span className="tag truncate max-w-[180px]">
                            {selectedTenant.config.marangatu_base_url}
                          </span>
                        }
                      />
                      <Row
                        label="Sync cada"
                        value={`${selectedTenant.config.frecuencia_sincronizacion_minutos} min`}
                      />
                    </dl>
                  </div>
                )}

                {selectedTenant.config?.ords_base_url && (
                  <div className="card p-5 lg:col-span-2">
                    <h3 className="section-title">Configuración ORDS</h3>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                      <Row
                        label="Envío automático"
                        value={
                          <Badge
                            variant={
                              selectedTenant.config.enviar_a_ords_automaticamente
                                ? 'success'
                                : 'neutral'
                            }
                            dot
                          >
                            {selectedTenant.config.enviar_a_ords_automaticamente
                              ? 'Activado'
                              : 'Desactivado'}
                          </Badge>
                        }
                      />
                      <Row
                        label="Autenticación"
                        value={
                          <Badge>
                            {selectedTenant.config.ords_tipo_autenticacion}
                          </Badge>
                        }
                      />
                      <Row
                        label="URL base"
                        value={
                          <span className="tag truncate max-w-[250px]">
                            {selectedTenant.config.ords_base_url}
                          </span>
                        }
                      />
                      <Row
                        label="Endpoint"
                        value={
                          <span className="tag">{selectedTenant.config.ords_endpoint_facturas}</span>
                        }
                      />
                      {selectedTenant.config.ords_usuario && (
                        <Row label="Usuario" value={selectedTenant.config.ords_usuario} />
                      )}
                      <Row
                        label="Credencial"
                        value={
                          <span className="flex items-center gap-1.5 text-emerald-600 text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Cifrada AES-256
                          </span>
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {view === 'edit' && (
            <div className="max-w-2xl">
              <h2 className="text-base font-semibold text-zinc-900 mb-1">
                Editar empresa
              </h2>
              <p className="text-sm text-zinc-500 mb-6">{selectedTenant.nombre_fantasia}</p>
              <div className="card p-6">
                <TenantForm
                  initialData={selectedTenant}
                  onSubmit={handleUpdate}
                  loading={formLoading}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {detailLoading && view !== 'list' && (
        <div className="flex items-center justify-center py-12">
          <Spinner size="md" className="text-zinc-400" />
        </div>
      )}

      <SyncModal
        open={syncModalOpen}
        onClose={() => setSyncModalOpen(false)}
        onSubmit={handleSync}
        tenantName={activeTenantName}
        loading={syncLoading}
      />

      <Modal
        open={xmlModalOpen}
        onClose={() => setXmlModalOpen(false)}
        title="Descargar XMLs"
        description={activeTenantName}
        size="sm"
        footer={
          <>
            <button
              onClick={() => setXmlModalOpen(false)}
              className="btn-md btn-secondary"
              disabled={xmlLoading}
            >
              Cancelar
            </button>
            <button
              onClick={handleDescargarXml}
              disabled={xmlLoading}
              className="btn-md btn-primary"
            >
              {xmlLoading && <Spinner size="xs" />}
              Encolar descarga
            </button>
          </>
        }
      >
        <p className="text-sm text-zinc-600">
          Se encolará un job <span className="tag">DESCARGAR_XML</span> que descargará hasta 20
          XMLs pendientes de eKuatia para esta empresa.
        </p>
        <p className="text-xs text-zinc-400 mt-3">
          Requiere saldo disponible en SolveCaptcha para resolver el reCAPTCHA de eKuatia.
        </p>
      </Modal>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <dt className="text-xs text-zinc-500 w-28 flex-shrink-0 pt-0.5">{label}</dt>
      <dd className="text-sm text-zinc-900 flex-1 min-w-0">
        {typeof value === 'string' ? value : value}
      </dd>
    </div>
  );
}
