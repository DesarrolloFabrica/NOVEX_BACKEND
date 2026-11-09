# NOVEX — Fase 00: Diagnóstico y preparación

**Fecha:** 2026-11-09  
**Alcance:** solo diagnóstico. Sin commits, merges, pushes, resets, eliminaciones, migraciones ni cambios funcionales.  
**Referencia inicial:** `docs/EMPALME-NOVEX.md` (contrastada contra Git y código).  
**Cruce adicional:** inventarios de exploración BE/FE de esta misma sesión (sin contradicciones con §1–§3; refinaron §2).  
**Leyenda:** **[V]** verificado en esta sesión · **[H]** histórico/documental · **[?]** no verificado · **[I]** inferido

---

## 1. Estado real de Git (backend / frontend)

### 1.1 Contenedor local

| Ubicación | Estado [V] |
|---|---|
| `c:\dev\Proyecto-Novex` | Git init local **sin commits**; contiene `NOVEX_BACKEND/`, `NOVEX_FRONTEND/`, `docs/`, `.backups/`, `.tools/` |
| Worktrees históricos `C:\dev\novex\_a1/_int/_sec/_m1` | **MISSING** |
| Backups locales | `.backups/novex-20260804-*` (agosto; no inspeccionados a fondo) |

### 1.2 Backend (`NOVEX_BACKEND`)

| Ref | Commit | Significado [V] |
|---|---|---|
| **HEAD actual** `docs/empalme-20261106` | `0930667` | Docs + **incluye A1** (ancestro `72e24fe`) |
| `origin/main` / tag `novex-circo-prod-20261027` | `5ffc65f` | **Producción** Cartas y Circo |
| `origin/integracion/cartas-circo` | `72e24fe` | `main` + merge PR #2 (A1). **No es prod** |
| `origin/seguridad/a1-recomendaciones` | `ce8c5ad` | Commit A1 |
| `origin/docs/empalme-20261106` | `0930667` | Continuidad documental remota |
| tag `novex-pre-circo-20261023` | `49a6483` | Pre-cartas; rollback no viable con INTER [H/EMPALME] |
| `main` **local** / `Alejo-Rama` | `9501b36` | **Divergente y peligrosa:** 1 ahead / **75 behind** `origin/main` |
| Worktrees git | Solo el principal | Sin `_sec` / `_m1` |
| Stash | `stash@{0}` | README + `seed-operaciones.ts` (WIP checkout empalme) |

**Diff working tree (sin commit) [V]:**

- Borrado local de `docs/empalme/*` (aún en HEAD del repo).
- `CLAUDE.md` reorientado al monorepo `../docs/EMPALME-NOVEX.md`.
- `seed-operaciones.ts`: asignación de coordinaciones a dos usuarios seed (datos personales; no reproducir en docs).

**Commits en `docs/empalme` no en prod [V]:**

```
0930667 docs(empalme): documentación técnica
7341918 docs(empalme): CLAUDE.md e índice de continuidad
72e24fe Merge PR #2: A1
ce8c5ad fix(seguridad): A1 recommendations scope
```

**Código funcional más reciente (backend):**

| Criterio | Ref |
|---|---|
| Producción desplegada | `origin/main` = `5ffc65f` |
| Más reciente **integrado** con fix de seguridad A1 | `origin/integracion/cartas-circo` = `72e24fe` |
| HEAD local de trabajo documental | `docs/empalme-20261106` = `0930667` (= integración + docs) |

**No integrado / en riesgo de pérdida:**

- A1: en integración y en HEAD docs; **no** en `main`/prod.
- A2 y M1: documentados como worktrees sin commit; **código no encontrado** en este entorno (ver §3 y §5).
- Commit único `Alejo-Rama` (`9501b36`, ago-2026): incluye migración `1786500000000-AllowAnalystUnassignedSituations` (alineada con la «migración fantasma» del empalme [H]). **No** usar como base.

### 1.3 Frontend (`NOVEX_FRONTEND`)

| Ref | Commit | Significado [V] |
|---|---|---|
| **HEAD actual** `docs/empalme-20261106` | `c117759` | Solo docs sobre `b726c47` |
| `origin/main` / `integracion/cartas-circo` / tag `novex-circo-prod-20261027` | `b726c47` | **Producción** |
| `origin/sync/casa-oficina-20261030` | `d1804b9` | Tutorial + pasos 6–9. **No integrado** |
| `main` **local** / `Alejo-Rama` | `97e1c92` | **85 behind** `origin/main` (Alejo ya es ancestro de main; sin commits únicos) |
| Stash | `stash@{0}` | Solo `README.md` |

**Corrección al empalme:** tip de sync ya no es `7a49148`; avanzó a `d1804b9` (2026-11-06) con specs step6–9 **commiteados** en la rama. El claim de «8 archivos + 4 specs sin commit» del empalme **ya no aplica** al working tree actual de `docs/empalme-20261106` [V].

**Diff working tree [V]:** borrado local `docs/empalme/*` + `CLAUDE.md` → apunta a `EMPALME-NOVEX.md`.

**Código funcional más reciente (frontend):**

| Criterio | Ref |
|---|---|
| Producción | `origin/main` = `b726c47` |
| Feature no integrada | `origin/sync/casa-oficina-20261030` = `d1804b9` (4 commits sobre main) |

### 1.4 Ramas de trabajo — estado tras Fase 00c [V 2026-11-09]

| Repo | Rama local | HEAD | Notas |
|---|---|---|---|
| Backend | `refactor/novex-consolidacion` | `c63f3f8` | A1 (`72e24fe`) + docs CLAUDE/README |
| Frontend | `refactor/novex-consolidacion` | `21eb4a0` | `b726c47` + merge tutorial + docs |
| Ambos | `main`, `Alejo-Rama` | sin tocar | Conservadas |
| Ambos | `docs/empalme-20261106` | **eliminada local** | Tips en bundle + `docs/archivo/` |

Tags Circo/pre-circo intactos. **Sin push.** Remotas candidatas: §10.  
Detalle 00b: §9 · Resultado 00c: §10.

---

## 2. Inventario real del proyecto

### 2.1 Backend — módulos

**Importados en `app.module.ts` [V]:** Configuration, Schedule, Throttler, Common, Audit, TypeORM, OperationalAreas, Coordinations, Situations (+ sweep), SituationTimeline, SituationEvidence, SituationImpact, SituationRecommendations, AIAnalysis, AIPromptEngine, AIOrchestration, AIAnalysisSessions, OperationalEvents, OperationalOverview, OperationalKpi, Intelligence, RecommendedActions, Dashboard, Auth, Roles, Permissions, Rbac, Users, DatabaseSeeds.

**Controllers montados (rutas activas) [V]:**

| Prefijo `/api/v1` | Módulo |
|---|---|
| `auth` | Auth |
| `users`, `roles`, `permissions` | RBAC admin |
| `coordinations` | Catálogo |
| `situations` (+ analyze, resolution, consequences, recommendations anidadas, timeline, evidences, impact, analysis sessions) | Núcleo operacional + IA |
| `recommendations/:id` | Recomendación por id (A1 aplica alcance en HEAD/integración; **no** en prod) |
| `operational-overview` | Integridad / vidas |
| `operational-kpis` (+ learnings, internal-problems, state…) | KPIs Director |
| `dashboard` | `GET metrics` (`REPORTS_VIEW`); **sin consumidor FE montado** hallado |
| `internal/jobs` | Sweep SLA (OIDC) |
| `/health`, `/health/ready` | Fuera de Nest |

**Notas de autorización BE [V]:** `users`/`roles`/`permissions` usan asserts en línea (no siempre `@RequirePermissions`). Evidencias POST/DELETE usan `requireOperableSituation`; listados de impacto/recomendaciones anidadas usan alcance de **lectura** (base de M1).

**Latentes (módulo importado pero `controllers: []` o sin registrar controller) [V]:**

- `operational-areas`, `operational-events`, `recommended-actions` (controllers en disco **huérfanos**)
- `intelligence` (sin `@Controller` en module; `intelligence.controller.ts` huérfano; sí entidades/Gemini legacy)
- `demo-users` (**ni importado** en `app.module.ts`; controller existe en disco)
- `AIAnalysisModule` / `AIPromptEngineModule`: providers/export, sin HTTP propio

**Persistencia [V]:** 26 migraciones; `synchronize: false`, `migrationsRun: false`.

### 2.2 Frontend — rutas y núcleo

**Rutas montadas [V `src/app/router.tsx`]:**

| Ruta | Rol / guard | Destino |
|---|---|---|
| `/login` | público | Login |
| `/` | autenticado | `RoleLandingRoute` → Centro |
| `/centro-operacional` | 4 roles shell | `OperationalCenterHome` → shell por rol |
| `/admin` | solo ADMIN | `AdminConsolePage` |
| `/situaciones/nueva` | create | Redirect a reporte INTERNAL |
| Legacy (`/dashboard`, `/red-impacto`, `/situaciones`, `/gestion`, panorama/inteligencia/reportes, etc.) | — | Redirect al Centro |

**Núcleo activo [V]:** `operational-cards/` (shells por rol), `auth`, `api`, Login/Admin, `executive-operations-center` (**solo layout**; páginas panorama/IA/reportes exportadas pero rutas redirigen), `room` (marco visual `NovexRoom`/`ScreenDeck` vía monitoring parcial).

**Histórico / no montado como destino [V]:** páginas huérfanas `ImpactNetworkPage`, `MonitoringPage`, `OperationalEventsCenterPage`, `OperationalIntelligencePage`; módulo `dashboard`; `operational-events` completo. **Reuso parcial:** configs de `impact-network` (islas/iconos) y `ScreenDeck` de monitoring **sí** alimentan el Centro.

**Experimental [V]:** `onboarding/` en `origin/main` con `ONBOARDING_TOUR_SUSPENDED=true` (provider montado, inerte; sin menú piloto DEV en HEAD). Ampliado en `sync/casa-oficina-20261030` (~+6984/−606 vs main): motor tour + piloto Coordinador solo `import.meta.env.DEV`. `PATCH /users/me/onboarding` existe en cliente; el tour suspendido **no escribe**.

### 2.3 Funcionalidades por rol (UI montada + autoridad BE)

| Capacidad | ADMIN | DIRECTOR | ANALISTA | COORDINADOR |
|---|---|---|---|---|
| Shell Centro Operacional | Consulta (deck) | Lectura + KPIs | Operación (deck) | Solo su carta |
| Reportar INTERNAL/INTER | No (UI + seed/migración) | No | Sí | Sí (con coordinación) |
| Avance OPEN→IN_PROGRESS | No | No | Solo si responsable = `coord-general` | Solo su coordinación responsable |
| Resolver + aprendizaje | No | No | Solo `coord-general` responsable | Solo su responsable |
| Afectaciones INTERNAL | No | No | Autor | Responsable |
| KPIs (`/operational-kpis`) | No (sin `KPIS_VIEW`) | Sí | No | No |
| `/admin` usuarios | Sí | No | No | No |
| Tutorial piloto | — | — | — | Solo DEV + rama sync [V/H] |

**Autoridad real:** backend (JWT identifica; `AuthorizationEnrichmentGuard` relee rol/permisos/coordinación). UI oculta; no autoriza.

### 2.4 Contratos FE↔BE críticos

**Usados por UI montada [V]:**

- Auth: `POST /auth/google`, `GET /auth/me` (+ `POST /auth/email` solo si login email local)
- Alta: `POST /situations/register-with-analysis` + `Idempotency-Key`
- Ciclo: `PATCH /situations/:id`, `POST …/resolution`, `POST …/consequences`
- Lectura: `GET /situations`, `GET /situations/:id`, `GET …/timeline`, `GET …/evidences`, `GET /situations/categories`
- Cartas: `GET /operational-overview`
- Director: familia `/operational-kpis` (`/`, history, breakdown, relations, period, state, learnings*, internal-problems, internal-recurrence)
- Admin: `GET/PATCH users`, roles, permissions, coordinations (`catalog=true`)

**BE disponible / FE preparado o latente [V]:**

- `GET/PATCH /recommendations/:id` y `POST …/recommendations` — BE sí (`@deprecated`); FE Circo **no** crea/parchea por id
- `POST …/analyze`, analysis history/compare — BE sí; UI solo en módulo `monitoring` histórico (rutas redirigen)
- Impact (`/impact`, simulate, impact-context, graph/network-status) — clientes en `impact.api` / coordinations; experiencia no enrutada
- `POST evidences` — cliente existe; Centro solo **GET** evidencias
- `GET /dashboard/metrics` — BE sí (`REPORTS_VIEW`); sin uso FE hallado
- `operational-events` — FE residual; BE `controllers: []`
- `PATCH /users/me/onboarding` — listo; inerte mientras tour suspendido

### 2.5 Dependencias críticas entre repos

1. Pareja de prod: BE `5ffc65f` ↔ FE `b726c47` (tags `novex-circo-prod-20261027`).
2. FE Circo **no** debe apuntar a BE pre-cartas.
3. `forbidNonWhitelisted` en BE: query/body FE nuevos sin DTO → 400.
4. `npm run dev` FE arranca también `../NOVEX_BACKEND`.
5. e2e-real FE **compila** BE (`../NOVEX_BACKEND/dist`) y usa PG desechable :55433.

---

## 3. Riesgos y problemas conocidos (contrastados)

### 3.1 Checklist A1 / A2 / M1 / N1 / N2 / O1–O4

| Id | Estado en código actual | ¿En prod (`5ffc65f`)? | Severidad | Evidencia |
|---|---|---|---|---|
| **A1** IDOR `GET/PATCH /recommendations/:id` | **Corregido** en `72e24fe` / HEAD docs (`requireAccessible` / `requireOperable` + 404 uniforme) | **Sí vulnerable** [V: `getById`/`update` sin scope en `origin/main`] | **P0** (prod) | Diff integración; controller HEAD |
| **A2** COORDINADOR sin coordinación lista **todas** | **Abierto** en código actual [V: `resolveSituationListCoordinationId` → `undefined` → search sin filtro] | Sí [V mismo código en main] | **P0** | `operational-scope.service.ts` L67-75; `situations.repository.ts` solo filtra si hay `coordinationId` |
| **M1** `analyze` y `POST …/recommendations` usan alcance de **lectura** | **Abierto** [V: ambos llaman `requireAccessibleSituation`] | Sí | **P1** (necesita decisión producto P1) | `ai-orchestration.controller.ts`; recommendations by-situation |
| **N1** ANALISTA autor reasigna `coordinationId` → puede llegar a resolver en `coord-general` | **Abierto** [V: update permite `coordinationId` si no es COORDINADOR] | Sí | **P1** | `situations.service.ts` update L753+ |
| **N2** PATCH INTER puede igualar responsable y afectada | **Abierto** [V: update cambia `coordinationId` en INTER sin validar ≠ afectada; DTO no expone `affectedCoordinationId`] | Sí | **P1** | `UpdateSituationDto` + update() |
| **O1** Avance OPEN→IN_PROGRESS no usa `assertCanUpdate` pero aplica otros campos del PATCH | **Abierto** [V] | Sí | **P1** | update() rama `advancesToInProgress` luego muta title/description/coordinationId |
| **O2** PATCH sin `status` edita caso CLOSED | **Abierto** [V: bloqueo solo si `dto.status` definido] | Sí | **P2** | update() L744-750 |
| **O3** `@MinLength` antes de trim; `description` PATCH sin `@MaxLength` | **Parcial** [V: `ResolveSituationDto` sí hace Transform+MinLength; `UpdateSituationDto.description` MinLength sin MaxLength ni Transform] | Sí | **P2** | `situation.dto.ts` |
| **O4** Pista `canUpdate` sin el mismo alcance que `assertCanUpdate` | **Abierto** [V: `canUpdateSituation` = permiso + `ownsSituation`; assert añade `assertSituationInScope`] | Sí | **P2** | `operational-scope.service.ts` |

**A2/M1 — pérdida de trabajo [V crítico]:**

- Empalme describe correcciones **sin commit** en worktrees `_sec` / `_m1` bajo `C:\dev\novex\…`.
- Esas rutas **no existen** hoy. No hay blobs `a2-*` / `m1-*` / `scope-fixtures` en el objeto store del repo. Reflog sin ramas `security/fase0-*`.
- Sí sobrevive la **especificación textual** en `docs/empalme/seguridad-y-correcciones.md` (aún en HEAD del BE; borrada solo en working tree).
- **Hipótesis [I]:** el código fuente de A2/M1 se perdió al eliminar worktrees/máquina; solo queda la especificación para reimplementar.

### 3.2 Otros riesgos evidentes (sin auditoría profunda)

| Riesgo | Nivel | Notas |
|---|---|---|
| Push `main` sin migraciones | **P0** | Incidente 23-oct [H]; workflows no migran [V] |
| `main` local BE divergente | **P0** (operativo) | Reintroduce línea pre-circo/Alejo si alguien parte de ahí |
| A1 no desplegado | **P0** | Fix listo en integración |
| Worktrees A2/M1 ausentes | **P0** (pérdida) | Reimplementar desde doc |
| Migraciones reales en Cloud SQL | **P1 [?]** | No consultado; lote cartas y fantasma 178650 no constatados |
| Barrido SLA / Cloud Scheduler | **P1 [H]** | Cron in-process no garantizado con min-instances=0 |
| Throttler in-memory × instancias | **P2 [H]** | |
| JWT en `localStorage` / sin CSP | **P2 [H]** | XSS → sesión |
| `ENABLE_EMAIL_LOGIN` fuera de local | **P1** si se activa | Deploy fuerza false [H] |
| Privacidad IA (nombre/correo en prompt) | **P2 [H]** | |
| CI solo en push `main`, no en PR | **P1 [V]** | Ambos repos: solo `deploy-*.yml` |
| Node local v26 vs BE20 / FE22 | **P2 [V]** | Entorno local no alinea engines documentados |
| URLs Cloud Run del DEPLOY no resolvieron DNS aquí | **?[V]** | Health prod **no verificado** en esta sesión |
| `role_permissions` real en prod | **?[H]** | Matriz seed ≠ garantía prod |
| Controllers latentes sin PermissionsGuard si se remontan | **P1 [H]** | |

### 3.3 Discrepancias documentación ↔ realidad

| Tema | Empalme / docs | Realidad [V] |
|---|---|---|
| BE `main` local en `49a6483` | Empalme §2 / CLAUDE BE | Ahora `9501b36` (Alejo), 75 behind |
| FE sync tip `7a49148` | Empalme §2 / CLAUDE FE | Tip `d1804b9`; steps 6–9 ya en rama |
| Tutorial «sin commit» en FE | Empalme §10.5 | Working tree docs: solo borrado empalme + CLAUDE; tutorial uncommitted **no** presente |
| Worktrees `_sec/_m1` | Empalme §6 | **Ausentes** |
| CLAUDE.md apunta a `docs/empalme/` | HEAD committed | Working tree ya apunta a `EMPALME-NOVEX.md`; carpetas empalme borradas en WT |
| README FE/BE | Visión pre-Circo (red impacto, panorama, Gemini en alta implícito) | Circo: Centro Operacional; alta **sin** Gemini síncrono |
| `docs/01–12` monorepo | Agosto 2026 | Desactualizados vs Circo; `docs/README.md` aún dice «última revisión agosto» pese a enlace empalme |
| CLAUDE BE path FE | `C:\dev\novex\NOVEX_FRONTEND` | Hoy vive en `Proyecto-Novex\NOVEX_FRONTEND` |

---

## 4. Candidatos de limpieza futura (NO eliminar aún)

| Ítem | Clasificación | Justificación |
|---|---|---|
| Ramas remotas `backup/main-pre-circo-*`, `recovery/*`, `release/circo-*`, `feat/*` antiguas | **Conservar** (archivo remoto) | Rollback/historia; no borrar sin política |
| `Alejo-Rama` / `main` local BE | **Archivar o resetear con autorización** | Divergente; commit único a inventariar (migración 178650) |
| Stashes BE/FE | **Conservar** hasta revisar | Pueden tener WIP |
| Working tree: borrado `docs/empalme/*` | **Consolidar** | Contenido ya en `EMPALME-NOVEX.md`; falta commit de consolidación en cada repo |
| Módulos latentes BE (`operational-events`, `areas`, `recommended-actions`, `demo-users`, intelligence Gemini v1) | **Archivar / no remontar** | Riesgo de seguridad si se activan sin guards |
| FE `impact-network`, `monitoring`, dashboard legacy, mocks | **Archivar gradualmente** | Rutas ya redirigen; código muerto aumenta superficie |
| Shims legado (`createLegacyContract`, migración 178810) | **Conservar** hasta decisión RELEASE_CIRCO §9 | Compatibilidad |
| Docs monorepo `01–12`, README FE/BE, DEPLOY_* agosto | **Actualizar o marcar obsoletos** | Generan instrucciones falsas |
| `.backups/` agosto | **Conservar** fuera de git limpio | Posible referencia histórica |
| `dist/` BE en working tree | **Ignorar / no versionar** | Artefacto build |
| Dependencia `@google/generative-ai` + `@google/genai` | **Consolidar** a medio plazo | Dual SDK [I] |

**Cambios únicos sin integrar (riesgo pérdida):**

1. A1 (remoto, no main) — bajo riesgo de pérdida; sí de no-despliegue.
2. A2/M1 — **alto riesgo; posible pérdida ya consumada** del patch.
3. Tutorial FE `sync/casa-oficina-20261030` — seguro en remoto.
4. Seed-operaciones WT + stash BE — locales.
5. Commit Alejo BE `9501b36` — solo local/remoto Alejo-Rama; evaluar si aporta algo no cubierto por migraciones Circo.

---

## 5. Estrategia de consolidación sin pérdida de trabajo

### 5.1 Principios

1. **Producción = `origin/main`** hasta autorización explícita.
2. **Base de trabajo BE = `origin/integracion/cartas-circo`** (incluye A1).
3. **Base de trabajo FE = `origin/main`**; tutorial como merge/cherry-pick controlado después.
4. Nunca partir de `main` local.
5. Preservar working trees actuales (stash nombrado o commit WIP en rama docs) **antes** de cambiar de rama.
6. No borrar ramas remotas ni tags Circo/pre-circo.

### 5.2 Secuencia propuesta (solo plan; no ejecutada)

```
Fase 00 (esta) ──► preservar WT + recuperar A2/M1 si aún existen fuera
                ──► crear refactor/novex-consolidacion (BE/FE) cuando WT esté limpio o stash-seguro
Fase 01 seguridad ──► A1 → main (autorizado) ──► reimplementar A2 ──► decidir P1/M1
                ──► N1/N2 (+ O1 acoplado)
Fase 02 higiene   ──► consolidar docs CLAUDE/EMPALME ──► alinear engines Node
Fase 03 producto  ──► tutorial sync (validación) ──► UX sin rediseño identidad
Fase 04 deuda     ──► latentes/shims/READMEs ──► Scheduler SLA ──► CI en PR
```

### 5.3 Condición para crear `refactor/novex-consolidacion`

**No crear todavía** hasta:

1. Decisión sobre el working tree (stash / commit docs / restaurar empalme en repos).
2. Búsqueda explícita de A2/M1 en otras máquinas/backups del equipo.
3. Confirmación de que nadie usará `main` local como tip.

---

## 6. Pruebas ejecutadas y resultados

| Verificación | Resultado | Notas |
|---|---|---|
| `git fetch --all --prune` BE/FE | OK [V] | |
| Inventario ramas/tags/worktrees | OK [V] | |
| BE `npx eslint "{src,test}/**/*.ts"` (sin `--fix`) | **exit 0** — 0 errors, 54 warnings | Solo lectura |
| BE `npm test` | **exit 0** — 69 suites passed, 5 skipped, 880 tests | PG specs omitidos |
| BE `npm run test:security` | **exit 0** — 8 suites / 156 tests | Incluye A1 presentes en HEAD |
| FE `npm run lint` (oxlint) | **exit 0** — warnings varios (legacy + hooks) | |
| FE `npm run typecheck` | **exit 0** | |
| FE `npm test` (Vitest) | **exit 1** — 137 files OK / **2 fail** (21 tests) | `window.localStorage` undefined en `report-persistence` + idempotency hook — entorno Vitest sin jsdom configurado en `vite.config` [V] |
| BE/FE `npm run build` | **No ejecutado** | Escribe `dist/` |
| BE `npm run lint` (con `--fix`) | **No ejecutado** | Modifica fuentes |
| e2e FE / e2e-real / BE e2e | **No ejecutado** | Escritura / Docker / compila BE |
| PG integration (`NOVEX_PG_IT=1`) | **No ejecutado** | Requiere DB desechable |
| Health prod Cloud Run | **Falló DNS** en este entorno | URL de `DEPLOY_FRONTEND.md` no resolvió |
| Cloud SQL / migraciones show | **No ejecutado** | Prohibido sin autorización |
| Explotación manual A1/A2 | **No ejecutada** | Solo lectura de código |

**Node local [V]:** v26.5.1 (documentado: BE 20 / FE 22).

---

## 7. Riesgos técnicos clasificados P0 / P1 / P2

### P0 — actuar primero

1. **A1 en producción** (IDOR recommendations) — fix listo fuera de main.
2. **A2 en producción** (listado global si COORDINADOR sin coordinación) — patch posiblemente perdido; reimplementar.
3. **Pérdida A2/M1 en disco** — recuperar o reescribir desde `seguridad-y-correcciones.md`.
4. **Disciplina de ramas:** `main` local BE peligrosa; push main = deploy sin migraciones.

### P1

5. M1 (tras decisión producto).  
6. N1 / N2 / O1.  
7. Verificar migraciones aplicadas en prod (solo lectura autorizada).  
8. CI en PR; Scheduler SLA.  
9. Consolidar documentación (evitar READMEs falsos).  
10. Tutorial sync no integrado (producto, no seguridad).

### P2

11. O2, O3, O4.  
12. Privacidad prompt IA.  
13. Throttler por instancia; JWT/CSP.  
14. Código latente / dual SDK Gemini.  
15. Tests FE localStorage/jsdom.  
16. Node engines locales.

---

## 8. Propuesta concreta del siguiente paso

**Fases 00b y 00c ejecutadas** (§9–§10). Siguiente:

1. **Autorizar** (o no) el borrado de ramas **remotas** listadas en §10.3 / `.backups/fase00c-20261109/branch-inventory/CANDIDATAS.md`.
2. Autorizar **auditoría profunda** (solo lectura) sobre `refactor/novex-consolidacion`.
3. Autorizar **Fase 01 seguridad**: A1 → `main` + reimplementar A2; M1 tras P1.
4. Verificar PRs abiertos en GitHub (`gh` no autenticado en 00c).

**No hacer todavía:** push a `main`, borrado remoto sin OK, migraciones, Cloud SQL, correcciones funcionales sin fase.

---

## 9. Resultado Fase 00b — preservación y ramas (2026-11-09) [V]

### 9.1 Respaldo

Ubicación: `c:\dev\Proyecto-Novex\.backups\fase00b-20261109\` (ver `README.md` allí).

| Pieza | Mecanismo | Contenido verificado |
|---|---|---|
| WT BE | Copia filesystem + `working-tree.diff` + **stash nuevo** `fase00b-20261109:…` | CLAUDE.md, seed-operaciones (coord-general/servicios), 9 deletes empalme |
| WT FE | Igual | CLAUDE.md + 7 deletes empalme |
| Stash previo BE/FE | Export patch/stat/names **sin drop** → ahora `stash@{1}` | BE: README+seed; FE: README |
| Docs empalme borrados en WT | Recuperados desde HEAD del commit docs | Incluye `seguridad-y-correcciones.md` |
| Alejo único BE | `alejo-unique/9501b36.patch` + migración `178650…` | **No** integrada ni ejecutada; **ausente** en consolidacion |
| Alejo FE | 0 commits únicos vs `origin/main` | Nada que preservar |
| Tutorial sync | `tutorial-sync/COMMITS*.txt` + patches `01..04` | 4 commits; **no** mergeados |
| Spec A2/M1 | `NOVEX_BACKEND/a2-m1-spec/seguridad-y-correcciones.md` | §§3–4 con plan de fix documentado |

Stashes actuales (ambos repos): `stash@{0}` = fase00b; `stash@{1}` = wip previo. **Ninguno eliminado.**

### 9.2 Ramas creadas

| Repo | Comando efectivo | HEAD | A1 / tutorial |
|---|---|---|---|
| BE | `checkout -b refactor/novex-consolidacion origin/integracion/cartas-circo` | `72e24fe` | A1 presente (`requireRecommendationScope`) |
| FE | `checkout -b refactor/novex-consolidacion origin/main` | `b726c47` | Tutorial **no** ancestro (`d1804b9` fuera) |

### 9.3 Trabajo pendiente de integrar (registro)

**Tutorial FE** (`origin/sync/casa-oficina-20261030`, tip `d1804b9`):

1. `4b3cd80` — tour guiado + piloto Coordinador  
2. `cea1496` — anclas `data-tour`  
3. `7a49148` — flujo tutorial coordinador  
4. `d1804b9` — ajustes móviles + pasos 6–9  

Patches locales: `.backups/fase00b-20261109/tutorial-sync/01-*.patch` … `04-*.patch`.

**Seguridad BE:** A1 ya en rama consolidacion; A2/M1 a reimplementar desde spec (código worktree perdido); N1/N2/O1–O4 abiertos.

**Alejo BE `9501b36`:** migración fantasma `1786500000000-AllowAnalystUnassignedSituations` respaldada solo en backup; **no** añadir a consolidacion sin decisión (puede existir ya en prod como fantasma [H]).

### 9.4 Spec A2/M1 para reimplementación

Fuente canónica en backup:  
`.backups/fase00b-20261109/NOVEX_BACKEND/a2-m1-spec/seguridad-y-correcciones.md`

También sigue en git en `docs/empalme-20261106` @ `0930667` (`docs/empalme/seguridad-y-correcciones.md`).

- **A2:** fallar cerrado / listado `own-only` si COORDINADOR sin `coordinationId` (`resolveSituationListCoordinationId` + `SituationsService.list`).  
- **M1:** `analyze` y `POST …/recommendations` → `requireOperableSituation`; analyze CLOSED → 409; **requiere decisión producto P1** antes de integrar.

### 9.5 Comprobaciones anti-pérdida

- WT limpio en ambas consolidacion [V]  
- Stashes 0+1 presentes [V]  
- Backup filesize/probes OK (0 fails) [V]  
- Tags `novex-circo-prod-20261027` / pre-circo intactos [V]  
- `docs/empalme-20261106` tip sin cambio [V]  
- Sin push / sin merge main / sin migraciones / sin Cloud SQL [V]

### 9.6 ¿Listo para auditoría profunda?

Actualizado en §10.6 tras 00c.

---

## 10. Resultado Fase 00c — consolidación y limpieza (2026-11-09) [V]

### 10.1 Ramas conservadas (locales)

| Repo | Ramas |
|---|---|
| BE | `main`, `Alejo-Rama`, `refactor/novex-consolidacion` (`c63f3f8`) |
| FE | `main`, `Alejo-Rama`, `refactor/novex-consolidacion` (`21eb4a0`) |

Tags: `novex-circo-prod-20261027`, `novex-pre-circo-20261023` (ambos repos). Stashes 0+1 intactos.

### 10.2 Código integrado vs pendiente

| Ítem | Estado |
|---|---|
| A1 BE | En consolidacion (`72e24fe` ancestro) |
| Tutorial FE (4 commits) | **Integrado** en consolidacion (`87701bb` merge); `ONBOARDING_TOUR_SUSPENDED=true`; piloto solo DEV |
| A2/M1 | Spec en `docs/seguridad-fase0-detalle.md` + backups; **no** código |
| N1/N2/O1–O4 | Pendientes |
| Alejo / 178650 | Solo backup; **no** integrado |
| Latentes / legacy | No reactivados |

### 10.3 Candidatas a eliminación **remota** (requieren tu OK)

Ver `.backups/fase00c-20261109/branch-inventory/CANDIDATAS.md`.

**BE:** `docs/empalme-20261106`, `integracion/cartas-circo`, `seguridad/a1-recomendaciones`, `feat/*`, `release/circo-*`, `backup/main-pre-circo-*`, `recovery/*` (cuidado), y **revisar** `origin/Alejo-Rama` (`3b54e64` ≠ local `9501b36`).

**FE:** `docs/empalme-20261106`, `sync/casa-oficina-20261030`, `integracion/cartas-circo`, `fix/*`, `feat/*`, `release/*`, `backup/*`, `recovery/*`, `Alejo-Rama` remoto.

**PRs:** no verificados (`gh` sin auth) — comprobar antes de borrar.

### 10.4 Documentación

**Vigente (`docs/`):** README, arquitectura, funcional-y-roles, seguridad-y-permisos, seguridad-fase0-detalle, despliegue-y-operacion, historial, EMPALME, este diagnóstico.

**Archivo:** `docs/archivo/2026-08/` (01–12), `docs/archivo/empalme-20261106/{backend,frontend}/`.

**Repos:** ops BE (`RELEASE_CIRCO`, INCIDENTE, BACKUP-DR, …) indexados desde despliegue. CLAUDE/README actualizados en ambas consolidacion.

### 10.5 Eliminado localmente

- BE/FE: rama local `docs/empalme-20261106` (tips en bundle 00c + archivo docs).
- **Ninguna** rama remota, tag, stash ni backup borrado.

### 10.6 Pruebas [V esta sesión]

| Check | Resultado |
|---|---|
| FE typecheck / lint / build (post-tutorial) | OK |
| FE `npm test` | **21 fail / 1458 pass** — `window.localStorage` undefined (Vitest sin jsdom); mismos síntomas pre-merge |
| BE `npm test` | 880 pass / 38 skip |
| BE `test:security` | 156 pass |
| BE `npm run build` | OK |
| Push / Cloud SQL / migraciones | No ejecutados |

### 10.7 Respaldo 00c

`.backups/fase00c-20261109/` — bundles all-refs (verify OK), docs-snapshot, CANDIDATAS, mirrors de tips exclusivos.

### 10.8 ¿Continuar con seguridad?

**Sí** para auditoría profunda de solo lectura sobre consolidacion.  
**No** aún para borrar remotas (falta tu lista OK + check PRs) ni para Fase 01 de correcciones.

---

## Anexo A — Comandos de validación (referencia)

**Backend (seguros / con cuidado):**

- Lectura: `npx eslint "{src,test}/**/*.ts"`, `npm test`, `npm run test:security`
- Escribe: `npm run lint` (--fix), `npm run build`, `npm run test:e2e`
- Peligrosos: `migration:*`, `seed:*`, `cloud:*`, `start:dev:cloud*`

**Frontend:**

- Lectura: `npm run lint`, `npm run typecheck`, `npm test`
- Escribe: `npm run build`, `npm run test:e2e`, `node e2e-real/run.mjs`

---

## Anexo B — Hechos vs hipótesis (resumen)

| Afirmación | Tipo |
|---|---|
| Prod BE `5ffc65f` / FE `b726c47` = tags Circo | **Hecho [V git]** |
| A1 ausente en `origin/main`, presente en integración/HEAD docs | **Hecho [V]** |
| A2/M1 patrones aún en código de list/analyze | **Hecho [V]** |
| Worktrees `_sec/_m1` inexistentes; sin blobs a2/m1 | **Hecho [V]** |
| Código patch A2/M1 irrecuperable en absoluto | **Hipótesis [I]** (puede existir fuera de esta máquina) |
| Health prod OK | **No verificado** (DNS falló) |
| Migraciones Circo aplicadas en Cloud SQL | **No verificado** |
| Matriz RBAC prod = seed/migraciones repo | **No verificado** |
| FE unit failures = solo falta jsdom | **Hipótesis fuerte [I]** (síntoma localStorage; no se reconfiguró Vitest en esta fase) |

---

*Fin Fase 00 + 00b + 00c. Borrado remoto y correcciones requieren aprobación explícita.*
