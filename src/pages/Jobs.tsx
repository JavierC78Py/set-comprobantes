import { useEffect, useState, useCallback } from 'react';
import {
  Briefcase,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/Spinner';
import { api } from '../lib/api';
import { formatRelative, formatDateTime, JOB_TYPE_LABELS } from '../lib/utils';
import type { Job, Tenant, JobStatus, JobType } from '../types';

interface JobsProps {
  toastError: (title: string, desc?: string) => void;
}

function JobStatusBadge({ status }: { status: JobStatus }) {
  const map: Record<JobStatus, { variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; label: string }> = {
    PENDING: { variant: 'warning', label: 'Pendiente' },
    RUNNING: { variant: 'info', label: 'En ejecución' },
    DONE: { variant: 'success', label: 'Completado' },
    FAILED: { variant: 'danger', label: 'Fallido' },
  };
  const { variant, label } = map[status];
  return (
    <Badge variant={variant} dot>
      {label}
    </Badge>
  );
}

function JobTypeIcon({ tipo }: { tipo: JobType }) {
  const map: Record<JobType, { icon: React.ReactNode; bg: string }> = {
    SYNC_COMPROBANTES: {
      icon: <RefreshCw className="w-3.5 h-3.5 text-sky-600" />,
      bg: 'bg-sky-50',
    },
    ENVIAR_A_ORDS: {
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />,
      bg: 'bg-emerald-50',
    },
    DESCARGAR_XML: {
      icon: <Briefcase className="w-3.5 h-3.5 text-amber-600" />,
      bg: 'bg-amber-50',
    },
  };
  const { icon, bg } = map[tipo] || {
    icon: <Briefcase className="w-3.5 h-3.5 text-zinc-500" />,
    bg: 'bg-zinc-100',
  };
  return (
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${bg}`}>
      {icon}
    </div>
  );
}

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'RUNNING', label: 'En ejecución' },
  { value: 'DONE', label: 'Completados' },
  { value: 'FAILED', label: 'Fallidos' },
];

const TYPE_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Todos los tipos' },
  { value: 'SYNC_COMPROBANTES', label: 'Sincronización' },
  { value: 'DESCARGAR_XML', label: 'Descarga XML' },
  { value: 'ENVIAR_A_ORDS', label: 'Envío ORDS' },
];

interface JobRowProps {
  job: Job;
  tenant?: Tenant;
  expanded: boolean;
  onToggle: () => void;
}

function JobRow({ job, tenant, expanded, onToggle }: JobRowProps) {
  const statusIcon = {
    DONE: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />,
    FAILED: <XCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />,
    RUNNING: <Loader2 className="w-3.5 h-3.5 text-sky-500 animate-spin flex-shrink-0" />,
    PENDING: <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />,
  }[job.estado];

  return (
    <>
      <tr className="table-tr cursor-pointer" onClick={onToggle}>
        <td className="table-td">
          <div className="flex items-center gap-3">
            <JobTypeIcon tipo={job.tipo_job} />
            <div>
              <p className="font-medium text-zinc-900">
                {JOB_TYPE_LABELS[job.tipo_job] || job.tipo_job}
              </p>
              <p className="text-xs font-mono text-zinc-400">{job.id.slice(0, 8)}</p>
            </div>
          </div>
        </td>
        <td className="table-td">
          {tenant ? (
            <div>
              <p className="text-sm font-medium text-zinc-700">{tenant.nombre_fantasia}</p>
              <p className="text-xs font-mono text-zinc-400">{tenant.ruc}</p>
            </div>
          ) : (
            <span className="tag text-zinc-400">{job.tenant_id.slice(0, 8)}</span>
          )}
        </td>
        <td className="table-td">
          <div className="flex items-center gap-2">
            {statusIcon}
            <JobStatusBadge status={job.estado} />
          </div>
        </td>
        <td className="table-td hidden lg:table-cell">
          <div className="flex items-center gap-1 text-xs text-zinc-500">
            <span>{job.intentos}</span>
            <span className="text-zinc-300">/</span>
            <span>{job.max_intentos}</span>
          </div>
        </td>
        <td className="table-td text-xs text-zinc-400">
          {job.last_run_at ? formatRelative(job.last_run_at) : formatRelative(job.created_at)}
        </td>
        <td className="table-td">
          <ChevronDown
            className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </td>
      </tr>

      {expanded && (
        <tr className="bg-zinc-50/80">
          <td colSpan={6} className="px-5 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
              <div>
                <p className="font-semibold text-zinc-600 mb-2">Detalles del job</p>
                <dl className="space-y-1.5">
                  <MiniRow label="ID" value={<span className="font-mono">{job.id}</span>} />
                  <MiniRow label="Tipo" value={job.tipo_job} />
                  <MiniRow label="Estado" value={<JobStatusBadge status={job.estado} />} />
                  <MiniRow label="Intentos" value={`${job.intentos} / ${job.max_intentos}`} />
                </dl>
              </div>
              <div>
                <p className="font-semibold text-zinc-600 mb-2">Timestamps</p>
                <dl className="space-y-1.5">
                  <MiniRow label="Creado" value={formatDateTime(job.created_at)} />
                  <MiniRow
                    label="Última ejecución"
                    value={job.last_run_at ? formatDateTime(job.last_run_at) : '—'}
                  />
                  <MiniRow
                    label="Próxima ejecución"
                    value={job.next_run_at ? formatDateTime(job.next_run_at) : '—'}
                  />
                </dl>
              </div>
              <div>
                <p className="font-semibold text-zinc-600 mb-2">Payload</p>
                {Object.keys(job.payload).length > 0 ? (
                  <pre className="font-mono text-xs bg-white border border-zinc-200 rounded-lg p-3 overflow-x-auto">
                    {JSON.stringify(job.payload, null, 2)}
                  </pre>
                ) : (
                  <p className="text-zinc-400">Sin payload</p>
                )}
              </div>
              {job.error_message && (
                <div className="lg:col-span-3">
                  <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-rose-700 mb-1">Error</p>
                      <p className="font-mono text-xs text-rose-600 whitespace-pre-wrap break-all">
                        {job.error_message}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function MiniRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="text-zinc-400 w-28 flex-shrink-0">{label}</dt>
      <dd className="text-zinc-700">{value}</dd>
    </div>
  );
}

export function Jobs({ toastError }: JobsProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [jobsData, tenantsData] = await Promise.all([
        api.jobs.list({
          estado: statusFilter || undefined,
          tipo_job: typeFilter || undefined,
          limit: 100,
        }),
        api.tenants.list(),
      ]);
      setJobs(jobsData);
      setTenants(tenantsData);
    } catch (e: unknown) {
      toastError('Error al cargar jobs', e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, typeFilter, toastError]);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 15000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, typeFilter]);

  const filtered = jobs.filter((j) => {
    const tenant = tenants.find((t) => t.id === j.tenant_id);
    const searchLower = search.toLowerCase();
    return (
      !search ||
      j.id.includes(search) ||
      j.tipo_job.toLowerCase().includes(searchLower) ||
      tenant?.nombre_fantasia.toLowerCase().includes(searchLower) ||
      tenant?.ruc.includes(search)
    );
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const counts = {
    PENDING: jobs.filter((j) => j.estado === 'PENDING').length,
    RUNNING: jobs.filter((j) => j.estado === 'RUNNING').length,
    DONE: jobs.filter((j) => j.estado === 'DONE').length,
    FAILED: jobs.filter((j) => j.estado === 'FAILED').length,
  };

  if (loading) return <PageLoader />;

  return (
    <div className="animate-fade-in">
      <Header
        title="Jobs"
        subtitle="Cola de trabajos del sistema"
        onRefresh={() => load(true)}
        refreshing={refreshing}
      />

      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { key: 'PENDING', label: 'Pendientes', icon: <Clock className="w-4 h-4 text-amber-500" />, bg: 'bg-amber-50' },
          { key: 'RUNNING', label: 'En ejecución', icon: <Loader2 className="w-4 h-4 text-sky-500 animate-spin" />, bg: 'bg-sky-50' },
          { key: 'DONE', label: 'Completados', icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />, bg: 'bg-emerald-50' },
          { key: 'FAILED', label: 'Fallidos', icon: <XCircle className="w-4 h-4 text-rose-500" />, bg: 'bg-rose-50' },
        ].map(({ key, label, icon, bg }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(statusFilter === key ? '' : key)}
            className={`card p-4 flex items-center gap-3 transition-all hover:shadow-sm text-left ${
              statusFilter === key ? 'ring-2 ring-zinc-900 ring-offset-1' : ''
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bg}`}>
              {icon}
            </div>
            <div>
              <p className="text-lg font-bold text-zinc-900 tabular-nums">
                {counts[key as keyof typeof counts]}
              </p>
              <p className="text-xs text-zinc-500">{label}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            className="input pl-9"
            placeholder="Buscar por ID, empresa..."
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

        <select
          className="input w-auto"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          {TYPE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        <p className="text-sm text-zinc-500 ml-auto">
          {filtered.length} job{filtered.length !== 1 ? 's' : ''}
        </p>
      </div>

      {paginated.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="w-5 h-5" />}
          title="Sin jobs"
          description="No hay jobs con los filtros seleccionados"
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="table-th">Job</th>
                <th className="table-th">Empresa</th>
                <th className="table-th">Estado</th>
                <th className="table-th hidden lg:table-cell">Intentos</th>
                <th className="table-th">Actualizado</th>
                <th className="table-th w-8" />
              </tr>
            </thead>
            <tbody>
              {paginated.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  tenant={tenants.find((t) => t.id === job.tenant_id)}
                  expanded={expandedId === job.id}
                  onToggle={() => setExpandedId(expandedId === job.id ? null : job.id)}
                />
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-100">
              <p className="text-xs text-zinc-500">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de{' '}
                {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-sm btn-secondary px-2 disabled:opacity-40"
                >
                  <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                </button>
                <span className="text-xs text-zinc-500 px-2">
                  {page}/{totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn-sm btn-secondary px-2 disabled:opacity-40"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
