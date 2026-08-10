# NOVEX — P0 Closure

## Estado inicial

- Score inicial: **64/100**
- Veredicto: **NOT READY FOR PRODUCTION**
- P0: **4** (SEC-001, SEC-002, SEC-003, CI-001)

## Hallazgos

| ID | Descripción |
|----|-------------|
| SEC-001 | Controladores legacy sin autenticación en API pública Cloud Run |
| SEC-002 | Endpoints `POST /intelligence/interpret*` invocaban Gemini sin auth |
| SEC-003 | `DemoUsersModule` exponía `POST /users/ensure` y onboarding demo sin auth |
| CI-001 | `deploy-backend.yml` permitía deploy con lint/tests fallidos (`continue-on-error: true`) |

## Consumer Analysis

| Módulo | Consumidor frontend | Consumidor backend interno | Decisión |
|--------|--------------------|-----------------------------|----------|
| operational-events | Ninguno | DashboardService, IntelligenceService, seeds | Controller **REMOVED_FROM_RUNTIME** |
| operational-areas | Ninguno | IntelligenceService, seeds | Controller **REMOVED_FROM_RUNTIME** |
| recommended-actions | Ninguno | IntelligenceService | Controller **REMOVED_FROM_RUNTIME** |
| intelligence | Solo `GET /intelligence/categories` (migrado) | SituationsService (entidad), seeds | Controller **REMOVED_FROM_RUNTIME** |
| demo-users | Ninguno | Ninguno en runtime | **REMOVED_FROM_RUNTIME** (AppModule) |

Onboarding real: `PATCH /users/me/onboarding` en `UsersController` (JWT + usuario real).

## Cambios por archivo

### Backend

| Archivo | Cambio |
|---------|--------|
| `src/situations/situations.controller.ts` | `GET /situations/categories` con `SITUATIONS_VIEW` |
| `src/situations/situations.service.ts` | `listIncidentCategories()` |
| `src/situations/dto/situation.dto.ts` | `IncidentCategorySummaryDto` |
| `src/operational-events/operational-events.module.ts` | `controllers: []` |
| `src/operational-areas/operational-areas.module.ts` | `controllers: []` |
| `src/recommended-actions/recommended-actions.module.ts` | `controllers: []` |
| `src/intelligence/intelligence.module.ts` | Sin `IntelligenceController` |
| `src/app.module.ts` | Sin `DemoUsersModule` |
| `.github/workflows/deploy-backend.yml` | Sin `continue-on-error` en lint/tests |
| `test/security/p0-authorization.spec.ts` | Regresión P0 |
| `package.json` | Jest incluye `test/` |

### Frontend

| Archivo | Cambio |
|---------|--------|
| `src/modules/api/situations.api.ts` | `/situations/categories` |
| `e2e/onboarding-first-situation.spec.ts` | Mock actualizado |
| `e2e/analysis-loading.spec.ts` | Mock actualizado |

## Endpoints retirados del runtime

- `GET/POST/PATCH /operational-events/*`
- `GET/POST/PATCH /operational-areas/*`
- `GET/PATCH /recommended-actions/*`
- `GET /intelligence/categories`
- `GET /intelligence/interpretations/by-event/:eventId`
- `POST /intelligence/interpretations`
- `POST /intelligence/interpret`
- `POST /intelligence/interpret/:eventId`
- `POST /users/ensure`
- `PATCH /users/:id/onboarding/complete`

## Endpoint migrado

```text
GET /intelligence/categories  →  GET /situations/categories
```

- Auth: **JWT requerido**
- Permission: **`SITUATIONS_VIEW`**
- Scope: N/A (catálogo global de solo lectura)

## Security Verification

| Caso | Resultado esperado | Evidencia |
|------|-------------------|-----------|
| Anónimo → legacy routes | 404 | `test/security/p0-authorization.spec.ts` |
| Anónimo → `/situations/categories` | 401 | idem |
| Autenticado sin permiso → categorías | 403 | idem |
| Autenticado con `SITUATIONS_VIEW` | 200 | idem |
| Anónimo → Gemini vía HTTP | Imposible | Sin controller `intelligence/interpret*` |

### Vías Gemini activas (protegidas)

| Endpoint | Auth | Permission | Gemini |
|----------|------|------------|--------|
| `POST /situations/register-with-analysis` | JWT | `SITUATIONS_CREATE` + `AI_ANALYZE` | Sí |
| `POST /situations/:id/analyze` | JWT | `AI_ANALYZE` + scope situación | Sí |

## Regression

| Área | Estado |
|------|--------|
| Backend lint | PASS |
| Backend tests | PASS (67) |
| Backend build | PASS |
| Frontend lint | PASS (warnings preexistentes) |
| Frontend tests | PASS (122) |
| Frontend build | PASS |
| Onboarding | Sin cambio en `/users/me/onboarding` |
| RBAC | Sin cambios en matriz de permisos |
| Operational Scope | Sin cambios |

## CI/CD

- Lint fallido → **bloquea deploy** (sin `continue-on-error`)
- Tests fallidos → **bloquea deploy**
- Build fallido → **bloquea deploy** (sin cambio)

## Estado final P0

| ID | Estado |
|----|--------|
| SEC-001 | **RESOLVED** |
| SEC-002 | **RESOLVED** |
| SEC-003 | **RESOLVED** |
| CI-001 | **RESOLVED** |

P0 después: **0**
