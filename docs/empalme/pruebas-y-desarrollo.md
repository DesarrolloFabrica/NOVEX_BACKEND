# Pruebas y desarrollo

> **Propósito:** explicar qué suites de prueba existen, qué ejecuta cada script, qué requiere base de datos, qué puede tocar la nube y cómo validar un cambio antes de abrir un PR.
> **Revisión:** 2026-11-06 · **Código de referencia:** NOVEX_BACKEND `5ffc65f` (producción = origin/main)
> **Leyenda:** [V] verificado en código · [H] histórico/documental · [?] no verificado · [I] inferido

> **Importante:** para redactar este documento **no se ejecutó ninguna prueba** (ni `npm test`, ni lint, ni build, ni migraciones). No se afirma que ninguna suite pase. Las referencias a resultados anteriores son [H].

---

## 1. Entorno requerido

| Elemento | Valor | Fuente |
|---|---|---|
| Node.js | 20 | `Dockerfile` (`FROM node:20-alpine`, l. 6 y 21); CI `node-version: '20'` (`.github/workflows/deploy-backend.yml` l. 46) [V] |
| Instalación | `npm ci` | CI l. 50 [V] |
| PostgreSQL local | `postgres:${POSTGRES_VERSION:-17}-alpine` | `docker-compose.yml` l. 9 [V]. Cloud SQL: la documentación histórica indica PostgreSQL 16 ([RELEASE_CIRCO](../RELEASE_CIRCO.md) §0, [RESTORE-TEST](../RESTORE-TEST.md)) [H]; configuración real no verificada [?] |
| Jest | `ts-jest`, entorno `node` | `package.json` → `jest` [V] |
| Variables | Solo nombres en `src/configuration/env.validation.ts` y `.env.example`. **Nunca** imprimir ni copiar `.env` | [V] |

Variables relevantes para pruebas (solo nombres):

- Base de la aplicación: `DB_CLOUD`, `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `DB_SSL` y sus variantes `*_LOCAL` / `*_CLOUD` (`src/configuration/resolve-database-env.ts`).
- Suites `*.pg.spec.ts`: `NOVEX_PG_IT=1` y `DB_*_LOCAL` o `DB_*`.
- Integración y seed E2E: `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER`, `TEST_DB_PASSWORD`, `TEST_DB_NAME`.
- Stub de Gemini: `GEMINI_STUB_PORT`, `GEMINI_BASE_URL`; cupo `GEMINI_THROTTLE_LIMIT` (ambas ignoradas en producción, ver [inteligencia-artificial.md](inteligencia-artificial.md)).

### 1.1 Cómo se resuelve la base (trampa frecuente)

`resolveDatabaseEnv` (`src/configuration/resolve-database-env.ts` l. 33–76) [V]:

- `DB_CLOUD=true` → perfil `cloud`; en otro caso `local`.
- Cada valor se toma en este orden: `DB_X_<PERFIL>` → (en cloud `CLOUD_DB_X`) → `DB_X`.
- En perfil local, lo que falte cae en `localhost:5432`, usuario/clave/base `novex`.
- `src/database/data-source.ts` (CLI de TypeORM, migraciones y seeds) carga `.env` con `override: false` (l. 10–14): **las variables del proceso ganan**, pero una `DB_HOST_LOCAL` definida en `.env` gana a una `DB_HOST` del proceso porque tiene prioridad en `pick`. Para apuntar a una base efímera hay que fijar explícitamente `DB_CLOUD=false` **y** las variantes `DB_*_LOCAL` [V por lectura; I en su efecto].
- La aplicación Nest carga `.env.local` y `.env` (`src/configuration/configuration.module.ts` l. 16) [V].

---

## 2. Scripts de `package.json`

### 2.1 Solo lectura / sin efectos fuera del proceso

| Script | Qué hace |
|---|---|
| `npm test` | `jest` con la config de `package.json` (ver §3) |
| `npm run test:security` | `jest --testPathPatterns=test/security` |
| `npm run test:watch` / `test:debug` | Jest en modo observación / depuración |
| `npm run start`, `start:dev`, `start:debug` | Arranca Nest con la BD que indique `.env` (puede ser **nube** si `DB_CLOUD=true`) — revisar antes |

### 2.2 Escriben archivos locales

| Script | Qué escribe |
|---|---|
| `npm run lint` | **`eslint ... --fix`: modifica archivos** de `src/` y `test/` [V] |
| `npm run format` | `prettier --write` sobre `src/**/*.ts` y `test/**/*.ts` |
| `npm run build` | `dist/` |
| `npm run test:cov` | Cobertura en `coverageDirectory: "../coverage"`, relativo a la raíz del repo → **fuera del repo** (`C:\dev\novex\coverage`). La configuración Jest de `package.json` no define `rootDir`, así que vale la carpeta del repo [V en config; no ejecutado] |
| `npm run migration:create` / `migration:generate` | Nuevos archivos en `src/database/migrations/` (`generate` además **lee** la BD configurada) |

### 2.3 Tocan base de datos o nube — **requieren autorización explícita**

| Script | Riesgo |
|---|---|
| `migration:run`, `migration:revert`, `migration:show` | Actúan sobre la BD resuelta por `data-source.ts`. **Sin guarda contra nube**: con `DB_CLOUD=true` irían a Cloud SQL [V] |
| `seed:operaciones`, `seed:situations:mock`, `seed:situations:clear`, `seed:qa-director-h2(:clean)` | Escriben en la BD. Llaman a `assertLocalDatabaseProfile`, que aborta en perfil cloud salvo `ALLOW_CLOUD_SEED=true` (`resolve-database-env.ts` l. 119–126) [V] |
| `seed:rbac`, `seed:qa-internal-vivo(:clean)` | Escriben en la BD. **No** se encontró `assertLocalDatabaseProfile` en sus runners (`run-seed-rbac.ts`, `run-seed-qa-internal-vivo.ts`, `seed-qa-internal-vivo.ts`) [V por búsqueda] |
| `cloud:sql`, `cloud:user:upsert`, `cloud:user:upsert:gcloud` | Operan sobre Cloud SQL |
| `sync:users:cloud`, `sync:users:cloud:run` | Leen de la nube y escriben usuarios |
| `cloud:proxy`, `cloud:psql` | Proxy y consola contra Cloud SQL (`novex-db`) |
| `start:dev:cloud`, `start:dev:cloud:direct` | Arrancan la API contra Cloud SQL (vía proxy / directo) |
| `docker:up`, `docker:down`, `docker:restart`, `docker:logs`, `docker:ps` | Contenedores locales `novex-postgres` y `novex-pgadmin` con volumen persistente; usan valores de `.env` para la sustitución de variables [I] |
| `docker:down:volumes` | **Borra** el volumen de datos local |

Regla del equipo: nada de migraciones, seeds ni acceso a nube/producción sin aprobación explícita ([CLAUDE.md](../../CLAUDE.md)) [H].

---

## 3. Configuración de Jest

`package.json` → `jest` [V]:

- `roots: ["<rootDir>/src", "<rootDir>/test"]`, `testRegex: ".*\\.spec\\.ts$"`.
- Por tanto `npm test` ejecuta **también** `test/security/`, `test/audit/`, `test/observability/` y `test/e2e-support/valid-analysis.spec.ts`.
- **No** coincide con `*.e2e-spec.ts` ni `*.int-spec.ts` (llevan `-spec`, no `.spec`).
- En CI, `test:security` vuelve a ejecutar lo que `npm test` ya incluyó [I].

| Configuración | Script | Patrón | Notas |
|---|---|---|---|
| `package.json` | `test`, `test:security`, `test:cov` | `.spec.ts` en `src/` y `test/` | |
| `test/jest-e2e.json` | `test:e2e` | `.e2e-spec.ts` en `test/` | |
| `test/jest-integration.json` | **ninguno** | `.int-spec.ts` en `test/integration/` | `testTimeout: 120000`, `maxWorkers: 1`. Se invoca con `npx jest -c test/jest-integration.json` |

---

## 4. Suites

### 4.1 Unitarias (`src/**/*.spec.ts`)

- **63** archivos `*.spec.ts` en `src/` [V por conteo], de los que 5 son `*.pg.spec.ts` (§4.3).
- Usan dobles de repositorios/servicios, sin BD real [I por muestreo].
- IA: `gemini.provider.spec.ts`, `ai-orchestrator.service.spec.ts`, `ai-orchestrator.idempotency.spec.ts`, `ai-orchestrator.persistence.spec.ts`, `ai-analysis.mapper.spec.ts`.
- Alcance/RBAC: `src/auth/services/operational-scope.*.spec.ts`, `src/auth/guards/role-situation-capabilities.spec.ts`.

### 4.2 Seguridad (`test/security/`)

Siete archivos en `5ffc65f` [V]:

| Archivo | Tema (por nombre) |
|---|---|
| `p0-authorization.spec.ts` | Cierre P0: superficie legada y rutas retiradas |
| `phase2-global-auth.spec.ts` | Guard global de autenticación |
| `phase2-helmet.spec.ts` | Cabeceras Helmet |
| `phase2-rate-limit.spec.ts` | Throttler |
| `phase3-authorization-e2e.spec.ts` | Autorización por ruta |
| `phase3-authorization-stale-jwt.spec.ts` | JWT con permisos obsoletos |
| `phase3-pagination.spec.ts` | Paginación |

Ninguno abre una conexión real a BD; `p0-authorization.spec.ts` fija `DB_HOST=127.0.0.1` en el proceso (l. 36) [V].

**Pruebas nuevas fuera de `5ffc65f`** (sin commit, solo en disco) [V]:

- `NOVEX_BACKEND_sec`: `a1-recommendations-scope.spec.ts`, `a2-situations-list-scope.spec.ts`, `a2-situations-list-scope.pg.spec.ts`, `support/`.
- `NOVEX_BACKEND_m1`: `m1-situation-writes-scope.spec.ts`.

Detalle en [seguridad-y-correcciones.md](seguridad-y-correcciones.md).

### 4.3 Integración con PostgreSQL (`*.pg.spec.ts`)

Archivos [V]:

- `src/operational-kpis/operational-kpi-aging.pg.spec.ts`
- `src/operational-kpis/operational-kpi-internal-problems.pg.spec.ts`
- `src/operational-kpis/operational-kpi-learnings.pg.spec.ts`
- `src/operational-kpis/operational-kpi-resolution.pg.spec.ts`
- `src/situations/internal-vivo.pg.spec.ts`

Cómo funcionan [V]:

- `const suite = process.env.NOVEX_PG_IT === '1' ? describe : describe.skip` → sin la variable se **omiten** (también en CI).
- Cargan `.env` con `override: false` y conectan con `DB_*_LOCAL ?? DB_*`.
- Abortan si `DB_CLOUD=true` («Esta suite solo corre contra la BD local.»).
- Los de KPIs trabajan dentro de una transacción por prueba; `internal-vivo` inserta fixtures `it-vivo-*`, las borra al final y **ejecuta el barrido sobre toda la base** (comentario l. 41–43).
- Necesitan el esquema completo: **base efímera con todas las migraciones aplicadas** [I: no crean el esquema].

Procedimiento recomendado [I] (requiere autorización, porque ejecuta migraciones):

1. Contenedor PostgreSQL desechable **distinto** de `novex-postgres`, en un puerto local libre (p. ej. `docker run --rm` de `postgres:17-alpine` publicado en `127.0.0.1:<puerto>`), con una base cuyo nombre contenga `test`.
2. En la misma sesión de shell: `DB_CLOUD=false` y **todas** las `DB_HOST_LOCAL`, `DB_PORT_LOCAL`, `DB_USERNAME_LOCAL`, `DB_PASSWORD_LOCAL`, `DB_DATABASE_LOCAL`, `DB_SSL_LOCAL=false` apuntando a ese contenedor (§1.1).
3. `npm run migration:run` **solo contra esa base**; confirmar antes con `migration:show` que la conexión es la del contenedor.
4. `NOVEX_PG_IT=1 npx jest <archivo>.pg.spec.ts`.
5. Destruir el contenedor.

**Nunca** apuntar estas suites ni `migration:run` a Cloud SQL ni a la base local habitual con datos.

### 4.4 E2E (`test/*.e2e-spec.ts`, `npm run test:e2e`)

| Archivo | Qué requiere |
|---|---|
| `app.e2e-spec.ts` | Contiene un `it.skip` que «requiere DB» (l. 31) [V] |
| `phase2-http.e2e-spec.ts` | `AppModule` completo con `GeminiProvider` sustituido por un doble; «REQUIERE `DB_*` apuntando a una base aislada… crea, cierra y borra datos» (l. 18–25) [V] |
| `phase21-concurrency.e2e-spec.ts` | Igual: Nest real + doble de IA + BD aislada [V] |

- Estas suites levantan `AppModule`, que carga `.env`; **no tienen guarda programática contra `DB_CLOUD=true`** [V por búsqueda]. Fijar las variables de la base efímera en el proceso antes de ejecutarlas.
- Gemini: se sustituye con `overrideProvider(GeminiProvider)`; no salen a la red [V].
- Existe además un **stub HTTP** de Gemini, `test/e2e-support/gemini-stub.ts` (escucha en `127.0.0.1`, puerto `GEMINI_STUB_PORT`, defecto 4010; controles `POST /__control` y `GET /__calls`) [V]. Se usa con `GEMINI_BASE_URL` fuera de producción; `docs/RELEASE_CIRCO.md` describe su uso en una validación de compatibilidad [H].
- `test/e2e-support/seed-e2e-database.ts` siembra una base E2E con `TEST_DB_*`, no carga `.env` y exige que `TEST_DB_NAME` contenga `test` (l. 5, 44–48) [V].
- `test/isolated-server.ts`: servidor Nest completo con doble de IA para validación manual/navegador contra una BD desechable (`DB_PORT_LOCAL=... PORT=3999 ts-node test/isolated-server.ts`) [V].

### 4.5 Integración sin script (`test/integration/*.int-spec.ts`)

- Un archivo: `registration-idempotency.int-spec.ts` (idempotencia del alta, reclamo de análisis, evidencias, cierre, migraciones) [V].
- No carga `.env`; exige `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER`, `TEST_DB_PASSWORD`, `TEST_DB_NAME`, y que `TEST_DB_NAME` contenga `test` (l. 9–10, 53–67) [V].
- **Ejecuta `runMigrations()` por sí mismo** sobre esa base (l. 262–272, 924) [V].
- Comando: `npx jest -c test/jest-integration.json` (no hay script npm) [V].

---

## 5. Qué ejecuta la CI

`.github/workflows/deploy-backend.yml`, disparado por push a `main` o `workflow_dispatch` (l. 16–23) [V]:

1. `npm ci`
2. `npm run lint` (con `--fix`: en CI corrige en el workspace y solo falla por errores no autocorregibles [I])
3. `npm test -- --passWithNoTests`
4. `npm run test:security`
5. `npm run build`

Luego construye y despliega a Cloud Run (ver [despliegue-y-operacion.md](despliegue-y-operacion.md)). **Un push a `main` despliega a producción.**

**No ejecuta:** `*.pg.spec.ts` (omitidas sin `NOVEX_PG_IT`), `test:e2e`, `*.int-spec.ts`, migraciones, ni nada contra PostgreSQL real [V].

---

## 6. Validación antes de un PR

1. Confirmar worktree, rama y HEAD (`git status`, `git worktree list`) y que la rama parte de `origin/main` o de la rama de integración acordada ([README.md](README.md)).
2. `npm run lint` — **revisar el diff que deja `--fix`** antes de commitear.
3. `npm test` y `npm run test:security`.
4. `npm run build`.
5. Si el cambio toca SQL de KPIs, alcance de listados, alta/análisis o migraciones: ejecutar las suites `*.pg.spec.ts`, la de integración y/o las E2E relevantes **contra una base efímera** (§4.3–4.5), con autorización.
6. Si cambia un contrato HTTP: revisar NOVEX_FRONTEND → `docs/empalme/contratos-api.md`.
7. Informar qué se ejecutó, el resultado literal y qué **no** se ejecutó ([CLAUDE.md](../../CLAUDE.md) §8).

---

## 7. Cobertura y limitaciones

- No hay umbral de cobertura configurado (`coverageThreshold` ausente) y la CI no ejecuta `test:cov` [V].
- La lógica SQL real (KPIs, barrido SLA, reclamo de análisis, índice de idempotencia) solo se prueba en suites que la CI **no** ejecuta [V].
- No hay pruebas contra la API real de Gemini; solo dobles y stub [V].
- `seed:rbac` y `seed:qa-internal-vivo` carecen de la guarda de nube (§2.3) [V por búsqueda].
- Que las pruebas de A2 y M1 pasan consta solo en notas del 2026-11-05 [H]; no se reejecutaron.

## Límites de verificación

- **No se ejecutó ninguna prueba, lint, build, migración ni comando de Docker** para este documento.
- Los conteos (63 specs en `src/`, 7 en `test/security/`, 3 E2E, 1 de integración) son de `find` sobre `5ffc65f`.
- La clasificación «sin BD real» de las unitarias es por muestreo, no exhaustiva.
- `coverageDirectory` se dedujo de la configuración, sin ejecutar `test:cov`. Que `--fix` en la CI corrija en el workspace del runner, sin afectar al commit, es una inferencia [I].
- No se verificó la versión de PostgreSQL de Cloud SQL ni la de Node en Cloud Run más allá del `Dockerfile`.

## Documentos relacionados

- [README.md](README.md) · [arquitectura.md](arquitectura.md) · [situaciones-y-reglas.md](situaciones-y-reglas.md) · [autenticacion-y-permisos.md](autenticacion-y-permisos.md)
- [base-de-datos-y-migraciones.md](base-de-datos-y-migraciones.md) · [seguridad-y-correcciones.md](seguridad-y-correcciones.md) · [inteligencia-artificial.md](inteligencia-artificial.md) · [despliegue-y-operacion.md](despliegue-y-operacion.md)
- [CLAUDE.md](../../CLAUDE.md)
- Código: [resolve-database-env.ts](../../src/configuration/resolve-database-env.ts) · [data-source.ts](../../src/database/data-source.ts) · [gemini-stub.ts](../../test/e2e-support/gemini-stub.ts) · [jest-integration.json](../../test/jest-integration.json)
- Frontend: NOVEX_FRONTEND → `docs/empalme/contratos-api.md`
