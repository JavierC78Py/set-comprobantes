import type {
  Tenant,
  TenantWithConfig,
  Job,
  Comprobante,
  PaginatedResponse,
  UserRecord,
} from '../types';
import { mockStore } from './mock-data';

export const MOCK_MODE = (import.meta.env.VITE_MOCK_MODE as string) === 'true';

const BASE_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:4000';

const TOKEN_KEY = 'auth_token';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers as Record<string, string> || {}),
  };

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.reload();
    throw new Error('Sesión expirada');
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body.message || body.error || msg;
    } catch { /* ignore parse errors */ }
    throw new Error(msg);
  }

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const api = {
  health: () => {
    if (MOCK_MODE) {
      return Promise.resolve({ status: 'ok (demo)', timestamp: new Date().toISOString(), version: '1.0.0-demo' });
    }
    return request<{ status: string; timestamp: string; version: string }>('/health');
  },

  tenants: {
    list: (): Promise<Tenant[]> => {
      if (MOCK_MODE) return mockStore.getTenants();
      return request<{ data: Tenant[]; total: number }>('/tenants').then((r) => r.data ?? []);
    },
    get: (id: string): Promise<TenantWithConfig> => {
      if (MOCK_MODE) return mockStore.getTenant(id);
      return request<{ data: TenantWithConfig }>(`/tenants/${id}`).then((r) => r.data);
    },
    create: (body: unknown): Promise<Tenant> => {
      if (MOCK_MODE) return mockStore.createTenant(body);
      return request<{ data: Tenant }>('/tenants', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data);
    },
    update: (id: string, body: unknown): Promise<Tenant> => {
      if (MOCK_MODE) return mockStore.updateTenant(id, body);
      return request<{ data: Tenant }>(`/tenants/${id}`, { method: 'PUT', body: JSON.stringify(body) }).then((r) => r.data);
    },
  },

  jobs: {
    list: (params?: {
      tenant_id?: string;
      tipo_job?: string;
      estado?: string;
      limit?: number;
      offset?: number;
    }): Promise<Job[]> => {
      if (MOCK_MODE) return mockStore.getJobs(params);
      const q = new URLSearchParams();
      if (params?.tenant_id) q.set('tenant_id', params.tenant_id);
      if (params?.tipo_job) q.set('tipo_job', params.tipo_job);
      if (params?.estado) q.set('estado', params.estado);
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.offset) q.set('offset', String(params.offset));
      const qs = q.toString();
      return request<{ data: Job[]; total: number }>(`/jobs${qs ? `?${qs}` : ''}`).then((r) => r.data ?? []);
    },
    get: (id: string): Promise<Job> => {
      if (MOCK_MODE) return mockStore.getJob(id);
      return request<{ data: Job }>(`/jobs/${id}`).then((r) => r.data);
    },
    cancel: (id: string): Promise<void> => {
      if (MOCK_MODE) return Promise.resolve();
      return request(`/jobs/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) }).then(() => {});
    },
    syncComprobantes: (tenantId: string, body?: { mes?: number; anio?: number }): Promise<{ job_id: string; tipo_job: string; estado: string }> => {
      if (MOCK_MODE) return mockStore.syncComprobantes(tenantId, body);
      return request<{ message: string; data: { job_id: string } }>(`/tenants/${tenantId}/jobs/sync-comprobantes`, {
        method: 'POST',
        body: JSON.stringify(body || {}),
      }).then((r) => ({ job_id: r.data.job_id, tipo_job: 'SYNC_COMPROBANTES', estado: 'PENDING' }));
    },
    consultaComprobantes: (tenantId: string, body: { fecha_desde: string; fecha_hasta: string; tipo_registro?: string }): Promise<{ job_id: string; tipo_job: string; estado: string }> => {
      if (MOCK_MODE) return Promise.resolve({ job_id: 'mock-consulta', tipo_job: 'CONSULTA_COMPROBANTES', estado: 'PENDING' });
      return request<{ message: string; data: { job_id: string } }>(`/tenants/${tenantId}/jobs/consulta-comprobantes`, {
        method: 'POST',
        body: JSON.stringify(body),
      }).then((r) => ({ job_id: r.data.job_id, tipo_job: 'CONSULTA_COMPROBANTES', estado: 'PENDING' }));
    },
    enviarOrds: (
      tenantId: string,
      body?: { fecha_desde?: string; fecha_hasta?: string; forzar_reenvio?: boolean }
    ): Promise<{ job_id: string; tipo_job: string; estado: string }> => {
      if (MOCK_MODE) return Promise.resolve({ job_id: 'mock-ords', tipo_job: 'ENVIAR_A_ORDS', estado: 'PENDING' });
      return request<{ message: string; data: { job_id: string } }>(`/tenants/${tenantId}/jobs/enviar-ords`, {
        method: 'POST',
        body: JSON.stringify(body || {}),
      }).then((r) => ({ job_id: r.data.job_id, tipo_job: 'ENVIAR_A_ORDS', estado: 'PENDING' }));
    },
    descargarXml: (tenantId: string, body?: { batch_size?: number; comprobante_id?: string }): Promise<{ job_id: string; tipo_job: string; estado: string }> => {
      if (MOCK_MODE) return mockStore.descargarXml(tenantId, body);
      return request<{ message: string; data: { job_id: string } }>(`/tenants/${tenantId}/jobs/descargar-xml`, {
        method: 'POST',
        body: JSON.stringify(body || {}),
      }).then((r) => ({ job_id: r.data.job_id, tipo_job: 'DESCARGAR_XML', estado: 'PENDING' }));
    },
  },

  comprobantes: {
    list: (
      tenantId: string,
      params?: {
        fecha_desde?: string;
        fecha_hasta?: string;
        tipo_comprobante?: string;
        ruc_vendedor?: string;
        xml_descargado?: boolean;
        page?: number;
        limit?: number;
      }
    ): Promise<PaginatedResponse<Comprobante>> => {
      if (MOCK_MODE) return mockStore.getComprobantes(tenantId, params);
      const q = new URLSearchParams();
      if (params?.fecha_desde) q.set('fecha_desde', params.fecha_desde);
      if (params?.fecha_hasta) q.set('fecha_hasta', params.fecha_hasta);
      if (params?.tipo_comprobante) q.set('tipo_comprobante', params.tipo_comprobante);
      if (params?.ruc_vendedor) q.set('ruc_vendedor', params.ruc_vendedor);
      if (params?.xml_descargado !== undefined)
        q.set('xml_descargado', String(params.xml_descargado));
      if (params?.page) q.set('page', String(params.page));
      if (params?.limit) q.set('limit', String(params.limit));
      const qs = q.toString();
      return request<{ data: Comprobante[]; meta: { total: number; page: number; limit: number; total_pages: number } }>(
        `/tenants/${tenantId}/comprobantes${qs ? `?${qs}` : ''}`
      ).then((r) => ({
        data: r.data ?? [],
        pagination: {
          page: r.meta.page,
          limit: r.meta.limit,
          total: r.meta.total,
          total_pages: r.meta.total_pages,
        },
      }));
    },
    stats: (tenantId: string): Promise<{
      total: number;
      con_xml: number;
      enviados_ords: number;
      pendientes_ords: number;
      fallidos_ords: number;
    }> => {
      if (MOCK_MODE) return Promise.resolve({ total: 0, con_xml: 0, enviados_ords: 0, pendientes_ords: 0, fallidos_ords: 0 });
      return request<{ data: { total: number; con_xml: number; enviados_ords: number; pendientes_ords: number; fallidos_ords: number } }>(
        `/tenants/${tenantId}/comprobantes/stats`
      ).then((r) => r.data);
    },
    get: (tenantId: string, comprobanteId: string): Promise<Comprobante> => {
      if (MOCK_MODE) return mockStore.getComprobante(tenantId, comprobanteId);
      return request<{ data: Comprobante }>(`/tenants/${tenantId}/comprobantes/${comprobanteId}`).then((r) => r.data);
    },
    downloadUrl: (tenantId: string, comprobanteId: string, formato: 'json' | 'txt' | 'xml'): string => {
      return `${BASE_URL}/tenants/${tenantId}/comprobantes/${comprobanteId}/descargar?formato=${formato}`;
    },
    exportUrl: (
      tenantId: string,
      formato: 'json' | 'txt',
      params?: {
        fecha_desde?: string;
        fecha_hasta?: string;
        tipo_comprobante?: string;
        ruc_vendedor?: string;
        xml_descargado?: boolean;
      }
    ): string => {
      const q = new URLSearchParams({ formato });
      if (params?.fecha_desde) q.set('fecha_desde', params.fecha_desde);
      if (params?.fecha_hasta) q.set('fecha_hasta', params.fecha_hasta);
      if (params?.tipo_comprobante) q.set('tipo_comprobante', params.tipo_comprobante);
      if (params?.ruc_vendedor) q.set('ruc_vendedor', params.ruc_vendedor);
      if (params?.xml_descargado !== undefined) q.set('xml_descargado', String(params.xml_descargado));
      return `${BASE_URL}/tenants/${tenantId}/comprobantes/exportar?${q.toString()}`;
    },
  },

  users: {
    list: (): Promise<UserRecord[]> => {
      return request<{ data: UserRecord[] }>('/users').then((r) => r.data ?? []);
    },
    create: (body: {
      username: string;
      password: string;
      nombre: string;
      rol: 'ADMIN' | 'USER';
      tenant_ids?: string[];
    }): Promise<UserRecord> => {
      return request<{ data: UserRecord }>('/users', {
        method: 'POST',
        body: JSON.stringify(body),
      }).then((r) => r.data);
    },
    update: (id: string, body: Record<string, unknown>): Promise<UserRecord> => {
      return request<{ data: UserRecord }>(`/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }).then((r) => r.data);
    },
    delete: (id: string): Promise<void> => {
      return request(`/users/${id}`, { method: 'DELETE' }).then(() => {});
    },
  },
};
