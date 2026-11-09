# Empalme NOVEX — Documento único de continuidad

**Periodo de empalme:** 9–20 de noviembre de 2026  
**Última comprobación de origen:** 2026-11-06 (docs de empalme de `NOVEX_BACKEND` y `NOVEX_FRONTEND`)  
**Consolidado:** 2026-11-09 en este monorepo (`docs/EMPALME-NOVEX.md`)

Leyenda: **[V]** verificado contra código/Git/endpoints · **[H]** histórico · **[?]** no verificado · **[I]** inferido

Este documento sustituye las carpetas `NOVEX_BACKEND/docs/empalme/` y `NOVEX_FRONTEND/docs/empalme/`. Es la fuente de continuidad para modificar NOVEX con seguridad.

---

## 0. Qué es NOVEX (en una página)

NOVEX es la plataforma interna de inteligencia operacional de la Dirección de Operaciones de la CUN. El ciclo de negocio es: **reportar** un problema de una coordinación → **seguirlo** → **solucionarlo** dejando un **aprendizaje**.

La interfaz de producto se llama **Cartas y Circo**: mesa de cartas (coordinaciones), personaje Rive que expresa el estado, paneles por rol.

| Capa | Repo | Stack | Prefijo / rutas |
|---|---|---|---|
| API | `NOVEX_BACKEND` | NestJS 11, TypeORM, PostgreSQL, Gemini (`@google/genai`), Jest | `/api/v1` (excepto `/health`, `/health/ready`) |
| SPA | `NOVEX_FRONTEND` | React 19, Vite 8, Tailwind 4, ECharts, Rive, Vitest, Playwright | `/centro-operacional`, `/admin`, `/login` |

**Producción conocida (2026-10-27):**

| Pieza | Commit | Tag |
|---|---|---|
| Backend | `5ffc65f` = `origin/main` | `novex-circo-prod-20261027` |
| Frontend | `b726c47` = `origin/main` | `novex-circo-prod-20261027` |

Salud pública backend: `GET /health/ready` → `{"status":"ready","checks":{"database":"up"}}` [V el 2026-11-06].

---

## 1. Reglas obligatorias antes de tocar nada

1. **Push a `main` = despliegue automático** en backend y frontend (GitHub Actions). **No** aplica migraciones.
2. **Nunca** uses `main` local como base: en backend estaba en `49a6483` (pre-cartas); en frontend desactualizada. Parte de `origin/<rama>`.
3. **Nunca** ejecutes migraciones, seeds, `cloud:*`, `gcloud`, ni escrituras a Cloud SQL sin autorización explícita.
4. **Nunca** descartes cambios locales (`reset --hard`, `clean`, `stash drop`) sin autorización.
5. Ante contradicción documentación vs código: **manda el código**; reporta la discrepancia.
6. No afirmes que una prueba pasa si no la ejecutaste en esta sesión.
7. No pongas secretos, `.env`, tokens ni datos personales en docs/commits.
8. Trabaja por fases: la aprobación de una fase no cubre la siguiente.
9. Backend Node **20**; frontend Node **22**.
10. Frontend y backend se mueven como pareja: no dejes el frontend de Circo apuntando a un backend pre-cartas.

---

## 2. Estado de ramas (referencia 2026-11-06; actualizar con `git fetch`)

### Backend

| Ref | Commit | Significado |
|---|---|---|
| `origin/main` | `5ffc65f` | Producción |
| `origin/integracion/cartas-circo` | `72e24fe` | `5ffc65f` + **A1** (PR #2). **No** es producción |
| `origin/seguridad/a1-recomendaciones` | `ce8c5ad` | Commit A1 |
| `docs/empalme-20261106` | docs + A1 | Rama de continuidad documental (local/remoto) |
| tag `novex-pre-circo-20261023` | `49a6483` | Pre-cartas; **no** rollback viable si ya hay INTER |

### Frontend

| Ref | Commit | Significado |
|---|---|---|
| `origin/main` / `integracion/cartas-circo` | `b726c47` | Producción |
| `origin/sync/casa-oficina-20261030` | `7a49148` (+ commits previos) | Tutorial guiado **no integrado** |
| `docs/empalme-20261106` | docs sobre `b726c47` | Continuidad documental |

**Pendiente de producto/código (no en producción):**

- Backend: A1 en integración (no en `main`); A2 y M1 solo en disco (worktrees); N1/N2/O1–O4 abiertos.
- Frontend: tutorial en `sync/casa-oficina-20261030` + cambios locales sin commit; no desplegar sin validación.

---

## 3. Arquitectura backend (qué tocar / qué no)

### 3.1 Arranque

1. Express abre el puerto pronto (probes Cloud Run).
2. `/health`, `/health/ready`, `/api/v1/auth/health` fuera de Nest.
3. Preflight PostgreSQL → Nest sobre Express → prefijo `api/v1` → ValidationPipe (`whitelist`, `forbidNonWhitelisted`) → CORS.
4. Solo tras `app.init()` `/health/ready` puede dar 200. Si falla bootstrap: proceso vivo, ready 503 con `failure.message` (hasta 500 chars, **sin auth**).

### 3.2 Guards globales (orden)

1. `JwtAuthGuard` (`@Public` lo salta)
2. `AuthorizationEnrichmentGuard` — **relee** rol, permisos y coordinación desde BD en cada petición (`RbacService`). El JWT solo identifica.
3. `ThrottlerGuard` — 600/60 s (auth 15, Gemini 10). Almacén en memoria **por instancia**.
4. `PermissionsGuard` por controlador (`@RequirePermissions` = conjunción). Controllers `users`/`roles`/`permissions` usan assert en línea.

### 3.3 Módulos activos vs latentes

**Activos (montar rutas):** auth, users, roles, permissions, coordinations, situations (+ sweep), timeline, evidence, impact, recommendations, AI orchestration/sessions, operational-overview, operational-kpis, dashboard.

**Latentes (`controllers: []` o sin montar):** `operational-areas`, `operational-events`, `recommended-actions`, `intelligence` (sí registra entidad `IncidentCategory`), `demo-users` (ni importado). **No volver a registrarlos** sin `PermissionsGuard` + alcance.

### 3.4 Convenciones de error / alcance

- Fuera de alcance de coordinación → **404** «Situación no encontrada» (no revelar existencia).
- En alcance pero sin propiedad/política → **403**.
- Conflicto de estado → **409**.
- Códigos de negocio: `LEGACY_REGISTRATION_REQUIRES_COORDINATION`, `IDEMPOTENCY_KEY_REUSED` (422), `REGISTRATION_IN_PROGRESS`, `ANALYSIS_IN_PROGRESS`, `ANALYSIS_CLAIM_LOST`.
- Pistas `canResolve` / `canAdvanceToInProgress` / `canUpdate` / `canAddConsequence` **no autorizan**; cada escritura vuelve a comprobar.

### 3.5 Persistencia

- `synchronize: false`, `migrationsRun: false` siempre. **26 migraciones** en `src/database/migrations/`.
- Escrituras críticas: `transaction` + `pessimistic_write` (resolución, afectaciones).
- Append-only por trigger: `situation_severity_changes`, `situation_consequences`.
- Auditoría: `AuditLogService.record` **traga errores** (no revierte negocio); `audit_logs` sin trigger de inmutabilidad.

---

## 4. Dominio de situaciones (reglas que no debes romper)

### 4.1 Modelo

| Concepto | Campo | Significado |
|---|---|---|
| Responsable | `coordinationId` | Atiende y resuelve |
| Afectada | `affectedCoordinationId` | Sufre el impacto; lectura al coordinador afectado, **no** operación |
| Relacionadas | `situation_related_coordinations` | Declarativas; **no** dan permisos |
| Autor | `createdByUserId` | Lectura propia; ANALISTA: edición/afectaciones |

Tipos: `INTERNAL` (categoría + afectaciones; afectada = responsable) · `INTER_COORDINATION` (sin categoría ni afectaciones; exige `affectedProcess` + `pendingDelivery`; afectada ≠ responsable).

Estados:

```
OPEN ──PATCH avance──► IN_PROGRESS ──POST /resolution──► CLOSED
  └──────────────── POST /resolution ─────────────────────┘
RESOLVED (legado) ──POST /resolution──► CLOSED
OPEN / IN_PROGRESS / RESOLVED ──POST /cancellation (ADMIN)──► CANCELLED
```

`CANCELLED` (Fase 01B.1, **cerrada en código** @ `2bdf12f`, sin desplegar) no es un cierre: sin aprendizaje ni `closed_at`, inmutable, fuera de listados por defecto y de todo indicador. Traslado de responsable: `POST /situations/:id/coordination-transfer` (solo ADMIN; UI FE pendiente). Ver docs/seguridad-y-permisos.md.

Cierre **solo** por `POST /situations/:id/resolution` con `{ learning }` (1..4000, no vacío). PATCH con `status: CLOSED` → 403.

### 4.2 Alta

- Único endpoint: `POST /situations/register-with-analysis` (`SITUATIONS_CREATE`).
- **No llama a Gemini**; responde `{ situation, analysis: null, replayed }`.
- Idempotencia opcional: cabecera `Idempotency-Key` UUID v4; huella SHA-256; misma clave+huella = replay; misma clave otra huella = 422; carrera → índice único parcial.
- INTERNAL: COORDINADOR solo en su coordinación; ANALISTA en cualquiera.
- INTER: ANALISTA elige responsable y afectada libremente; un COORDINADOR solo registra INTER con **afectada = su coordinación** (Fase 01A, `b28026f`). Sin coordinación asignada, 403 `COORDINATION_REQUIRED`.

### 4.3 Quién avanza / resuelve / añade afectaciones

| Acción | COORDINADOR | ANALISTA | ADMIN/DIRECTOR |
|---|---|---|---|
| Avance OPEN→IN_PROGRESS | Responsable = la suya | Responsable = `coord-general` | Nunca |
| Resolver | Responsable = la suya | Responsable = `coord-general` | Nunca |
| Afectaciones (solo INTERNAL activo) | Responsable | Autor | Nunca |
| Editar PATCH (no avance) | Responsable | Autor | Nunca |
| Cambiar coordinación responsable | Nunca (PATCH → 403) | Nunca | Traslado ADMIN (pendiente) |
| Analizar con IA | Responsable, caso activo | Cualquier caso activo | Nunca |

Desde la Fase 01A el PATCH corre en transacción con `pessimistic_write`, rechaza casos CLOSED (409 `SITUATION_CLOSED`) y no admite mezclar el avance con otros campos (400 `ADVANCE_WITH_FIELD_CHANGES`).

Autoría o ser afectada **no** concede resolver.

### 4.4 SLA (`severity-v1`) — usa severidad **reportada** (inmutable)

| Reportada | Plazo | Ventana aviso |
|---|---|---|
| CRITICAL | 24 h | últimas 6 h |
| HIGH | 72 h | últimas 24 h |
| MEDIUM | 7 d | últimas 48 h |
| LOW | 14 d | últimas 72 h |

`due_at` se fija al alta y **no se reescribe**. Escalamiento automático: infraestructura lista, **ninguna política activa** (`ACTIVE_SEVERITY_ESCALATION_POLICY_CODE = null`). Barrido: `@Cron` 30 min + endpoint OIDC; Cloud Scheduler **no configurado**; con `min-instances=0` el cron **no está garantizado**.

### 4.5 Integridad (`integrity-mvp-v1`) y vidas (`life-points-v1`)

Se **calculan al leer** `GET /operational-overview`; no se persisten.

**CRITICO** si alguna: ≥1 CRITICAL · ≥3 HIGH · ≥5 activos · ≥3 coordinaciones afectadas · ≥1 INTER entrante CRITICAL.  
**ESTABLE** si 0 activos y 0 INTER entrantes.  
**ALERTA** resto. Snapshot inválido → `DESCONOCIDO` (nunca ESTABLE).

Vidas: máx 10 (5 corazones × 2). Daño: L/M=1, H/C=2 por activo propio + INTER externos entrantes. `lifePoints = clamp(10 − daño, 0, 10)`; inválido → `null`.

---

## 5. Autenticación, RBAC y alcance

### 5.1 Login

- Google: `POST /auth/google` con ID token; usuario **preexistente** ACTIVE; sin restricción de dominio `hd`.
- JWT HS256, `JWT_EXPIRES_IN` default 1h, sin refresh ni lista de revocación.
- Email login solo si `ENABLE_EMAIL_LOGIN=true` (deploy fuerza `false`). En local FE: `VITE_ENABLE_EMAIL_LOGIN=true`.

### 5.2 Matriz de permisos (seed; producción vía migraciones)

| Permiso | ADMIN | DIRECTOR | ANALISTA | COORDINADOR |
|---|:-:|:-:|:-:|:-:|
| `SITUATIONS_VIEW` | ✔ | ✔ | ✔ | ✔ |
| `SITUATIONS_CREATE/UPDATE/CLOSE` | — | — | ✔ | ✔ |
| `AI_ANALYZE` | — | — | ✔ | ✔ |
| `AI_VIEW_REPORTS` | ✔ | ✔ | ✔ | ✔ |
| `KPIS_VIEW` | — | ✔ | — | — |
| `REPORTS_VIEW` | ✔ | ✔ | ✔ | — |
| `USERS_*` / `SYSTEM_CONFIGURATION` | ✔ | — | — | — |
| `COORDINATIONS_VIEW` | ✔ | ✔ | ✔ | ✔ |

**[?] Contenido real de `role_permissions` en producción no verificado.** Si falta migración `1788200000000`, ADMIN/DIRECTOR podrían crear situaciones.

### 5.3 Lectura ≠ escritura

Ejemplo INTER (responsable A, afectada B): coordinador de B **lee**; PATCH/evidencias → 404; resolver → 403; `analyze` y crear recomendaciones → 404 (M1 corregido en Fase 01A).

---

## 6. Seguridad Fase 0 — checklist para modificar

| Id | Problema | Estado | ¿En prod? | Acción |
|---|---|---|---|---|
| **A1** | IDOR `GET/PATCH /recommendations/:id` sin alcance | En `72e24fe` / integración | **No** | Autorizar PR → `main` |
| **A2** | COORDINADOR sin coordinación lista **todas** | **Corregido** en consolidación (`485476c`) | No | Desplegar |
| **M1** | `analyze` y `POST …/recommendations` usan alcance de **lectura** | **Corregido** (`485476c`) con las decisiones aprobadas | No | Desplegar |
| **N1** | ANALISTA autor reasigna `coordinationId` a `coord-general` y luego resuelve | **Corregido** (`8be4415`) | Sí (código) | Traslado ADMIN posterior |
| **N2** | PATCH INTER puede igualar responsable y afectada | **Corregido** (`8be4415`) | Sí (código) | Desplegar |
| **O1** | PATCH avance no llama `assertCanUpdate` pero aplica otros campos | **Corregido** (`8be4415`) | Sí | Desplegar |
| **O2** | PATCH sin `status` edita caso CLOSED | **Corregido** (`8be4415`): CLOSED inmutable | Sí | Desplegar |
| **O3** | `@MinLength` antes de trim; description PATCH sin max | Abierto | Sí | Validación |
| **O4** | Pista `canUpdate` sin alcance de coordinación | Abierto | Sí | Alinear pista |

**Worktrees históricos (rutas `C:\dev\novex\…`):** `_a1`, `_int`, `_sec`, `_m1` con `node_modules` como **junction**. Borrar worktree con junction puede borrar `node_modules` real → primero `rmdir` del enlace.

**Orden propuesto (no autorizado):** A1→main → A2 → N1+N2 → M1 (tras P1) → integración→main.

**Privacidad IA:** el prompt a Gemini incluye nombre y correo del autor; se guarda en `prompt_snapshot` y se expone en `GET …/analysis/history/:version`.

El frontend **no** usa `/recommendations/:id` (A1 no lo rompe). Efecto e2e de A2/M1 no probado.

---

## 7. Base de datos y migraciones

- Local: Postgres 17 Docker. Cloud SQL documentado como Postgres **16** [H], no verificado [?].
- Perfil: `DB_CLOUD=true` → `DB_*_CLOUD`; si no → `DB_*_LOCAL` / `DB_*`. **`migration:*` no tiene guarda** contra nube.
- Seeds al boot: apagados en producción (`CATALOG_SEED_ON_BOOT=false`). Cambios RBAC en prod = **migración**.
- Incidente 23-oct: deploy sin migraciones → fallos en situaciones. Orden correcto: **migrar primero (copia + show + run), desplegar después**.
- Migración fantasma en prod: `AllowAnalystUnassignedSituations1786500000000` (no está en el repo) [H].
- Lote cartas (9 migraciones): aplicado en copia de restore [H]; **aplicación en producción no constatada** [?].
- Rollback a `49a6483` **no viable** si existen INTER.
- Shims de compatibilidad legado (`createLegacyContract`, triggers `1788100000000`): no retirar sin decisión (`RELEASE_CIRCO` §9).

Scripts peligrosos sin autorización: `migration:run/revert`, `seed:rbac`, `seed:qa-internal-vivo`, `cloud:sql`, `cloud:user:upsert`, `cloud:proxy`, `start:dev:cloud*`.

---

## 8. Inteligencia artificial

- Única capacidad: análisis estructurado de **una** situación bajo `POST /situations/:id/analyze` (`AI_ANALYZE`).
- Proveedor: Gemini (`gemini-3-flash-preview` por defecto), JSON schema, timeout 60 s, throttle 10/min.
- Reclamo con lease 150 s; persistencia fenciada; fallo → timeline/audit FAILED, no borra situación.
- Plantilla activa: **v2** `operational-intelligence-v2`.
- **No existe** asistente conversacional en el producto.
- UI de IA **no montada** en producción del frontend (solo código legado/latente).
- Claude/asistentes de IDE **no** son el proveedor de IA de NOVEX.

---

## 9. Despliegue y operación

| Aspecto | Backend | Frontend |
|---|---|---|
| Workflow | `deploy-backend.yml` | `deploy-frontend.yml` |
| Trigger | push `main` / `workflow_dispatch` | igual |
| CI en PR | **No** | **No** |
| Smoke | health, ready, 401 `/auth/me`, CORS | build + deploy imagen nginx |
| Migraciones | **Ninguna vía las corre** | N/A |
| Node imagen | 20 | 22 |
| Riesgo Cloud Build manual | `--set-env-vars` **reemplaza todas** las vars; CORS incluye localhost | — |

Secretos (nombres): `DB_PASSWORD`, `JWT_SECRET`, `GEMINI_API_KEY` en Secret Manager.

---

## 10. Frontend — arquitectura y reglas de UI

### 10.1 Núcleo activo

- Entrada: `src/main.tsx` → providers → `router.tsx`.
- Núcleo: `src/modules/operational-cards/` (experiencia por rol, servicios, charts, personaje).
- Auth: JWT en `localStorage` (`novex.auth.accessToken.v1`); permisos de UI desde **claims del JWT**; `roleCode` desde `/auth/me`.
- HTTP: `src/shared/api/http.ts`. En DEV sin `VITE_API_BASE_URL` → proxy `/api/v1` → `127.0.0.1:3001`.
- `npm run dev` arranca también `../NOVEX_BACKEND` (`scripts/dev.mjs`).

### 10.2 Roles en UI (el servidor autoriza de verdad)

| Rol | Shell | Mesa | Reportar | KPIs | `/admin` |
|---|---|---|---|---|---|
| ADMIN | Deck consulta | Completa | No | No | Sí |
| DIRECTOR | Director | Completa | No | Sí | No |
| ANALISTA | Deck operación | Completa | Sí | No | No |
| COORDINADOR | Solo su carta | No | Sí (con coordinación) | No | No |

- `normalizeRoleCode`: rol desconocido → **COORDINADOR**.
- Deuda: tras cambio de rol, UI puede mostrar permisos JWT viejos hasta nuevo login (servidor ya enriquecido).
- Etiqueta inconsistente: `IN_PROGRESS` = «En revisión» (filtros) vs «En atención» (acción).

### 10.3 Cartas y Circo — no romper

1. **15** coordinaciones en BD / `CoordCards`; mesa pinta **9 mazos** (`productHierarchy.ts`). `coord-servicios` no se pinta; arte prestado a homologaciones.
2. **No calcular** integridad ni vidas en el frontend; consumir `status` y `lifePoints`. Inválido → `DESCONOCIDO` / `null`, nunca ESTABLE/10.
3. Identidad de carta (color/cara) **independiente** del estado operacional.
4. Personaje Rive: solo `mood` + triggers `approve`/`disapprove` en View Model; **no** `useStateMachineInput`. Reacciones solo tras confirmación del servidor.
5. LEVEL 0 = overview; LEVEL 1 = problemas; LEVEL 2 = detalle. Sin polling; refetch tras escritura.
6. Umbrales en `integrity-policy.ts` del FE son solo para **texto explicativo** (deuda si backend cambia).

### 10.4 Flujo HTTP que usa la UI montada

| Paso | Endpoint |
|---|---|
| Alta | `POST /situations/register-with-analysis` + `Idempotency-Key` |
| Avance | `PATCH /situations/:id` `{ status: IN_PROGRESS }` |
| Cierre | `POST /situations/:id/resolution` `{ learning }` |
| Afectaciones | `POST /situations/:id/consequences` |
| Cartas | `GET /operational-overview` |
| KPIs Director | `GET /operational-kpis/*` |

Errores de alta: `REGISTRATION_IN_PROGRESS` conserva clave; `IDEMPOTENCY_KEY_REUSED` rota clave; timeout/red conservan clave.

Endpoints preparados pero **sin uso montado:** `/operational-kpis/breakdown`, `/period`, `analysis/compare`, `impact-context`, `POST evidences`, `/recommendations/:id`, etc.

Código histórico (no reactivar sin decisión): `impact-network`, `monitoring`, secciones panorama/inteligencia/reportes, `operational-events` (provider montado pero nadie llama; BE sin controller).

### 10.5 Tutorial guiado

| Aspecto | Estado |
|---|---|
| En producción | **No** |
| Rama | `sync/casa-oficina-20261030` |
| Activación | Solo `import.meta.env.DEV` + rol COORDINADOR |
| Tour general | `ONBOARDING_TOUR_SUSPENDED = true` (provider montado, no arranca) |
| Persistencia piloto | `localStorage` / `sessionStorage`; **no** llama `PATCH /users/me/onboarding` |
| Trabajo local sin commit (2026-11-06) | 8 archivos modificados + 4 specs step6–9 sin seguimiento — **preservar antes de cambiar rama** |
| Bugs conocidos | `readPilotProgress` no usado (siempre paso 1); ancla `report-problem` inexistente en tour general; test de anclas se auto-satisface |

**No activar en producción** sin validación multi-viewport y autorización.

---

## 11. Contratos y compatibilidad FE↔BE

- Todos los endpoints que usa el FE de producción existen en el BE [V 2026-11-06].
- Excepción conceptual: cliente FE de `/operational-events` sin invocación; BE `controllers: []`.
- Backend `forbidNonWhitelisted`: un query param nuevo en FE sin DTO → 400.
- Si cambias un contrato HTTP: revisar servicios en `NOVEX_FRONTEND/src/modules/operational-cards/services/` y `src/modules/api/`.
- Si cambias esquema: migración aditiva + idempotente + `down()`; documentar orden migrate→deploy.

---

## 12. Desarrollo y pruebas locales

### Backend

| Comando | Nota |
|---|---|
| `npx eslint "{src,test}/**/*.ts"` | Solo lectura |
| `npm run lint` | **Modifica** archivos (`--fix`) |
| `npm test` / `test:security` | Jest; `*.pg.spec.ts` omitidos sin `NOVEX_PG_IT=1` |
| `npm run test:e2e` | Nest completo; puede crear/borrar datos → base aislada |
| `npm run build` | Escribe `dist/` |

Para PG specs: contenedor **desechable** distinto de `novex-postgres`, `DB_CLOUD=false` + todas `DB_*_LOCAL`, migrar esa base, `NOVEX_PG_IT=1`.

### Frontend

| Comando | Nota |
|---|---|
| `npm run lint` | oxlint, solo lectura |
| `npm run typecheck` / `test` | tsc / Vitest |
| `npm run test:e2e` | Playwright mock; escribe `test-results/` |
| `node e2e-real/run.mjs` | **Única** vía e2e real: Docker PG :55433, migra, **compila backend** (`../NOVEX_BACKEND/dist`), Playwright. No invocar el config a mano |
| `npm run build` | `dist/` |

CI FE: lint, typecheck, unit, build — **sin e2e**, sin PR.

### Variables locales (solo nombres)

Backend: `DB_CLOUD=false`, `DB_*` / `DB_*_LOCAL` → Postgres local, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GEMINI_*`, `ENABLE_EMAIL_LOGIN`.  
Frontend: `VITE_API_BASE_URL` vacío (proxy), `VITE_GOOGLE_CLIENT_ID`, `VITE_ENABLE_EMAIL_LOGIN=true`.

---

## 13. Trabajo terminado vs pendiente

### En producción [V]

RBAC servidor · ciclo situación + resolución atómica + aprendizaje · INTERNAL/INTER · afectaciones · severidad efectiva append-only · alta idempotente · integridad/vidas · KPIs Director · health · Gemini diferido · Centro Operacional por rol · admin usuarios · Cartas y Circo.

### Pendiente prioritario

1. A1 → `main`/prod (autorización).
2. A2: rama/PR.
3. M1: decisión P1 → rama/PR.
4. Evaluar/corregir N1, N2, O1–O4.
5. Verificar migraciones reales en producción (solo lectura autorizada).
6. Cloud Scheduler para barrido SLA.
7. Reconciliar docs backups (`BACKUP-DR` vs `RESTORE-TEST`).
8. Integrar tutorial FE (preservar trabajo local, PR, pruebas, política de activación).
9. Retirar código latente / shims cuando se decida.
10. Actualizar READMEs históricos (dicen cosas falsas: Gemini en el alta, módulos no montados, `RESOLVED` como normal, health antiguo, cifras de migraciones).

---

## 14. Riesgos conocidos (tabla rápida)

| Riesgo | Detalle |
|---|---|
| Deploy sin migraciones | Push a `main` puede romper prod (incidente 23-oct) |
| `main` local viejo | Reintroduce pre-cartas |
| A2/M1 / tutorial solo en disco | Pérdida al limpiar worktree/rama |
| N1/N2 | Autorización / consistencia INTER |
| Barrido SLA | Puede no ejecutarse |
| Throttler por instancia | Límite × N instancias |
| JWT en localStorage + nginx sin CSP | XSS → robo de sesión |
| `ENABLE_EMAIL_LOGIN` | Si se activa fuera de local = sesión sin Google |
| Controladores latentes | Sin PermissionsGuard si se remontan |
| Rollback pre-cartas | Inválido con INTER |
| Documentación histórica | No usar como verdad (`README`, `DEPLOY.md`, `MONITORING`, `BACKUP-DR`, etc.) |

---

## 15. Checklist «antes de implementar»

1. Leer este documento; confirmar rama y HEAD (`git status`, `git log -1`, `git fetch` + `git log origin/main`).
2. Localizar código **alcanzable** (FE desde `main.tsx`/`router`; BE módulos con controllers montados).
3. Si toca acceso: leer `operational-scope.service.ts` **y** `situation-access.service.ts` **y** el controlador concreto. Permiso ≠ alcance.
4. Si toca API: contrastar DTO + permiso + FE consumidor.
5. Si toca esquema: migración aditiva; plan migrate→deploy.
6. Proponer cambio (archivos, riesgos, pruebas, impacto prod) y **esperar aprobación**.
7. Validar con comandos de solo lectura primero; informar qué se ejecutó y qué no.

---

## 16. Discrepancias abiertas relevantes

| Id | Área | Resumen | Estado |
|---|---|---|---|
| BE D3 | README histórico | Dice que el alta llama Gemini; lista módulos no montados | Abierta (doc) |
| BE D7 | `cloudbuild.backend.yaml` | `--set-env-vars` + localhost en CORS | Abierta (config) |
| BE D13 | Seeds/scripts | Algunos sin guarda anti-cloud | Abierta (código) |
| FE D3 | Auth session | Permisos UI desde JWT vs BE en cada request | Abierta |
| FE D4 | integrity-policy FE | Espejo de umbrales solo para texto | Abierta |
| FE D6 | O4 backend | `canUpdate` engañoso | Abierta |
| FE D7 | UX | «En revisión» vs «En atención» | Abierta |
| FE D9 | Tutorial | Progreso/anclas/tests frágiles | Abierta |
| FE D10 | CI | No corre en PR | Abierta |

---

## 17. Documentos históricos útiles (fuera de este archivo)

En `NOVEX_BACKEND/docs/` (no son este empalme, pero existen):

| Documento | Uso |
|---|---|
| `INTERNAL_VIVO.md` | Modelo INTERNAL vigente |
| `RELEASE_CIRCO.md` | Publicación Cartas y Circo / recuperación |
| `INCIDENTE-20261023-MIGRACIONES.md` | Postmortem migraciones |
| `RESTORE-TEST.md` / `BACKUP-DR.md` | Backups (se contradicen) |
| `SECRETS-AND-VARS.md`, `SECURITY.md` | Secretos / postura GCP |
| `DEPLOY_BACKEND.md` | Guía Cloud Run |

En frontend: `DEPLOY_FRONTEND.md` (revisar; agosto), README del repo **desactualizado**.

Reglas de asistentes: `NOVEX_BACKEND/CLAUDE.md`, `NOVEX_FRONTEND/CLAUDE.md` (apuntan a este documento).

---

## 18. Cómo informar (para quien continúe)

- Responder en español.
- Separar **verificado** / **histórico** / **no verificado**.
- En seguridad: «verificado en código» ≠ «explotado».
- Por hallazgo: qué, dónde, roles, impacto, cómo comprobar, propuesta **sin aplicarla** hasta aprobación.
- Al cerrar: archivos tocados, `git status`, pruebas hechas y no hechas, riesgos abiertos.

---

*Fin del documento único de empalme. Cualquier cambio de comportamiento del sistema debe actualizar este archivo en la misma fase autorizada.*
