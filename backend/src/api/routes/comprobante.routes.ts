import { FastifyInstance } from 'fastify';
import {
  findComprobantesByTenant,
  findComprobanteById,
} from '../../db/repositories/comprobante.repository';
import { findTenantById } from '../../db/repositories/tenant.repository';
import { Comprobante, TipoComprobante } from '../../types';

function comprobanteToTxtLines(c: Comprobante): string {
  const lines: string[] = [
    `COMPROBANTE`,
    `Numero:          ${c.numero_comprobante}`,
    `Tipo:            ${c.tipo_comprobante}`,
    `Origen:          ${c.origen}`,
    `Fecha Emision:   ${c.fecha_emision}`,
    `Total:           ${c.total_operacion}`,
    `CDC:             ${c.cdc ?? '—'}`,
    ``,
    `VENDEDOR`,
    `RUC:             ${c.ruc_vendedor}`,
    `Razon Social:    ${c.razon_social_vendedor ?? '—'}`,
  ];

  const d = c.detalles_xml;
  if (d) {
    const op = d.operacion ?? { moneda: d.moneda ?? 'PYG', condicionVenta: d.condicionVenta ?? '' };
    lines.push(
      ``,
      `OPERACION`,
      `Moneda:          ${op.moneda}`,
      `Condicion:       ${op.condicionVenta}`,
      ...(op.tipoTransaccionDesc ? [`Tipo Transac.:   ${op.tipoTransaccionDesc}`] : []),
      ...(op.indicadorPresenciaDesc ? [`Presencia:       ${op.indicadorPresenciaDesc}`] : []),
    );

    lines.push(
      ``,
      `EMISOR`,
      `RUC:             ${d.emisor.ruc}${d.emisor.digitoVerificador ? `-${d.emisor.digitoVerificador}` : ''}`,
      `Razon Social:    ${d.emisor.razonSocial}`,
      ...(d.emisor.nombreFantasia ? [`Nombre Fantasia: ${d.emisor.nombreFantasia}`] : []),
      ...(d.emisor.timbrado ? [`Timbrado:        ${d.emisor.timbrado}`] : []),
      ...(d.emisor.establecimiento ? [`Est/Pto/Num:     ${d.emisor.establecimiento}-${d.emisor.punto}-${d.emisor.numero}`] : []),
      ...(d.emisor.direccion ? [`Direccion:       ${d.emisor.direccion}`] : []),
      ...(d.emisor.ciudad ? [`Ciudad:          ${d.emisor.ciudad}${d.emisor.departamento ? `, ${d.emisor.departamento}` : ''}`] : []),
      ...(d.emisor.telefono ? [`Telefono:        ${d.emisor.telefono}`] : []),
      ...(d.emisor.email ? [`Email:           ${d.emisor.email}`] : []),
      ...(d.emisor.actividadEconomica ? [`Actividad Econ.: ${d.emisor.actividadEconomica}`] : []),
    );

    if (d.receptor.razonSocial || d.receptor.ruc || d.receptor.numeroIdentificacion) {
      lines.push(
        ``,
        `RECEPTOR`,
        ...(d.receptor.razonSocial ? [`Nombre:          ${d.receptor.razonSocial}`] : []),
        ...(d.receptor.ruc ? [`RUC:             ${d.receptor.ruc}`] : []),
        ...(d.receptor.numeroIdentificacion ? [`Documento:       ${d.receptor.tipoIdentificacionDesc ?? ''} ${d.receptor.numeroIdentificacion}`.trim()] : []),
        ...(d.receptor.email ? [`Email:           ${d.receptor.email}`] : []),
        ...(d.receptor.pais ? [`Pais:            ${d.receptor.pais}`] : []),
      );
    }

    if (d.pagos && d.pagos.length > 0) {
      lines.push(``, `PAGOS`);
      for (const p of d.pagos) {
        lines.push(`  ${p.tipoPagoDesc ?? p.tipoPago}: ${p.monto.toLocaleString('es-PY')} ${p.moneda ?? op.moneda}`);
      }
    }

    if (d.items.length > 0) {
      lines.push(``, `ITEMS`);
      const col = (s: string, w: number) => s.slice(0, w).padEnd(w);
      lines.push(
        `  ${col('Cod.', 10)} ${col('Descripcion', 36)} ${col('Cant.', 7)} ${col('P.Unit.', 12)} ${col('IVA%', 5)} ${col('Subtotal', 12)}`
      );
      lines.push(`  ${'-'.repeat(86)}`);
      for (const item of d.items) {
        lines.push(
          `  ${col(item.codigo ?? '', 10)} ${col(item.descripcion, 36)} ${col(String(item.cantidad), 7)} ${col(item.precioUnitario.toLocaleString('es-PY'), 12)} ${col(`${item.tasaIva}%`, 5)} ${col(item.subtotal.toLocaleString('es-PY'), 12)}`
        );
      }
    }

    lines.push(
      ``,
      `TOTALES`,
      ...(d.totales.subtotalIva5 ? [`Subtotal 5%:     ${d.totales.subtotalIva5.toLocaleString('es-PY')}`] : []),
      ...(d.totales.subtotalIva10 ? [`Subtotal 10%:    ${d.totales.subtotalIva10.toLocaleString('es-PY')}`] : []),
      ...(d.totales.exentas ? [`Exentas:         ${d.totales.exentas.toLocaleString('es-PY')}`] : []),
      ...(d.totales.descuento ? [`Descuento:       ${d.totales.descuento.toLocaleString('es-PY')}`] : []),
      ...(d.totales.redondeo ? [`Redondeo:        ${d.totales.redondeo.toLocaleString('es-PY')}`] : []),
      `Total:           ${d.totales.total.toLocaleString('es-PY')}`,
      ...(d.totales.iva5 ? [`IVA 5%:          ${d.totales.iva5.toLocaleString('es-PY')}`] : []),
      ...(d.totales.iva10 ? [`IVA 10%:         ${d.totales.iva10.toLocaleString('es-PY')}`] : []),
      `IVA Total:       ${d.totales.ivaTotal.toLocaleString('es-PY')}`,
    );

    if (d.qrUrl) {
      lines.push(``, `QR: ${d.qrUrl}`);
    }
  }

  lines.push(``, `Generado: ${new Date().toISOString()}`);
  return lines.join('\n');
}

export async function comprobanteRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Params: { id: string };
    Querystring: {
      fecha_desde?: string;
      fecha_hasta?: string;
      tipo_comprobante?: string;
      ruc_vendedor?: string;
      xml_descargado?: string;
      page?: string;
      limit?: string;
    };
  }>('/tenants/:id/comprobantes', async (req, reply) => {
    const tenant = await findTenantById(req.params.id);
    if (!tenant) {
      return reply.status(404).send({ error: 'Tenant no encontrado' });
    }

    const {
      fecha_desde,
      fecha_hasta,
      tipo_comprobante,
      ruc_vendedor,
      xml_descargado,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const xmlDescargadoFilter =
      xml_descargado === 'true' ? true :
      xml_descargado === 'false' ? false :
      undefined;

    const { data, total } = await findComprobantesByTenant(
      req.params.id,
      {
        fecha_desde,
        fecha_hasta,
        tipo_comprobante: tipo_comprobante as TipoComprobante | undefined,
        ruc_vendedor,
        xml_descargado: xmlDescargadoFilter,
      },
      { page: pageNum, limit: limitNum }
    );

    return reply.send({
      data,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        total_pages: Math.ceil(total / limitNum),
      },
    });
  });

  app.get<{ Params: { id: string; comprobanteId: string } }>(
    '/tenants/:id/comprobantes/:comprobanteId',
    async (req, reply) => {
      const tenant = await findTenantById(req.params.id);
      if (!tenant) {
        return reply.status(404).send({ error: 'Tenant no encontrado' });
      }

      const comprobante = await findComprobanteById(
        req.params.id,
        req.params.comprobanteId
      );
      if (!comprobante) {
        return reply.status(404).send({ error: 'Comprobante no encontrado' });
      }

      return reply.send({ data: comprobante });
    }
  );

  app.get<{
    Params: { id: string; comprobanteId: string };
    Querystring: { formato?: string };
  }>(
    '/tenants/:id/comprobantes/:comprobanteId/descargar',
    async (req, reply) => {
      const tenant = await findTenantById(req.params.id);
      if (!tenant) {
        return reply.status(404).send({ error: 'Tenant no encontrado' });
      }

      const comprobante = await findComprobanteById(
        req.params.id,
        req.params.comprobanteId
      );
      if (!comprobante) {
        return reply.status(404).send({ error: 'Comprobante no encontrado' });
      }

      const formato = (req.query.formato ?? 'json').toLowerCase();
      const filename = `comprobante_${comprobante.numero_comprobante.replace(/\//g, '-')}`;

      if (formato === 'xml') {
        if (!comprobante.xml_contenido) {
          return reply.status(404).send({ error: 'XML no disponible para este comprobante' });
        }
        return reply
          .header('Content-Type', 'application/xml; charset=utf-8')
          .header('Content-Disposition', `attachment; filename="${filename}.xml"`)
          .send(comprobante.xml_contenido);
      }

      if (formato === 'txt') {
        const txt = comprobanteToTxtLines(comprobante);
        return reply
          .header('Content-Type', 'text/plain; charset=utf-8')
          .header('Content-Disposition', `attachment; filename="${filename}.txt"`)
          .send(txt);
      }

      const jsonData = {
        id: comprobante.id,
        numero_comprobante: comprobante.numero_comprobante,
        tipo_comprobante: comprobante.tipo_comprobante,
        origen: comprobante.origen,
        fecha_emision: comprobante.fecha_emision,
        total_operacion: comprobante.total_operacion,
        cdc: comprobante.cdc,
        ruc_vendedor: comprobante.ruc_vendedor,
        razon_social_vendedor: comprobante.razon_social_vendedor,
        xml_descargado_at: comprobante.xml_descargado_at,
        detalles_xml: comprobante.detalles_xml,
      };

      return reply
        .header('Content-Type', 'application/json; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}.json"`)
        .send(JSON.stringify(jsonData, null, 2));
    }
  );

  app.get<{
    Params: { id: string };
    Querystring: {
      fecha_desde?: string;
      fecha_hasta?: string;
      tipo_comprobante?: string;
      ruc_vendedor?: string;
      xml_descargado?: string;
      formato?: string;
    };
  }>(
    '/tenants/:id/comprobantes/exportar',
    async (req, reply) => {
      const tenant = await findTenantById(req.params.id);
      if (!tenant) {
        return reply.status(404).send({ error: 'Tenant no encontrado' });
      }

      const {
        fecha_desde,
        fecha_hasta,
        tipo_comprobante,
        ruc_vendedor,
        xml_descargado,
        formato = 'json',
      } = req.query;

      const xmlDescargadoFilter =
        xml_descargado === 'true' ? true :
        xml_descargado === 'false' ? false :
        undefined;

      const { data } = await findComprobantesByTenant(
        req.params.id,
        {
          fecha_desde,
          fecha_hasta,
          tipo_comprobante: tipo_comprobante as TipoComprobante | undefined,
          ruc_vendedor,
          xml_descargado: xmlDescargadoFilter,
        },
        { page: 1, limit: 10000 }
      );

      const fmt = formato.toLowerCase();
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `comprobantes_${tenant.ruc}_${ts}`;

      if (fmt === 'txt') {
        const lines: string[] = [
          `EXPORTACION DE COMPROBANTES`,
          `Empresa: ${tenant.nombre_fantasia} (RUC: ${tenant.ruc})`,
          `Generado: ${new Date().toISOString()}`,
          `Total registros: ${data.length}`,
          ``,
          `${'='.repeat(100)}`,
        ];
        for (const c of data) {
          lines.push(``, comprobanteToTxtLines(c), `${'='.repeat(100)}`);
        }
        return reply
          .header('Content-Type', 'text/plain; charset=utf-8')
          .header('Content-Disposition', `attachment; filename="${filename}.txt"`)
          .send(lines.join('\n'));
      }

      const jsonExport = data.map((c) => ({
        id: c.id,
        numero_comprobante: c.numero_comprobante,
        tipo_comprobante: c.tipo_comprobante,
        origen: c.origen,
        fecha_emision: c.fecha_emision,
        total_operacion: c.total_operacion,
        cdc: c.cdc,
        ruc_vendedor: c.ruc_vendedor,
        razon_social_vendedor: c.razon_social_vendedor,
        xml_descargado_at: c.xml_descargado_at,
        detalles_xml: c.detalles_xml,
      }));

      return reply
        .header('Content-Type', 'application/json; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}.json"`)
        .send(JSON.stringify(jsonExport, null, 2));
    }
  );
}
