# DNIT Comprobantes

Sistema de automatización de comprobantes fiscales SET Paraguay.
Descarga comprobantes de Marangatu, descarga XMLs desde eKuatia y los envía a Oracle ORDS.
Arquitectura multitenant con cola de jobs en PostgreSQL y automatización headless con Puppeteer.

---

## Tabla de contenidos

1. [Stack tecnológico](#stack-tecnológico)
2. [Arquitectura del proyecto](#arquitectura-del-proyecto)
3. [Requisitos previos](#requisitos-previos)
4. [Instalación local](#instalación-local)
5. [Instalación con Docker Compose](#instalación-con-docker-compose)
6. [Despliegue con systemd](#despliegue-con-systemd)
7. [Variables de entorno](#variables-de-entorno)
8. [Scripts disponibles](#scripts-disponibles)
9. [Troubleshooting](#troubleshooting)

---

## Stack tecnológico

### Backend

| Componente | Tecnología |
|---|---|
| Runtime | Node.js 20+ / TypeScript |
| Framework HTTP | Fastify |
| Base de datos | PostgreSQL 15+ |
| Query builder | node-postgres (`pg`) — queries parametrizadas |
| Automatización web | Puppeteer (headless Chromium) |
| Parser XML | `@xmldom/xmldom` |
| Resolver CAPTCHA | SolveCaptcha API |
| Scheduler | node-cron |
| HTTP client | Axios |
| Validación | Zod |
| Cifrado | AES-256-GCM (módulo `crypto` nativo) |
| Logging | Pino vía Fastify |

### Frontend

| Componente | Tecnología |
|---|---|
| Framework | React 18 |
| Build tool | Vite 5 |
| Estilos | Tailwind CSS 3 |
| Iconos | Lucide React |
| Lenguaje | TypeScript 5 |

---

## Arquitectura del proyecto

```
set-comprobantes/
├── backend/                  # API + Worker (Fastify, Puppeteer, PostgreSQL)
│   ├── src/
│   │   ├── api/              # Servidor Fastify, rutas, middleware
│   │   ├── config/           # Env y logger
│   │   ├── db/               # Conexión, migraciones SQL, repositorios
│   │   ├── services/         # Lógica de negocio (marangatu, ekuatia, sync, captcha, crypto, ords)
│   │   ├── workers/          # Job worker, scheduler (node-cron)
│   │   ├── types/            # Tipos TypeScript
│   │   ├── main.ts           # Entry point API
│   │   └── worker.ts         # Entry point Worker
│   ├── .env.example
│   ├── Dockerfile
│   └── package.json
├── src/                      # Frontend React
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   ├── pages/
│   └── main.tsx
├── systemd/                  # Units para despliegue con systemd
├── docker-compose.yml
├── vite.config.ts
└── package.json
```

### Flujo de procesamiento

```
┌─────────────────────────────────────────────────────────────────┐
│                         API (Fastify :4000)                     │
│  POST /tenants   GET /tenants/:id/comprobantes   POST jobs     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                    Tabla jobs (PostgreSQL)
                    FOR UPDATE SKIP LOCKED
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                        Worker Loop                              │
│  ┌──────────────────┐  ┌─────────────────┐  ┌───────────────┐  │
│  │ SYNC_COMPROBANTES│  │  ENVIAR_A_ORDS  │  │ DESCARGAR_XML │  │
│  └────────┬─────────┘  └────────┬────────┘  └───────┬───────┘  │
│    Puppeteer →           Axios POST →       SolveCaptcha →      │
│    Marangatu             Oracle ORDS        eKuatia XML DL      │
│    (scraping)            (REST API)         (parse SIFEN)       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (Vite :5173)                        │
│              React + Tailwind — Panel de gestión                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Requisitos previos

### Software requerido

| Requisito | Versión mínima | Notas |
|---|---|---|
| **Node.js** | 20+ | Recomendado instalar con [nvm](https://github.com/nvm-sh/nvm) |
| **npm** | 10+ | Incluido con Node.js 20+ |
| **PostgreSQL** | 15+ | Puede ser local, remoto o vía Docker |
| **Chromium / Chrome** | — | Puppeteer lo descarga automáticamente con `npm install`. En Linux sin GUI instalar dependencias del sistema (ver abajo) |
| **Git** | — | Para clonar el repositorio |

### Cuentas y servicios externos

| Servicio | Para qué se usa | Dónde obtenerlo |
|---|---|---|
| **SolveCaptcha** | Resolver reCAPTCHA de eKuatia para descarga de XMLs | [solvecaptcha.com](https://solvecaptcha.com/) |
| **Marangatu SET** | Credenciales de acceso al portal de la SET por cada tenant | [marangatu.set.gov.py](https://marangatu.set.gov.py) |
| **Oracle ORDS** *(opcional)* | Endpoint destino para envío automático de comprobantes | Configurado por cada tenant |

### Dependencias del sistema para Puppeteer (Linux sin GUI)

Si estás en un servidor Linux sin interfaz gráfica, Puppeteer necesita estas librerías para ejecutar Chromium:

```bash
sudo apt-get update && sudo apt-get install -y \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgdk-pixbuf2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    --no-install-recommends
```

> Si se usa Docker, el Dockerfile ya incluye todas estas dependencias.

---

## Instalación local

### 1. Clonar el repositorio

```bash
git clone <repo-url>
cd set-comprobantes
```

### 2. Instalar dependencias

```bash
# Frontend
npm install

# Backend
cd backend
npm install
cd ..
```

### 3. Configurar variables de entorno del backend

```bash
cp backend/.env.example backend/.env
```

Editar `backend/.env` con los valores reales. **Lo mínimo necesario para arrancar:**

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/set_comprobantes
ENCRYPTION_KEY=una_clave_de_al_menos_32_caracteres_aqui!
SOLVECAPTCHA_API_KEY=tu_api_key_de_solvecaptcha
```

Ver la sección [Variables de entorno](#variables-de-entorno) para todas las opciones.

### 4. Crear la base de datos y ejecutar migraciones

```bash
# Crear la base de datos
psql -U postgres -c "CREATE DATABASE set_comprobantes;"

# Ejecutar migraciones
cd backend
npm run migrate
cd ..
```

Las migraciones se ejecutan en orden desde `backend/src/db/migrations/`.

### 5. Iniciar los servicios

Se necesitan **3 procesos** corriendo en terminales separadas:

```bash
# Terminal 1: Frontend (Vite dev server)
npm run dev
# → http://localhost:5173

# Terminal 2: Backend API (Fastify)
cd backend
npm run dev
# → http://localhost:4000
# → Swagger UI: http://localhost:4000/docs

# Terminal 3: Worker de jobs
cd backend
npm run dev:worker
```

---

## Instalación con Docker Compose

### 1. Configurar variables de entorno

```bash
cp backend/.env.example backend/.env
# Editar backend/.env con los valores reales
```

### 2. Levantar todos los servicios

```bash
docker compose up -d
```

Esto levanta:
- **postgres** — PostgreSQL 15
- **api** — Fastify API en puerto 4000
- **worker** — Worker de jobs (proceso independiente, limitado a 1GB RAM)

> **Nota:** El frontend no está incluido en Docker Compose. Ejecutar `npm run dev` localmente o configurar un build estático con `npm run build`.

### 3. Ejecutar migraciones (primera vez)

```bash
docker compose --profile migrate up migrate
```

O contra el contenedor de la API:

```bash
docker compose exec api npm run migrate
```

### 4. Comandos útiles

```bash
# Ver logs
docker compose logs -f api
docker compose logs -f worker

# Detener
docker compose down

# Detener y borrar datos (elimina la DB)
docker compose down -v
```

---

## Despliegue con systemd

El directorio `systemd/` contiene unit files para ejecutar los 3 servicios como daemons del sistema.

### 1. Copiar los unit files

```bash
sudo cp systemd/set-backend.service /etc/systemd/system/
sudo cp systemd/set-frontend.service /etc/systemd/system/
sudo cp systemd/set-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
```

### 2. Habilitar e iniciar los servicios

```bash
sudo systemctl enable --now set-backend
sudo systemctl enable --now set-worker
sudo systemctl enable --now set-frontend
```

### 3. Verificar estado

```bash
sudo systemctl status set-backend
sudo systemctl status set-worker
sudo systemctl status set-frontend
```

### 4. Ver logs

```bash
journalctl -u set-backend -f
journalctl -u set-worker -f
journalctl -u set-frontend -f
```

> **Nota:** Los unit files asumen Node.js instalado con nvm en `/home/ubuntu/.nvm/versions/node/v24.13.0/bin/`. Ajustar la ruta si tu instalación es diferente.

---

## Variables de entorno

Todas se configuran en `backend/.env`.

### Requeridas

| Variable | Descripción | Ejemplo |
|---|---|---|
| `DATABASE_URL` | Connection string PostgreSQL | `postgresql://user:pass@host:5432/db` |
| `ENCRYPTION_KEY` | Clave AES-256 para cifrar credenciales. Mínimo 32 caracteres. **Nunca cambiar en producción sin re-cifrar.** | `my_super_secret_key_32chars_min!` |
| `SOLVECAPTCHA_API_KEY` | API Key de SolveCaptcha para resolver reCAPTCHA de eKuatia | `abc123...` |

### Opcionales

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | `4000` | Puerto del servidor HTTP |
| `NODE_ENV` | `development` | `development` o `production` |
| `DEBUG` | `false` | Activa logs de debug detallados |
| `DB_POOL_MIN` | `2` | Conexiones mínimas en el pool PostgreSQL |
| `DB_POOL_MAX` | `10` | Conexiones máximas en el pool PostgreSQL |
| `WORKER_POLL_INTERVAL_MS` | `5000` | Cada cuántos ms el worker consulta nuevos jobs |
| `WORKER_MAX_CONCURRENT_JOBS` | `3` | Jobs simultáneos del worker |
| `STUCK_JOB_TIMEOUT_MINUTES` | `60` | Minutos antes de reiniciar un job stuck en RUNNING |
| `CRON_SCHEDULE` | `*/5 * * * *` | Expresión cron del scheduler automático |
| `PUPPETEER_HEADLESS` | `true` | `false` para ver el browser durante debug |
| `PUPPETEER_TIMEOUT_MS` | `30000` | Timeout general de Puppeteer en ms |
| `MARANGATU_BASE_URL` | `https://marangatu.set.gov.py` | URL base del portal Marangatu |
| `EKUATIA_BASE_URL` | `https://ekuatia.set.gov.py` | URL base del portal eKuatia |
| `EKUATIA_RECAPTCHA_SITE_KEY` | `6Ldcb-wrAAAAAGp5...` | Site key de reCAPTCHA v2 de eKuatia |

> **Producción:** usar un secrets manager (HashiCorp Vault, AWS Secrets Manager) para `ENCRYPTION_KEY` y `SOLVECAPTCHA_API_KEY`. Nunca commitear estos valores al repositorio.

---

## Scripts disponibles

### Frontend (raíz del proyecto)

| Script | Descripción |
|---|---|
| `npm run dev` | Vite dev server con hot reload (`:5173`) |
| `npm run build` | Build de producción a `dist/` |
| `npm run preview` | Preview del build de producción |
| `npm run lint` | Lint con ESLint |
| `npm run typecheck` | Verificar tipos TypeScript |

### Backend (`cd backend`)

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

## Troubleshooting

**El worker no procesa jobs**
- Verificar que `DATABASE_URL` apunta a la misma DB que la API
- Correr las migraciones: `cd backend && npm run migrate`
- Revisar logs del worker

**Puppeteer falla al iniciar**
- En Linux sin GUI, instalar las dependencias del sistema (ver [Requisitos previos](#dependencias-del-sistema-para-puppeteer-linux-sin-gui))
- Para debug: `PUPPETEER_HEADLESS=false` y ejecutar localmente (no en Docker)
- Si se usa Chromium del sistema: definir `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`

**Error de cifrado al crear tenant**
- `ENCRYPTION_KEY` debe tener mínimo 32 caracteres
- Si se cambia esta variable, los registros existentes no se podrán descifrar

**SolveCaptcha retorna error**
- Verificar saldo disponible en la cuenta de SolveCaptcha
- El site key de eKuatia puede cambiar — verificar en `backend/.env.example`

**El frontend no se conecta al backend**
- Verificar que la API está corriendo en el puerto 4000
- Revisar configuración de CORS en el backend

**Migraciones fallan**
- Verificar que la base de datos existe: `psql -U postgres -c "\l"`
- Verificar que `DATABASE_URL` es correcto en `.env`
