import puppeteer, { Browser, Page } from 'puppeteer';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { TenantConfig } from '../types';
import { decrypt } from './crypto.service';
import { upsertComprobante } from '../db/repositories/comprobante.repository';

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

    logger.info('Login en Marangatu exitoso');
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
  ): Promise<Page> {
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
      }).then((clicked: boolean) => {
        if (!clicked) {
          logger.warn('No se encontró el item del menú, navegando directamente');
          return page.evaluate((url: string) => { window.open(url, '_blank'); }, gestionUrl);
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

    logger.debug('Esperando tabla de comprobantes');
    await registroPage.waitForSelector(SELECTORS.registro.tabla, { visible: true, timeout: config.puppeteer.timeoutMs });
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
