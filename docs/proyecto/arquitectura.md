# Arquitectura técnica NOVEX

**Vigente:** Cartas y Circo (actualizado 2026-11-12). Detalle: [EMPALME-NOVEX.md](./EMPALME-NOVEX.md).

## Stack

| Capa | Tecnología | Prefijo / rutas |
|---|---|---|
| Backend | NestJS 11, TypeORM, PostgreSQL, Gemini (`@google/genai`), Jest | `/api/v1` (+ `/health`, `/health/ready`) |
| Frontend | React 19, Vite 8, Tailwind 4, ECharts, Rive, Vitest, Playwright | `/centro-operacional`, `/admin`, `/login` |
| Node | BE 20 · FE 22 (imagen/CI) | Local puede diferir |

## Backend — activos vs latentes

**Activos (HTTP montado):** auth, users, roles, permissions, coordinations, situations (+ sweep, timeline, evidence, impact, recommendations, administración ADMIN, AI orchestration/sessions), operational-overview, operational-kpis, dashboard.

**Latentes (no remontar sin PermissionsGuard + alcance):** `operational-areas`, `operational-events`, `recommended-actions`, `intelligence` (controller huérfano), `demo-users` (ni importado).

**Guards globales:** JwtAuthGuard → AuthorizationEnrichmentGuard (relee rol/permisos/coordinación desde BD) → UserAwareThrottlerGuard (límite por usuario autenticado `user:<sub>`; por IP si no hay sesión).

**Persistencia:** `synchronize: false`, `migrationsRun: false`; migraciones en `src/database/migrations/` (última `1789200000000`); aplicar **a mano** (migrate → deploy).

## Frontend — núcleo

- Entrada: `src/main.tsx` → `router.tsx`.
- Núcleo: `src/modules/operational-cards/` (shells por rol, servicios, charts, personaje).
- Auth: JWT en `localStorage`; permisos UX desde `permissions[]` de `GET /auth/me`; autoridad real = backend.
- Rutas legadas (`/dashboard`, `/red-impacto`, `/monitoring`, panorama/inteligencia/reportes…) redirigen al Centro; su código fue retirado.
- Tutorial: tour general suspendido (`ONBOARDING_TOUR_SUSPENDED`); recorrido del COORDINADOR en `src/modules/onboarding/` (desarrollo o `VITE_ENABLE_COORDINATOR_TOUR=true`).

## Contratos críticos FE↔BE

Alta `POST /situations/register-with-analysis` · avance `PATCH` · cierre `POST …/resolution` · afectaciones · `GET /operational-overview` · KPIs Director · admin users.  
`forbidNonWhitelisted`: query/body FE sin DTO → 400.

## Pareja de producción

BE `5ffc65f` ↔ FE `b726c47` (tag `novex-circo-prod-20261027`). No mezclar FE Circo con BE pre-cartas.
