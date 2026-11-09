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
9. Trabajar por fases con aprobación explícita.

## Validación segura

| Comando | Nota |
|---|---|
| `npx eslint "{src,test}/**/*.ts"` | Solo lectura |
| `npm run lint` | **Modifica** (`--fix`) |
| `npm test` / `test:security` | Jest; `*.pg.spec.ts` omitidos sin `NOVEX_PG_IT=1` |
| `NOVEX_PG_IT=1 npx jest --runInBand --testPathPatterns pg.spec` | Solo contra una base local **desechable y migrada** (`DB_CLOUD=false` + todas las `DB_*_LOCAL`). `--runInBand` es obligatorio: las suites comparten tablas |
| `npm run build` | Escribe `dist/` |

Contra Cloud SQL (`DB_CLOUD=true` o `DB_HOST=/cloudsql/…`): las semillas de arranque se omiten, `seed:*` aborta salvo `ALLOW_CLOUD_SEED=true` y `migration:*` aborta salvo `ALLOW_CLOUD_MIGRATIONS=true`. Esas banderas solo en la invocación concreta y con autorización.

## Docs operativos en este repo

Conservar: `docs/RELEASE_CIRCO.md`, `INCIDENTE-20261023-MIGRACIONES.md`, `RESTORE-TEST.md`, `BACKUP-DR.md`, `SECURITY.md`, `SECRETS-AND-VARS.md`, `INTERNAL_VIVO.md`, `DEPLOY_BACKEND.md`. Índice en `../docs/despliegue-y-operacion.md`.
