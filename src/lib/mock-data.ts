import type {
  Tenant,
  TenantWithConfig,
  Job,
  Comprobante,
  PaginatedResponse,
} from '../types';

export const MOCK_TENANTS: Tenant[] = [
  {
    id: 'tenant-001',
    nombre_fantasia: 'Farmacia San Rafael',
    ruc: '80012345-1',
    email_contacto: 'admin@sanrafael.com.py',
    timezone: 'America/Asuncion',
    activo: true,
    created_at: '2024-01-15T08:00:00Z',
    updated_at: '2024-11-20T14:32:00Z',
  },
  {
    id: 'tenant-002',
    nombre_fantasia: 'Farmacia Central PY',
    ruc: '80098765-4',
    email_contacto: 'sistemas@farmaciacentral.com.py',
    timezone: 'America/Asuncion',
    activo: true,
    created_at: '2024-02-10T09:15:00Z',
    updated_at: '2024-11-21T10:00:00Z',
  },
  {
    id: 'tenant-003',
    nombre_fantasia: 'Distribuidora Médica Guaraní',
    ruc: '80054321-6',
    email_contacto: 'contabilidad@dmguarani.com.py',
    timezone: 'America/Asuncion',
    activo: true,
    created_at: '2024-03-01T11:00:00Z',
    updated_at: '2024-11-19T16:45:00Z',
  },
  {
    id: 'tenant-004',
    nombre_fantasia: 'Farmacia La Esperanza',
    ruc: '80067890-2',
    email_contacto: null,
    timezone: 'America/Asuncion',
    activo: false,
    created_at: '2024-04-20T07:30:00Z',
    updated_at: '2024-10-05T12:00:00Z',
  },
  {
    id: 'tenant-005',
    nombre_fantasia: 'Botica Popular Asunción',
    ruc: '80033210-9',
    email_contacto: 'info@boticapopular.com.py',
    timezone: 'America/Asuncion',
    activo: true,
    created_at: '2024-05-12T13:00:00Z',
    updated_at: '2024-11-22T08:15:00Z',
  },
];

export const MOCK_TENANTS_WITH_CONFIG: Record<string, TenantWithConfig> = {
  'tenant-001': {
    ...MOCK_TENANTS[0],
    config: {
      id: 'cfg-001',
      tenant_id: 'tenant-001',
      ruc_login: '80012345-1',
      usuario_marangatu: 'usr_sanrafael',
      marangatu_base_url: 'https://marangatu.set.gov.py/api',
      ords_base_url: 'https://ords.sanrafael.com.py',
      ords_endpoint_facturas: '/api/v1/facturas',
      ords_tipo_autenticacion: 'BASIC',
      ords_usuario: 'ords_user',
      enviar_a_ords_automaticamente: true,
      frecuencia_sincronizacion_minutos: 60,
      extra_config: { retry_on_fail: true, max_xml_batch: 10 },
      created_at: '2024-01-15T08:05:00Z',
      updated_at: '2024-11-20T14:32:00Z',
    },
  },
  'tenant-002': {
    ...MOCK_TENANTS[1],
    config: {
      id: 'cfg-002',
      tenant_id: 'tenant-002',
      ruc_login: '80098765-4',
      usuario_marangatu: 'usr_central',
      marangatu_base_url: 'https://marangatu.set.gov.py/api',
      ords_base_url: null,
      ords_endpoint_facturas: null,
      ords_tipo_autenticacion: 'NONE',
      ords_usuario: null,
      enviar_a_ords_automaticamente: false,
      frecuencia_sincronizacion_minutos: 120,
      extra_config: {},
      created_at: '2024-02-10T09:20:00Z',
      updated_at: '2024-11-21T10:00:00Z',
    },
  },
  'tenant-003': {
    ...MOCK_TENANTS[2],
    config: {
      id: 'cfg-003',
      tenant_id: 'tenant-003',
      ruc_login: '80054321-6',
      usuario_marangatu: 'usr_guarani',
      marangatu_base_url: 'https://marangatu.set.gov.py/api',
      ords_base_url: 'https://ords.dmguarani.com.py',
      ords_endpoint_facturas: '/facturas/entrada',
      ords_tipo_autenticacion: 'BEARER',
      ords_usuario: 'bearer_token_user',
      enviar_a_ords_automaticamente: true,
      frecuencia_sincronizacion_minutos: 30,
      extra_config: { notify_email: 'alertas@dmguarani.com.py' },
      created_at: '2024-03-01T11:05:00Z',
      updated_at: '2024-11-19T16:45:00Z',
    },
  },
  'tenant-004': {
    ...MOCK_TENANTS[3],
    config: null,
  },
  'tenant-005': {
    ...MOCK_TENANTS[4],
    config: {
      id: 'cfg-005',
      tenant_id: 'tenant-005',
      ruc_login: '80033210-9',
      usuario_marangatu: 'usr_botica',
      marangatu_base_url: 'https://marangatu.set.gov.py/api',
      ords_base_url: null,
      ords_endpoint_facturas: null,
      ords_tipo_autenticacion: 'NONE',
      ords_usuario: null,
      enviar_a_ords_automaticamente: false,
      frecuencia_sincronizacion_minutos: 90,
      extra_config: {},
      created_at: '2024-05-12T13:05:00Z',
      updated_at: '2024-11-22T08:15:00Z',
    },
  },
};

export const MOCK_JOBS: Job[] = [
  {
    id: 'job-001',
    tenant_id: 'tenant-001',
    tipo_job: 'SYNC_COMPROBANTES',
    payload: { mes: 11, anio: 2024 },
    estado: 'DONE',
    intentos: 1,
    max_intentos: 3,
    error_message: null,
    created_at: '2024-11-22T08:00:00Z',
    updated_at: '2024-11-22T08:04:32Z',
    last_run_at: '2024-11-22T08:00:05Z',
    next_run_at: '2024-11-22T09:00:00Z',
  },
  {
    id: 'job-002',
    tenant_id: 'tenant-002',
    tipo_job: 'DESCARGAR_XML',
    payload: { batch_size: 10 },
    estado: 'RUNNING',
    intentos: 1,
    max_intentos: 3,
    error_message: null,
    created_at: '2024-11-22T08:30:00Z',
    updated_at: '2024-11-22T08:30:45Z',
    last_run_at: '2024-11-22T08:30:10Z',
    next_run_at: null,
  },
  {
    id: 'job-003',
    tenant_id: 'tenant-003',
    tipo_job: 'ENVIAR_A_ORDS',
    payload: { comprobantes_ids: ['comp-010', 'comp-011', 'comp-012'] },
    estado: 'FAILED',
    intentos: 3,
    max_intentos: 3,
    error_message: 'Connection timeout: ORDS endpoint no responde después de 30s. Último intento: 2024-11-22T08:25:00Z',
    created_at: '2024-11-22T07:45:00Z',
    updated_at: '2024-11-22T08:25:10Z',
    last_run_at: '2024-11-22T08:25:00Z',
    next_run_at: null,
  },
  {
    id: 'job-004',
    tenant_id: 'tenant-001',
    tipo_job: 'SYNC_COMPROBANTES',
    payload: { mes: 10, anio: 2024 },
    estado: 'DONE',
    intentos: 1,
    max_intentos: 3,
    error_message: null,
    created_at: '2024-11-21T20:00:00Z',
    updated_at: '2024-11-21T20:06:15Z',
    last_run_at: '2024-11-21T20:00:08Z',
    next_run_at: null,
  },
  {
    id: 'job-005',
    tenant_id: 'tenant-005',
    tipo_job: 'SYNC_COMPROBANTES',
    payload: {},
    estado: 'PENDING',
    intentos: 0,
    max_intentos: 3,
    error_message: null,
    created_at: '2024-11-22T09:00:00Z',
    updated_at: '2024-11-22T09:00:00Z',
    last_run_at: null,
    next_run_at: '2024-11-22T09:01:00Z',
  },
  {
    id: 'job-006',
    tenant_id: 'tenant-002',
    tipo_job: 'SYNC_COMPROBANTES',
    payload: { mes: 11, anio: 2024 },
    estado: 'DONE',
    intentos: 2,
    max_intentos: 3,
    error_message: null,
    created_at: '2024-11-21T14:00:00Z',
    updated_at: '2024-11-21T14:09:22Z',
    last_run_at: '2024-11-21T14:00:12Z',
    next_run_at: null,
  },
  {
    id: 'job-007',
    tenant_id: 'tenant-003',
    tipo_job: 'DESCARGAR_XML',
    payload: { batch_size: 20 },
    estado: 'DONE',
    intentos: 1,
    max_intentos: 3,
    error_message: null,
    created_at: '2024-11-21T10:15:00Z',
    updated_at: '2024-11-21T10:18:44Z',
    last_run_at: '2024-11-21T10:15:05Z',
    next_run_at: null,
  },
  {
    id: 'job-008',
    tenant_id: 'tenant-001',
    tipo_job: 'ENVIAR_A_ORDS',
    payload: { comprobantes_ids: ['comp-001', 'comp-002', 'comp-003', 'comp-004', 'comp-005'] },
    estado: 'DONE',
    intentos: 1,
    max_intentos: 3,
    error_message: null,
    created_at: '2024-11-20T16:30:00Z',
    updated_at: '2024-11-20T16:31:55Z',
    last_run_at: '2024-11-20T16:30:08Z',
    next_run_at: null,
  },
  {
    id: 'job-009',
    tenant_id: 'tenant-004',
    tipo_job: 'SYNC_COMPROBANTES',
    payload: {},
    estado: 'FAILED',
    intentos: 3,
    max_intentos: 3,
    error_message: 'AuthenticationError: Credenciales de Marangatu inválidas o expiradas. HTTP 401.',
    created_at: '2024-11-20T12:00:00Z',
    updated_at: '2024-11-20T12:05:30Z',
    last_run_at: '2024-11-20T12:05:20Z',
    next_run_at: null,
  },
  {
    id: 'job-010',
    tenant_id: 'tenant-005',
    tipo_job: 'DESCARGAR_XML',
    payload: { batch_size: 5 },
    estado: 'DONE',
    intentos: 1,
    max_intentos: 3,
    error_message: null,
    created_at: '2024-11-19T09:00:00Z',
    updated_at: '2024-11-19T09:02:11Z',
    last_run_at: '2024-11-19T09:00:07Z',
    next_run_at: null,
  },
];

const makeXmlContenido = (cdc: string, ruc: string, razon: string, numero: string): string => `<?xml version="1.0" encoding="UTF-8"?>
<rDE xmlns="http://ekuatia.set.gov.py/sifen/xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <DE Id="${cdc}">
    <gOpeDE>
      <iTipEmi>1</iTipEmi>
      <dDesTipEmi>Emisión normal</dDesTipEmi>
      <dFecFirma>2024-11-15T10:30:00</dFecFirma>
      <dSisFact>1</dSisFact>
    </gOpeDE>
    <gTimb>
      <iTiDE>1</iTiDE>
      <dDesTiDE>Factura electrónica</dDesTiDE>
      <dNumTim>12345678</dNumTim>
      <dEst>001</dEst>
      <dPunExp>001</dPunExp>
      <dNumDoc>${numero}</dNumDoc>
    </gTimb>
    <gDatGralOpe>
      <dFeEmiDE>2024-11-15</dFeEmiDE>
      <gEmis>
        <dRucEm>${ruc}</dRucEm>
        <dNomEmi>${razon}</dNomEmi>
      </gEmis>
    </gDatGralOpe>
  </DE>
</rDE>`;

export const MOCK_COMPROBANTES: Comprobante[] = [
  {
    id: 'comp-001',
    tenant_id: 'tenant-001',
    origen: 'ELECTRONICO',
    ruc_vendedor: '80001234-5',
    razon_social_vendedor: 'Laboratorios Paraguayos S.A.',
    cdc: 'CDC000100123456789012345678901234567890123',
    numero_comprobante: '001-001-0000001',
    tipo_comprobante: 'FACTURA',
    fecha_emision: '2024-11-15T10:30:00Z',
    total_operacion: '4500000',
    raw_payload: { source: 'marangatu', version: '2' },
    hash_unico: 'hash_comp_001',
    xml_contenido: makeXmlContenido('CDC000100123456789012345678901234567890123', '80001234-5', 'Laboratorios Paraguayos S.A.', '0000001'),
    xml_url: null,
    xml_descargado_at: '2024-11-15T11:00:00Z',
    detalles_xml: {
      cdc: 'CDC000100123456789012345678901234567890123',
      tipoDocumento: 'Factura electrónica',
      version: '150',
      emisor: {
        ruc: '80001234-5',
        razonSocial: 'Laboratorios Paraguayos S.A.',
        nombreFantasia: 'LabPY',
        timbrado: '12345678',
        establecimiento: '001',
        punto: '001',
        numero: '0000001',
        direccion: 'Av. Mariscal López 1234',
        ciudad: 'Asunción',
        departamento: 'Central',
      },
      receptor: {
        ruc: '80012345-1',
        razonSocial: 'Farmacia San Rafael S.R.L.',
        tipoContribuyente: 'Jurídica',
        direccion: 'Calle Palma 567',
        ciudad: 'Asunción',
      },
      fechaEmision: '2024-11-15T10:30:00',
      moneda: 'PYG',
      condicionVenta: 'Crédito 30 días',
      items: [
        { descripcion: 'Paracetamol 500mg x 20 comp', cantidad: 100, precioUnitario: 15000, descuento: 0, subtotal: 1500000, iva: 136364, tasaIva: 10 },
        { descripcion: 'Amoxicilina 500mg x 21 caps', cantidad: 50, precioUnitario: 45000, descuento: 0, subtotal: 2250000, iva: 204545, tasaIva: 10 },
        { descripcion: 'Ibuprofeno 400mg x 20 comp', cantidad: 30, precioUnitario: 25000, descuento: 0, subtotal: 750000, iva: 68182, tasaIva: 10 },
      ],
      totales: {
        subtotal: 4500000,
        descuento: 0,
        anticipo: 0,
        total: 4500000,
        ivaTotal: 409091,
        iva5: 0,
        iva10: 409091,
        exentas: 0,
      },
      timbrado: '12345678',
      numeroComprobante: '001-001-0000001',
      qrUrl: 'https://ekuatia.set.gov.py/consultas/qr?CDC=CDC000100123456789012345678901234567890123',
    },
    created_at: '2024-11-15T10:35:00Z',
    updated_at: '2024-11-15T11:00:00Z',
  },
  {
    id: 'comp-002',
    tenant_id: 'tenant-001',
    origen: 'ELECTRONICO',
    ruc_vendedor: '80005678-9',
    razon_social_vendedor: 'Distribuidora Farma S.A.',
    cdc: 'CDC000200234567890123456789012345678901234',
    numero_comprobante: '002-001-0000045',
    tipo_comprobante: 'FACTURA',
    fecha_emision: '2024-11-14T14:15:00Z',
    total_operacion: '8750000',
    raw_payload: { source: 'marangatu', version: '2' },
    hash_unico: 'hash_comp_002',
    xml_contenido: makeXmlContenido('CDC000200234567890123456789012345678901234', '80005678-9', 'Distribuidora Farma S.A.', '0000045'),
    xml_url: null,
    xml_descargado_at: '2024-11-14T15:00:00Z',
    detalles_xml: {
      cdc: 'CDC000200234567890123456789012345678901234',
      tipoDocumento: 'Factura electrónica',
      version: '150',
      emisor: {
        ruc: '80005678-9',
        razonSocial: 'Distribuidora Farma S.A.',
        timbrado: '87654321',
        establecimiento: '002',
        punto: '001',
        numero: '0000045',
        direccion: 'Ruta 2 km 15',
        ciudad: 'Luque',
        departamento: 'Central',
      },
      receptor: {
        ruc: '80012345-1',
        razonSocial: 'Farmacia San Rafael S.R.L.',
        tipoContribuyente: 'Jurídica',
      },
      fechaEmision: '2024-11-14T14:15:00',
      moneda: 'PYG',
      condicionVenta: 'Contado',
      items: [
        { descripcion: 'Omeprazol 20mg x 14 caps', cantidad: 200, precioUnitario: 12000, descuento: 0, subtotal: 2400000, iva: 0, tasaIva: 0 },
        { descripcion: 'Losartán 50mg x 30 comp', cantidad: 150, precioUnitario: 28000, descuento: 150000, subtotal: 4050000, iva: 0, tasaIva: 0 },
        { descripcion: 'Metformina 850mg x 30 comp', cantidad: 100, precioUnitario: 23000, descuento: 0, subtotal: 2300000, iva: 0, tasaIva: 0 },
      ],
      totales: {
        subtotal: 8900000,
        descuento: 150000,
        anticipo: 0,
        total: 8750000,
        ivaTotal: 0,
        iva5: 0,
        iva10: 0,
        exentas: 8750000,
      },
      timbrado: '87654321',
      numeroComprobante: '002-001-0000045',
      qrUrl: 'https://ekuatia.set.gov.py/consultas/qr?CDC=CDC000200234567890123456789012345678901234',
    },
    created_at: '2024-11-14T14:20:00Z',
    updated_at: '2024-11-14T15:00:00Z',
  },
  {
    id: 'comp-003',
    tenant_id: 'tenant-001',
    origen: 'VIRTUAL',
    ruc_vendedor: '80009012-3',
    razon_social_vendedor: 'Servicios Médicos Paraguay S.A.',
    cdc: null,
    numero_comprobante: '001-002-0000312',
    tipo_comprobante: 'NOTA_CREDITO',
    fecha_emision: '2024-11-13T09:00:00Z',
    total_operacion: '750000',
    raw_payload: { source: 'marangatu', version: '1' },
    hash_unico: 'hash_comp_003',
    xml_contenido: null,
    xml_url: null,
    xml_descargado_at: null,
    detalles_xml: null,
    created_at: '2024-11-13T09:05:00Z',
    updated_at: '2024-11-13T09:05:00Z',
  },
  {
    id: 'comp-004',
    tenant_id: 'tenant-001',
    origen: 'ELECTRONICO',
    ruc_vendedor: '80001234-5',
    razon_social_vendedor: 'Laboratorios Paraguayos S.A.',
    cdc: 'CDC000400456789012345678901234567890123456',
    numero_comprobante: '001-001-0000002',
    tipo_comprobante: 'FACTURA',
    fecha_emision: '2024-11-10T11:00:00Z',
    total_operacion: '12300000',
    raw_payload: { source: 'marangatu', version: '2' },
    hash_unico: 'hash_comp_004',
    xml_contenido: makeXmlContenido('CDC000400456789012345678901234567890123456', '80001234-5', 'Laboratorios Paraguayos S.A.', '0000002'),
    xml_url: null,
    xml_descargado_at: '2024-11-10T12:00:00Z',
    detalles_xml: null,
    created_at: '2024-11-10T11:05:00Z',
    updated_at: '2024-11-10T12:00:00Z',
  },
  {
    id: 'comp-005',
    tenant_id: 'tenant-001',
    origen: 'ELECTRONICO',
    ruc_vendedor: '80005678-9',
    razon_social_vendedor: 'Distribuidora Farma S.A.',
    cdc: 'CDC000500567890123456789012345678901234567',
    numero_comprobante: '002-001-0000046',
    tipo_comprobante: 'NOTA_DEBITO',
    fecha_emision: '2024-11-08T16:30:00Z',
    total_operacion: '320000',
    raw_payload: { source: 'marangatu', version: '2' },
    hash_unico: 'hash_comp_005',
    xml_contenido: null,
    xml_url: null,
    xml_descargado_at: null,
    detalles_xml: null,
    created_at: '2024-11-08T16:35:00Z',
    updated_at: '2024-11-08T16:35:00Z',
  },
  {
    id: 'comp-006',
    tenant_id: 'tenant-002',
    origen: 'ELECTRONICO',
    ruc_vendedor: '80011111-7',
    razon_social_vendedor: 'Importadora Médica del Sur S.R.L.',
    cdc: 'CDC000600678901234567890123456789012345678',
    numero_comprobante: '003-001-0001200',
    tipo_comprobante: 'FACTURA',
    fecha_emision: '2024-11-20T08:45:00Z',
    total_operacion: '25600000',
    raw_payload: { source: 'marangatu', version: '2' },
    hash_unico: 'hash_comp_006',
    xml_contenido: makeXmlContenido('CDC000600678901234567890123456789012345678', '80011111-7', 'Importadora Médica del Sur S.R.L.', '0001200'),
    xml_url: null,
    xml_descargado_at: '2024-11-20T09:30:00Z',
    detalles_xml: {
      cdc: 'CDC000600678901234567890123456789012345678',
      tipoDocumento: 'Factura electrónica',
      version: '150',
      emisor: {
        ruc: '80011111-7',
        razonSocial: 'Importadora Médica del Sur S.R.L.',
        timbrado: '11223344',
        establecimiento: '003',
        punto: '001',
        numero: '0001200',
        direccion: 'Av. España 890',
        ciudad: 'Asunción',
        departamento: 'Central',
      },
      receptor: {
        ruc: '80098765-4',
        razonSocial: 'Farmacia Central PY S.A.',
        tipoContribuyente: 'Jurídica',
      },
      fechaEmision: '2024-11-20T08:45:00',
      moneda: 'PYG',
      condicionVenta: 'Crédito 60 días',
      items: [
        { descripcion: 'Insulina Glargina 100UI/mL x 3ml', cantidad: 20, precioUnitario: 180000, descuento: 0, subtotal: 3600000, iva: 0, tasaIva: 0 },
        { descripcion: 'Glucómetro OneTouch Select Plus', cantidad: 10, precioUnitario: 450000, descuento: 0, subtotal: 4500000, iva: 409091, tasaIva: 10 },
        { descripcion: 'Tiras reactivas OneTouch x 50', cantidad: 30, precioUnitario: 185000, descuento: 0, subtotal: 5550000, iva: 0, tasaIva: 0 },
        { descripcion: 'Jeringuillas insulina BD 0.5mL x 100', cantidad: 25, precioUnitario: 95000, descuento: 0, subtotal: 2375000, iva: 0, tasaIva: 0 },
        { descripcion: 'Metoprolol 25mg x 30 comp', cantidad: 100, precioUnitario: 22000, descuento: 0, subtotal: 2200000, iva: 0, tasaIva: 0 },
        { descripcion: 'Amlodipina 10mg x 30 comp', cantidad: 80, precioUnitario: 19000, descuento: 0, subtotal: 1520000, iva: 0, tasaIva: 0 },
        { descripcion: 'Atorvastatina 40mg x 30 comp', cantidad: 60, precioUnitario: 42500, descuento: 0, subtotal: 2550000, iva: 0, tasaIva: 0 },
        { descripcion: 'Levotiroxina 50mcg x 30 comp', cantidad: 40, precioUnitario: 32500, descuento: 0, subtotal: 1300000, iva: 0, tasaIva: 0 },
        { descripcion: 'Alprazolam 0.5mg x 30 comp (CNTRL)', cantidad: 20, precioUnitario: 55000, descuento: 0, subtotal: 1100000, iva: 0, tasaIva: 0 },
        { descripcion: 'Claritromicina 500mg x 14 comp', cantidad: 30, precioUnitario: 43500, descuento: 0, subtotal: 1305000, iva: 119545, tasaIva: 10 },
      ],
      totales: {
        subtotal: 26000000,
        descuento: 400000,
        anticipo: 0,
        total: 25600000,
        ivaTotal: 528636,
        iva5: 0,
        iva10: 528636,
        exentas: 13225000,
      },
      timbrado: '11223344',
      numeroComprobante: '003-001-0001200',
      qrUrl: 'https://ekuatia.set.gov.py/consultas/qr?CDC=CDC000600678901234567890123456789012345678',
    },
    created_at: '2024-11-20T08:50:00Z',
    updated_at: '2024-11-20T09:30:00Z',
  },
  {
    id: 'comp-007',
    tenant_id: 'tenant-002',
    origen: 'VIRTUAL',
    ruc_vendedor: '80022222-4',
    razon_social_vendedor: null,
    cdc: null,
    numero_comprobante: '001-001-0004500',
    tipo_comprobante: 'AUTOFACTURA',
    fecha_emision: '2024-11-18T10:00:00Z',
    total_operacion: '950000',
    raw_payload: { source: 'marangatu', version: '1' },
    hash_unico: 'hash_comp_007',
    xml_contenido: null,
    xml_url: null,
    xml_descargado_at: null,
    detalles_xml: null,
    created_at: '2024-11-18T10:05:00Z',
    updated_at: '2024-11-18T10:05:00Z',
  },
  {
    id: 'comp-008',
    tenant_id: 'tenant-003',
    origen: 'ELECTRONICO',
    ruc_vendedor: '80033333-1',
    razon_social_vendedor: 'Química Industrial PY S.A.',
    cdc: 'CDC000800890123456789012345678901234567890',
    numero_comprobante: '004-002-0000789',
    tipo_comprobante: 'FACTURA',
    fecha_emision: '2024-11-19T13:20:00Z',
    total_operacion: '47800000',
    raw_payload: { source: 'marangatu', version: '2' },
    hash_unico: 'hash_comp_008',
    xml_contenido: makeXmlContenido('CDC000800890123456789012345678901234567890', '80033333-1', 'Química Industrial PY S.A.', '0000789'),
    xml_url: null,
    xml_descargado_at: '2024-11-19T14:00:00Z',
    detalles_xml: null,
    created_at: '2024-11-19T13:25:00Z',
    updated_at: '2024-11-19T14:00:00Z',
  },
];

let _tenants = [...MOCK_TENANTS];
let _tenantsWithConfig = { ...MOCK_TENANTS_WITH_CONFIG };
let _jobs = [...MOCK_JOBS];

function delay(ms = 400): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

export const mockStore = {
  getTenants: async (): Promise<Tenant[]> => {
    await delay();
    return [..._tenants];
  },

  getTenant: async (id: string): Promise<TenantWithConfig> => {
    await delay();
    const t = _tenantsWithConfig[id];
    if (!t) throw new Error(`Tenant ${id} no encontrado`);
    return { ...t };
  },

  createTenant: async (body: unknown): Promise<Tenant> => {
    await delay(600);
    const data = body as Record<string, unknown>;
    const tenant: Tenant = {
      id: `tenant-${Date.now()}`,
      nombre_fantasia: String(data.nombre_fantasia || 'Nuevo Tenant'),
      ruc: String(data.ruc || '00000000-0'),
      email_contacto: (data.email_contacto as string) || null,
      timezone: String(data.timezone || 'America/Asuncion'),
      activo: Boolean(data.activo ?? true),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    _tenants.push(tenant);
    _tenantsWithConfig[tenant.id] = { ...tenant, config: null };
    return tenant;
  },

  updateTenant: async (id: string, body: unknown): Promise<Tenant> => {
    await delay(600);
    const data = body as Record<string, unknown>;
    const existing = _tenantsWithConfig[id];
    if (!existing) throw new Error(`Tenant ${id} no encontrado`);
    const updated: Tenant = {
      ...existing,
      nombre_fantasia: String(data.nombre_fantasia ?? existing.nombre_fantasia),
      ruc: String(data.ruc ?? existing.ruc),
      email_contacto: (data.email_contacto as string | null) ?? existing.email_contacto,
      activo: data.activo !== undefined ? Boolean(data.activo) : existing.activo,
      updated_at: new Date().toISOString(),
    };
    _tenantsWithConfig[id] = { ...updated, config: existing.config };
    _tenants = _tenants.map((t) => (t.id === id ? updated : t));
    return updated;
  },

  getJobs: async (params?: {
    tenant_id?: string;
    tipo_job?: string;
    estado?: string;
    limit?: number;
    offset?: number;
  }): Promise<Job[]> => {
    await delay();
    let jobs = [..._jobs];
    if (params?.tenant_id) jobs = jobs.filter((j) => j.tenant_id === params.tenant_id);
    if (params?.tipo_job) jobs = jobs.filter((j) => j.tipo_job === params.tipo_job);
    if (params?.estado) jobs = jobs.filter((j) => j.estado === params.estado);
    const offset = params?.offset ?? 0;
    const limit = params?.limit ?? 50;
    return jobs.slice(offset, offset + limit);
  },

  getJob: async (id: string): Promise<Job> => {
    await delay();
    const j = _jobs.find((j) => j.id === id);
    if (!j) throw new Error(`Job ${id} no encontrado`);
    return { ...j };
  },

  syncComprobantes: async (
    tenantId: string,
    _body?: { mes?: number; anio?: number }
  ): Promise<{ job_id: string; tipo_job: string; estado: string }> => {
    await delay(800);
    const newJob: Job = {
      id: `job-mock-${Date.now()}`,
      tenant_id: tenantId,
      tipo_job: 'SYNC_COMPROBANTES',
      payload: _body || {},
      estado: 'PENDING',
      intentos: 0,
      max_intentos: 3,
      error_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_run_at: null,
      next_run_at: new Date(Date.now() + 60000).toISOString(),
    };
    _jobs.unshift(newJob);
    return { job_id: newJob.id, tipo_job: 'SYNC_COMPROBANTES', estado: 'PENDING' };
  },

  descargarXml: async (
    tenantId: string,
    body?: { batch_size?: number; comprobante_id?: string }
  ): Promise<{ job_id: string; tipo_job: string; estado: string }> => {
    await delay(800);
    const newJob: Job = {
      id: `job-mock-${Date.now()}`,
      tenant_id: tenantId,
      tipo_job: 'DESCARGAR_XML',
      payload: body || {},
      estado: 'PENDING',
      intentos: 0,
      max_intentos: 3,
      error_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_run_at: null,
      next_run_at: new Date(Date.now() + 30000).toISOString(),
    };
    _jobs.unshift(newJob);
    return { job_id: newJob.id, tipo_job: 'DESCARGAR_XML', estado: 'PENDING' };
  },

  getComprobantes: async (
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
    await delay();
    let items = MOCK_COMPROBANTES.filter((c) => c.tenant_id === tenantId);
    if (params?.tipo_comprobante)
      items = items.filter((c) => c.tipo_comprobante === params.tipo_comprobante);
    if (params?.ruc_vendedor)
      items = items.filter((c) => c.ruc_vendedor.includes(params.ruc_vendedor!));
    if (params?.xml_descargado !== undefined)
      items = items.filter((c) =>
        params.xml_descargado ? c.xml_descargado_at !== null : c.xml_descargado_at === null
      );
    if (params?.fecha_desde)
      items = items.filter((c) => c.fecha_emision >= params.fecha_desde!);
    if (params?.fecha_hasta)
      items = items.filter((c) => c.fecha_emision <= params.fecha_hasta! + 'T23:59:59Z');
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 20;
    const total = items.length;
    const start = (page - 1) * limit;
    return {
      data: items.slice(start, start + limit),
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  },

  getComprobante: async (tenantId: string, id: string): Promise<Comprobante> => {
    await delay();
    const c = MOCK_COMPROBANTES.find((c) => c.id === id && c.tenant_id === tenantId);
    if (!c) throw new Error(`Comprobante ${id} no encontrado`);
    return { ...c };
  },
};
