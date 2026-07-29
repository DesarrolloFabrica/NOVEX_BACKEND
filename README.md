# Novex Backend

Backend oficial de **Visión general**.

Stack: **NestJS + PostgreSQL + TypeORM + Gemini**.

> Sprint 7 — capa de Inteligencia Artificial (Gemini) aislada detrás de `IntelligenceFacade`.
> El frontend **aún no está conectado** y sigue usando mocks.

## Estructura

```
src/
├── configuration/          # Env, validación, TypeORM async config
├── common/                 # Enums, BaseEntity, utilidades transversales
├── operational-areas/      # Catálogo de áreas
├── operational-events/     # Eventos + timeline (sin Gemini)
├── intelligence/
│   ├── gemini/             # Cliente Gemini (prompt, schema, parser)
│   ├── intelligence.facade.ts
│   └── …                   # Persistencia AIInterpretation + catálogos
├── dashboard/              # Contrato DashboardMetrics
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
# Si tu PostgreSQL local aún usa rol/base legacy (`omega`/`cunmark`), conserva esos valores en `.env`
# o migra al stack Docker `novex-*` (ver docker-compose.yml).
# El script opcional `scripts/migrate-intelligence-contract-version.sql`
# alinea `contractVersion` históricos (omega/cunmark) a `novex.intelligence.v2`.
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
npm run start:prod
```

Con `DB_SYNCHRONIZE=true` (solo desarrollo) TypeORM crea/actualiza el esquema.

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/POST/PATCH | `/api/v1/operational-areas` | áreas |
| GET/POST/PATCH | `/api/v1/operational-events` | eventos |
| GET | `/api/v1/intelligence/categories` | taxonomía |
| POST | `/api/v1/intelligence/interpretations` | persistir interpretación ya armada (mock) |
| POST | `/api/v1/intelligence/interpret` | IA real → `GeminiInterpretationResult` (no persiste) |
| POST | `/api/v1/intelligence/interpret/:eventId` | IA real + persiste `AIInterpretation` |
| GET | `/api/v1/intelligence/interpretations/by-event/:eventId` | listar por evento |
| GET | `/api/v1/dashboard/metrics` | tablero (contrato) |

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

## Próximo Sprint

1. Semillas de áreas/categorías
2. Portar motor de inteligencia al backend
3. Conectar servicios del frontend a esta API
4. Sustituir mocks del frontend por interpretaciones reales
