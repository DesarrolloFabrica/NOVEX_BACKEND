# Novex Backend

Backend oficial de **NOVEX**.

Stack: **NestJS + PostgreSQL + TypeORM + Gemini**.

El frontend consume autenticación, usuarios, coordinaciones, situaciones,
evidencias, impacto, recomendaciones y análisis desde esta API.

## Estructura

```
src/
├── configuration/          # Env, validación, TypeORM async config
├── common/                 # Enums, BaseEntity, utilidades transversales
├── auth/, users/, rbac/    # Identidad, autorización y administración
├── coordinations/          # Catálogo y grafo institucional
├── situations/             # Registro y ciclo de situaciones
├── situation-*/            # Evidencia, impacto, timeline y recomendaciones
├── ai-orchestration/       # Orquestación de análisis de situaciones
├── ai-analysis*/           # Contratos, persistencia e historial de análisis
├── intelligence/           # Dominio operacional y cliente Gemini legado
├── operational-*/          # Dominio operacional conservado
├── database/               # Configuración, migraciones y seeds
├── app.module.ts
└── main.ts
```

## Requisitos

- Node.js 20+
- PostgreSQL 14+
- API key de Google Gemini (`GEMINI_API_KEY`)

## Configuración

```bash
cp .env.example .env
# Ajustar DB_* y GEMINI_API_KEY
# Stack local: rol/base `novex` (ver docker-compose.yml).
# El script opcional `scripts/migrate-intelligence-contract-version.sql`
# alinea `contractVersion` históricos a `novex.intelligence.v2`.
```

| Variable | Descripción |
|----------|-------------|
| `GEMINI_API_KEY` | Clave de Google AI Studio / Vertex |
| `GEMINI_MODEL` | Modelo (default `gemini-3-flash-preview`) |

## Comandos

```bash
npm install
npm run start:dev    # http://localhost:3001/api/v1
npm run build
npm run lint
npm run test
npm run test:e2e
npm run migration:show
npm run start:prod
```

El esquema se administra mediante migraciones TypeORM.
`DB_SYNCHRONIZE` debe permanecer en `false`.

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/POST/PATCH | `/api/v1/situations` | registro y gestión |
| GET/POST | `/api/v1/situations/:id/evidences` | evidencias |
| POST | `/api/v1/situations/:id/analyze` | solicitar análisis IA |
| GET | `/api/v1/situations/:id/analysis` | consultar análisis IA |
| GET | `/api/v1/situations/:id/impact` | impacto |
| GET | `/api/v1/situations/:id/recommendations` | recomendaciones |
| GET | `/api/v1/coordinations` | catálogo de coordinaciones |
| GET | `/api/v1/coordinations/graph` | grafo institucional |
| GET | `/api/v1/situations/categories` | taxonomía de incidentes (auth + `SITUATIONS_VIEW`) |
| GET/POST/PATCH | `/api/v1/operational-events` | dominio operacional conservado |

## Principio de aislamiento

`OperationalEvents` **nunca** conoce Gemini.

```
Cliente / IntelligenceService
  → IntelligenceFacade
    → GeminiService (prompt + Response Schema)
      → GeminiResponseParser
        → GeminiInterpretationResult
```

## Dominio

- `OperationalEvent`
- `OperationalArea`
- `AIInterpretation` (mock o Gemini real)
- `OperationalTimelineEntry`
- `OperationalIndicator`
- `IncidentCategory`

## Documentación operativa

- [Despliegue en Cloud Run](DEPLOY_BACKEND.md)
- Variables locales: `.env.example`
- Estado de migraciones: `npm run migration:show`
