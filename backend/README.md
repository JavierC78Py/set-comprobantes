# SET Comprobantes Backend

Servicio de automatización de comprobantes fiscales SET Paraguay.
Descarga comprobantes de Marangatu, descarga los XML desde eKuatia y los envía a Oracle ORDS.
Arquitectura multitenant con cola de jobs en PostgreSQL y automatización headless con Puppeteer.

---

## Tabla de contenidos

1. [Stack tecnológico](#stack-tecnológico)
2. [Arquitectura](#arquitectura)
3. [Requisitos previos](#requisitos-previos)
4. [Instalación local (sin Docker)](#instalación-local-sin-docker)
5. [Instalación con Docker Compose](#instalación-con-docker-compose)
6. [Variables de entorno](#variables-de-entorno)
7. [Configuración de tenants](#configuración-de-tenants)
8. [API Reference](#api-reference)
9. [Flujo de procesamiento](#flujo-de-procesamiento)
10. [Schema de base de datos](#schema-de-base-de-datos)
11. [Payload ORDS](#payload-ords)
12. [Seguridad](#seguridad)
13. [Colección Postman](#colección-postman)

---

## Stack tecnológico

| Componente | Tecnología |
|---|---|
| Runtime | Node.js 20 + TypeScript |
| Framework HTTP | Fastify |
| Base de datos | PostgreSQL 15 |
| Query builder | node-postgres (`pg`) — queries parametrizadas directas |
| Automatización web | Puppeteer (headless Chromium) |
| Parser XML | `@xmldom/xmldom` |
| Resolver CAPTCHA | SolveCaptcha API |
| Scheduler | node-cron |
| HTTP client | Axios |
| Validación | Zod |
| Cifrado | AES-256-GCM (módulo `crypto` nativo de Node) |
| Logging | Pino vía Fastify |

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                         API (Fastify)                           │
│  POST /tenants   GET /tenants/:id/comprobantes   POST jobs      │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                    Tabla jobs (PostgreSQL)
                    FOR UPDATE SKIP LOCKED
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                        Worker Loop                              │
│                                                                 │
│  ┌──────────────────┐  ┌─────────────────┐  ┌───────────────┐  │
│  │ SYNC_COMPROBANTES│  │  ENVIAR_A_ORDS  │  │ DESCARGAR_XML │  │
│  └────────┬─────────┘  └────────┬────────┘  └───────┬───────┘  │
│           │                     │                   │          │
│    Puppeteer →           Axios POST →       SolveCaptcha →     │
│    Marangatu             Oracle ORDS        eKuatia XML DL     │
│    (scraping)            (REST API)         (parse SIFEN)      │
└─────────────────────────────────────────────────────────────────┘
```

**Multitenant:** todas las tablas tienen `tenant_id`. Cada empresa tiene sus propias credenciales cifradas y su propia cola de jobs.

**Sin Redis:** la cola de jobs es la tabla `jobs` en PostgreSQL usando `SELECT ... FOR UPDATE SKIP LOCKED`. Soporta múltiples instancias del worker en paralelo sin colisiones.

---

## Requisitos previos

- Node.js 20+
- npm 10+
- PostgreSQL 15+ (o Docker)
- Chromium / Chrome (Puppeteer lo descarga automáticamente en `npm install`)
- Una cuenta activa en [SolveCaptcha](https://solvecaptcha.com/) para la descarga de XMLs desde eKuatia

---

## Instalación local (sin Docker)

### 1. Clonar e instalar dependencias

```bash
git clone <repo>
cd set-comprobantes/backend
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env` con los valores reales. Ver sección [Variables de entorno](#variables-de-entorno).

**Lo mínimo necesario para arrancar:**

```
DATABASE_URL=postgresql://postgres:password@localhost:5432/set_comprobantes
ENCRYPTION_KEY=una_clave_de_al_menos_32_caracteres_aqui!
SOLVECAPTCHA_API_KEY=tu_api_key_de_solvecaptcha
```

### 3. Crear la base de datos

```bash
# Con psql
psql -U postgres -c "CREATE DATABASE set_comprobantes;"
```

### 4. Ejecutar migraciones

```bash
npm run migrate
```

Esto ejecuta en orden todos los archivos SQL en `src/db/migrations/`.

### 5. Iniciar API y Worker

En terminales separadas:

```bash
# Terminal 1: API HTTP
npm run dev

# Terminal 2: Worker de jobs
npm run dev:worker
```

La API queda disponible en `http://localhost:4000`.
La documentación Swagger en `http://localhost:4000/docs`.

### Scripts disponibles

| Script | Descripción |
|---|---|
| `npm run dev` | API en modo desarrollo (ts-node-dev, hot reload) |
| `npm run dev:worker` | Worker en modo desarrollo |
| `npm run build` | Compilar TypeScript a `dist/` |
| `npm start` | Ejecutar API compilada |
| `npm run start:worker` | Ejecutar Worker compilado |
| `npm run migrate` | Correr migraciones SQL |
| `npm run typecheck` | Verificar tipos sin compilar |

---

## Instalación con Docker Compose

### 1. Configurar entorno

```bash
# Desde la raíz del monorepo
cp backend/.env.example backend/.env
# Editar backend/.env con los valores reales
```

### 2. Levantar todos los servicios

```bash
docker compose up -d
```

Esto levanta:
- `postgres` — PostgreSQL 15
- `api` — Fastify API en puerto 4000
- `worker` — Worker de jobs (proceso independiente)

### 3. Correr migraciones (primera vez)

```bash
docker compose --profile migrate up migrate
```

O directamente contra el contenedor:

```bash
docker compose exec api npm run migrate
```

### 4. Ver logs

```bash
docker compose logs -f api
docker compose logs -f worker
```

### 5. Detener

```bash
docker compose down
# Con volúmenes (borra la DB):
docker compose down -v
```

---

## Variables de entorno

Todas las variables se configuran en `backend/.env`.

### Requeridas

| Variable | Descripción | Ejemplo |
|---|---|---|
| `DATABASE_URL` | Connection string PostgreSQL completo | `postgresql://user:pass@host:5432/db` |
| `ENCRYPTION_KEY` | Clave AES-256 para cifrar credenciales. Mínimo 32 caracteres. **Nunca cambiarla en producción sin re-cifrar todos los registros.** | `my_super_secret_key_32chars_min!` |
| `SOLVECAPTCHA_API_KEY` | API Key de [SolveCaptcha](https://solvecaptcha.com/) para resolver el reCAPTCHA de eKuatia | `abc123...` |

### Opcionales

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | `4000` | Puerto del servidor HTTP |
| `NODE_ENV` | `development` | Entorno: `development` o `production` |
| `DEBUG` | `false` | Activa logs de debug detallados |
| `DB_POOL_MIN` | `2` | Conexiones mínimas en el pool PostgreSQL |
| `DB_POOL_MAX` | `10` | Conexiones máximas en el pool PostgreSQL |
| `WORKER_POLL_INTERVAL_MS` | `5000` | Cada cuántos ms el worker consulta nuevos jobs |
| `WORKER_MAX_CONCURRENT_JOBS` | `3` | Cuántos jobs puede procesar el worker en paralelo |
| `PUPPETEER_HEADLESS` | `true` | `false` para ver el browser durante desarrollo |
| `PUPPETEER_TIMEOUT_MS` | `30000` | Timeout general de Puppeteer en ms |
| `MARANGATU_BASE_URL` | `https://marangatu.set.gov.py` | URL base del portal Marangatu |

> **Producción:** usar un secrets manager (HashiCorp Vault, AWS Secrets Manager) para `ENCRYPTION_KEY` y `SOLVECAPTCHA_API_KEY`. Nunca commitearlos al repositorio.

---

## Configuración de tenants

Cada empresa cliente se registra como un **tenant** con su propia configuración. Las credenciales sensibles se cifran automáticamente con AES-256-GCM antes de persistir.

### Crear un tenant

```
POST /tenants
Content-Type: application/json
```

```json
{
  "nombre_fantasia": "Farmacia Central",
  "ruc": "80012345-6",
  "email_contacto": "admin@farmaciacentral.com.py",
  "config": {
    "ruc_login": "80012345-6",
    "usuario_marangatu": "mi_usuario_set",
    "clave_marangatu": "mi_clave_secreta",
    "enviar_a_ords_automaticamente": true,
    "frecuencia_sincronizacion_minutos": 60,
    "ords_base_url": "https://oracle.empresa.com/ords",
    "ords_endpoint_facturas": "/api/v1/facturas",
    "ords_tipo_autenticacion": "BASIC",
    "ords_usuario": "oracle_user",
    "ords_password": "oracle_pass"
  }
}
```

**Campos de configuración:**

| Campo | Tipo | Descripción |
|---|---|---|
| `ruc_login` | string | RUC usado para login en Marangatu |
| `usuario_marangatu` | string | Usuario del portal SET |
| `clave_marangatu` | string | Contraseña (se cifra al guardar) |
| `enviar_a_ords_automaticamente` | boolean | Si `true`, encola envío ORDS después de cada sync |
| `frecuencia_sincronizacion_minutos` | number | Cada cuántos minutos el scheduler encola un sync automático |
| `ords_base_url` | string? | URL base del servidor ORDS (puede omitirse si no se usa ORDS) |
| `ords_endpoint_facturas` | string? | Path del endpoint de facturas en ORDS |
| `ords_tipo_autenticacion` | `BASIC` \| `BEARER` \| `NONE` | Tipo de auth para ORDS |
| `ords_usuario` | string? | Usuario para auth BASIC |
| `ords_password` | string? | Contraseña para auth BASIC (se cifra al guardar) |
| `ords_token` | string? | Token para auth BEARER (se cifra al guardar) |

**Configuración eKuatia por tenant (campo `extra_config`):**

Si se quiere usar una API key de SolveCaptcha diferente por tenant, agregarla en `extra_config`:

```json
{
  "config": {
    "extra_config": {
      "solvecaptcha_api_key": "api_key_especifica_de_este_tenant"
    }
  }
}
```

Si no se define, se usa la variable de entorno `SOLVECAPTCHA_API_KEY` como fallback global.

---

## API Reference

La documentación interactiva Swagger UI está en: `http://localhost:4000/docs`

### Tenants

#### `POST /tenants`
Crea una empresa con su configuración.

**Body:** ver [Configuración de tenants](#configuración-de-tenants)

**Respuesta `201`:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "nombre_fantasia": "Farmacia Central",
  "ruc": "80012345-6",
  "email_contacto": "admin@farmaciacentral.com.py",
  "activo": true,
  "created_at": "2025-01-15T10:00:00Z"
}
```

---

#### `GET /tenants`
Lista todas las empresas registradas.

**Respuesta `200`:**
```json
[
  {
    "id": "550e8400-...",
    "nombre_fantasia": "Farmacia Central",
    "ruc": "80012345-6",
    "activo": true
  }
]
```

---

#### `GET /tenants/:id`
Detalle de una empresa. No incluye campos cifrados.

---

#### `PUT /tenants/:id`
Actualiza datos y/o configuración de la empresa.

---

### Jobs

#### `POST /tenants/:id/jobs/sync-comprobantes`
Encola una sincronización manual de comprobantes para el tenant.

**Body (opcional):**
```json
{
  "mes": 11,
  "anio": 2024
}
```

Si no se especifica `mes`/`anio`, el scheduler usará el mes/año actual.

**Respuesta `201`:**
```json
{
  "job_id": "a1b2c3d4-...",
  "tipo_job": "SYNC_COMPROBANTES",
  "estado": "PENDING",
  "next_run_at": "2025-01-15T10:00:00Z"
}
```

---

#### `POST /tenants/:id/jobs/descargar-xml`
Encola descarga manual de XMLs pendientes para el tenant.

**Body (opcional):**
```json
{
  "batch_size": 20,
  "comprobante_id": "uuid-especifico-opcional"
}
```

---

#### `GET /jobs`
Lista jobs con filtros opcionales.

**Query params:**

| Param | Tipo | Descripción |
|---|---|---|
| `tenant_id` | uuid | Filtrar por empresa |
| `tipo_job` | string | `SYNC_COMPROBANTES`, `ENVIAR_A_ORDS`, `DESCARGAR_XML` |
| `estado` | string | `PENDING`, `RUNNING`, `DONE`, `FAILED` |
| `limit` | number | Máximo resultados (default 20) |

---

#### `GET /jobs/:id`
Detalle de un job incluyendo `error_message` si falló.

---

### Comprobantes

#### `GET /tenants/:id/comprobantes`
Lista paginada de comprobantes para la empresa.

**Query params:**

| Param | Tipo | Descripción |
|---|---|---|
| `fecha_desde` | `YYYY-MM-DD` | Filtro fecha inicio |
| `fecha_hasta` | `YYYY-MM-DD` | Filtro fecha fin |
| `tipo_comprobante` | string | `FACTURA`, `NOTA_CREDITO`, `NOTA_DEBITO`, `AUTOFACTURA`, `OTRO` |
| `ruc_vendedor` | string | RUC del emisor |
| `xml_descargado` | boolean | `true` = solo con XML, `false` = solo sin XML |
| `page` | number | Página (default 1) |
| `limit` | number | Resultados por página (default 20, max 100) |

**Respuesta `200`:**
```json
{
  "data": [
    {
      "id": "...",
      "ruc_vendedor": "80012345-6",
      "razon_social_vendedor": "Empresa XYZ S.A.",
      "cdc": "01800123456001001000000012024110112345678901",
      "numero_comprobante": "001-001-0001234",
      "tipo_comprobante": "FACTURA",
      "fecha_emision": "2024-11-01",
      "total_operacion": "194000",
      "origen": "ELECTRONICO",
      "xml_descargado_at": "2025-01-15T10:05:00Z",
      "detalles_xml": { ... }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 342
  }
}
```

---

#### `GET /tenants/:id/comprobantes/:comprobanteId`
Detalle completo de un comprobante incluyendo `detalles_xml` parseado y `xml_contenido` (XML crudo).

---

### Health check

#### `GET /health`

```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:00:00.000Z",
  "version": "1.0.0"
}
```

---

## Flujo de procesamiento

### SYNC_COMPROBANTES

```
Scheduler (cron) o API manual
  → crea job SYNC_COMPROBANTES en tabla jobs
  → Worker reclama job (FOR UPDATE SKIP LOCKED)
  → SyncService.ejecutarSyncComprobantes()
      → MarangatuService.sincronizarComprobantes()
          → Puppeteer: login en Marangatu
          → navega a Gestión de Comprobantes Virtuales
          → selecciona sección COMPRAS
          → selecciona año y mes
          → marca checkbox "seleccionar todos"
          → extrae filas de la tabla (paginado)
          → upsert en tabla comprobantes (hash_unico como deduplicador)
      → Si enviar_a_ords_automaticamente = true:
          → markEnviosOrdsPendingAfterSync()
          → encola job ENVIAR_A_ORDS
      → Si hay comprobantes con CDC:
          → enqueueXmlDownloads() en comprobante_xml_jobs
          → encola job DESCARGAR_XML
```

### DESCARGAR_XML

```
Worker reclama job DESCARGAR_XML
  → SyncService.ejecutarDescargarXml()
      → obtenerPendientesXml() — lee comprobante_xml_jobs PENDING
      → Por cada comprobante pendiente con CDC:
          → EkuatiaService.descargarXml(cdc)
              → CaptchaService.resolverCaptcha()
                  → POST https://api.solvecaptcha.com/in.php
                  → polling GET /res.php hasta obtener token
              → GET https://ekuatia.set.gov.py/docs/documento-electronico-xml/{cdc}
              → parsearXml() — extrae todos los campos SIFEN
          → guardarXmlDescargado() — guarda xml_contenido + detalles_xml en DB
          → Si falla: marcarXmlJobFallido() con retry automático (max 3 intentos)
      → Si quedan pendientes: re-encola job DESCARGAR_XML automáticamente
```

### ENVIAR_A_ORDS

```
Worker reclama job ENVIAR_A_ORDS
  → SyncService.ejecutarEnvioOrds()
      → OrdsService.procesarEnviosPendientes()
          → findPendingOrdsEnvios() — lee comprobante_envio_ords PENDING
          → Por cada envío pendiente:
              → buildOrdsPayload() — arma JSON con datos básicos + detalles_xml completo
              → POST al endpoint ORDS configurado (BASIC o BEARER auth)
              → Si éxito: updateEnvioOrdsSuccess()
              → Si falla: updateEnvioOrdsFailed() con retry exponencial
```

### Scheduler automático

El scheduler (`scheduler.ts`) ejecuta un cron **cada 5 minutos**. Para cada tenant activo, verifica si corresponde encolar un nuevo sync según `frecuencia_sincronizacion_minutos`. Si el tenant tiene frecuencia 60, sólo encola si el último job fue hace más de 60 minutos.

---

## Schema de base de datos

### Diagrama simplificado

```
tenants (1) ──── (1) tenant_config
   │
   └──── (N) jobs
   │
   └──── (N) comprobantes
               │
               ├──── (1) comprobante_envio_ords
               └──── (1) comprobante_xml_jobs
```

### Tablas principales

**`tenants`** — Empresas registradas
```sql
id, nombre_fantasia, ruc (UNIQUE), email_contacto, timezone, activo, created_at, updated_at
```

**`tenant_config`** — Configuración sensible (uno por tenant)
```sql
id, tenant_id, ruc_login, usuario_marangatu, clave_marangatu_encrypted,
marangatu_base_url, ords_base_url, ords_endpoint_facturas,
ords_tipo_autenticacion (BASIC|BEARER|NONE), ords_usuario,
ords_password_encrypted, ords_token_encrypted,
enviar_a_ords_automaticamente, frecuencia_sincronizacion_minutos,
extra_config (JSONB), created_at, updated_at
```

**`jobs`** — Cola de trabajos en PostgreSQL
```sql
id, tenant_id, tipo_job (SYNC_COMPROBANTES|ENVIAR_A_ORDS|DESCARGAR_XML),
payload (JSONB), estado (PENDING|RUNNING|DONE|FAILED),
intentos, max_intentos (default 3), error_message,
created_at, updated_at, last_run_at, next_run_at
```

**`comprobantes`** — Comprobantes fiscales
```sql
id, tenant_id, origen (ELECTRONICO|VIRTUAL),
ruc_vendedor, razon_social_vendedor, cdc, numero_comprobante,
tipo_comprobante (FACTURA|NOTA_CREDITO|NOTA_DEBITO|AUTOFACTURA|OTRO),
fecha_emision, total_operacion, raw_payload (JSONB),
hash_unico (SHA-256, UNIQUE),
xml_contenido (TEXT), xml_url, xml_descargado_at,
detalles_xml (JSONB), created_at, updated_at
```

**`comprobante_envio_ords`** — Tracking de envíos a Oracle ORDS
```sql
id, comprobante_id, tenant_id, estado_envio (PENDING|SENT|FAILED),
intentos, last_sent_at, error_message, respuesta_ords (JSONB),
created_at, updated_at
```

**`comprobante_xml_jobs`** — Tracking de descarga de XMLs
```sql
id, comprobante_id, tenant_id, estado (PENDING|RUNNING|DONE|FAILED),
intentos, last_attempt_at, error_message, created_at, updated_at
```

---

## Payload ORDS

El payload enviado al endpoint Oracle ORDS tiene esta estructura:

```json
{
  "rucVendedor": "80012345-6",
  "razonSocialVendedor": "Empresa XYZ S.A.",
  "cdc": "01800123456001001000000012024110112345678901",
  "numeroComprobante": "001-001-0001234",
  "tipoComprobante": "FACTURA",
  "fechaEmision": "2024-11-01",
  "totalOperacion": 194000,
  "origen": "ELECTRONICO",
  "tenantRuc": "80099999-9",
  "detalles": {
    "cdc": "01800123456001001000000012024110112345678901",
    "tipoDocumento": "1",
    "version": "150",
    "emisor": {
      "ruc": "80012345-6",
      "razonSocial": "Empresa XYZ S.A.",
      "nombreFantasia": "XYZ",
      "timbrado": "12345678",
      "establecimiento": "001",
      "punto": "001",
      "numero": "0001234",
      "direccion": "Av. Mcal. López 123",
      "ciudad": "Asunción",
      "departamento": "Central"
    },
    "receptor": {
      "ruc": "12345678-9",
      "razonSocial": "Cliente Final S.A.",
      "tipoContribuyente": "1"
    },
    "fechaEmision": "2024-11-01T10:30:00",
    "moneda": "PYG",
    "condicionVenta": "1",
    "items": [
      {
        "descripcion": "Amoxicilina 500mg",
        "cantidad": 10,
        "precioUnitario": 15000,
        "descuento": 0,
        "subtotal": 150000,
        "iva": 13636,
        "tasaIva": 10
      }
    ],
    "totales": {
      "subtotal": 150000,
      "descuento": 0,
      "anticipo": 0,
      "total": 150000,
      "ivaTotal": 13636,
      "iva5": 0,
      "iva10": 13636,
      "exentas": 0
    },
    "timbrado": "12345678",
    "numeroComprobante": "001-001-0001234",
    "qrUrl": "https://ekuatia.set.gov.py/...",
    "xmlHash": "abc123..."
  },
  "metadatos": {}
}
```

Para adaptar el payload a un schema ORDS diferente, modificar `buildOrdsPayload()` en `src/services/ords.service.ts`.

---

## Seguridad

- Las contraseñas y tokens se cifran con **AES-256-GCM** antes de insertar en la DB. El IV y el auth tag se incluyen en el campo cifrado. Ver `src/services/crypto.service.ts`.
- Las claves cifradas **nunca se retornan** en las respuestas de la API.
- Todas las queries usan parámetros PostgreSQL (`$1`, `$2`, ...) — sin riesgo de SQL injection.
- En producción, gestionar `ENCRYPTION_KEY` y `SOLVECAPTCHA_API_KEY` con un secrets manager. **Nunca commitear estos valores al repositorio.**
- El campo `hash_unico` es SHA-256 de `tenant_id|ruc_vendedor|numero_comprobante|fecha_emision` — evita duplicados en upsert.

---

## Colección Postman

La colección Postman se encuentra en `postman_collection.json` en la raíz del backend.

Para importarla:
1. Abrir Postman
2. `File → Import`
3. Seleccionar `backend/postman_collection.json`
4. Configurar la variable de entorno `base_url` a `http://localhost:4000`

---

## Troubleshooting

**El worker no procesa jobs**
- Verificar que `DATABASE_URL` apunta a la misma DB que la API
- Correr las migraciones: `npm run migrate`
- Revisar logs: `docker compose logs -f worker`

**Puppeteer falla al iniciar**
- En Linux sin interfaz gráfica, asegurarse que Chromium tiene las dependencias del sistema. El Dockerfile ya las instala.
- Para debug, setear `PUPPETEER_HEADLESS=false` y ejecutar localmente (no en Docker).

**Error de cifrado al crear tenant**
- `ENCRYPTION_KEY` debe tener mínimo 32 caracteres.
- Si se cambia esta variable, los registros existentes no se podrán descifrar.

**SolveCaptcha retorna error**
- Verificar saldo disponible en la cuenta de SolveCaptcha.
- El site key de eKuatia es `6LchFioUAAAAAL1JVkV0YFmLd0nMEd_C5P60eaTi` — ya está hardcodeado en `captcha.service.ts`.
