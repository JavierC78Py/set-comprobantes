import { useEffect, useState, useCallback } from 'react';
import {
  Building2,
  Briefcase,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  FileX,
  TrendingUp,
  Activity,
  ArrowRight,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Badge } from '../components/ui/Badge';
import { PageLoader } from '../components/ui/Spinner';
import { api } from '../lib/api';
import { formatRelative, JOB_TYPE_LABELS } from '../lib/utils';
import type { Tenant, Job, DashboardStats } from '../types';
import type { Page } from '../components/layout/Sidebar';

interface DashboardProps {
  onNavigate: (page: Page, params?: Record<string, string>) => void;
}

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  iconBg: string;
  sub?: string;
  trend?: { value: string; positive: boolean };
}

function StatCard({ label, value, icon, iconBg, sub, trend }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>
          {icon}
        </div>
        {trend && (
          <span
            className={`text-xs font-medium ${trend.positive ? 'text-emerald-600' : 'text-rose-500'}`}
          >
            {trend.positive ? '↑' : '↓'} {trend.value}
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-zinc-900 tabular-nums">{value}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function JobStatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'orange'; label: string }> = {
    PENDING: { variant: 'warning', label: 'Pendiente' },
    RUNNING: { variant: 'info', label: 'En ejecución' },
    DONE: { variant: 'success', label: 'Completado' },
    FAILED: { variant: 'danger', label: 'Fallido' },
  };
  const { variant, label } = map[status] || { variant: 'neutral', label: status };
  return (
    <Badge variant={variant} dot>
      {label}
    </Badge>
  );
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [tenantsData, jobsData] = await Promise.all([
        api.tenants.list(),
        api.jobs.list({ limit: 8 }),
      ]);
      setTenants(tenantsData);
      setRecentJobs(jobsData);

      const activeTenants = tenantsData.filter((t) => t.activo).length;
      const pending = jobsData.filter((j) => j.estado === 'PENDING').length;
      const running = jobsData.filter((j) => j.estado === 'RUNNING').length;
      const failed = jobsData.filter((j) => j.estado === 'FAILED').length;
      const done = jobsData.filter((j) => j.estado === 'DONE').length;

      setStats({
        totalTenants: tenantsData.length,
        activeTenants,
        totalJobs: jobsData.length,
        pendingJobs: pending,
        runningJobs: running,
        failedJobs: failed,
        doneJobs: done,
        totalComprobantes: 0,
        comprobantesConXml: 0,
        comprobantesSinXml: 0,
      });
    } catch (_) {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) return <PageLoader />;

  const failedJobs = recentJobs.filter((j) => j.estado === 'FAILED');
  const runningJobs = recentJobs.filter((j) => j.estado === 'RUNNING');
  const activeTenantsCount = tenants.filter((t) => t.activo).length;

  return (
    <div className="animate-fade-in">
      <Header
        title="Dashboard"
        subtitle="Vista general del sistema"
        onRefresh={() => load(true)}
        refreshing={refreshing}
      />

      {failedJobs.length > 0 && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-sm">
          <XCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
          <span className="text-rose-700 font-medium">
            {failedJobs.length} job{failedJobs.length !== 1 ? 's' : ''} fallido
            {failedJobs.length !== 1 ? 's' : ''} — revisá los logs
          </span>
          <button
            onClick={() => onNavigate('jobs')}
            className="ml-auto text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1"
          >
            Ver jobs <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {runningJobs.length > 0 && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-sky-50 border border-sky-200 rounded-xl text-sm">
          <Loader2 className="w-4 h-4 text-sky-500 flex-shrink-0 animate-spin" />
          <span className="text-sky-700 font-medium">
            {runningJobs.length} job{runningJobs.length !== 1 ? 's' : ''} ejecutándose ahora
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Empresas registradas"
          value={stats?.totalTenants ?? 0}
          icon={<Building2 className="w-4 h-4 text-zinc-700" />}
          iconBg="bg-zinc-100"
          sub={`${activeTenantsCount} activas`}
        />
        <StatCard
          label="Jobs totales"
          value={stats?.totalJobs ?? 0}
          icon={<Briefcase className="w-4 h-4 text-sky-600" />}
          iconBg="bg-sky-50"
          sub={`${stats?.pendingJobs ?? 0} pendientes`}
        />
        <StatCard
          label="Jobs completados"
          value={stats?.doneJobs ?? 0}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          iconBg="bg-emerald-50"
        />
        <StatCard
          label="Jobs fallidos"
          value={stats?.failedJobs ?? 0}
          icon={<XCircle className="w-4 h-4 text-rose-500" />}
          iconBg="bg-rose-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-zinc-400" />
              <h3 className="section-title mb-0">Jobs recientes</h3>
            </div>
            <button
              onClick={() => onNavigate('jobs')}
              className="text-xs text-zinc-500 hover:text-zinc-700 flex items-center gap-1 font-medium"
            >
              Ver todos <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {recentJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Briefcase className="w-8 h-8 text-zinc-300 mb-3" />
              <p className="text-sm text-zinc-500">No hay jobs registrados</p>
              <p className="text-xs text-zinc-400 mt-1">
                Creá una empresa y ejecutá una sincronización
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {recentJobs.map((job) => {
                const tenant = tenants.find((t) => t.id === job.tenant_id);
                return (
                  <div
                    key={job.id}
                    className="px-5 py-3 flex items-center gap-3 hover:bg-zinc-50/60 transition-colors"
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        job.estado === 'DONE'
                          ? 'bg-emerald-50'
                          : job.estado === 'FAILED'
                          ? 'bg-rose-50'
                          : job.estado === 'RUNNING'
                          ? 'bg-sky-50'
                          : 'bg-amber-50'
                      }`}
                    >
                      {job.estado === 'DONE' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : job.estado === 'FAILED' ? (
                        <XCircle className="w-4 h-4 text-rose-500" />
                      ) : job.estado === 'RUNNING' ? (
                        <Loader2 className="w-4 h-4 text-sky-500 animate-spin" />
                      ) : (
                        <Clock className="w-4 h-4 text-amber-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900 truncate">
                        {JOB_TYPE_LABELS[job.tipo_job] || job.tipo_job}
                      </p>
                      <p className="text-xs text-zinc-400 truncate">
                        {tenant?.nombre_fantasia || job.tenant_id.slice(0, 8)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <JobStatusBadge status={job.estado} />
                      <span className="text-xs text-zinc-400">{formatRelative(job.created_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-zinc-400" />
              <h3 className="section-title mb-0">Empresas</h3>
            </div>
            <button
              onClick={() => onNavigate('tenants')}
              className="text-xs text-zinc-500 hover:text-zinc-700 flex items-center gap-1 font-medium"
            >
              Ver todas <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {tenants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Building2 className="w-8 h-8 text-zinc-300 mb-3" />
              <p className="text-sm text-zinc-500">Sin empresas aún</p>
              <button
                onClick={() => onNavigate('tenants')}
                className="mt-3 btn-sm btn-primary"
              >
                Crear empresa
              </button>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {tenants.slice(0, 6).map((tenant) => (
                <button
                  key={tenant.id}
                  onClick={() => onNavigate('tenants', { tenant_id: tenant.id })}
                  className="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-zinc-50/60 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-zinc-600">
                      {tenant.nombre_fantasia.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">
                      {tenant.nombre_fantasia}
                    </p>
                    <p className="text-xs text-zinc-400 font-mono">{tenant.ruc}</p>
                  </div>
                  <Badge variant={tenant.activo ? 'success' : 'neutral'} dot>
                    {tenant.activo ? 'Activo' : 'Inactivo'}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {tenants.length > 0 && (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-zinc-400" />
              <h3 className="section-title mb-0">Acciones rápidas</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {tenants.slice(0, 4).map((tenant) => (
                <button
                  key={tenant.id}
                  onClick={() => onNavigate('tenants', { tenant_id: tenant.id, action: 'sync' })}
                  className="flex items-start gap-2.5 p-3 rounded-lg border border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300 transition-all text-left group"
                >
                  <div className="w-6 h-6 rounded-md bg-zinc-900 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Loader2 className="w-3 h-3 text-white group-hover:animate-spin" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-900 truncate">Sync</p>
                    <p className="text-xs text-zinc-500 truncate">{tenant.nombre_fantasia}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4 text-zinc-400" />
              <h3 className="section-title mb-0">Comprobantes por empresa</h3>
            </div>
            <div className="space-y-2">
              {tenants.slice(0, 4).map((tenant) => (
                <button
                  key={tenant.id}
                  onClick={() => onNavigate('comprobantes')}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-zinc-50 transition-colors text-left"
                >
                  <div className="w-6 h-6 rounded-md bg-zinc-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-zinc-600">
                      {tenant.nombre_fantasia.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm text-zinc-700 flex-1 truncate">
                    {tenant.nombre_fantasia}
                  </span>
                  <FileX className="w-3.5 h-3.5 text-zinc-300" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
