import { useEffect, useState, useCallback } from 'react';
import {
  Building2,
  Plus,
  Search,
  MoreHorizontal,
  Play,
  Edit3,
  X,
  ChevronRight,
  Download,
  Settings,
  CheckCircle2,
  Send,
  FileText,
  Code2,
  AlertCircle,
  Clock,
  KeyRound,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { PageLoader, Spinner } from '../components/ui/Spinner';
import { TenantForm, type TenantFormData } from '../components/tenants/TenantForm';
import { SyncModal } from '../components/tenants/SyncModal';
import { ConsultaModal } from '../components/tenants/ConsultaModal';
import { api } from '../lib/api';
import { formatDateTime, formatRelative } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
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
  const { isAdmin } = useAuth();
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
  const [consultaModalOpen, setConsultaModalOpen] = useState(false);
  const [consultaLoading, setConsultaLoading] = useState(false);
  const [ordsModalOpen, setOrdsModalOpen] = useState(false);
  const [ordsLoading, setOrdsLoading] = useState(false);
  const [ordsFechaDesde, setOrdsFechaDesde] = useState('');
  const [ordsFechaHasta, setOrdsFechaHasta] = useState('');
  const [ordsForzarReenvio, setOrdsForzarReenvio] = useState(false);
  const [xmlModalOpen, setXmlModalOpen] = useState(false);
  const [xmlLoading, setXmlLoading] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [togglingTenant, setTogglingTenant] = useState<string | null>(null);
  const [credsModalOpen, setCredsModalOpen] = useState(false);
  const [credsForm, setCredsForm] = useState({ usuario_marangatu: '', clave_marangatu: '' });
  const [credsLoading, setCredsLoading] = useState(false);
  const [tenantStats, setTenantStats] = useState<{
    total: number; con_xml: number; enviados_ords: number; pendientes_ords: number; fallidos_ords: number;
  } | null>(null);

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
    setTenantStats(null);
    try {
      const [data, stats] = await Promise.all([
        api.tenants.get(id),
        api.comprobantes.stats(id),
      ]);
      setSelectedTenant(data);
      setTenantStats(stats);
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

  const handleConsulta = async (fechaDesde: string, fechaHasta: string) => {
    if (!selectedId) return;
    setConsultaLoading(true);
    try {
      await api.jobs.consultaComprobantes(selectedId, { fecha_desde: fechaDesde, fecha_hasta: fechaHasta });
      toastSuccess('Job encolado', 'Se consultarán comprobantes registrados en Marangatu');
      setConsultaModalOpen(false);
      onNavigate('jobs');
    } catch (e: unknown) {
      toastError('Error al encolar consulta', e instanceof Error ? e.message : undefined);
    } finally {
      setConsultaLoading(false);
    }
  };

  const handleEnviarOrds = async () => {
    if (!selectedId) return;
    setOrdsLoading(true);
    try {
      await api.jobs.enviarOrds(selectedId, {
        fecha_desde: ordsFechaDesde || undefined,
        fecha_hasta: ordsFechaHasta || undefined,
        forzar_reenvio: ordsForzarReenvio,
      });
      toastSuccess('Job encolado', 'Se enviarán los comprobantes con XML a ORDS');
      setOrdsModalOpen(false);
      setOrdsFechaDesde('');
      setOrdsFechaHasta('');
      setOrdsForzarReenvio(false);
      onNavigate('jobs');
    } catch (e: unknown) {
      toastError('Error al encolar envío ORDS', e instanceof Error ? e.message : undefined);
    } finally {
      setOrdsLoading(false);
    }
  };

  const openCredsModal = () => {
    setCredsForm({
      usuario_marangatu: selectedTenant?.config?.usuario_marangatu || '',
      clave_marangatu: '',
    });
    setCredsModalOpen(true);
  };

  const handleSaveCreds = async () => {
    if (!selectedId) return;
    if (!credsForm.usuario_marangatu.trim()) {
      toastError('El usuario Marangatu es requerido');
      return;
    }
    setCredsLoading(true);
    try {
      const config: Record<string, string> = {
        usuario_marangatu: credsForm.usuario_marangatu,
      };
      if (credsForm.clave_marangatu.trim()) {
        config.clave_marangatu = credsForm.clave_marangatu;
      }
      await api.tenants.update(selectedId, { config });
      toastSuccess('Credenciales actualizadas');
      setCredsModalOpen(false);
      await loadDetail(selectedId);
    } catch (e: unknown) {
      toastError('Error al guardar credenciales', e instanceof Error ? e.message : undefined);
    } finally {
      setCredsLoading(false);
    }
  };

  const handleToggleActivo = async (tenantId: string, currentActivo: boolean) => {
    setTogglingTenant(tenantId);
    try {
      await api.tenants.update(tenantId, { activo: !currentActivo });
      toastSuccess(
        !currentActivo ? 'Empresa activada' : 'Empresa desactivada',
        !currentActivo ? 'Participará en sincronizaciones automáticas' : 'No participará en sincronizaciones automáticas'
      );
      await loadList(true);
      if (selectedId === tenantId && selectedTenant) {
        setSelectedTenant({ ...selectedTenant, activo: !currentActivo });
      }
    } catch (e: unknown) {
      toastError('Error al cambiar estado', e instanceof Error ? e.message : undefined);
    } finally {
      setTogglingTenant(null);
    }
  };

  const handleDescargarXml = async () => {
    if (!selectedId) return;
    setXmlLoading(true);
    try {
      const result = await api.jobs.descargarXml(selectedId, { batch_size: 20 });
      if (!result.job_id) {
        toastError('Sin XMLs pendientes', 'No hay comprobantes con CDC pendientes de descarga XML para esta empresa');
        return;
      }
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
          isAdmin ? (
            <button onClick={() => setView('create')} className="btn-md btn-primary">
              <Plus className="w-3.5 h-3.5" />
              Nueva empresa
            </button>
          ) : undefined
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
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
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
              description={isAdmin ? 'Registrá la primera empresa para comenzar a sincronizar comprobantes' : 'No tenés empresas asignadas'}
              action={
                isAdmin ? (
                  <button onClick={() => setView('create')} className="btn-md btn-primary">
                    <Plus className="w-3.5 h-3.5" /> Nueva empresa
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead className="bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
                  <tr>
                    <th className="table-th">Empresa</th>
                    <th className="table-th">RUC</th>
                    <th className="table-th">Estado</th>
                    <th className="table-th hidden lg:table-cell">Creado</th>
                    {isAdmin && <th className="table-th w-10" />}
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
                          <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300">
                              {tenant.nombre_fantasia.slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <div className="text-left">
                            <p className="font-medium text-zinc-900 dark:text-zinc-100 group-hover:text-zinc-600 dark:group-hover:text-zinc-300">
                              {tenant.nombre_fantasia}
                            </p>
                            {tenant.email_contacto && (
                              <p className="text-xs text-zinc-400">{tenant.email_contacto}</p>
                            )}
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100" />
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
                      {isAdmin && (
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
                                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                                  >
                                    <Play className="w-3.5 h-3.5" /> Sincronizar
                                  </button>
                                  <button
                                    onClick={() => {
                                      openDetail(tenant.id);
                                      setOpenMenu(null);
                                    }}
                                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                                  >
                                    <Settings className="w-3.5 h-3.5" /> Ver detalles
                                  </button>
                                  <button
                                    onClick={() => {
                                      handleToggleActivo(tenant.id, tenant.activo);
                                      setOpenMenu(null);
                                    }}
                                    disabled={togglingTenant === tenant.id}
                                    className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 ${
                                      tenant.activo ? 'text-amber-600' : 'text-emerald-600'
                                    }`}
                                  >
                                    {tenant.activo ? (
                                      <><X className="w-3.5 h-3.5" /> Desactivar</>
                                    ) : (
                                      <><Play className="w-3.5 h-3.5" /> Activar</>
                                    )}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      )}
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
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Nueva empresa</h2>
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
                  <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center">
                    <span className="text-sm font-bold text-zinc-600 dark:text-zinc-300">
                      {selectedTenant.nombre_fantasia.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                      {selectedTenant.nombre_fantasia}
                    </h2>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="tag">{selectedTenant.ruc}</span>
                      {isAdmin ? (
                        <button
                          onClick={() => handleToggleActivo(selectedTenant.id, selectedTenant.activo)}
                          disabled={togglingTenant === selectedTenant.id}
                          className="flex items-center gap-2 group"
                          title={selectedTenant.activo ? 'Click para desactivar' : 'Click para activar'}
                        >
                          <span
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              selectedTenant.activo ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'
                            }`}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                selectedTenant.activo ? 'translate-x-4' : 'translate-x-0.5'
                              }`}
                            />
                          </span>
                          <span className={`text-xs font-medium ${selectedTenant.activo ? 'text-emerald-600' : 'text-zinc-400'}`}>
                            {selectedTenant.activo ? 'Activa' : 'Inactiva'}
                          </span>
                        </button>
                      ) : (
                        <Badge variant={selectedTenant.activo ? 'success' : 'neutral'} dot>
                          {selectedTenant.activo ? 'Activa' : 'Inactiva'}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin ? (
                    <>
                      <button
                        onClick={() => setSyncModalOpen(true)}
                        className="btn-md btn-emerald"
                      >
                        <Play className="w-3.5 h-3.5" /> Sincronizar
                      </button>
                      <button
                        onClick={() => setConsultaModalOpen(true)}
                        className="btn-md btn-emerald"
                      >
                        <Play className="w-3.5 h-3.5" /> Periodo específico
                      </button>
                      <button
                        onClick={() => setXmlModalOpen(true)}
                        className="btn-md btn-secondary"
                      >
                        <Download className="w-3.5 h-3.5" /> Descargar XML
                      </button>
                      <button
                        onClick={() => setOrdsModalOpen(true)}
                        className="btn-md btn-secondary"
                      >
                        <Send className="w-3.5 h-3.5" /> Enviar a ORDS
                      </button>
                      <button
                        onClick={() => setView('edit')}
                        className="btn-md btn-secondary"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Editar
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={openCredsModal}
                      className="btn-md btn-primary"
                    >
                      <KeyRound className="w-3.5 h-3.5" /> Configurar credenciales
                    </button>
                  )}
                </div>
              </div>

              {tenantStats && (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  <div className="card p-4 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <FileText className="w-3.5 h-3.5 text-zinc-400" />
                      <p className="text-xs text-zinc-500">Total documentos</p>
                    </div>
                    <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                      {tenantStats.total.toLocaleString()}
                    </p>
                  </div>
                  <div className="card p-4 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <Code2 className="w-3.5 h-3.5 text-blue-500" />
                      <p className="text-xs text-zinc-500">Con XML</p>
                    </div>
                    <p className="text-xl font-bold text-blue-600 tabular-nums">
                      {tenantStats.con_xml.toLocaleString()}
                    </p>
                  </div>
                  <div className="card p-4 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <Send className="w-3.5 h-3.5 text-emerald-500" />
                      <p className="text-xs text-zinc-500">Enviados ORDS</p>
                    </div>
                    <p className="text-xl font-bold text-emerald-600 tabular-nums">
                      {tenantStats.enviados_ords.toLocaleString()}
                    </p>
                  </div>
                  <div className="card p-4 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      <p className="text-xs text-zinc-500">Pendientes ORDS</p>
                    </div>
                    <p className="text-xl font-bold text-amber-600 tabular-nums">
                      {tenantStats.pendientes_ords.toLocaleString()}
                    </p>
                  </div>
                  <div className="card p-4 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                      <p className="text-xs text-zinc-500">Fallidos ORDS</p>
                    </div>
                    <p className="text-xl font-bold text-rose-600 tabular-nums">
                      {tenantStats.fallidos_ords.toLocaleString()}
                    </p>
                  </div>
                </div>
              )}

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
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
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

      <ConsultaModal
        open={consultaModalOpen}
        onClose={() => setConsultaModalOpen(false)}
        onSubmit={handleConsulta}
        tenantName={activeTenantName}
        loading={consultaLoading}
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
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Se encolará un job <span className="tag">DESCARGAR_XML</span> que descargará hasta 20
          XMLs pendientes de eKuatia para esta empresa.
        </p>
        <p className="text-xs text-zinc-400 mt-3">
          Requiere saldo disponible en SolveCaptcha para resolver el reCAPTCHA de eKuatia.
        </p>
      </Modal>

      <Modal
        open={ordsModalOpen}
        onClose={() => {
          setOrdsModalOpen(false);
          setOrdsFechaDesde('');
          setOrdsFechaHasta('');
          setOrdsForzarReenvio(false);
        }}
        title="Enviar a ORDS"
        description={activeTenantName}
        size="md"
        footer={
          <>
            <button
              onClick={() => {
                setOrdsModalOpen(false);
                setOrdsFechaDesde('');
                setOrdsFechaHasta('');
                setOrdsForzarReenvio(false);
              }}
              className="btn-md btn-secondary"
              disabled={ordsLoading}
            >
              Cancelar
            </button>
            <button
              onClick={handleEnviarOrds}
              disabled={ordsLoading}
              className="btn-md btn-primary"
            >
              {ordsLoading && <Spinner size="xs" />}
              {ordsForzarReenvio ? 'Reenviar todos' : 'Enviar pendientes'}
            </button>
          </>
        }
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Se encolará un job <span className="tag">ENVIAR_A_ORDS</span> que enviará
          los comprobantes con XML descargado a la API ORDS configurada.
        </p>

        <div className="mt-4 space-y-3">
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Rango de fechas (opcional)</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Desde</label>
              <input
                type="date"
                className="input"
                value={ordsFechaDesde}
                onChange={(e) => setOrdsFechaDesde(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Hasta</label>
              <input
                type="date"
                className="input"
                value={ordsFechaHasta}
                onChange={(e) => setOrdsFechaHasta(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-zinc-400">
            Si no se especifica rango, se envían todos los comprobantes con XML descargado.
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <div>
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Forzar reenvío</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Reenviar comprobantes ya enviados o fallidos
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOrdsForzarReenvio(!ordsForzarReenvio)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              ordsForzarReenvio ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-600'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                ordsForzarReenvio ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </Modal>

      {/* Modal credenciales Marangatu (para usuarios no-admin) */}
      <Modal
        open={credsModalOpen}
        onClose={() => setCredsModalOpen(false)}
        title="Credenciales Marangatu"
        description={activeTenantName}
        size="sm"
        footer={
          <>
            <button
              onClick={() => setCredsModalOpen(false)}
              className="btn-md btn-secondary"
              disabled={credsLoading}
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveCreds}
              disabled={credsLoading}
              className="btn-md btn-primary"
            >
              {credsLoading && <Spinner size="xs" />}
              Guardar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="text-xs text-zinc-500 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
            Las credenciales se cifran con AES-256 antes de almacenarse.
          </div>
          <div>
            <label className="label">Usuario Marangatu</label>
            <input
              className="input"
              value={credsForm.usuario_marangatu}
              onChange={(e) => setCredsForm((f) => ({ ...f, usuario_marangatu: e.target.value }))}
              placeholder="mi_usuario_set"
            />
          </div>
          <div>
            <label className="label">
              {selectedTenant?.config?.clave_marangatu_encrypted ? 'Clave Marangatu (dejar vacío para no cambiar)' : 'Clave Marangatu'}
            </label>
            <input
              type="password"
              className="input"
              value={credsForm.clave_marangatu}
              onChange={(e) => setCredsForm((f) => ({ ...f, clave_marangatu: e.target.value }))}
              placeholder={selectedTenant?.config?.clave_marangatu_encrypted ? '(sin cambios)' : '••••••••'}
              autoComplete="new-password"
            />
          </div>
        </div>
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
      <dd className="text-sm text-zinc-900 dark:text-zinc-100 flex-1 min-w-0">
        {typeof value === 'string' ? value : value}
      </dd>
    </div>
  );
}
