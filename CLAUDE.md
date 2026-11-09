# CLAUDE.md — NOVEX_BACKEND

Instrucciones para asistentes y desarrolladores.  
**Documentación vigente (monorepo):** [`../docs/README.md`](../docs/README.md) · continuidad: [`../docs/EMPALME-NOVEX.md`](../docs/EMPALME-NOVEX.md) · seguridad: [`../docs/seguridad-y-permisos.md`](../docs/seguridad-y-permisos.md) + [`../docs/seguridad-fase0-detalle.md`](../docs/seguridad-fase0-detalle.md).

## Qué es este repo

API NestJS de NOVEX (Cartas y Circo): RBAC, situaciones, overview/KPIs, Gemini. SPA en `NOVEX_FRONTEND`.

## Rama de trabajo

- **Trabajo:** `refactor/novex-consolidacion` (base `origin/integracion/cartas-circo`, incluye **A1**).
- **Producción:** `origin/main` / tag `novex-circo-prod-20261027` (`5ffc65f`) — **no** pushear sin autorización.
- **Conservar sin tocar:** `Alejo-Rama`.
- Nunca usar `main` local divergente como base.

## Reglas

1. Push a `main` = deploy automático **sin** migraciones.
2. No migraciones / seeds / `cloud:*` / Cloud SQL sin autorización.
3. No descartar stashes/backups/tags. Bundles en `../.backups/fase00c-20261109/`.
4. Ante docs vs código → manda el código; reporta discrepancia.
5. No afirmar pruebas sin ejecutarlas. No secretos en docs/commits.
6. No remontar módulos latentes sin PermissionsGuard + alcance.
7. Lectura ≠ análisis IA ≠ escritura (Fase 01A): ninguna ruta de escritura usa `requireAccessibleSituation`. Análisis → `requireAnalyzableSituation`; escrituras → `requireOperableSituation` (+ `assertSituationWorkable` si exige caso activo).
8. El `PATCH` de situaciones no cambia la coordinación responsable ni edita casos CLOSED; toda escritura sobre `situations` va en transacción con `pessimistic_write` (no `repository.save` de una entidad leída sin bloqueo).
9. Acciones críticas (crear, avanzar, editar, resolver, anular, trasladar, afectaciones, evidencias, usuarios, análisis IA completado) auditan con `AuditLogService.recordCritical(input, manager)` **dentro** de su transacción: sin auditoría no se confirman. `record` solo para eventos no críticos. Nunca textos completos (motivos, aprendizajes, prompts) en metadatos: solo ids, estados y longitudes.
10. `CANCELLED` (Fase 01B.1) no es `CLOSED`: no fija `closed_at`, no admite ninguna escritura, se excluye de listados por defecto y de todo indicador (`kpiNotCancelledSql()` en cualquier consulta nueva de KPIs). Anular y trasladar solo vía `SituationAdministrationService` (ADMIN + permiso específico).
11. Trabajar por fases con aprobación explícita.

## Validación segura

| Comando | Nota |
|---|---|
| `npx eslint "{src,test}/**/*.ts"` | Solo lectura |
| `npm run lint` | **Modifica** (`--fix`) |
| `npm test` / `test:security` | Jest unitario; no toca bases (`*.pg.spec.ts` omitidos sin `NOVEX_PG_IT=1`) |
| `npx tsc --noEmit --incremental false -p tsconfig.json` | Typecheck **con pruebas** (sin caché incremental, que oculta errores) |
| `npm run build` | Escribe `dist/` |

Contra Cloud SQL (`DB_CLOUD=true` o `DB_HOST=/cloudsql/…`): las semillas de arranque se omiten, `seed:*` aborta salvo `ALLOW_CLOUD_SEED=true` y `migration:*` aborta salvo `ALLOW_CLOUD_MIGRATIONS=true`. Esas banderas solo en la invocación concreta y con autorización.

## Pruebas destructivas (PostgreSQL real)

**Nunca** contra la base del `.env` (hoy `novex_local_snapshot_20261028`, puerto 5442), ni contra `novex`, ni contra Cloud SQL. Incidente 2026-11-09: `phase2-http` truncó esa snapshot. Toda prueba que escribe pasa por `test/support/disposable-database.guard.ts`, que aborta antes de cualquier SQL si falta algo de lo siguiente.

1. **Contenedor nuevo y desechable**, distinto de `novex-postgres`, en loopback y con datos en memoria (en Git Bash, `MSYS_NO_PATHCONV=1`):
   `docker run -d --rm --name novex-it-<fecha> -e POSTGRES_USER=novex_it -e POSTGRES_PASSWORD=<aleatoria> -e POSTGRES_DB=novex_it_<fecha> -p 127.0.0.1:<puerto>:5432 --tmpfs /var/lib/postgresql/data postgres:17-alpine`
2. **Marca de desechable** (solo en esa base): `COMMENT ON DATABASE novex_it_<fecha> IS 'novex:disposable-test-db'`.
3. **En la invocación** (nunca en `.env`; la guarda lo rechaza):
   - `NOVEX_DESTRUCTIVE_TESTS=1`;
   - `NOVEX_TEST_DB_HOST`, `NOVEX_TEST_DB_PORT` y `NOVEX_TEST_DB_NAME` con el destino;
   - `DB_CLOUD=false` y todas las `DB_*_LOCAL` / `DB_*` apuntando al mismo destino.
4. `npm run migration:run` sobre esa base. Las suites PG crean sus fixtures, salvo `internal-vivo` y los KPI, que esperan los 4 códigos de rol y un usuario.
5. Suites:
   - **PG:** `NOVEX_PG_IT=1 npx jest --runInBand --testPathPatterns pg.spec`. `--runInBand` es obligatorio: comparten tablas.
   - **e2e:** `NODE_ENV=test ENABLE_EMAIL_LOGIN=true CATALOG_SEED_ON_BOOT=true GEMINI_THROTTLE_LIMIT=100 npx jest --config ./test/jest-e2e.json --runInBand`. Las banderas valen solo en esa invocación; el límite de Gemini se ignora en producción.
   - **Integración:** `npx jest --config ./test/jest-integration.json`. Recrea el esquema: ejecútala **al final** o vuelve a crear los fixtures.
6. `docker stop` del contenedor al terminar.

La e2e real del frontend (`NOVEX_FRONTEND/e2e-real/run.mjs`) crea por ejecución un contenedor PostgreSQL nuevo con tmpfs, puerto aleatorio ligado a loopback y base marcada `novex:disposable-test-db`; el preparador exige la guarda central antes de recrear el esquema. El contenedor se detiene al terminar. La aplicación e2e necesita el puerto 3001 libre.

### Propiedad del historial institucional

La migración `1788700000000-HardenSituationHistory` requiere que infraestructura cree `NOVEX_HISTORY_OWNER_ROLE` como `NOLOGIN` y `NOVEX_APP_DB_ROLE` como rol runtime no-superusuario, sin membresía del rol propietario. El migrador debe poder transferir la propiedad. Ejecute la migración con credenciales de migrador y declare ambos nombres solo en esa invocación; configure el servicio con el rol de aplicación. La migración valida los privilegios efectivos y falla cerrada si el runtime conserva UPDATE, DELETE o TRUNCATE. Los triggers también rechazan esas operaciones; propietarios y superusuarios siguen siendo una frontera administrativa privilegiada y nunca deben usarse como runtime.

## Docs operativos en este repo

Conservar: `docs/RELEASE_CIRCO.md`, `INCIDENTE-20261023-MIGRACIONES.md`, `RESTORE-TEST.md`, `BACKUP-DR.md`, `SECURITY.md`, `SECRETS-AND-VARS.md`, `INTERNAL_VIVO.md`, `DEPLOY_BACKEND.md`. Índice en `../docs/despliegue-y-operacion.md`.
