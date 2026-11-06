# CLAUDE.md — NOVEX_BACKEND

Instrucciones para asistentes de IA y desarrolladores que continúen este repositorio.
Índice de continuidad: [`docs/empalme/README.md`](docs/empalme/README.md).
Última comprobación: **2026-11-06**.

## 1. Qué es NOVEX y qué cubre este repo

NOVEX es la plataforma interna de inteligencia operacional de la Dirección de Operaciones de la CUN. Su ciclo es reportar problemas de las 15 coordinaciones, seguirlos y solucionarlos dejando un aprendizaje. La interfaz es de **cartas** y un **personaje** ("Cartas y Circo").

Este repositorio es la **API** (NestJS), el modelo de datos (PostgreSQL, Cloud SQL), el RBAC y el análisis con Gemini. La SPA vive en el repo complementario `NOVEX_FRONTEND` (`github.com/DesarrolloFabrica/NOVEX_FRONTEND`; local `C:\dev\novex\NOVEX_FRONTEND`).

## 2. Tecnología y arquitectura

- **Stack:** NestJS 11, TypeORM, PostgreSQL, Jest, Google OAuth y JWT, Gemini (`@google/genai`).
- **Versiones de PostgreSQL:**
  - Local: imagen `postgres:${POSTGRES_VERSION:-17}-alpine` de `docker-compose.yml`.
  - Cloud SQL: la documentación histórica indica PostgreSQL 16, pero **la configuración real no está verificada**.
- **Prefijo y salud:** todas las rutas cuelgan de `api/v1`. `/health` y `/health/ready` se atienden fuera de Nest (`src/health/probe-health.ts`).
- **Guards globales** (`src/app.module.ts`), en este orden:
  1. `JwtAuthGuard`;
  2. `AuthorizationEnrichmentGuard`, que recarga en cada petición rol, permisos y coordinación desde la base (`src/rbac/rbac.service.ts`);
  3. `ThrottlerGuard`.
- **Permisos:**
  - `@RequirePermissions` más `PermissionsGuard` (`src/auth/guards/permissions.guard.ts`).
  - Catálogo en `src/permissions/seeds/permissions.catalog.seed.ts`.
  - En producción los cambios de permisos llegan **por migraciones**, no por el seed.
- **Alcance:**
  - `src/auth/services/operational-scope.service.ts`.
  - `src/situations/situation-access.service.ts`: `requireAccessibleSituation` comprueba el alcance de lectura; `requireOperableSituation`, el de escritura.
- **Situaciones** (`src/situations/`):
  - Tipos INTERNAL e INTER_COORDINATION. `coordinationId` es siempre la coordinación **responsable**.
  - Ciclo OPEN → IN_PROGRESS → CLOSED. El cierre solo es posible vía `POST /situations/:id/resolution`.
  - SLA en `situation-sla.policy.ts` y barrido en `sweep/`.
- **Integridad y vidas del personaje:** `src/operational-overview/domain/`. Se calculan al leer; no se persisten.
- **KPIs:** `src/operational-kpis/`.
- **IA:** `src/ai-orchestration/` (proveedor Gemini, alta idempotente, análisis) y `src/ai-prompt-engine/`.
- **Código sin rutas montadas (histórico):** `intelligence`, `operational-events`, `operational-areas`, `recommended-actions`, `demo-users`.
- **Migraciones:**
  - 26 archivos en `src/database/migrations/`.
  - `synchronize: false` y `migrationsRun: false` (`src/configuration/database.config.ts`, `src/database/data-source.ts`).
  - Se aplican **solo a mano**.

## 3. Documentación

| Documento | Uso |
|---|---|
| [`docs/empalme/README.md`](docs/empalme/README.md) | Estado, ramas, worktrees, riesgos, pendientes y discrepancias (empezar aquí) |
| `docs/empalme/*.md` | Documentación técnica: [arquitectura](docs/empalme/arquitectura.md), [situaciones](docs/empalme/situaciones-y-reglas.md), [autenticación y permisos](docs/empalme/autenticacion-y-permisos.md), [BD y migraciones](docs/empalme/base-de-datos-y-migraciones.md), [seguridad](docs/empalme/seguridad-y-correcciones.md), [IA](docs/empalme/inteligencia-artificial.md), [despliegue](docs/empalme/despliegue-y-operacion.md), [pruebas](docs/empalme/pruebas-y-desarrollo.md) |
| `docs/INTERNAL_VIVO.md` | Modelo de dominio vigente de INTERNAL (afectaciones, severidad efectiva) |
| `DEPLOY_BACKEND.md` | Guía de Cloud Run |
| `docs/RELEASE_CIRCO.md` | Publicación de Cartas y Circo, recuperación y compatibilidad (no registra el cierre final) |
| `docs/INCIDENTE-20261023-MIGRACIONES.md` | Postmortem: migraciones no aplicadas en producción |
| `docs/RESTORE-TEST.md`, `docs/BACKUP-DR.md` | Backups. **Se contradicen** sobre si hubo un restore real |
| `docs/SECURITY.md`, `docs/SECRETS-AND-VARS.md` | Postura de GCP y secretos (sin la Fase 0) |
| `README.md`, `README_ESTADO_ACTUAL_NOVEX.md` | Anteriores a Cartas y Circo o con cifras desactualizadas. No usar como fuente de verdad |
| `docs/AUDITORIA_*`, `docs/CLOSURE_*`, `docs/FINAL_TECHNICAL_CLOSURE.md` | Históricos (agosto) |

## 4. Ramas de referencia (verificado 2026-11-06 con `git ls-remote`)

| Referencia | Commit | Significado |
|---|---|---|
| `origin/main` | `5ffc65f` | Versión publicada. El deploy de Actions del 27-oct sobre este commit terminó bien |
| tag `novex-circo-prod-20261027` | → `5ffc65f` | Marca de la versión en producción |
| `origin/integracion/cartas-circo` | `72e24fe` | `5ffc65f` + fusión de A1 (PR #2). **No está en producción** |
| `origin/seguridad/a1-recomendaciones` | `ce8c5ad` | Commit de A1 |
| tag `novex-pre-circo-20261023` | → `49a6483` | Versión anterior a Cartas y Circo |

- **`main` local apunta a `49a6483`, la versión anterior a Cartas y Circo, 32 commits por detrás.** No la uses nunca como base.
- **La rama local `integracion/cartas-circo` sigue en `5ffc65f`.** Las ramas nuevas se crean desde `origin/integracion/cartas-circo`.

## 5. Reglas obligatorias

- Nunca asumir que `main` local está actualizada. Comprobar con `git ls-remote origin` o `git log origin/main`.
- Nunca hacer push a `main` sin autorización. **Un push a `main` despliega producción automáticamente** (`.github/workflows/deploy-backend.yml`), y **ese despliegue no aplica migraciones**.
- Nunca ejecutar despliegues (`gcloud builds submit`, `gcloud run …`, `workflow_dispatch`) sin autorización.
- Nunca ejecutar migraciones (`migration:run`, `migration:revert`), seeds ni escrituras contra producción o Cloud SQL sin autorización. Tampoco `cloud:proxy`, `cloud:sql`, `cloud:psql`, `cloud:user:*` ni `sync:users:cloud*` sin autorización.
  - `migration:*` y las suites e2e eligen la base con `DB_CLOUD` y los bloques `DB_*_LOCAL` / `DB_*_CLOUD` del `.env`, sin ninguna guarda contra la nube. Antes de nada, confirma a qué base apuntan.
  - `seed:rbac` y `seed:qa-internal-vivo` tampoco tienen la guarda de perfil local.
- Nunca descartar cambios locales (`checkout -- `, `reset --hard`, `clean`, `stash drop`, `restore`) sin autorización. Aplica a todos los worktrees.
- Nunca borrar worktrees sin revisar los enlaces de `node_modules`:
  - En `_a1`, `_int`, `_sec` y `_m1`, `node_modules` es un **junction** hacia `NOVEX_BACKEND\node_modules`.
  - Antes de cualquier `git worktree remove`, quita solo el enlace con `rmdir` (y con autorización); si no, se borra el `node_modules` principal.
- Nunca confundir una rama publicada con producción. `integracion/cartas-circo` **no** es producción.
- Nunca considerar la documentación histórica más fiable que el código actual. Ante una contradicción, manda el código; repórtala.
- Nunca afirmar que una prueba pasa si no se ejecutó en esta sesión. Indica «no ejecutada».
- Nunca incluir credenciales, secretos, tokens, contenido de `.env` ni datos personales en documentación, commits o informes. Solo nombres de variables. Esto incluye los usuarios de `src/database/seeds/`.
- No editar el código de A1, A2 o M1 sin una fase aprobada para ello.
- Trabajar por fases: cada fase necesita aprobación explícita, y la aprobación de una fase no cubre la siguiente.

## 6. Producción, base de datos y despliegue

- **No tienes acceso a producción por defecto.** Sin `gcloud` autenticado, el estado de Cloud Run y Cloud SQL es «no verificado».
- **Comprobación de solo lectura permitida:** `GET /health` y `GET /health/ready` en el servicio público.
- **Pipelines:** GitHub Actions (push a `main` o `workflow_dispatch`) y `cloudbuild.backend.yaml` (manual). Ninguno corre en PR ni aplica migraciones.
- **Consultas SQL:** solo con `scripts/run-readonly-sql.mjs` (`default_transaction_read_only=on`) y solo con autorización.
- **Variables:** solo nombres, en `src/configuration/env.validation.ts` y `.env.example`. Los secretos están en Secret Manager: `DB_PASSWORD`, `JWT_SECRET`, `GEMINI_API_KEY`.

## 7. Antes de implementar

1. Lee `docs/empalme/README.md`. Confirma worktree, rama y HEAD (`git worktree list`, `git status`, `git ls-remote origin`).
2. Para reglas de acceso, lee **ambos** servicios de alcance (§2) y la ruta concreta del controlador. Un permiso de `@RequirePermissions` no implica alcance.
3. Si cambias un contrato, revisa a quién afecta en `NOVEX_FRONTEND` (servicios en `src/modules/operational-cards/services/` y `src/modules/api/`).
4. Si cambias el esquema, la migración debe ser aditiva, idempotente y con `down()`. Documenta el orden: primero aplicar la migración, después desplegar.
5. Propón el cambio, con archivos, riesgos, pruebas e impacto en producción, y **espera aprobación** antes de editar.

## 8. Validación

| Comando | Qué hace | Nota |
|---|---|---|
| `npx eslint "{src,test}/**/*.ts"` | ESLint **sin** modificar archivos | Solo lectura. Es lo que conviene usar para validar |
| `npm run lint` | `eslint … --fix`: **modifica archivos** de `src/` y `test/` | Revisa el diff que deja antes de cualquier commit. Así se ejecuta también en la CI |
| `npm test` | Jest sobre `src` y `test` (incluye `test/security`) | Los `*.pg.spec.ts` se omiten salvo `NOVEX_PG_IT=1` |
| `npm run test:security` | `test/security/` | |
| `npm run test:cov` | Cobertura | Escribe en `../coverage`, **fuera del repo**: `coverageDirectory` relativo a la raíz |
| `npm run test:e2e` | `test/jest-e2e.json`: Nest completo con IA simulada | Algunas suites **crean y borran datos**: base aislada obligatoria |
| `npx jest -c test/jest-integration.json` | Integración (sin script npm) | Exige `TEST_DB_*`, con un nombre de base que contenga `test`; ejecuta migraciones en esa base |
| `npm run build` | Compilación | Escribe en `dist/` |

- Los specs con PostgreSQL real necesitan una **base efímera local** con migraciones aplicadas y todas las `DB_*` definidas. Sin ellas, la configuración cae en `localhost:5432/novex`.
- La CI ejecuta `npm ci`, lint (con `--fix`), `npm test`, `test:security` y build. **No corre en PR**.
- Procedimiento completo en [pruebas-y-desarrollo.md](docs/empalme/pruebas-y-desarrollo.md).
- Informa qué se ejecutó, el resultado literal y qué no.

## 9. Código funcional, histórico y experimental

- **Funcional:** módulos con controladores registrados en su `*.module.ts` e importados en `src/app.module.ts`.
- **Histórico:**
  - módulos sin rutas montadas (§2);
  - el SDK `@google/generative-ai` (`src/intelligence/gemini/`);
  - el estado `RESOLVED`;
  - los shims de compatibilidad con el frontend anterior: `createLegacyContract` en `situations.service.ts` y la migración `1788100000000-LegacySituationInsertCompatibility`.
  - No retirar los shims sin decisión (ver `docs/RELEASE_CIRCO.md` §9).
- **Experimental o pendiente:**
  - Correcciones de seguridad A2 y M1, sin commit en los worktrees `_sec` y `_m1`.
  - Políticas de escalamiento de severidad: hay infraestructura pero ninguna política activa (`src/situations/severity-escalation/severity-escalation.policy.ts`).
- **No existe ningún asistente de IA conversacional.** La única IA es el análisis con Gemini.

## 10. Cómo informar

- Responde en español.
- Separa **verificado** (archivo:línea, commit o salida de comando), **histórico** (documento o nota) y **no verificado**.
- En seguridad, distingue «verificado en código» de «verificado con prueba de explotación».
- Para cada hallazgo: qué ocurre, dónde, roles afectados, impacto, cómo comprobarlo, y propuesta. Sin aplicarla.
- Al cerrar una tarea: archivos tocados, `git status` antes y después (de cada worktree afectado), pruebas ejecutadas y no ejecutadas, y riesgos abiertos.
