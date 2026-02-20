import { useEffect, useState, useCallback } from 'react';
import {
  FileText,
  Search,
  X,
  Filter,
  ChevronDown,
  ExternalLink,
  Download,
  Building2,
  Code2,
  CheckCircle2,
  Circle,
  FileJson,
  FileType2,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { PageLoader } from '../components/ui/Spinner';
import { Pagination } from '../components/ui/Pagination';
import { api } from '../lib/api';
import {
  formatDate,
  formatDateTime,
  formatCurrency,
  formatNumber,
  TIPO_COMPROBANTE_LABELS,
} from '../lib/utils';
import type { Comprobante, Tenant, TipoComprobante } from '../types';

interface ComprobantesProps {
  toastError: (title: string, desc?: string) => void;
}

function TipoComprobanteBadge({ tipo }: { tipo: TipoComprobante }) {
  const map: Record<TipoComprobante, 'default' | 'info' | 'warning' | 'success' | 'neutral' | 'orange'> = {
    FACTURA: 'info',
    NOTA_CREDITO: 'warning',
    NOTA_DEBITO: 'orange',
    AUTOFACTURA: 'neutral',
    OTRO: 'neutral',
  };
  return <Badge variant={map[tipo]}>{TIPO_COMPROBANTE_LABELS[tipo] || tipo}</Badge>;
}

const TIPO_OPTIONS: TipoComprobante[] = [
  'FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'AUTOFACTURA', 'OTRO',
];

export function Comprobantes({ toastError }: ComprobantesProps) {
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState('');
  const [xmlFilter, setXmlFilter] = useState<'' | 'true' | 'false'>('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [selectedComprobante, setSelectedComprobante] = useState<Comprobante | null>(null);
  const [detailView, setDetailView] = useState<'info' | 'xml' | 'detalles'>('info');
  const LIMIT = 20;

  const load = useCallback(async (silent = false) => {
    if (!selectedTenantId) {
      setComprobantes([]);
      setTotal(0);
      setTotalPages(1);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.comprobantes.list(selectedTenantId, {
        page,
        limit: LIMIT,
        tipo_comprobante: tipoFilter as TipoComprobante || undefined,
        xml_descargado: xmlFilter === '' ? undefined : xmlFilter === 'true',
        fecha_desde: fechaDesde || undefined,
        fecha_hasta: fechaHasta || undefined,
        ruc_vendedor: search.match(/^\d/) ? search : undefined,
      });
      setComprobantes(res.data);
      setTotal(res.pagination.total);
      setTotalPages(res.pagination.total_pages);
    } catch (e: unknown) {
      toastError('Error al cargar comprobantes', e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedTenantId, page, tipoFilter, xmlFilter, fechaDesde, fechaHasta, search, toastError]);

  useEffect(() => {
    api.tenants.list().then(setTenants).catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
  }, [selectedTenantId, tipoFilter, xmlFilter, fechaDesde, fechaHasta, search]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (c: Comprobante) => {
    if (!c.detalles_xml && selectedTenantId) {
      try {
        const full = await api.comprobantes.get(selectedTenantId, c.id);
        setSelectedComprobante(full);
      } catch {
        setSelectedComprobante(c);
      }
    } else {
      setSelectedComprobante(c);
    }
    setDetailView('info');
  };

  const activeFilters = [tipoFilter, xmlFilter, fechaDesde, fechaHasta].filter(Boolean).length;

  return (
    <div className="animate-fade-in">
      <Header
        title="Comprobantes"
        subtitle="Comprobantes fiscales sincronizados desde Marangatu"
        onRefresh={selectedTenantId ? () => load(true) : undefined}
        refreshing={refreshing}
      />

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <select
          className="input w-auto min-w-[200px]"
          value={selectedTenantId}
          onChange={(e) => setSelectedTenantId(e.target.value)}
        >
          <option value="">— Seleccionar empresa —</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre_fantasia} ({t.ruc})
            </option>
          ))}
        </select>

        {selectedTenantId && (
          <>
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input
                className="input pl-9"
                placeholder="RUC vendedor, número..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`btn-md btn-secondary gap-2 ${showFilters ? 'bg-zinc-100' : ''}`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filtros
              {activeFilters > 0 && (
                <span className="bg-zinc-900 text-white rounded-full text-[10px] w-4 h-4 flex items-center justify-center">
                  {activeFilters}
                </span>
              )}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>

            {total > 0 && (
              <p className="text-sm text-zinc-500">
                {total.toLocaleString()} comprobante{total !== 1 ? 's' : ''}
              </p>
            )}

            {selectedTenantId && (
              <div className="relative ml-auto">
                <button
                  onClick={() => setShowExport(!showExport)}
                  className="btn-md btn-secondary gap-2"
                >
                  <Download className="w-3.5 h-3.5" />
                  Exportar
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showExport ? 'rotate-180' : ''}`} />
                </button>
                {showExport && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-zinc-200 rounded-lg shadow-lg z-20 min-w-[160px] py-1 animate-fade-in">
                    <a
                      href={api.comprobantes.exportUrl(selectedTenantId, 'json', {
                        fecha_desde: fechaDesde || undefined,
                        fecha_hasta: fechaHasta || undefined,
                        tipo_comprobante: tipoFilter || undefined,
                        ruc_vendedor: search.match(/^\d/) ? search : undefined,
                        xml_descargado: xmlFilter === '' ? undefined : xmlFilter === 'true',
                      })}
                      download
                      onClick={() => setShowExport(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
                    >
                      <FileJson className="w-3.5 h-3.5 text-zinc-400" />
                      Exportar JSON
                    </a>
                    <a
                      href={api.comprobantes.exportUrl(selectedTenantId, 'txt', {
                        fecha_desde: fechaDesde || undefined,
                        fecha_hasta: fechaHasta || undefined,
                        tipo_comprobante: tipoFilter || undefined,
                        ruc_vendedor: search.match(/^\d/) ? search : undefined,
                        xml_descargado: xmlFilter === '' ? undefined : xmlFilter === 'true',
                      })}
                      download
                      onClick={() => setShowExport(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
                    >
                      <FileType2 className="w-3.5 h-3.5 text-zinc-400" />
                      Exportar TXT
                    </a>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {selectedTenantId && showFilters && (
        <div className="card p-4 mb-5 animate-fade-in">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="label">Tipo comprobante</label>
              <select
                className="input"
                value={tipoFilter}
                onChange={(e) => setTipoFilter(e.target.value)}
              >
                <option value="">Todos</option>
                {TIPO_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_COMPROBANTE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">XML descargado</label>
              <select
                className="input"
                value={xmlFilter}
                onChange={(e) => setXmlFilter(e.target.value as typeof xmlFilter)}
              >
                <option value="">Todos</option>
                <option value="true">Con XML</option>
                <option value="false">Sin XML</option>
              </select>
            </div>
            <div>
              <label className="label">Fecha desde</label>
              <input
                type="date"
                className="input"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Fecha hasta</label>
              <input
                type="date"
                className="input"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
              />
            </div>
          </div>
          {activeFilters > 0 && (
            <button
              onClick={() => {
                setTipoFilter('');
                setXmlFilter('');
                setFechaDesde('');
                setFechaHasta('');
              }}
              className="mt-3 btn-sm btn-ghost text-zinc-500"
            >
              <X className="w-3 h-3" /> Limpiar filtros
            </button>
          )}
        </div>
      )}

      {!selectedTenantId ? (
        <div className="card p-12">
          <EmptyState
            icon={<Building2 className="w-5 h-5" />}
            title="Seleccioná una empresa"
            description="Elegí una empresa del selector para ver sus comprobantes"
          />
        </div>
      ) : loading ? (
        <PageLoader />
      ) : comprobantes.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-5 h-5" />}
          title="Sin comprobantes"
          description={
            activeFilters > 0
              ? 'No hay comprobantes con los filtros aplicados'
              : 'Esta empresa no tiene comprobantes sincronizados aún. Ejecutá una sincronización desde la página de Empresas.'
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="table-th">Comprobante</th>
                <th className="table-th">Vendedor</th>
                <th className="table-th">Tipo</th>
                <th className="table-th">Fecha emisión</th>
                <th className="table-th text-right">Total</th>
                <th className="table-th">XML</th>
              </tr>
            </thead>
            <tbody>
              {comprobantes.map((c) => (
                <tr
                  key={c.id}
                  className="table-tr cursor-pointer"
                  onClick={() => openDetail(c)}
                >
                  <td className="table-td">
                    <div>
                      <p className="font-mono text-xs font-medium text-zinc-900">
                        {c.numero_comprobante}
                      </p>
                      {c.cdc && (
                        <p className="text-[10px] font-mono text-zinc-400 truncate max-w-[180px]">
                          {c.cdc.slice(0, 20)}...
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="table-td">
                    <div>
                      <p className="text-sm text-zinc-900">
                        {c.razon_social_vendedor || <span className="text-zinc-400">—</span>}
                      </p>
                      <p className="text-xs font-mono text-zinc-400">{c.ruc_vendedor}</p>
                    </div>
                  </td>
                  <td className="table-td">
                    <TipoComprobanteBadge tipo={c.tipo_comprobante} />
                  </td>
                  <td className="table-td text-xs text-zinc-600">
                    {formatDate(c.fecha_emision)}
                  </td>
                  <td className="table-td text-right">
                    <span className="font-mono text-sm font-medium text-zinc-900">
                      {formatCurrency(c.total_operacion)}
                    </span>
                  </td>
                  <td className="table-td">
                    {c.xml_descargado_at ? (
                      <span className="flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span className="text-xs">Descargado</span>
                      </span>
                    ) : c.cdc ? (
                      <span className="flex items-center gap-1 text-zinc-400">
                        <Circle className="w-3.5 h-3.5" />
                        <span className="text-xs">Pendiente</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-zinc-300">
                        <X className="w-3.5 h-3.5" />
                        <span className="text-xs">Sin CDC</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={LIMIT}
            onPageChange={setPage}
          />
        </div>
      )}

      {selectedComprobante && (
        <Modal
          open={!!selectedComprobante}
          onClose={() => setSelectedComprobante(null)}
          title={selectedComprobante.numero_comprobante}
          description={selectedComprobante.razon_social_vendedor || selectedComprobante.ruc_vendedor}
          size="xl"
        >
          <div className="flex gap-0 border border-zinc-200 rounded-lg overflow-hidden mb-5 -mt-1">
            {(['info', 'detalles', 'xml'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setDetailView(v)}
                className={`flex-1 py-2 text-xs font-medium transition-colors duration-100 ${
                  detailView === v
                    ? 'bg-zinc-900 text-white'
                    : 'bg-white text-zinc-500 hover:bg-zinc-50'
                }`}
              >
                {v === 'info' ? 'Información' : v === 'detalles' ? 'Items XML' : 'XML crudo'}
              </button>
            ))}
          </div>

          {detailView === 'info' && (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
                  Comprobante
                </p>
                <dl className="space-y-2.5">
                  <DR label="Número" value={<span className="tag">{selectedComprobante.numero_comprobante}</span>} />
                  <DR
                    label="Tipo"
                    value={<TipoComprobanteBadge tipo={selectedComprobante.tipo_comprobante} />}
                  />
                  <DR
                    label="Origen"
                    value={
                      <Badge variant={selectedComprobante.origen === 'ELECTRONICO' ? 'info' : 'neutral'}>
                        {selectedComprobante.origen}
                      </Badge>
                    }
                  />
                  <DR label="Fecha emisión" value={formatDate(selectedComprobante.fecha_emision)} />
                  <DR
                    label="Total"
                    value={
                      <span className="font-mono font-semibold">
                        {formatCurrency(selectedComprobante.total_operacion)}
                      </span>
                    }
                  />
                  {selectedComprobante.cdc && (
                    <DR
                      label="CDC"
                      value={
                        <span className="tag text-[10px] break-all">{selectedComprobante.cdc}</span>
                      }
                    />
                  )}
                </dl>
              </div>

              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
                  Vendedor
                </p>
                <dl className="space-y-2.5">
                  <DR label="Razón social" value={selectedComprobante.razon_social_vendedor || '—'} />
                  <DR label="RUC" value={<span className="tag">{selectedComprobante.ruc_vendedor}</span>} />
                  {selectedComprobante.detalles_xml?.emisor && (
                    <>
                      {selectedComprobante.detalles_xml.emisor.timbrado && (
                        <DR label="Timbrado" value={<span className="tag">{selectedComprobante.detalles_xml.emisor.timbrado}</span>} />
                      )}
                      {selectedComprobante.detalles_xml.emisor.establecimiento && (
                        <DR
                          label="Est. / Punto"
                          value={`${selectedComprobante.detalles_xml.emisor.establecimiento}-${selectedComprobante.detalles_xml.emisor.punto}`}
                        />
                      )}
                      {selectedComprobante.detalles_xml.emisor.direccion && (
                        <DR label="Dirección" value={selectedComprobante.detalles_xml.emisor.direccion} />
                      )}
                    </>
                  )}
                </dl>

                {selectedComprobante.detalles_xml?.receptor && (
                  <>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mt-5 mb-3">
                      Receptor
                    </p>
                    <dl className="space-y-2.5">
                      {selectedComprobante.detalles_xml.receptor.razonSocial && (
                        <DR label="Nombre" value={selectedComprobante.detalles_xml.receptor.razonSocial} />
                      )}
                      {selectedComprobante.detalles_xml.receptor.ruc && (
                        <DR label="RUC" value={<span className="tag">{selectedComprobante.detalles_xml.receptor.ruc}</span>} />
                      )}
                      {selectedComprobante.detalles_xml.receptor.numeroIdentificacion && !selectedComprobante.detalles_xml.receptor.ruc && (
                        <DR
                          label={selectedComprobante.detalles_xml.receptor.tipoIdentificacionDesc ?? 'Documento'}
                          value={<span className="tag">{selectedComprobante.detalles_xml.receptor.numeroIdentificacion}</span>}
                        />
                      )}
                      {selectedComprobante.detalles_xml.receptor.email && (
                        <DR label="Email" value={selectedComprobante.detalles_xml.receptor.email} />
                      )}
                      {selectedComprobante.detalles_xml.receptor.pais && (
                        <DR label="País" value={selectedComprobante.detalles_xml.receptor.pais} />
                      )}
                    </dl>
                  </>
                )}

                {selectedComprobante.detalles_xml?.pagos && selectedComprobante.detalles_xml.pagos.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mt-5 mb-3">
                      Pago
                    </p>
                    <dl className="space-y-2.5">
                      {selectedComprobante.detalles_xml.pagos.map((p, i) => (
                        <DR
                          key={i}
                          label={p.tipoPagoDesc ?? `Pago ${i + 1}`}
                          value={
                            <span className="font-mono font-medium">
                              {formatCurrency(p.monto)} {p.moneda ?? ''}
                            </span>
                          }
                        />
                      ))}
                    </dl>
                  </>
                )}
              </div>

              {selectedComprobante.detalles_xml?.totales && (
                <div className="col-span-2">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
                    Totales
                  </p>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: 'Gravado 5%', value: selectedComprobante.detalles_xml.totales.subtotalIva5 ?? 0, show: (selectedComprobante.detalles_xml.totales.subtotalIva5 ?? 0) > 0 },
                      { label: 'Gravado 10%', value: selectedComprobante.detalles_xml.totales.subtotalIva10 ?? 0, show: (selectedComprobante.detalles_xml.totales.subtotalIva10 ?? 0) > 0 },
                      { label: 'Exentas', value: selectedComprobante.detalles_xml.totales.exentas, show: selectedComprobante.detalles_xml.totales.exentas > 0 },
                      { label: 'Descuento', value: selectedComprobante.detalles_xml.totales.descuento, show: selectedComprobante.detalles_xml.totales.descuento > 0 },
                      { label: 'IVA 5%', value: selectedComprobante.detalles_xml.totales.iva5, show: selectedComprobante.detalles_xml.totales.iva5 > 0 },
                      { label: 'IVA 10%', value: selectedComprobante.detalles_xml.totales.iva10, show: selectedComprobante.detalles_xml.totales.iva10 > 0 },
                      { label: 'IVA Total', value: selectedComprobante.detalles_xml.totales.ivaTotal, show: true },
                      { label: 'Total', value: selectedComprobante.detalles_xml.totales.total, show: true },
                    ].filter(({ show }) => show).map(({ label, value }) => (
                      <div key={label} className={`card p-3 text-center ${label === 'Total' ? 'border-zinc-900' : ''}`}>
                        <p className="text-xs text-zinc-500 mb-1">{label}</p>
                        <p className={`font-mono font-semibold text-sm ${label === 'Total' ? 'text-zinc-900' : 'text-zinc-700'}`}>
                          {formatCurrency(value)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="col-span-2 pt-3 border-t border-zinc-100">
                <div className="flex items-center gap-2 mb-3">
                  <Download className="w-3.5 h-3.5 text-zinc-400" />
                  <p className="text-xs text-zinc-500">
                    XML:{' '}
                    {selectedComprobante.xml_descargado_at ? (
                      <span className="text-emerald-600 font-medium">
                        Descargado {formatDateTime(selectedComprobante.xml_descargado_at)}
                      </span>
                    ) : (
                      <span className="text-zinc-400">No descargado</span>
                    )}
                  </p>
                  {selectedComprobante.xml_url && (
                    <a
                      href={selectedComprobante.xml_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto btn-sm btn-secondary"
                    >
                      <ExternalLink className="w-3 h-3" /> Ver en eKuatia
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">Descargar:</span>
                  <a
                    href={api.comprobantes.downloadUrl(selectedComprobante.tenant_id, selectedComprobante.id, 'json')}
                    download
                    className="btn-sm btn-secondary gap-1.5"
                  >
                    <FileJson className="w-3 h-3" /> JSON
                  </a>
                  <a
                    href={api.comprobantes.downloadUrl(selectedComprobante.tenant_id, selectedComprobante.id, 'txt')}
                    download
                    className="btn-sm btn-secondary gap-1.5"
                  >
                    <FileType2 className="w-3 h-3" /> TXT
                  </a>
                  {selectedComprobante.xml_contenido && (
                    <a
                      href={api.comprobantes.downloadUrl(selectedComprobante.tenant_id, selectedComprobante.id, 'xml')}
                      download
                      className="btn-sm btn-secondary gap-1.5"
                    >
                      <Code2 className="w-3 h-3" /> XML
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {detailView === 'detalles' && (
            <div>
              {selectedComprobante.detalles_xml?.items?.length ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-50 rounded-lg">
                      <th className="table-th">Descripción</th>
                      <th className="table-th text-right">Cant.</th>
                      <th className="table-th text-right">P. Unitario</th>
                      <th className="table-th text-right">Descuento</th>
                      <th className="table-th text-right">IVA</th>
                      <th className="table-th text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedComprobante.detalles_xml.items.map((item, i) => (
                      <tr key={i} className="table-tr">
                        <td className="table-td font-medium">{item.descripcion}</td>
                        <td className="table-td text-right tabular-nums">
                          {formatNumber(item.cantidad)}
                        </td>
                        <td className="table-td text-right tabular-nums font-mono">
                          {formatCurrency(item.precioUnitario)}
                        </td>
                        <td className="table-td text-right tabular-nums font-mono">
                          {item.descuento > 0 ? formatCurrency(item.descuento) : '—'}
                        </td>
                        <td className="table-td text-right">
                          <span className="tag">{item.tasaIva}%</span>
                        </td>
                        <td className="table-td text-right tabular-nums font-mono font-medium">
                          {formatCurrency(item.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState
                  icon={<FileText className="w-5 h-5" />}
                  title="Sin items"
                  description="No hay items parseados del XML para este comprobante"
                />
              )}
            </div>
          )}

          {detailView === 'xml' && (
            <div>
              {selectedComprobante.xml_contenido ? (
                <div className="relative">
                  <Code2 className="absolute top-3 right-3 w-3.5 h-3.5 text-zinc-400" />
                  <pre className="text-[11px] font-mono bg-zinc-950 text-emerald-400 p-4 rounded-xl overflow-x-auto overflow-y-auto max-h-[500px] whitespace-pre leading-5">
                    {selectedComprobante.xml_contenido}
                  </pre>
                </div>
              ) : (
                <EmptyState
                  icon={<Code2 className="w-5 h-5" />}
                  title="XML no disponible"
                  description="El XML no fue descargado aún. Ejecutá un job de descarga XML desde la página de la empresa."
                />
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function DR({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="text-xs text-zinc-500 w-24 flex-shrink-0 pt-0.5">{label}</dt>
      <dd className="text-sm text-zinc-900 flex-1 min-w-0">
        {typeof value === 'string' ? value : value}
      </dd>
    </div>
  );
}
