import puppeteer, { Browser, Page } from 'puppeteer';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { TenantConfig } from '../types';
import { decrypt } from './crypto.service';
import { upsertComprobante, insertComprobanteIfNotExists } from '../db/repositories/comprobante.repository';

export interface ComprobanteRow {
  origen: 'ELECTRONICO' | 'VIRTUAL';
  ruc_vendedor: string;
  razon_social_vendedor?: string;
  cdc?: string;
  numero_comprobante: string;
  tipo_comprobante: string;
  fecha_emision: string;
  total_operacion: number;
  raw_payload: Record<string, unknown>;
}

export interface SyncResult {
  total_pages: number;
  total_rows: number;
  inserted: number;
  updated: number;
  errors: string[];
}

const SELECTORS = {
  login: {
    usuario: 'input[name="usuario"]',
    clave: 'input[name="clave"]',
    submit: 'button[type="submit"]',
    errorMsg: '.alert-danger, .alert-error, [class*="error"]',
  },
  menu: {
    busqueda: 'input[name="busqueda"]',
  },
  gestionComprobantes: {
    obtenerComprobantes: 'a, button',
    obtenerComprobantesText: 'Obtener Comprob',
  },
  registro: {
    comprasLink: 'a[data-ng-click="vm.seccion(\'COMPRAS\')"]',
    selectAnio: 'select[data-ng-model="vm.datos.anio"]',
    selectMes: 'select[data-ng-model="vm.datos.mes"]',
    checkboxSeleccionar: 'input[data-ng-model="vm.datos.seleccionar"]',
    btnSiguiente: 'button[name="siguiente"]',
    tabla: 'table.table-responsive',
    tablaFilas: 'table.table-responsive tbody tr',
    paginacionLista: 'ul.pagination',
    paginaActiva: 'ul.pagination li.page-item.active a.page-link',
    paginaLink: 'ul.pagination li.page-item:not(.active) a.page-link',
    infoPaginado: '.blockquote-footer',
    loadingIndicator: '[data-ng-show="vm.cargando"]',
  },
} as const;

function parseFechaEmision(fecha: string): string {
  const parts = fecha.split('/');
  if (parts.length !== 3) return fecha;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function parseTotalOperacion(total: string): number {
  const cleaned = total.replace(/\./g, '').replace(/,/g, '').trim();
  return parseInt(cleaned, 10) || 0;
}

function normalizeOrigen(origen: string): 'ELECTRONICO' | 'VIRTUAL' {
  const upper = origen.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (upper.includes('ELECT')) return 'ELECTRONICO';
  return 'VIRTUAL';
}

export class MarangatuService {
  private browser: Browser | null = null;

  async openBrowser(): Promise<void> {
    this.browser = await puppeteer.launch({
      headless: config.puppeteer.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-features=PasswordLeakDetection',
        '--password-store=basic',
      ],
      defaultViewport: { width: 1280, height: 900 },
    });
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private async newPage(): Promise<Page> {
    if (!this.browser) throw new Error('Browser no inicializado. Llamar openBrowser() primero.');
    const page = await this.browser.newPage();

    page.setDefaultTimeout(config.puppeteer.timeoutMs);
    page.setDefaultNavigationTimeout(config.puppeteer.timeoutMs);

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    return page;
  }

  /**
   * Espera a que AngularJS termine el digest cycle y no haya solicitudes pendientes.
   * Útil después de interacciones con elementos ng-change o ng-click.
   */
  private async waitForAngular(page: Page, extraDelayMs = 400): Promise<void> {
    await page.waitForFunction(
      () => {
        try {
          const el = document.querySelector('[ng-app], [data-ng-app]') as Element & {
            injector?: () => { get: (s: string) => { $$phase: string | null } };
          };
          if (!el) return true;
          const $rootScope = el.injector?.()?.get('$rootScope');
          return !$rootScope?.$$phase;
        } catch {
          return true;
        }
      },
      { timeout: config.puppeteer.timeoutMs }
    );
    await new Promise((r) => setTimeout(r, extraDelayMs));
  }

  /**
   * Dispara manualmente los eventos de change necesarios para que AngularJS
   * procese un valor seleccionado en un <select> con ng-model y ng-change.
   */
  private async angularSelect(page: Page, selector: string, value: string): Promise<void> {
    await page.evaluate(
      (sel: string, val: string) => {
        const el = document.querySelector(sel) as HTMLSelectElement | null;
        if (!el) throw new Error(`Selector no encontrado: ${sel}`);
        el.value = val;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
      },
      selector,
      value
    );
  }

  /**
   * Login en el portal Marangatu.
   *
   * Formulario: <form name="loginForm" action="authenticate" method="POST">
   *   Campo usuario: input[name="usuario"]  (id="usuario")
   *   Campo clave:   input[name="clave"]    (id="clave")
   *   Botón submit:  button[type="submit"]
   *
   * La URL de login es: {marangatu_base_url}/eset/login
   * Tras el login exitoso redirige al dashboard del portal.
   */
  private async loginMarangatu(
    page: Page,
    tenantConfig: TenantConfig & { clave_marangatu: string }
  ): Promise<void> {
    const loginUrl = `${tenantConfig.marangatu_base_url}/eset/login`;
    logger.debug('Navegando al login de Marangatu', { url: loginUrl });

    await page.goto(loginUrl, { waitUntil: 'networkidle2' });
    await page.waitForSelector(SELECTORS.login.usuario, { visible: true, timeout: config.puppeteer.timeoutMs });

    await page.click(SELECTORS.login.usuario, { clickCount: 3 });
    await page.type(SELECTORS.login.usuario, tenantConfig.usuario_marangatu, { delay: 40 });

    await page.click(SELECTORS.login.clave);
    await page.type(SELECTORS.login.clave, tenantConfig.clave_marangatu, { delay: 40 });

    logger.debug('Credenciales ingresadas, haciendo submit');

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: config.puppeteer.timeoutMs }),
      page.click(SELECTORS.login.submit),
    ]);

    const urlDespues = page.url();
    logger.debug('URL post-login', { url: urlDespues });

    const errorVisible = await page.evaluate((errSel: string) => {
      const el = document.querySelector(errSel);
      return el ? (el as HTMLElement).offsetParent !== null : false;
    }, SELECTORS.login.errorMsg);

    if (errorVisible || urlDespues.endsWith('/login') || urlDespues.includes('/login?') || urlDespues.includes('authenticate')) {
      const errorText = await page.evaluate((errSel: string) => {
        const el = document.querySelector(errSel);
        return el?.textContent?.trim() ?? '';
      }, SELECTORS.login.errorMsg);
      throw new Error(`Login fallido en Marangatu. ${errorText ? `Mensaje: ${errorText}` : 'Verificar usuario y contraseña.'}`);
    }

    logger.info('Login en Marangatu exitoso, esperando carga del dashboard (5s)');
    await new Promise((r) => setTimeout(r, 5000));
  }

  /**
   * Navega al módulo de Gestión de Comprobantes Informativos a través del menú de búsqueda.
   * Flujo:
   *   1. Tipea "Gestion De Comprobantes Informativos" en el buscador del menú
   *   2. Hace click en el resultado → abre nueva pestaña con gestionComprobantesVirtuales.do
   *   3. En esa pestaña click en "Obtener Comprob. Elect. y Virtuales" → abre registroComprobantesVirtuales.do
   *   4. Selecciona "Compras a Imputar"
   *   5. Selecciona año y mes actuales
   *   6. Marca "Seleccionar comprobantes"
   *   7. Click "Siguiente" → carga la tabla de comprobantes
   *
   * Retorna la Page (pestaña) que contiene la tabla de comprobantes lista para extraer.
   */
  private async navegarAGestionComprobantes(
    page: Page,
    tenantConfig: TenantConfig,
    mes: number,
    anio: number
  ): Promise<Page | null> {
    const baseUrl = tenantConfig.marangatu_base_url;

    logger.debug('Buscando "Gestion De Comprobantes Informativos" en el menú');
    await page.waitForSelector(SELECTORS.menu.busqueda, { visible: true, timeout: config.puppeteer.timeoutMs });
    await page.click(SELECTORS.menu.busqueda);
    await page.type(SELECTORS.menu.busqueda, 'Gestion De Comprobantes Informativos', { delay: 50 });

    logger.debug('Esperando resultado de búsqueda en el menú');
    await page.waitForFunction(
      () => {
        const items = Array.from(document.querySelectorAll('.list-group-item'));
        return items.some((el) =>
          el.textContent?.toLowerCase().includes('gestion de comprobantes informativos') ||
          el.textContent?.toLowerCase().includes('comprobantes informativos')
        );
      },
      { timeout: config.puppeteer.timeoutMs }
    );
    await new Promise((r) => setTimeout(r, 400));

    const gestionUrl = `${baseUrl}/eset/gestionComprobantesVirtuales.do`;

    logger.debug('Haciendo click en el resultado del menú');
    const gestionTarget = await Promise.all([
      this.browser!.waitForTarget(
        (t: import('puppeteer').Target) => t.url().includes('gestionComprobantesVirtuales'),
        { timeout: config.puppeteer.timeoutMs }
      ),
      page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('.list-group-item'));
        const item = items.find((el) =>
          el.textContent?.toLowerCase().includes('gestion de comprobantes informativos') ||
          el.textContent?.toLowerCase().includes('comprobantes informativos')
        );
        if (item) {
          (item as HTMLElement).click();
          return true;
        }
        return false;
      }).then(async (clicked: boolean) => {
        if (!clicked) {
          logger.warn('No se encontró el item del menú, navegando directamente');
          await page.evaluate((url: string) => { window.open(url, '_blank'); }, gestionUrl);
        }
      }),
    ]);

    const gestionTargetResult = gestionTarget[0];

    const gestionPage = await gestionTargetResult.page();
    if (!gestionPage) {
      throw new Error('No se pudo obtener la pestaña de gestión de comprobantes');
    }
    await gestionPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: config.puppeteer.timeoutMs }).catch(() => {});
    await gestionPage.setDefaultTimeout(config.puppeteer.timeoutMs);
    await gestionPage.setDefaultNavigationTimeout(config.puppeteer.timeoutMs);
    await gestionPage.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    logger.debug('Pestaña gestionComprobantesVirtuales abierta, buscando "Obtener Comprob. Elect. y Virtuales"');
    await gestionPage.waitForFunction(
      (text: string) => {
        const cards = Array.from(document.querySelectorAll('.card h4, .card-body h4'));
        return cards.some((el) => el.textContent?.includes(text));
      },
      { timeout: config.puppeteer.timeoutMs },
      SELECTORS.gestionComprobantes.obtenerComprobantesText
    );

    logger.debug('Click en la card "Obtener Comprob. Elect. y Virtuales"');
    const clickedCard = await gestionPage.evaluate((text: string) => {
      const cards = Array.from(document.querySelectorAll('.card'));
      const card = cards.find((el) => el.querySelector('h4')?.textContent?.includes(text));
      if (card) {
        (card as HTMLElement).click();
        return true;
      }
      return false;
    }, SELECTORS.gestionComprobantes.obtenerComprobantesText);

    if (!clickedCard) {
      throw new Error('No se encontró la card "Obtener Comprob. Elect. y Virtuales"');
    }

    const registroUrl = `${baseUrl}/eset/gdi/registroComprobantesVirtuales`;

    let registroPage: Page;

    const newTarget = await this.browser!.waitForTarget(
      (t: import('puppeteer').Target) =>
        t.url().includes('registroComprobantesVirtuales') ||
        t.url().includes('gdi/registro'),
      { timeout: config.puppeteer.timeoutMs }
    ).catch(() => null);

    if (newTarget) {
      logger.debug('Se abrió nueva pestaña con registroComprobantesVirtuales');
      const p = await newTarget.page();
      if (!p) throw new Error('No se pudo obtener la nueva pestaña de registro');
      registroPage = p;
      await registroPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: config.puppeteer.timeoutMs }).catch(() => {});
    } else {
      logger.debug('No se abrió nueva pestaña; esperando navegación interna o carga de sección');
      const navigated = await gestionPage.waitForFunction(
        () =>
          window.location.href.includes('registroComprobantesVirtuales') ||
          window.location.href.includes('gdi/registro') ||
          document.querySelector('[data-ng-click*="seccion"]') !== null,
        { timeout: config.puppeteer.timeoutMs }
      ).catch(() => null);

      if (!navigated) {
        logger.warn('La card no navegó, intentando URL directa');
        await gestionPage.goto(registroUrl, { waitUntil: 'networkidle2' });
      }

      registroPage = gestionPage;
    }

    await registroPage.setDefaultTimeout(config.puppeteer.timeoutMs);
    await registroPage.setDefaultNavigationTimeout(config.puppeteer.timeoutMs);
    await this.waitForAngular(registroPage, 600);

    logger.debug('Seleccionando "Compras a Imputar"');
    await registroPage.waitForFunction(
      (sel: string) => document.querySelector(sel) !== null,
      { timeout: config.puppeteer.timeoutMs },
      SELECTORS.registro.comprasLink
    );
    await registroPage.click(SELECTORS.registro.comprasLink);
    await this.waitForAngular(registroPage, 400);

    logger.debug(`Seleccionando año ${anio}`);
    await registroPage.waitForSelector(SELECTORS.registro.selectAnio, { visible: true, timeout: config.puppeteer.timeoutMs });
    await this.angularSelect(registroPage, SELECTORS.registro.selectAnio, String(anio));
    await this.waitForAngular(registroPage, 400);

    logger.debug(`Seleccionando mes ${mes}`);
    await registroPage.waitForSelector(SELECTORS.registro.selectMes, { visible: true, timeout: config.puppeteer.timeoutMs });
    await this.angularSelect(registroPage, SELECTORS.registro.selectMes, String(mes));
    await this.waitForAngular(registroPage, 400);

    logger.debug('Marcando "Seleccionar comprobantes"');
    await registroPage.waitForFunction(
      (sel: string) => document.querySelector(sel) !== null,
      { timeout: config.puppeteer.timeoutMs },
      SELECTORS.registro.checkboxSeleccionar
    );
    await registroPage.evaluate((sel: string) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (!el) throw new Error('Checkbox seleccionar no encontrado');
      if (el.checked) return;
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('click', { bubbles: true }));
    }, SELECTORS.registro.checkboxSeleccionar);
    await this.waitForAngular(registroPage, 400);

    logger.debug('Click en "Siguiente"');
    await registroPage.waitForSelector(SELECTORS.registro.btnSiguiente, { visible: true, timeout: config.puppeteer.timeoutMs });
    await registroPage.click(SELECTORS.registro.btnSiguiente);

    logger.debug('Esperando tabla de comprobantes o mensaje sin resultados');
    const tablaEncontrada = await registroPage.waitForFunction(
      (tablaSel: string) => {
        // Verificar si apareció la tabla
        const tabla = document.querySelector(tablaSel);
        if (tabla && (tabla as HTMLElement).offsetParent !== null) return 'tabla';
        // Verificar si hay un mensaje de alerta indicando sin resultados
        const alertas = Array.from(document.querySelectorAll('.alert, .alert-info, .alert-warning, [class*="alert"]'));
        const sinResultados = alertas.some((el) => {
          const text = el.textContent?.toLowerCase() ?? '';
          return text.includes('no se encontr') || text.includes('sin resultado') || text.includes('no existen') || text.includes('no hay');
        });
        if (sinResultados) return 'vacio';
        return null;
      },
      { timeout: config.puppeteer.timeoutMs },
      SELECTORS.registro.tabla
    );

    const resultado = await tablaEncontrada.jsonValue();
    if (resultado === 'vacio') {
      logger.info('No se encontraron comprobantes para el período', { mes, anio });
      return null;
    }

    await this.waitForAngular(registroPage, 400);

    logger.info('Tabla de comprobantes cargada', { mes, anio });
    return registroPage;
  }

  /**
   * Extrae todas las filas de comprobantes de la página actual de la tabla.
   *
   * Estructura de columnas de la tabla.table-responsive:
   *   0: Origen
   *   1: RUC Vendedor
   *   2: Razón Social Vendedor
   *   3: CDC
   *   4: Número Comprobante
   *   5: Tipo de Comprobante
   *   6: Fecha Emisión (DD/MM/YYYY)
   *   7: Total de la Operación (formato guaraní: puntos como separadores de miles)
   */
  private async extraerFilasDeComprobantes(page: Page): Promise<ComprobanteRow[]> {
    await page.waitForSelector(SELECTORS.registro.tablaFilas, { visible: true, timeout: config.puppeteer.timeoutMs });

    const rawRows = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table.table-responsive tbody tr'));
      return rows.map((tr) => {
        const tds = Array.from(tr.querySelectorAll('td'));
        return {
          origen: tds[0]?.textContent?.trim() ?? '',
          ruc_vendedor: tds[1]?.textContent?.trim() ?? '',
          razon_social_vendedor: tds[2]?.textContent?.trim() ?? '',
          cdc: tds[3]?.textContent?.trim() ?? '',
          numero_comprobante: tds[4]?.textContent?.trim() ?? '',
          tipo_comprobante: tds[5]?.textContent?.trim() ?? '',
          fecha_emision: tds[6]?.textContent?.trim() ?? '',
          total_str: tds[7]?.textContent?.trim() ?? '0',
        };
      });
    });

    return rawRows
      .filter((r) => r.ruc_vendedor && r.numero_comprobante)
      .map((r) => ({
        origen: normalizeOrigen(r.origen),
        ruc_vendedor: r.ruc_vendedor,
        razon_social_vendedor: r.razon_social_vendedor || undefined,
        cdc: r.cdc || undefined,
        numero_comprobante: r.numero_comprobante,
        tipo_comprobante: r.tipo_comprobante || 'FACTURA',
        fecha_emision: parseFechaEmision(r.fecha_emision),
        total_operacion: parseTotalOperacion(r.total_str),
        raw_payload: {
          origen_texto: r.origen,
          ruc_vendedor: r.ruc_vendedor,
          razon_social_vendedor: r.razon_social_vendedor,
          cdc: r.cdc,
          numero_comprobante: r.numero_comprobante,
          tipo_comprobante: r.tipo_comprobante,
          fecha_emision_raw: r.fecha_emision,
          total_str: r.total_str,
        },
      }));
  }

  /**
   * Lee la info de paginación de la tabla.
   * La tabla muestra: "25 registros en página, 2 páginas"
   * en el elemento .blockquote-footer
   */
  private async leerInfoPaginacion(page: Page): Promise<{ totalPaginas: number; paginaActual: number }> {
    return page.evaluate(
      (footerSel: string, activeSel: string) => {
        const footer = document.querySelector(footerSel);
        const footerText = footer?.textContent ?? '';

        const paginasMatch = footerText.match(/(\d+)\s+p[áa]ginas?/i);
        const totalPaginas = paginasMatch ? parseInt(paginasMatch[1], 10) : 1;

        const activeLink = document.querySelector(activeSel);
        const paginaActual = activeLink
          ? parseInt(activeLink.textContent?.trim() ?? '1', 10)
          : 1;

        return { totalPaginas, paginaActual };
      },
      SELECTORS.registro.infoPaginado,
      SELECTORS.registro.paginaActiva
    );
  }

  /**
   * Navega a la siguiente página de la tabla de comprobantes.
   * Usa los links de paginación Angular (ul.pagination > li > a.page-link).
   * Retorna true si pudo avanzar, false si ya está en la última página.
   */
  private async irSiguientePagina(page: Page): Promise<boolean> {
    const { totalPaginas, paginaActual } = await this.leerInfoPaginacion(page);

    if (paginaActual >= totalPaginas) return false;

    const siguientePagina = paginaActual + 1;
    logger.debug(`Navegando a página ${siguientePagina} de ${totalPaginas}`);

    const clickOk = await page.evaluate((targetPage: number) => {
      const allLinks = Array.from(
        document.querySelectorAll('ul.pagination li.page-item a.page-link')
      );
      const link = allLinks.find(
        (a) => a.textContent?.trim() === String(targetPage)
      );
      if (!link) return false;
      (link as HTMLElement).click();
      return true;
    }, siguientePagina);

    if (!clickOk) {
      logger.warn(`No se encontró el link para la página ${siguientePagina}`);
      return false;
    }

    await page.waitForFunction(
      (activePageSel: string, expected: number) => {
        const active = document.querySelector(activePageSel);
        return active
          ? parseInt(active.textContent?.trim() ?? '0', 10) === expected
          : false;
      },
      { timeout: config.puppeteer.timeoutMs },
      SELECTORS.registro.paginaActiva,
      siguientePagina
    );

    await this.waitForAngular(page, 600);
    return true;
  }

  /**
   * Navega a "Consulta de Comprobantes Registrados" a través del menú de búsqueda.
   * Busca el texto en el menú, click en resultado → abre nueva pestaña con consultarComprobantesRegistrados.do
   * Configura filtros (tipo registro, fecha desde, fecha hasta) y click "Búsqueda".
   * Retorna la Page de la nueva pestaña con resultados cargados, o null si no hay resultados.
   */
  private async navegarAConsultaComprobantes(
    page: Page,
    tenantConfig: TenantConfig,
    tipoRegistro: string,
    fechaDesde: string,
    fechaHasta: string
  ): Promise<Page | null> {
    const baseUrl = tenantConfig.marangatu_base_url;

    logger.debug('Buscando "consulta de comprobantes registrados" en el menú');
    await page.waitForSelector(SELECTORS.menu.busqueda, { visible: true, timeout: config.puppeteer.timeoutMs });
    await page.click(SELECTORS.menu.busqueda);
    await page.type(SELECTORS.menu.busqueda, 'consulta de comprobantes registrados', { delay: 50 });

    logger.debug('Esperando resultado de búsqueda en el menú');
    await page.waitForFunction(
      () => {
        const items = Array.from(document.querySelectorAll('.list-group-item'));
        return items.some((el) =>
          el.textContent?.toLowerCase().includes('consulta de comprobantes registrados') ||
          el.textContent?.toLowerCase().includes('comprobantes registrados')
        );
      },
      { timeout: config.puppeteer.timeoutMs }
    );
    await new Promise((r) => setTimeout(r, 400));

    const consultaUrl = `${baseUrl}/eset/consultarComprobantesRegistrados.do`;

    logger.debug('Haciendo click en el resultado del menú');
    const consultaTarget = await Promise.all([
      this.browser!.waitForTarget(
        (t: import('puppeteer').Target) => t.url().includes('consultarComprobantesRegistrados'),
        { timeout: config.puppeteer.timeoutMs }
      ),
      page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('.list-group-item'));
        const item = items.find((el) =>
          el.textContent?.toLowerCase().includes('consulta de comprobantes registrados') ||
          el.textContent?.toLowerCase().includes('comprobantes registrados')
        );
        if (item) {
          (item as HTMLElement).click();
          return true;
        }
        return false;
      }).then(async (clicked: boolean) => {
        if (!clicked) {
          logger.warn('No se encontró el item del menú, navegando directamente');
          await page.evaluate((url: string) => { window.open(url, '_blank'); }, consultaUrl);
        }
      }),
    ]);

    const consultaTargetResult = consultaTarget[0];
    const consultaPage = await consultaTargetResult.page();
    if (!consultaPage) {
      throw new Error('No se pudo obtener la pestaña de consulta de comprobantes registrados');
    }
    await consultaPage.setDefaultTimeout(config.puppeteer.timeoutMs);
    await consultaPage.setDefaultNavigationTimeout(config.puppeteer.timeoutMs);
    await consultaPage.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    // Esperar que el formulario esté listo + 5s
    logger.info('Esperando que cargue el formulario de consulta...');
    await consultaPage.waitForSelector('#tipoRegistro', { visible: true, timeout: config.puppeteer.timeoutMs });
    logger.info('Formulario visible, esperando 5s');
    await new Promise((r) => setTimeout(r, 5000));

    // Convertir fechas de YYYY-MM-DD a dd-mm-yyyy para Marangatu
    const fechaDesdeFmt = this.formatDateForMarangatu(fechaDesde);
    const fechaHastaFmt = this.formatDateForMarangatu(fechaHasta);

    // Seleccionar tipo de registro
    logger.debug(`Seleccionando tipo de registro: ${tipoRegistro}`);
    await consultaPage.waitForSelector('#tipoRegistro', { visible: true, timeout: config.puppeteer.timeoutMs });
    await this.angularSelect(consultaPage, '#tipoRegistro', tipoRegistro);
    await this.waitForAngular(consultaPage, 1000);

    // Configurar fechas — ng-model real: vm.datos.filtros.fechaEmisionDesde / fechaEmisionHasta
    logger.debug(`Configurando fecha desde: ${fechaDesdeFmt}`);
    await this.setMomentPickerDate(consultaPage, 'vm.datos.filtros.fechaEmisionDesde', fechaDesdeFmt);
    await this.waitForAngular(consultaPage, 1000);

    logger.debug(`Configurando fecha hasta: ${fechaHastaFmt}`);
    await this.setMomentPickerDate(consultaPage, 'vm.datos.filtros.fechaEmisionHasta', fechaHastaFmt);
    await this.waitForAngular(consultaPage, 1000);

    // Click en "Búsqueda"
    logger.debug('Click en "Búsqueda"');
    const btnBusqueda = await consultaPage.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find((b) => b.textContent?.trim().toLowerCase().includes('búsqueda') || b.textContent?.trim().toLowerCase().includes('busqueda')) ?? null;
    });
    if (!btnBusqueda || !(btnBusqueda as unknown as { asElement: () => unknown }).asElement?.()) {
      throw new Error('No se encontró el botón "Búsqueda"');
    }
    await (btnBusqueda as unknown as import('puppeteer').ElementHandle<HTMLButtonElement>).click();

    // Esperar a que cargue la tabla con resultados o un mensaje de sin resultados
    logger.debug('Esperando carga de resultados...');
    await consultaPage.waitForFunction(
      () => {
        // ¿Hay una tabla con filas?
        const tables = Array.from(document.querySelectorAll('table'));
        const hayTablaConFilas = tables.some((t) => t.querySelectorAll('tbody tr').length > 0);
        if (hayTablaConFilas) return true;
        // ¿Hay un mensaje de sin resultados?
        const alertas = Array.from(document.querySelectorAll('.alert, .alert-info, .alert-warning, [class*="alert"]'));
        const sinResultados = alertas.some((el) => {
          const text = el.textContent?.toLowerCase() ?? '';
          return text.includes('no se encontr') || text.includes('sin resultado') || text.includes('no existen') || text.includes('no hay');
        });
        if (sinResultados) return true;
        return false;
      },
      { timeout: 60000 } // hasta 60s para consultas con rangos de fecha amplios
    );
    await this.waitForAngular(consultaPage, 1000);

    // Verificar si hay tabla o mensaje vacío — buscar CUALQUIER tabla con filas
    const resultado = await consultaPage.evaluate(() => {
      // Buscar tabla con distintos selectores posibles
      const tablaSelectors = [
        '#resultados table',
        'table.table-responsive',
        'table.table',
        'table',
      ];
      for (const sel of tablaSelectors) {
        const tabla = document.querySelector(sel);
        if (tabla && tabla.querySelectorAll('tbody tr').length > 0) return 'tabla';
      }
      const alertas = Array.from(document.querySelectorAll('.alert, .alert-info, .alert-warning, [class*="alert"]'));
      const sinResultados = alertas.some((el) => {
        const text = el.textContent?.toLowerCase() ?? '';
        return text.includes('no se encontr') || text.includes('sin resultado') || text.includes('no existen') || text.includes('no hay');
      });
      if (sinResultados) return 'vacio';
      return 'vacio'; // si no hay tabla con filas, considerar vacío
    });

    if (resultado === 'vacio') {
      logger.info('No se encontraron comprobantes en la consulta', { fechaDesde, fechaHasta });
      return null;
    }

    logger.info('Tabla de consulta de comprobantes cargada', { fechaDesde, fechaHasta });
    return consultaPage;
  }

  /**
   * Extrae filas de comprobantes de la página de consulta.
   * Usa selectores flexibles ya que la tabla puede ser #resultados table, table.table-responsive, o simplemente table.
   * Mapea las columnas al mismo ComprobanteRow[].
   */
  private async extraerFilasConsulta(page: Page): Promise<ComprobanteRow[]> {
    // Esperar a que aparezca alguna tabla con filas
    await page.waitForFunction(
      () => {
        const selectors = ['#resultados table tbody tr', 'table.table-responsive tbody tr', 'table tbody tr'];
        return selectors.some((sel) => document.querySelectorAll(sel).length > 0);
      },
      { timeout: config.puppeteer.timeoutMs }
    );

    const { headers: tableHeaders, rows: rawRows } = await page.evaluate(() => {
      // Encontrar la tabla principal de resultados
      const selectors = ['#resultados table', 'table.table-responsive', 'table.table'];
      let table: HTMLTableElement | null = null;
      for (const sel of selectors) {
        const candidate = document.querySelector(sel) as HTMLTableElement | null;
        if (candidate && candidate.querySelectorAll('tbody tr').length > 0) {
          table = candidate;
          break;
        }
      }
      if (!table) {
        const tables = Array.from(document.querySelectorAll('table'));
        table = tables.find((t) => t.querySelectorAll('tbody tr').length > 0) as HTMLTableElement ?? null;
      }
      if (!table) return { headers: [] as string[], rows: [] as string[][] };

      const headers = Array.from(table.querySelectorAll('thead th, thead td')).map(
        (th) => th.textContent?.trim() ?? ''
      );

      const rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) => {
        return Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim() ?? '');
      });

      return { headers, rows };
    });

    // Log headers y primera fila para mapeo
    logger.debug('Consulta: headers de la tabla', { headerCount: tableHeaders.length });
    if (rawRows.length > 0) {
      logger.debug('Consulta: primera fila raw', { cellCount: rawRows[0]!.length });
    }

    // La tabla tiene headers de grupo (colspan) que no corresponden 1:1 con las celdas.
    // Headers: 17 (4 de grupo + 13 de datos), Celdas: 13
    // Mapeo directo por posición basado en la estructura real:
    //   0: RUC Informante (nuestro RUC, ignorar)
    //   1: Razón Social Informante (nosotros, ignorar)
    //   2: RUC Informado = RUC Vendedor
    //   3: Razón Social Informado = Razón Social Vendedor
    //   4: Tipo de Registro (COMPRAS/VENTAS, ignorar)
    //   5: Tipo de Comprobante (FACTURA, etc.)
    //   6: Fecha de Emisión (DD/MM/YYYY)
    //   7: Período de Emisión (MM/YYYY, ignorar)
    //   8: Número de Comprobante
    //   9: Timbrado (ignorar)
    //  10: Origen del Comprobante (ELECTRONICO/VIRTUAL)
    //  11: CDC
    //  12: Total Comprobante
    const colMap = {
      ruc_vendedor: 2,
      razon_social: 3,
      tipo_comprobante: 5,
      fecha_emision: 6,
      numero_comprobante: 8,
      origen: 10,
      cdc: 11,
      total: 12,
    };
    logger.debug('Consulta: mapa de columnas (posicional)', colMap);

    const getCell = (row: string[], col: number): string => (col >= 0 && col < row.length) ? row[col]! : '';

    return rawRows
      .map((cells) => {
        const origen = getCell(cells, colMap.origen);
        const ruc = getCell(cells, colMap.ruc_vendedor);
        const razonSocial = getCell(cells, colMap.razon_social);
        const cdc = getCell(cells, colMap.cdc);
        const numComprobante = getCell(cells, colMap.numero_comprobante);
        const tipoComprobante = getCell(cells, colMap.tipo_comprobante);
        const fechaEmision = getCell(cells, colMap.fecha_emision);
        const totalStr = getCell(cells, colMap.total);

        return { origen, ruc, razonSocial, cdc, numComprobante, tipoComprobante, fechaEmision, totalStr, cells };
      })
      .filter((r) => r.ruc && (r.numComprobante || r.cdc))
      .map((r) => ({
        origen: normalizeOrigen(r.origen || 'ELECTRONICO'),
        ruc_vendedor: r.ruc,
        razon_social_vendedor: r.razonSocial || undefined,
        cdc: r.cdc || undefined,
        numero_comprobante: r.numComprobante || r.cdc || '',
        tipo_comprobante: r.tipoComprobante || 'FACTURA',
        fecha_emision: parseFechaEmision(r.fechaEmision),
        total_operacion: parseTotalOperacion(r.totalStr),
        raw_payload: {
          origen_texto: r.origen,
          ruc_vendedor: r.ruc,
          razon_social_vendedor: r.razonSocial,
          cdc: r.cdc,
          numero_comprobante: r.numComprobante,
          tipo_comprobante: r.tipoComprobante,
          fecha_emision_raw: r.fechaEmision,
          total_str: r.totalStr,
          all_cells: r.cells,
          fuente: 'CONSULTA_COMPROBANTES_REGISTRADOS',
        },
      }));
  }

  /**
   * Lee la info de paginación de la tabla de consulta.
   * Busca paginación en #resultados o en ul.pagination general.
   */
  private async leerInfoPaginacionConsulta(page: Page): Promise<{ totalPaginas: number; paginaActual: number }> {
    return page.evaluate(() => {
      // Buscar footer de paginación
      const footerSelectors = ['#resultados .blockquote-footer', '.blockquote-footer'];
      let footerText = '';
      for (const sel of footerSelectors) {
        const footer = document.querySelector(sel);
        if (footer) {
          footerText = footer.textContent ?? '';
          break;
        }
      }

      const paginasMatch = footerText.match(/(\d+)\s+p[áa]ginas?/i);
      const totalPaginas = paginasMatch ? parseInt(paginasMatch[1]!, 10) : 1;

      // Buscar página activa
      const activeSelectors = ['#resultados ul.pagination li.page-item.active a.page-link', 'ul.pagination li.page-item.active a.page-link'];
      let paginaActual = 1;
      for (const sel of activeSelectors) {
        const active = document.querySelector(sel);
        if (active) {
          paginaActual = parseInt(active.textContent?.trim() ?? '1', 10);
          break;
        }
      }

      return { totalPaginas, paginaActual };
    });
  }

  /**
   * Navega a la siguiente página en la tabla de consulta.
   */
  private async irSiguientePaginaConsulta(page: Page, primeraFilaAnterior: string = ''): Promise<boolean> {
    const { totalPaginas, paginaActual } = await this.leerInfoPaginacionConsulta(page);

    if (paginaActual >= totalPaginas) return false;

    const siguientePagina = paginaActual + 1;
    logger.info(`Navegando a página ${siguientePagina} de ${totalPaginas} (consulta)`);

    // Click en el link de la página siguiente
    const clickOk = await page.evaluate((targetPage: number) => {
      const allLinks = Array.from(document.querySelectorAll('ul.pagination li a'));
      const link = allLinks.find((a) => a.textContent?.trim() === String(targetPage));
      if (!link) return false;
      (link as HTMLElement).click();
      return true;
    }, siguientePagina);

    if (!clickOk) {
      // Fallback: intentar con ng-click que contenga el número de página
      const fallbackOk = await page.evaluate((targetPage: number) => {
        // Buscar todos los links de paginación y hacer click en el correcto
        const allLi = Array.from(document.querySelectorAll('ul.pagination li'));
        for (const li of allLi) {
          const link = li.querySelector('a');
          if (!link) continue;
          const text = link.textContent?.trim();
          if (text === String(targetPage)) {
            link.click();
            return true;
          }
          // También intentar por posición (si es ">" o "»" para siguiente)
          const ngClick = link.getAttribute('ng-click') || link.getAttribute('data-ng-click') || '';
          if (ngClick.includes(String(targetPage)) || ngClick.includes('next') || ngClick.includes('siguiente')) {
            link.click();
            return true;
          }
        }
        return false;
      }, siguientePagina);

      if (!fallbackOk) {
        logger.warn(`No se encontró el link para la página ${siguientePagina} (consulta)`);
        return false;
      }
    }

    // Esperar que la página activa cambie
    logger.debug(`Esperando que la página activa cambie a ${siguientePagina}...`);
    await page.waitForFunction(
      (expected: number) => {
        const allLists = Array.from(document.querySelectorAll('ul.pagination'));
        for (const ul of allLists) {
          const active = ul.querySelector('li.active a, li.page-item.active a, li.page-item.active a.page-link');
          if (active && parseInt(active.textContent?.trim() ?? '0', 10) === expected) return true;
        }
        return false;
      },
      { timeout: 60000 },
      siguientePagina
    );
    logger.debug(`Página ${siguientePagina} activa, esperando recarga de tabla...`);

    // Esperar a que los datos de la tabla cambien (primera fila diferente a la anterior)
    if (primeraFilaAnterior) {
      await page.waitForFunction(
        (filaAnterior: string) => {
          const tables = Array.from(document.querySelectorAll('table'));
          const table = tables.find((t) => t.querySelectorAll('tbody tr').length > 0);
          if (!table) return false;
          const tds = Array.from(table.querySelectorAll('tbody tr:first-child td'));
          const cells = tds.map((td) => td.textContent?.trim() ?? '');
          // Comparar número comprobante (col 8) + CDC (col 11)
          const filaActual = (cells[8] ?? '') + '|' + (cells[11] ?? '');
          return filaActual !== filaAnterior;
        },
        { timeout: 60000 },
        primeraFilaAnterior
      );
    } else {
      // Fallback: esperar 5s si no tenemos fila anterior
      await new Promise((r) => setTimeout(r, 5000));
    }

    await this.waitForAngular(page, 500);
    logger.info(`Página ${siguientePagina} cargada con datos nuevos`);
    return true;
  }

  /**
   * Convierte fecha de YYYY-MM-DD a DD/MM/YYYY para los moment-pickers de Marangatu.
   */
  private formatDateForMarangatu(dateStr: string): string {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  /**
   * Setea un valor de fecha en un moment-picker de AngularJS.
   *
   * Estructura del DOM en Marangatu:
   *   <div moment-picker="vm.datos.filtros.fechaEmisionDesde" format="DD/MM/YYYY">
   *     <input data-ng-model="vm.datos.filtros.fechaEmisionDesde"
   *            data-ng-model-options="{ updateOn: 'blur' }" ...>
   *   </div>
   *
   * Estrategia:
   *   1. Busca el input por data-ng-model
   *   2. Setea valor via Angular scope.$apply
   *   3. Fallback: set value en el input + trigger input/change/blur
   */
  private async setMomentPickerDate(page: Page, ngModel: string, dateValue: string): Promise<void> {
    const result = await page.evaluate((model: string, val: string) => {
      // Buscar el input con ng-model
      const input = document.querySelector(`input[data-ng-model="${model}"]`) as HTMLInputElement
        || document.querySelector(`input[ng-model="${model}"]`) as HTMLInputElement;

      // También buscar el div moment-picker padre
      const mpDiv = document.querySelector(`[moment-picker="${model}"]`)
        || document.querySelector(`[data-moment-picker="${model}"]`);

      // Si no encontramos ni input ni div, buscar por cualquier match
      const targetInput = input || (mpDiv?.querySelector('input.moment-picker-input') as HTMLInputElement);

      if (!targetInput) return { found: false, method: 'none' };

      // Intento 1: via Angular scope
      try {
        const ang = (window as unknown as { angular?: { element: (el: Element) => { scope: () => Record<string, unknown>; controller: () => Record<string, unknown> } } }).angular;
        if (ang) {
          const scope = ang.element(targetInput).scope();
          if (scope) {
            // Navegar al modelo anidado
            const parts = model.split('.');
            let obj: Record<string, unknown> = scope;
            for (let i = 0; i < parts.length - 1; i++) {
              obj = obj[parts[i]!] as Record<string, unknown>;
              if (!obj) break;
            }
            if (obj) {
              obj[parts[parts.length - 1]!] = val;
              (scope as unknown as { $apply: () => void }).$apply();
              return { found: true, method: 'scope', value: targetInput.value };
            }
          }
        }
      } catch {
        // scope method failed, try fallback
      }

      // Intento 2: set value directo + events (importante: blur por ng-model-options updateOn:'blur')
      targetInput.focus();
      targetInput.value = val;
      targetInput.dispatchEvent(new Event('input', { bubbles: true }));
      targetInput.dispatchEvent(new Event('change', { bubbles: true }));
      targetInput.dispatchEvent(new Event('blur', { bubbles: true }));

      return { found: true, method: 'fallback', value: targetInput.value };
    }, ngModel, dateValue);

    logger.debug(`setMomentPickerDate resultado`, { ngModel, dateValue, ...result });
  }

  /**
   * Proceso completo de consulta de comprobantes registrados para un tenant.
   * Flujo:
   *   1. Abre Chromium headless
   *   2. Login en Marangatu
   *   3. Navega al menú → abre pestaña consultarComprobantesRegistrados.do
   *   4. Configura filtros (tipo registro, fechas) y click "Búsqueda"
   *   5. Extrae todas las páginas de resultados
   *   6. INSERT solo comprobantes nuevos (skip si CDC ya existe)
   *   7. Cierra browser
   */
  async consultarComprobantes(
    tenantId: string,
    tenantConfig: TenantConfig,
    options: { fechaDesde: string; fechaHasta: string; tipoRegistro?: string }
  ): Promise<SyncResult> {
    const tipoRegistro = options.tipoRegistro ?? 'COMPRAS';

    const result: SyncResult = {
      total_pages: 0,
      total_rows: 0,
      inserted: 0,
      updated: 0,
      errors: [],
    };

    const decryptedConfig = {
      ...tenantConfig,
      clave_marangatu: decrypt(tenantConfig.clave_marangatu_encrypted),
    };

    try {
      await this.openBrowser();
      const loginPage = await this.newPage();

      logger.info('Iniciando login en Marangatu para consulta de comprobantes', { tenant_id: tenantId });
      await this.loginMarangatu(loginPage, decryptedConfig);
      logger.info('Login exitoso', { tenant_id: tenantId });

      const workingPage = await this.navegarAConsultaComprobantes(
        loginPage,
        tenantConfig,
        tipoRegistro,
        options.fechaDesde,
        options.fechaHasta
      );

      if (!workingPage) {
        logger.info('Sin comprobantes en consulta, finalizada con 0 resultados', {
          tenant_id: tenantId,
          fechaDesde: options.fechaDesde,
          fechaHasta: options.fechaHasta,
        });
        return result;
      }

      // Leer info de paginación inicial
      const paginacionInicial = await this.leerInfoPaginacionConsulta(workingPage);
      logger.info('Resultados de consulta encontrados', {
        tenant_id: tenantId,
        totalPaginas: paginacionInicial.totalPaginas,
        paginaActual: paginacionInicial.paginaActual,
      });

      let hasMore = true;
      let ultimaPrimeraFila = ''; // para detectar cambio de página
      while (hasMore) {
        result.total_pages++;
        logger.info(`Extrayendo página ${result.total_pages}`, { tenant_id: tenantId });

        const rows = await this.extraerFilasConsulta(workingPage);
        result.total_rows += rows.length;
        logger.info(`Filas extraídas en página ${result.total_pages}: ${rows.length}`, { tenant_id: tenantId });

        // Guardar identificador de la primera fila para detectar cambio en siguiente página
        if (rows.length > 0) {
          ultimaPrimeraFila = rows[0]!.numero_comprobante + '|' + rows[0]!.cdc;
        }

        for (const row of rows) {
          try {
            const { created } = await insertComprobanteIfNotExists({
              tenant_id: tenantId,
              origen: row.origen,
              ruc_vendedor: row.ruc_vendedor,
              razon_social_vendedor: row.razon_social_vendedor,
              cdc: row.cdc,
              numero_comprobante: row.numero_comprobante,
              tipo_comprobante: row.tipo_comprobante,
              fecha_emision: row.fecha_emision,
              total_operacion: row.total_operacion,
              raw_payload: row.raw_payload,
            });
            if (created) {
              result.inserted++;
            }
          } catch (err) {
            const msg = `Error al guardar comprobante ${row.numero_comprobante}: ${(err as Error).message}`;
            logger.warn(msg, { tenant_id: tenantId });
            result.errors.push(msg);
          }
        }

        hasMore = await this.irSiguientePaginaConsulta(workingPage, ultimaPrimeraFila);
      }

      logger.info('Consulta de comprobantes completada', {
        tenant_id: tenantId,
        paginas: result.total_pages,
        total: result.total_rows,
        nuevos: result.inserted,
        errores: result.errors.length,
      });

      return result;
    } finally {
      await this.closeBrowser();
    }
  }

  /**
   * Proceso completo de sincronización para un tenant.
   * Flujo:
   *   1. Abre Chromium headless
   *   2. Login en Marangatu con credenciales del tenant
   *   3. Navega por el menú → abre pestaña gestionComprobantesVirtuales.do
   *   4. Click "Obtener Comprob." → abre pestaña registroComprobantesVirtuales.do
   *   5. Selecciona COMPRAS, año actual, mes actual, modo "Seleccionar comprobantes"
   *   6. Click "Siguiente" → carga tabla paginada
   *   7. Extrae todas las páginas y hace upsert en PostgreSQL
   *   8. Cierra el browser
   */
  async syncComprobantes(
    tenantId: string,
    tenantConfig: TenantConfig,
    options: { mes?: number; anio?: number } = {}
  ): Promise<SyncResult> {
    const now = new Date();
    const mes = options.mes ?? now.getMonth() + 1;
    const anio = options.anio ?? now.getFullYear();

    const result: SyncResult = {
      total_pages: 0,
      total_rows: 0,
      inserted: 0,
      updated: 0,
      errors: [],
    };

    const decryptedConfig = {
      ...tenantConfig,
      clave_marangatu: decrypt(tenantConfig.clave_marangatu_encrypted),
    };

    try {
      await this.openBrowser();
      const loginPage = await this.newPage();

      logger.info('Iniciando login en Marangatu', { tenant_id: tenantId });
      await this.loginMarangatu(loginPage, decryptedConfig);
      logger.info('Login exitoso', { tenant_id: tenantId });

      const workingPage = await this.navegarAGestionComprobantes(
        loginPage,
        tenantConfig,
        mes,
        anio
      );

      if (!workingPage) {
        logger.info('Sin comprobantes para el período, sincronización finalizada con 0 resultados', {
          tenant_id: tenantId,
          mes,
          anio,
        });
        return result;
      }

      logger.info('Tabla de comprobantes lista', { tenant_id: tenantId, mes, anio });

      let hasMore = true;
      while (hasMore) {
        result.total_pages++;
        logger.debug(`Extrayendo página ${result.total_pages}`, { tenant_id: tenantId });

        const rows = await this.extraerFilasDeComprobantes(workingPage);
        result.total_rows += rows.length;
        logger.debug(`Filas extraídas en página ${result.total_pages}: ${rows.length}`);

        for (const row of rows) {
          try {
            const { created } = await upsertComprobante({
              tenant_id: tenantId,
              origen: row.origen,
              ruc_vendedor: row.ruc_vendedor,
              razon_social_vendedor: row.razon_social_vendedor,
              cdc: row.cdc,
              numero_comprobante: row.numero_comprobante,
              tipo_comprobante: row.tipo_comprobante,
              fecha_emision: row.fecha_emision,
              total_operacion: row.total_operacion,
              raw_payload: row.raw_payload,
            });
            if (created) {
              result.inserted++;
            } else {
              result.updated++;
            }
          } catch (err) {
            const msg = `Error al guardar comprobante ${row.numero_comprobante}: ${(err as Error).message}`;
            logger.warn(msg, { tenant_id: tenantId });
            result.errors.push(msg);
          }
        }

        hasMore = await this.irSiguientePagina(workingPage);
      }

      logger.info('Sincronización completada', {
        tenant_id: tenantId,
        paginas: result.total_pages,
        total: result.total_rows,
        nuevos: result.inserted,
        actualizados: result.updated,
        errores: result.errors.length,
      });

      return result;
    } finally {
      await this.closeBrowser();
    }
  }
}
