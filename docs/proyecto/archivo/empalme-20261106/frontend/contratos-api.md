# Contratos API consumidos por el frontend

> **Propósito:** inventario de los endpoints que la SPA llama de verdad en producción, con el archivo del frontend, el tipo que usa, el controlador del backend y el permiso que este exige; y, por separado, los endpoints latentes, heredados o sin uso.
> **Revisión:** 2026-11-06 · **Código de referencia:** NOVEX_FRONTEND `b726c47` (producción) / `7a49148` + cambios locales (tutorial)
> **Leyenda:** [V] verificado en código · [H] histórico/documental · [?] no verificado · [I] inferido

---

## 0. Cómo se obtuvo y cómo leerlo

- **Frontend:** se recorrió el grafo de imports desde `src/main.tsx` y las pantallas que monta [router.tsx](../../src/app/router.tsx) (`/login`, `/admin`, `/centro-operacional` index → `OperationalCenterHome`), excluyendo las páginas legacy que el router solo redirige. Para cada función de servicio se leyó la petición y su tipo [V]. Los cambios del tutorial no añaden ni modifican llamadas a la API [V: `git diff b726c47 7a49148 --stat` no toca `services/` ni `api/`].
- **Backend:** se leyó el controlador en NOVEX_BACKEND (working tree local, rama `local/circo-5ffc65f`, HEAD `5ffc65f`) para confirmar ruta, método y permiso. Que ese HEAD sea exactamente lo desplegado en Cloud Run **no se verificó** [?].
- **Prefijo y URL base** [V]: el backend monta todo bajo `api/v1` (`setGlobalPrefix`, NOVEX_BACKEND `src/main.ts:91-98`, excepto `GET /health` y `GET /health/ready`). El frontend antepone `getApiBaseUrl()` ([http.ts](../../src/shared/api/http.ts) líneas 40–55): `VITE_API_BASE_URL`, si no `VITE_API_URL`; en DEV sin variable usa `/api/v1` relativo (el proxy de Vite reenvía `/api` a `127.0.0.1:3001`, [vite.config.ts](../../vite.config.ts)); en build sin variable lanza `ApiError` con estado 0. La CI exige que la variable sea `https://…/api/v1` y contenga `novex-backend` ([deploy-frontend.yml](../../.github/workflows/deploy-frontend.yml), paso *Resolve deploy metadata*).
- **Permisos:** `@RequirePermissions(a, b)` exige **todos** los códigos (NOVEX_BACKEND `src/auth/guards/permissions.guard.ts`, filtro de faltantes) [V]. Sin decorador, el endpoint solo requiere JWT válido (guard global [I]) salvo que el controlador compruebe en línea.
- Rutas de la tabla **sin** el prefijo `/api/v1`.

Reparto de permisos por rol según el catálogo de semillas (NOVEX_BACKEND `src/permissions/seeds/permissions.catalog.seed.ts`, `ROLE_PERMISSION_CODES`) [V en semilla; en base de datos real, ?]:

| Rol | Permisos relevantes |
|---|---|
| DIRECTOR | `COORDINATIONS_VIEW`, `SITUATIONS_VIEW`, `AI_VIEW_REPORTS`, `REPORTS_VIEW`, `REPORTS_EXPORT`, `KPIS_VIEW` |
| ANALISTA | `COORDINATIONS_VIEW`, `SITUATIONS_VIEW/CREATE/UPDATE/CLOSE`, `AI_ANALYZE`, `AI_VIEW_REPORTS`, `REPORTS_VIEW` |
| COORDINADOR | `COORDINATIONS_VIEW`, `SITUATIONS_VIEW/CREATE/UPDATE/CLOSE`, `AI_ANALYZE`, `AI_VIEW_REPORTS`. **Sin `KPIS_VIEW` ni `REPORTS_VIEW`** |
| ADMIN | Todo el catálogo **menos** `SITUATIONS_CREATE/UPDATE/CLOSE`, `AI_ANALYZE` y `KPIS_VIEW` |

---

## 1. Endpoints usados por código montado en producción

Abreviaturas FE: `api/` = `src/modules/api/`, `oc/` = `src/modules/operational-cards/`. BE: rutas relativas a `NOVEX_BACKEND/src/`.

### 1.1 Sesión

| Método + ruta | Servicio FE | Tipo FE | Controlador BE | Permiso BE | Compatibilidad |
|---|---|---|---|---|---|
| `POST /auth/google` | `src/modules/auth/services/google-auth.service.ts:5` → `auth-session.service.ts:131` | body `{ credential }`; respuesta `AuthLoginResponse` (interno de `auth-session.service.ts:25`) | `auth/auth.controller.ts:24` | `@Public()` + `@Throttle` (límite de auth) | El JWT recibido se guarda en `localStorage` (`novex.auth.accessToken.v1`, `src/modules/auth/utils/accessTokenStorage.ts`). Un 401 aquí **no** dispara el cierre de sesión global (`shouldHandleUnauthorized`, `http.ts:57-60`) [V] |
| `POST /auth/email` | `google-auth.service.ts:10` | body `{ email }` | `auth/auth.controller.ts:36` | `@Public()` + `@Throttle`; el servicio responde 403 si `enableEmailLogin` es falso (`auth/auth.service.ts` ~84) | Solo se ofrece si `VITE_ENABLE_EMAIL_LOGIN === 'true'` (`src/pages/LoginPage.tsx:21`). Pensado solo para local [V] |
| `GET /auth/me` | `auth-session.service.ts:127` (arranque de sesión) | `AuthMeResponse` (interno, línea 31) | `auth/auth.controller.ts:41` | Solo JWT | Si responde 401, el manejador global limpia la sesión (§3) |

### 1.2 Centro Operacional (todos los roles; escrituras solo ANALISTA/COORDINADOR)

| Método + ruta | Servicio FE | Tipo FE | Controlador BE | Permiso BE | Compatibilidad |
|---|---|---|---|---|---|
| `GET /operational-overview` | `oc/services/operational-overview.service.ts:23,204` (hook `useOperationalOverview`) | `OperationalOverview` (`oc/types/operational-overview.contract.ts`), validado por `parseOperationalOverview` | `operational-overview/operational-overview.controller.ts:20` | `SITUATIONS_VIEW` **y** `COORDINATIONS_VIEW` | Los cuatro roles los tienen en semilla [V]. El parser tolera campos ausentes (p. ej. `parseLifePoints` → `null`) [V] |
| `GET /situations/categories` | `api/situations.api.ts:52`, llamado en `oc/hooks/useOperationalShellModel.tsx:73` | `IncidentCategorySummary[]` (`src/modules/situations/types/situation.types.ts`) | `situations/situations.controller.ts:33` | `SITUATIONS_VIEW` | — |
| `GET /situations?…` | `api/situations.api.ts:56` vía `oc/services/coordination-problems.service.ts` (activos, `limit=100`, cerrados `limit=25`), `my-reports.service.ts` (`mine=true`, 20 por página), `problem-history.service.ts` (`status=CLOSED`, `closedFrom/closedTo`) | `SituationsListQuery` / `SituationsListResponse` (`situations.api.ts:13-50`), incluye `scope?: 'complete'|'own-only'` | `situations/situations.controller.ts:39` (`ListSituationsQueryDto`, `situations/dto/situation.dto.ts:253`) | `SITUATIONS_VIEW` | Parámetros FE = campos del DTO (`mine`, `status`, `severity`, `coordinationId`, `categoryId`, `occurredFrom/To`, `closedFrom/To`, `page`, `limit`) [V]. `limit` máx. 100 (`PAGINATION_MAX_LIMIT`, `common/dto/pagination-query.dto.ts:5`); el FE no pide más de 100 [V]. `mine` acepta `'true'` [V]. `scope: 'own-only'` existe en BE (`situation.dto.ts:437`) [V] |
| `GET /situations/:id` | `api/situations.api.ts:107` vía `oc/services/problem-detail.service.ts:89` | `SituationResponse` (`situation.types.ts`) → `ProblemDetail` | `situations/situations.controller.ts:48` | `SITUATIONS_VIEW` | El FE prefiere `canAdvanceToInProgress` y `canResolve` del servidor para mostrar acciones (`src/modules/auth/utils/permissions.ts:71`) [V] |
| `GET /situations/:id/evidences` | `api/evidences.api.ts:35` vía `problem-detail.service.ts:124` | `SituationEvidencesListResponse` (`evidences.api.ts:19`) | `situation-evidence/situation-evidence.controller.ts:43` | `SITUATIONS_VIEW` | Forma de la respuesta campo a campo no contrastada [?] |
| `GET /situations/:id/timeline` | `api/timeline.api.ts:21` vía `problem-detail.service.ts:129` | `SituationTimelineResponse` (`timeline.api.ts:15`) | `situation-timeline/situation-timeline.controller.ts:23` | `SITUATIONS_VIEW` | Campo a campo [?] |
| `POST /situations/register-with-analysis` | `api/situations.api.ts:92` vía `oc/services/report-submission.service.ts:115` | `CreateSituationPayload` (`situation.types.ts`) / `CreateSituationWithAnalysisResponse` `{situation, analysis \| null, replayed}` | `ai-orchestration/ai-orchestration.controller.ts:34` (`CreateSituationDto`, `situations/dto/situation.dto.ts:63`) | `SITUATIONS_CREATE` + `@Throttle` de Gemini | Cabecera `Idempotency-Key`: el BE exige UUID v4 si viene (400 si no) [V]; el FE la genera con `createUuidV4` (`oc/services/report-persistence.ts:3`) y la persiste en `localStorage` (`novex.cards.reportRequestIds.v1:<scope>`). Campos enviados (`title`, `description`, `reportKind`, `coordinationId`, `affectedCoordinationId`, `categoryId`, `severity`, `occurredAt`, `affectedProcess`, `pendingDelivery`, `initialConsequence`) existen en el DTO [V]; `relatedCoordinationIds` existe en BE y el FE no lo envía. Timeout FE 120 s (`situations.api.ts:90`) |
| `PATCH /situations/:id` | `api/situations.api.ts:179` vía `oc/services/problem-status-advance.service.ts:26` | `UpdateSituationPayload` (`situations.api.ts:117`); el FE solo envía `{ status: 'IN_PROGRESS' }` | `situations/situations.controller.ts:57` (`UpdateSituationDto`) | `SITUATIONS_UPDATE` (+ reglas de alcance en servicio) | El cierre **no** va por PATCH (comentario `situations.api.ts:140-150`) [V] |
| `POST /situations/:id/resolution` | `api/situations.api.ts:151` vía `oc/services/problem-resolution.service.ts:20` | body `{ learning }` / `SituationResponse` | `situations/situations.controller.ts:78` (`ResolveSituationDto`) | `SITUATIONS_CLOSE` (+ área responsable en servicio) | — |
| `POST /situations/:id/consequences` | `api/situations.api.ts:166` vía `oc/services/problem-consequence.service.ts:55` | `CreateSituationConsequencePayload` / `SituationConsequenceResponse` | `situations/situations.controller.ts:94` (`CreateSituationConsequenceDto`: `description`, `occurredAt?`) | `SITUATIONS_UPDATE` | El servidor responde 409 si el problema ya está cerrado (comentario FE `situations.api.ts:161-165`) [H en FE; no se leyó el servicio BE] |

### 1.3 Lectura del DIRECTOR (KPIs)

Solo los monta `DirectorOperationalShell` (`oc/experience/OperationalCenterHome.tsx:25-26`) [V]. Todos con `KPIS_VIEW`, que en semilla solo tiene DIRECTOR.

| Método + ruta | Servicio FE (hook) | Tipo FE | Controlador BE | Permiso BE |
|---|---|---|---|---|
| `GET /operational-kpis?scope=direction` y `?scope=coordination&coordinationId=` | `oc/services/operational-kpi.service.ts:272,309` (`useDirectorKpi`) | `OperationalKpiDirectionResponse` / `…CoordinationResponse` (`oc/types/operational-kpi.types.ts`) | `operational-kpis/operational-kpi.controller.ts:74` | `KPIS_VIEW` |
| `GET /operational-kpis/state` | `operational-kpi.service.ts:1262` (`useDirectorEstadoState`) | `…StateResponse` | `operational-kpi.controller.ts:20` | `KPIS_VIEW` |
| `GET /operational-kpis/relations` | `operational-kpi.service.ts:631` (`useDirectorRelations`) | `…RelationsResponse` | `operational-kpi.controller.ts:47` | `KPIS_VIEW` |
| `GET /operational-kpis/history` | `operational-kpi.service.ts:459` (`useDirectorPeriodHistory`) | `…PeriodHistoryResponse` | `operational-kpi.controller.ts:56` (`OperationalKpiHistoryQueryDto`) | `KPIS_VIEW` |
| `GET /operational-kpis/internal-problems` · `/internal-recurrence` | `oc/services/internal-problems.service.ts:269,281` (`useDirectorInternalProblems`) | `oc/types/internal-problems.types.ts` | `operational-kpis/operational-kpi-internal-problems.controller.ts:17,27` | `KPIS_VIEW` |
| `GET /operational-kpis/learnings` · `/learnings/items` | `oc/services/learnings.service.ts:188,198` (`useDirectorLearnings`) | `oc/types/learnings.types.ts` | `operational-kpis/operational-kpi-learnings.controller.ts:28,38` | `KPIS_VIEW` |

Parámetros: los nombres que el FE envía (`scope`, `coordinationId`, `from`, `to`, `kind`, `calendarEnd`, `metric`, `granularity`, `categoryId`, `partnerCoordinationId`, `dependencySide`, `page`, `limit`) existen en los DTO de `operational-kpis/dto/*query*.ts` [V por nombre]. Valores de enumeraciones y tipos campo a campo no contrastados [?]. Ojo: el backend usa `forbidNonWhitelisted: true` (`src/main.ts`), así que un parámetro nuevo en el FE que el DTO no declare provoca 400 [V].

### 1.4 Administración (`/admin`, solo ADMIN)

| Método + ruta | Servicio FE | Tipo FE | Controlador BE | Permiso BE | Compatibilidad |
|---|---|---|---|---|---|
| `GET /users?includeInactive=true` | `api/admin.api.ts:48` (`fetchAdminOverview`, `src/pages/AdminConsolePage.tsx`) | `AdminUser[]` (`admin.api.ts:3`) | `users/users.controller.ts:38` | En línea: `USERS_VIEW` | `includeInactive` en `ListUsersQueryDto` [V] |
| `GET /roles?includeInactive=true` | `admin.api.ts:49` | `AdminRole[]` | `roles/roles.controller.ts:22` | En línea (`assertAdmin`): `SYSTEM_CONFIGURATION` | [V] |
| `GET /permissions` | `admin.api.ts:50` | `AdminPermission[]` | `permissions/permissions.controller.ts:10` | En línea: `SYSTEM_CONFIGURATION` | [V] |
| `GET /coordinations?includeInactive=true&catalog=true` | `admin.api.ts:51` | `AdminCoordination[]` | `coordinations/coordinations.controller.ts:21` | `COORDINATIONS_VIEW` | Ambos parámetros en el DTO (`coordinations/dto/coordination.dto.ts:8,17`) [V]. `@Type(() => Boolean)` trataría `'false'` como verdadero; el FE solo envía `'true'` [I] |
| `PATCH /users/:id` | `admin.api.ts:58` (`updateAdminUserStatus`) | body `{ status }` / `AdminUser` | `users/users.controller.ts:68` (`UpdateUserDto.status`, `@IsEnum(UserStatus)`) | En línea: `USERS_UPDATE` | Valores de `AdminUser['status']` frente a `UserStatus` no contrastados [?] |

---

## 2. Endpoints latentes, heredados o sin uso

### 2.1 Latentes (código montado, hoy no se ejecuta)

| Método + ruta | FE | BE | Por qué no se llama |
|---|---|---|---|
| `PATCH /users/me/onboarding` | `src/modules/auth/services/auth.service.ts:43,51` (vía `AuthContext`) | `users/users.controller.ts:30` (`UpdateOnboardingDto`), solo JWT | Solo lo invoca `OnboardingContext`, suspendido (`ONBOARDING_TOUR_SUSPENDED = true`). El piloto del tutorial **no** lo usa. Ver [tutorial-guiado.md](tutorial-guiado.md) §6 [V] |
| `GET`/`POST /operational-events` | `src/modules/operational-events/services/operational-events.service.ts:79,91` | Existe `operational-events/operational-events.controller.ts`, pero `OperationalEventsModule` declara `controllers: []` → **no montado (404)** [V] | `OperationalEventsProvider` se monta globalmente (`src/app/providers.tsx:15`) pero **nadie** llama a `loadOperationalEvents`, `resetOperationalEvents` ni `registerOperationalEvent` [V: grep] |

### 2.2 Heredados (solo pantallas retiradas)

Lo carga `loadOperationalCenterData` (`src/modules/executive-operations-center/services/operational-center.service.ts:425`) desde `ExecutiveOperationsProvider`, que el layout monta con `enabled={!isHome}` (`components/layout/ExecutiveOperationsLayout.tsx:37`); los hijos no-home (`panorama`, `inteligencia`, `reportes`) solo redirigen [V].

| Endpoint | Permiso BE |
|---|---|
| `GET /situations?page=…&limit=100` (todas las páginas) | `SITUATIONS_VIEW` |
| `GET /coordinations` | `COORDINATIONS_VIEW` |
| `GET /situations/:id/analysis` (`tryFetchSituationAnalysis`) | `AI_VIEW_REPORTS` (`ai-orchestration.controller.ts:90`) |
| `GET /situations/:id/analysis/history` | `AI_VIEW_REPORTS` (`ai-analysis-sessions/ai-analysis-sessions.controller.ts:41`) |
| `GET /situations/:id/recommendations` | `SITUATIONS_VIEW` (`situation-recommendations.controller.ts:30`) |
| `GET /situations/:id/affected-coordinations` | `SITUATIONS_VIEW` (`situation-impact.controller.ts:40`) |
| `GET /situations/:id/evidences`, `/timeline` | `SITUATIONS_VIEW` |

> Riesgo [I, no reproducido]: al visitar `/centro-operacional/panorama` (u otra sección retirada), el layout renderiza una vez con `isHome = false` antes de que `<Navigate>` redirija; el efecto `if (enabled) reload()` (`ExecutiveOperationsProvider.tsx:45-48`) podría lanzar esa carga masiva una vez.

Otros heredados (módulos no montados) [V por llamador]: `GET /situations/:id/analysis/compare` (`monitoring/components/AiVersionCard.tsx`), `GET /coordinations/graph` y `/network-status` (`impact-network/services/impact-network-bootstrap.service.ts`), `GET /situations/:id/impact-context` (`ImpactNetworkExperience.tsx`), `POST /situations/:id/simulate-impact` (`impact-network.provider.ts`), `GET /situations/:id/impact` (`src/modules/services/situationManagementData.service.ts`), `POST /situations/:id/analyze` y `GET …/analysis` (`src/modules/services/situationAnalysis.service.ts`).

### 2.3 Funciones sin ningún llamador en `src` (fuera de tests) [V]

| Función FE | Endpoint | BE |
|---|---|---|
| `createSituationEvidence` (`api/evidences.api.ts:25`) | `POST /situations/:id/evidences` | `situation-evidence.controller.ts:29`, `SITUATIONS_CREATE` |
| `fetchOperationalKpiBreakdown` (`operational-kpi.service.ts:548`) | `GET /operational-kpis/breakdown` | `operational-kpi.controller.ts:38`, `KPIS_VIEW` |
| `fetchOperationalKpiPeriod` (`operational-kpi.service.ts:714`) | `GET /operational-kpis/period` | `operational-kpi.controller.ts:29`, `KPIS_VIEW` |
| `fetchOperationalKpiHistory` (`operational-kpi.service.ts:382`) | `GET /operational-kpis/history` | Solo lo usa `oc/hooks/useDirectorCoordinationHistory.ts`, hook no montado |

Endpoints BE sin cliente FE: `GET /operational-kpis/compare`, `GET /situations/:id/analysis/history/:version`, `GET`/`DELETE /situations/:id/evidences/:evidenceId`, `POST /situations/:id/recommendations`, `GET`/`PATCH /recommendations/:id`, `GET /coordinations/:id`, `GET /dashboard/metrics`, `/intelligence/*`, `/operational-areas/*`, `/recommended-actions/*`, `/users/ensure` y `PATCH /users/:id/onboarding/complete` (`demo-users`), `POST /users`, `GET /users/:id`, `GET /users/:id/permissions`, `GET /roles/:id/permissions`, `POST /internal/jobs/situation-sweep` [V].

---

## 3. Manejo de errores

Todo pasa por `apiRequest` ([http.ts](../../src/shared/api/http.ts)) [V]:

| Caso | Comportamiento |
|---|---|
| Cabeceras | `Accept` y `Content-Type: application/json`; `Authorization: Bearer <token>` si hay token; las de `init.headers` se fusionan al final (así entra `Idempotency-Key`) |
| `ApiError` | `status` (0 si no hubo respuesta), `message`, `code?`, `requestId?`, `cause?` (líneas 16–28) |
| Cuerpo de error | Se lee `{ message (string o string[]), code, requestId }`. `message` en array se une con `, `. Si `status ≥ 500` y hay `requestId`, se añade «(Ref: …)». El filtro global del backend propaga `code` y añade `requestId` (NOVEX_BACKEND `src/common/filters/global-exception.filter.ts:42-51`) [V] |
| Sin red | `ApiError` con `code: 'NETWORK_ERROR'`, `status: 0`; mensaje distinto en DEV |
| Timeout | Solo el alta fija tope (`AbortSignal.timeout(120_000)`, `situations.api.ts:102`). `TimeoutError` → `code: 'TIMEOUT'`. Las demás peticiones no tienen timeout propio [V] |
| 401 | Si la ruta no empieza por `/auth/google` ni `/auth/email`, llama al manejador registrado por `AuthContext` (`src/modules/auth/context/AuthContext.tsx:137-145`), que borra token y sesión y despacha `AUTH_LOGOUT`. No se comprueba la caducidad del JWT en el cliente [V] |
| 204 | Devuelve `undefined` |

**Errores del alta** (`describeReportSubmissionError`, `oc/services/report-submission.service.ts:190`) [V]:

| Código | HTTP (BE) | Origen BE | Acción FE |
|---|---|---|---|
| `REGISTRATION_IN_PROGRESS` | 409 (`ConflictException`) | `ai-orchestration/ai-orchestrator.service.ts:576-581` | Mensaje «siga esperando»; conserva la clave |
| `IDEMPOTENCY_KEY_REUSED` | 422 (`UnprocessableEntityException`) | `ai-orchestrator.service.ts:558-563` | Rota la clave (`rotateReportRequestId`, `oc/hooks/useOperationalOverview.ts:635-639`): el siguiente envío será un registro nuevo |
| `TIMEOUT` / `NETWORK_ERROR` | — (cliente) | `http.ts` | Conserva la clave; el reintento no duplica |
| HTTP 429 | Throttler | `@Throttle` del controlador | Mensaje «espere un minuto» |
| Otro | — | — | Mensaje del servidor |

Tras éxito (nuevo o `replayed: true`) la clave se borra (`useOperationalOverview.ts:625`) [V].

---

## 4. Compatibilidad y observaciones

| Tema | Estado |
|---|---|
| COORDINADOR sin `KPIS_VIEW`/`REPORTS_VIEW` | Correcto por diseño: el FE no monta paneles de KPIs fuera del shell DIRECTOR [V]. Si un cambio futuro muestra KPIs al COORDINADOR, el backend responderá 403 |
| ADMIN y escrituras | ADMIN no tiene `SITUATIONS_CREATE/UPDATE/CLOSE`; el FE no le ofrece reportar (`canCreateSituations`, `permissions.ts:19-29`) [V] |
| Autorización real | La decide el backend; `permissions.ts` solo oculta o muestra [V] |
| Cambios de seguridad del backend (A1, A2, M1) | A1 (`/recommendations/:id`): el FE no lo usa [V]. A2 y M1: ver NOVEX_BACKEND → `docs/empalme/seguridad-y-correcciones.md`; efecto extremo a extremo no probado [?] |
| Tutorial | No añade llamadas; sus e2e rechazan cualquier escritura con 403 [V] |
| `forbidNonWhitelisted` | Cualquier campo o parámetro extra enviado por el FE produce 400 [V] |

**Deuda técnica:** módulos API heredados (`impact`, `analysis`, `recommendations`) siguen en el bundle por imports estáticos del router (`src/modules/executive-operations-center/index.ts`); `operational-events` apunta a un endpoint inexistente; funciones sin uso en `operational-kpi.service.ts`.

---

## Límites de verificación

- Backend leído en el working tree local `5ffc65f`; no se comprobó que coincida con la revisión desplegada [?].
- Tipos de respuesta comparados por nombre de campo en DTO de petición; las respuestas no se compararon campo a campo salvo donde se indica [?].
- La reachability es estática (imports y llamadores); no se ejecutó la app ni se capturó tráfico.
- Los permisos por rol son los de la semilla del catálogo; la base de datos de producción puede diferir [?].
- El guard JWT global se infiere por la existencia de `@Public()`; no se leyó su registro [I].

## Documentos relacionados

- [README de empalme](README.md) · [Arquitectura](arquitectura.md) · [Roles y navegación](roles-y-navegacion.md) · [Cartas y gráficas](cartas-y-graficas.md) · [Tutorial guiado](tutorial-guiado.md) · [Pruebas y desarrollo](pruebas-y-desarrollo.md) · [CLAUDE.md](../../CLAUDE.md)
- Backend (sin enlace): NOVEX_BACKEND → `docs/empalme/arquitectura.md`, NOVEX_BACKEND → `docs/empalme/situaciones-y-reglas.md`, NOVEX_BACKEND → `docs/empalme/autenticacion-y-permisos.md`, NOVEX_BACKEND → `docs/empalme/seguridad-y-correcciones.md`
