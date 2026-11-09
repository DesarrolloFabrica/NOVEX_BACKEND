# Empalme NOVEX_FRONTEND

Índice de continuidad para el periodo del 9 al 20 de noviembre de 2026.
**Última comprobación: 2026-11-06.** Las reglas de trabajo están en [`../../CLAUDE.md`](../../CLAUDE.md).

Leyenda: **[V]** verificado el 2026-11-06 contra código, Git o endpoints públicos · **[H]** histórico (documento o nota previa) · **[?]** no verificado.

## Mapa de documentos

| Documento | Para qué consultarlo |
|---|---|
| [arquitectura.md](arquitectura.md) | Módulos (activo / legado / experimental), arranque, sesión, cliente HTTP, dependencias |
| [roles-y-navegacion.md](roles-y-navegacion.md) | Rutas, guards y la experiencia de ADMIN, DIRECTOR, ANALISTA y COORDINADOR; visibilidad en UI frente a autorización del servidor |
| [cartas-y-graficas.md](cartas-y-graficas.md) | Cartas y Circo: catálogo de mazos, estados, personaje Rive, vidas, KPIs y gráficas del DIRECTOR |
| [tutorial-guiado.md](tutorial-guiado.md) | Motor del tour, anclas `data-tour`, piloto del COORDINADOR, cambios locales y cómo añadir un paso |
| [contratos-api.md](contratos-api.md) | Endpoints consumidos, tipos, controlador y permiso del backend, manejo de errores |
| [pruebas-y-desarrollo.md](pruebas-y-desarrollo.md) | Entorno local, variables, scripts, Vitest, Playwright, e2e real, CI, checklist previa a PR |
| [../../CLAUDE.md](../../CLAUDE.md) | Reglas de trabajo para desarrolladores y asistentes de IA |

Documentación equivalente del backend: NOVEX_BACKEND → `docs/empalme/README.md`.

---

## 1. Arquitectura en breve

| Pieza | Ubicación |
|---|---|
| Arranque y providers | `src/main.tsx`, `src/app/App.tsx`, `src/app/providers.tsx` |
| Rutas | `src/app/router.tsx`: `/centro-operacional`, `/admin`, `/login`; el resto redirige |
| Experiencia por rol (cartas, personaje, paneles) | `src/modules/operational-cards/experience/` |
| Llamadas al backend del Centro Operacional | `src/modules/operational-cards/services/` |
| Clientes REST genéricos y tipos | `src/modules/api/`, `src/modules/situations/types/` |
| Cliente HTTP y URL base | `src/shared/api/http.ts` |
| Sesión, JWT y permisos de interfaz | `src/modules/auth/` |
| Guards de ruta | `src/shared/components/` |
| Gráficos del DIRECTOR (ECharts) | `src/modules/operational-cards/charts/` |
| Tutorial guiado | `src/modules/onboarding/` |
| Despliegue | `Dockerfile`, `nginx.conf`, `docker-entrypoint.sh`, `.github/workflows/deploy-frontend.yml`, `cloudbuild.frontend.yaml` |
| Pruebas | `src/**/*.test.ts(x)` (Vitest), `e2e/` (Playwright con mocks), `e2e-real/` (backend real) |

Flujo de una situación [V]:

| Paso | Endpoint |
|---|---|
| Alta idempotente | `POST /situations/register-with-analysis`, con `Idempotency-Key` |
| Avance OPEN → IN_PROGRESS | `PATCH /situations/:id` |
| Cierre con aprendizaje | `POST /situations/:id/resolution` |
| Afectaciones (solo INTERNAL) | `POST /situations/:id/consequences` |
| Estado de las cartas | `GET /operational-overview` |
| KPIs del DIRECTOR | `GET /operational-kpis/*` |

## 2. Producción conocida

| Dato | Estado |
|---|---|
| Commit en producción | `b726c47` [V]. Es `origin/main`; el deploy de Actions sobre él terminó bien el 2026-10-27; el `index.html` servido tiene `last-modified` 27-oct 14:49 GMT y `cache-control: no-cache`, cambio introducido en ese commit |
| Tutorial en producción | **No** [V]: sus textos no están en el bundle publicado |
| Revisión de Cloud Run con tráfico | [?] Requiere `gcloud` autenticado; no se pudo consultar |
| Configuración de Cloud Run (variables, instancias) | [?] |

## 3. Integración, ramas y worktrees

| Rama / ref | Commit | Estado |
|---|---|---|
| `origin/main` | `b726c47` | Producción [V] |
| `origin/integracion/cartas-circo` | `b726c47` | Igual a `main`; aún no recibe trabajo nuevo [V] |
| `origin/sync/casa-oficina-20261030` | `7a49148` | Tutorial: 3 commits sobre `b726c47` (`4b3cd80`, `cea1496`, `7a49148`). **No integrado** [V] |
| `main` local | `bb0e1d2` | **Desactualizada**: no usar como base [V] |
| `feat/admin-operational-cards-mvp` local | — | 2 commits por detrás de `origin` [V] |
| `origin/recovery/pre-circo-compatible-20261027`, `origin/release/circo-20261026`, `origin/backup/main-pre-circo-20261026`, `origin/Alejo-Rama` | — | Ramas de release, recuperación o personales; no son base de trabajo [V] |
| Tags | `novex-circo-prod-20261027` → `b726c47`; `novex-pre-circo-20261023` → `b20ffd3` | [V] |

- **Worktree:** uno solo, `C:\dev\novex\NOVEX_FRONTEND`, en `sync/casa-oficina-20261030` [V].
- **Pull requests:** #1, #2 y #3 fusionados el 2026-10-27; **ninguno abierto** [V].
- **Stash:** hay un `stash@{0}` del 2026-10-04 sin revisar [V].

### Trabajo local sin commit (no perder)

[V] Estado al 2026-11-06:

- **Modificados (8):**
  - `src/modules/onboarding/TourOverlay.tsx`
  - `src/modules/onboarding/engine/tourGeometry.ts` y su test
  - `src/modules/onboarding/tours/coordinatorPilot.ts`
  - `src/styles/tour-engine.css`
  - `e2e/coordinator-pilot-problems.spec.ts`, `e2e/coordinator-pilot-tour.spec.ts`, `e2e/coordinator-pilot.fixture.ts`
- **Sin seguimiento (4):** `e2e/coordinator-pilot-problems-step6.spec.ts` … `step9.spec.ts`.
- **Contenido:** ajuste de la hoja del tour en pantallas pequeñas (elige borde superior o inferior y altura máxima del 50 %), nuevos textos de los pasos 6 a 9, y el paso 9 apuntando a `[data-testid="action-panel-idle"]`.
- **Pruebas:** no se han ejecutado tras estos cambios en esta comprobación. `test-results/.last-run.json` dice `failed` sin indicar qué falló.

> Antes de cambiar de rama, hacer stash, rebase o limpiar, ese trabajo debe preservarse (commit en su rama o copia) **con autorización**.

## 4. Tutorial guiado

| Aspecto | Estado |
|---|---|
| Desplegado | **No** [V] |
| Motor propio | `src/modules/onboarding/engine/` (geometría, plan con filtro por permisos, predicados, progreso, textos), `TourOverlay.tsx`, `TourBubble.tsx`, `src/styles/tour-engine.css` [V] |
| Piloto del Coordinador | `src/modules/onboarding/tours/coordinatorPilot.ts`, 11 pasos [V] |
| Activación | Solo `import.meta.env.DEV` y rol COORDINADOR (`src/modules/operational-cards/experience/layouts/OperationalCenterMenu.tsx`). No hay variable `VITE_*` que lo active [V] |
| Tour general | Suspendido: `ONBOARDING_TOUR_SUSPENDED = true` (`src/modules/onboarding/OnboardingContext.tsx`). El `OnboardingProvider` sí está montado en producción (`src/shared/components/RootLayout.tsx` en `b726c47`), pero no arranca ningún tour [V] |
| Persistencia | `localStorage` `novex.onboarding.pilot.*` y `sessionStorage` `novex.pilot.invitation.v1.*`. No llama a `PATCH /users/me/onboarding` [V] |
| Otros roles | Sin tours para DIRECTOR, ANALISTA ni ADMIN [V] |

> **Advertencia:** no activar en producción sin validación funcional en los distintos tamaños de pantalla y autorización explícita.

## 5. Trabajo terminado y pendiente

**Terminado y en producción** [V]:
- Centro Operacional por rol.
- Ciclo reportar → avanzar → resolver con aprendizaje.
- Afectaciones.
- KPIs del DIRECTOR.
- Administración de usuarios en `/admin`.
- Alta idempotente.

**Pendiente:**
1. Preservar e integrar el trabajo del tutorial (commit, PR hacia integración y pruebas ejecutadas).
2. Decidir cómo y cuándo se activaría el tutorial fuera de DEV, y para qué roles.
3. Ejecutar los e2e en CI (hoy la CI solo hace lint, typecheck, tests unitarios y build) [V].
4. Retirar o aislar el código histórico no alcanzable [V].
5. Endpoints preparados pero sin uso: `/operational-kpis/breakdown`, `/operational-kpis/period`, `analysis/compare`, `impact-context`, `POST evidences` [V].

## 6. Riesgos conocidos

| Riesgo | Detalle |
|---|---|
| Push a `main` = despliegue automático | `.github/workflows/deploy-frontend.yml` [V] |
| Pérdida del trabajo del tutorial | Cambios solo en disco [V] |
| `main` local desactualizada | Base errónea para ramas nuevas [V] |
| JWT en `localStorage` y sin CSP en nginx | Exposición ante XSS (`src/modules/auth/utils/accessTokenStorage.ts`, `nginx.conf`) [V] |
| Expiración del JWT | No se comprueba en el cliente; se confía en el 401 [V] |
| Rol desconocido | `normalizeRoleCode` cae por defecto en COORDINADOR (`src/modules/auth/`) [V] |
| `/operational-events` | Existe cliente en `src/modules/operational-events/services/` y el provider está montado globalmente, pero ningún código montado invoca su carga; el backend no monta el controlador (`controllers: []`). Sin impacto en ejecución hoy; código muerto [V] |
| Compatibilidad con cambios de seguridad del backend | A1, A2 y M1 (ver el README de empalme del backend). A1 no afecta: el frontend no usa `/recommendations/:id` [V]. El efecto de A2 en un COORDINADOR sin coordinación no está probado de extremo a extremo [?] |

## 7. Documentos

| Documento | Estado |
|---|---|
| `CLAUDE.md` | Vigente (2026-11-06) |
| `docs/empalme/README.md` | Vigente (este archivo) |
| `README.md` | Anterior a Cartas y Circo; rutas desactualizadas. Ampliar |
| `DEPLOY_FRONTEND.md` | Última edición en agosto; revisar |
| `README_ESTADO_ACTUAL_NOVEX.md` | Duplicado del backend; cifras desactualizadas (tests, migraciones). Histórico hasta su consolidación |
| `src/modules/executive-operations-center/README.md` | Describe secciones retiradas. Histórico |
| `C:\dev\novex\deploy\RUNBOOK.md` y `C:\dev\novex\README_ESTADO_ACTUAL_NOVEX.md` (fuera del repo) | Obsoletos (septiembre) |

## 8. Repositorio complementario

- **Backend:** `NOVEX_BACKEND`, en `github.com/DesarrolloFabrica/NOVEX_BACKEND` y localmente en `C:\dev\novex\NOVEX_BACKEND`.
- Leer su `CLAUDE.md` y `docs/empalme/README.md`.
- La documentación de release, incidentes, backups y seguridad está en `NOVEX_BACKEND/docs/`.

### Cómo se referencia el otro repositorio

- **Documentación de empalme (`CLAUDE.md`, `docs/empalme/`):** al 2026-11-06 existe **solo en local**, sin commit (GitHub devuelve 404). Por eso se cita en texto plano («NOVEX_BACKEND → `docs/empalme/…`») y no con enlaces. Una vez publicada, se podrá enlazar por rama o commit.
- **Código publicado:** se puede consultar en GitHub fijando el commit. Todas estas URLs respondieron HTTP 200 el 2026-11-06:
  - Backend en producción: <https://github.com/DesarrolloFabrica/NOVEX_BACKEND/tree/5ffc65f>
  - Backend en integración (con A1): <https://github.com/DesarrolloFabrica/NOVEX_BACKEND/tree/72e24fe>
  - Este repo en producción: <https://github.com/DesarrolloFabrica/NOVEX_FRONTEND/tree/b726c47>
  - Rama del tutorial: <https://github.com/DesarrolloFabrica/NOVEX_FRONTEND/tree/7a49148>
- **Lo que no está en GitHub:** A2, M1, los cambios locales del tutorial y el seed local. No tienen URL.

## 9. Documentación pendiente (prioridad)

Cubierto en la Fase 2B (2026-11-06): arquitectura, roles, cartas y gráficas, tutorial, contratos de API y pruebas (ver [Mapa de documentos](#mapa-de-documentos)).

Pendiente:
1. Documento general de empalme común a ambos repos (en espera de aprobación).
2. ~~Corregir D1 y D2 en `CLAUDE.md`~~: hecho en la Fase 2C (2026-11-06).
3. Actualizar `README.md` y `DEPLOY_FRONTEND.md`; consolidar `README_ESTADO_ACTUAL_NOVEX.md` (fase posterior, con autorización).
4. Documentar el aspecto visual real (capturas) y las propiedades del archivo `.riv` verificadas abriendo el archivo, no solo por comentarios del código.

## 10. Discrepancias (revisadas en la Fase 2C, 2026-11-06)

Hay dos tipos de estado:

- **Resuelta (doc.):** el error estaba en la documentación de empalme y se corrigió.
- **Abierta:** el desajuste está en el código o la configuración. Esta fase no modifica código, así que se mantiene documentada para una decisión posterior.

No se modificó documentación histórica fuera de `CLAUDE.md` y `docs/empalme/`.

| Id | Documento afectado | Descripción | Evidencia [V] | Impacto para el empalme | Estado y acción |
|---|---|---|---|---|---|
| D1 | `CLAUDE.md` §8 | Proponía lanzar e2e-real con `npx playwright test -c playwright.e2e-real.config.ts` | `e2e-real/run.mjs` L1-5 y L109-113: fija las variables, no lee `.env`, migra la base desechable, compila el backend y lanza Playwright | Riesgo de levantar el backend contra una base no desechable | **Resuelta (doc.).** `CLAUDE.md` §8 indica ahora `node e2e-real/run.mjs` y sus efectos; [pruebas-y-desarrollo.md](pruebas-y-desarrollo.md) actualizado |
| D2 | `CLAUDE.md` §1 | Hablaba de «las 15 coordinaciones» como cartas | Backend `coordinations.catalog.seed.ts` (15 códigos); `public/CoordCards/` (15 imágenes); `src/modules/operational-cards/data/productHierarchy.ts` L68-148 (9 mazos) | Confusión entre catálogo y presentación | **Resuelta (doc.).** `CLAUDE.md` §1 distingue 15 entradas y 9 mazos |
| D3 | Código: `src/modules/auth/services/auth-session.service.ts` L102 | La UI toma los permisos de los claims del JWT, mientras el backend los recarga de la BD en cada petición | Backend `AuthorizationEnrichmentGuard` y `RbacService` | Tras un cambio de rol, la UI puede mostrar controles desfasados hasta el siguiente login. El servidor sigue siendo la autoridad | **Abierta (código).** Documentada en [roles-y-navegacion.md](roles-y-navegacion.md) |
| D4 | Código: `src/modules/operational-cards/domain/integrity-policy.ts` | Replica en el frontend los umbrales de integridad del backend, solo para redactar explicaciones | Backend `src/operational-overview/domain/coordination-integrity.ts` | Si cambia la política del backend, el texto queda desfasado | **Abierta (deuda).** [cartas-y-graficas.md](cartas-y-graficas.md) |
| D5 | Comentario en `src/modules/executive-operations-center/constants/routes.ts` L28-29 | Dice que el COORDINADOR «es el único rol que puede SOLUCIONAR» | Backend `canResolveSituation`: el ANALISTA resuelve si la responsable es `coord-general` | Puede inducir a error a quien lea el código | **Abierta (comentario de código).** La documentación de empalme describe la regla real |
| D6 | Pista `canUpdate` del backend (O4) | No aplica el alcance de coordinación | Backend `operational-scope.service.ts` L404-412 | La UI puede ofrecer editar y el `PATCH` devolver 404 | **Abierta (código backend).** NOVEX_BACKEND → `docs/empalme/seguridad-y-correcciones.md` §6.1 |
| D7 | Código: `components/ProblemDetail.tsx` L70, `data/coordinationProblemFilters.ts` L53, `components/ProblemActions.tsx` L157 | `IN_PROGRESS` se rotula «En revisión» en el detalle y los filtros, y «En atención» en la acción de avance | Rutas citadas | Inconsistencia de lenguaje para el usuario y en la formación | **Abierta (UX).** [cartas-y-graficas.md](cartas-y-graficas.md) |
| D8 | Código: `src/modules/auth/utils/roleExperience.ts` | `getEffectiveDashboardRole` solo lo usan páginas legadas | Consumidores: `operational-events/components/OperationalIntelligenceDashboard.tsx` y `pages/OperationalIntelligencePage.tsx`, ambos no montados | La vista previa de rol del ADMIN no existe en producción | **Cerrada en la documentación** (descrita como no disponible); es código muerto |
| D9 | Código del tutorial | Tres problemas: `readPilotProgress` no se usa (el piloto arranca siempre en el paso 1, `CoordinatorPilotTour.tsx` L20); la prueba «las anclas existen» se satisface con los propios selectores; el tour general apunta a `data-tour="report-problem"`, que no existe (`onboardingTourSteps.ts` L180) | Rutas citadas | Afecta a la reanudación del piloto y a la fiabilidad de sus pruebas | **Abierta (código).** [tutorial-guiado.md](tutorial-guiado.md) |
| D10 | `.github/workflows/deploy-frontend.yml` | La CI solo se dispara con push a `main` o `workflow_dispatch`; no corre en PR | `on:` del workflow | No hay validación automática antes de fusionar | **Abierta (infraestructura).** Advertida en `CLAUDE.md` §8 |
| D11 | `cloudbuild.frontend.yaml` L82-84 | Pasa `VITE_APP_NAME` y `VITE_APP_ENV`, pero ningún código de `src` los lee | `grep` en `src` sin resultados | Ninguno funcional; ruido de configuración | **Abierta (configuración).** [pruebas-y-desarrollo.md](pruebas-y-desarrollo.md) |
| D12 | Este README, §6 (Fase 2A) | Decía que `/operational-events` «solo se carga desde secciones retiradas» | Ningún código montado llama a su carga; en el backend el módulo tiene `controllers: []` | Ninguno | **Resuelta (doc.)** en la Fase 2B |
| D13 | Este README, §4 (Fase 2A) | No mencionaba que `OnboardingProvider` está montado en producción | `src/shared/components/RootLayout.tsx` en `b726c47` | Ninguno funcional | **Resuelta (doc.)** en la Fase 2B; añadido también a `CLAUDE.md` §9 en la Fase 2C |
