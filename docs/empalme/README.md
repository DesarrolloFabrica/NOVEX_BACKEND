# Empalme NOVEX_BACKEND

Índice de continuidad para el periodo del 9 al 20 de noviembre de 2026.
**Última comprobación: 2026-11-06.** Las reglas de trabajo están en [`../../CLAUDE.md`](../../CLAUDE.md).

Leyenda: **[V]** verificado el 2026-11-06 contra código, Git o endpoints públicos · **[H]** histórico (documento o nota previa) · **[?]** no verificado.

## Mapa de documentos

| Documento | Para qué consultarlo |
|---|---|
| [arquitectura.md](arquitectura.md) | Bootstrap de NestJS, módulos montados y latentes, guards, configuración, flujo de una petición |
| [situaciones-y-reglas.md](situaciones-y-reglas.md) | INTERNAL/INTER, alta, PATCH, estados, avance, resolución, severidad, integridad, vidas, SLA, idempotencia, cada regla con su código y sus pruebas |
| [autenticacion-y-permisos.md](autenticacion-y-permisos.md) | Google/JWT, guards, catálogo de permisos, matriz RBAC, alcance, autorización por recurso (actual frente a esperado) |
| [base-de-datos-y-migraciones.md](base-de-datos-y-migraciones.md) | Entidades, las 26 migraciones, orden, seeds, verificación en solo lectura, riesgos, backups |
| [seguridad-y-correcciones.md](seguridad-y-correcciones.md) | A1, A2, M1, N1, N2: estado, worktree, pruebas, decisiones, orden de integración propuesto |
| [inteligencia-artificial.md](inteligencia-artificial.md) | Gemini existente, y el asistente conversacional futuro (no implementado; proveedor sin decidir) |
| [despliegue-y-operacion.md](despliegue-y-operacion.md) | GitHub Actions, Cloud Build, Cloud Run, Cloud SQL, variables, health, logs, backups, recuperación |
| [pruebas-y-desarrollo.md](pruebas-y-desarrollo.md) | Scripts npm (lectura / escritura / nube), suites, PostgreSQL efímero, validación previa a PR |
| [../../CLAUDE.md](../../CLAUDE.md) | Reglas de trabajo para desarrolladores y asistentes de IA |

Documentación equivalente del frontend: NOVEX_FRONTEND → `docs/empalme/README.md`.

---

## 1. Arquitectura en breve

| Pieza | Ubicación |
|---|---|
| Arranque, prefijo `api/v1`, Helmet, CORS | `src/main.ts` |
| Guards globales y módulos | `src/app.module.ts` |
| Autenticación (Google, JWT; login por correo solo en DEV) | `src/auth/` |
| RBAC resuelto por petición | `src/rbac/rbac.service.ts`, `src/auth/guards/` |
| Catálogo de permisos | `src/permissions/seeds/permissions.catalog.seed.ts`, más las migraciones RBAC |
| Alcance de lectura y escritura | `src/auth/services/operational-scope.service.ts`, `src/situations/situation-access.service.ts` |
| Situaciones, resolución, afectaciones, SLA | `src/situations/` |
| Barrido SLA (cron y endpoint con OIDC) | `src/situations/sweep/` |
| Evidencias, timeline, impacto, recomendaciones | `src/situation-*/` |
| Estado de las cartas, integridad, vidas | `src/operational-overview/`, `src/operational-overview/domain/` |
| KPIs del DIRECTOR | `src/operational-kpis/` |
| Gemini, alta idempotente, análisis | `src/ai-orchestration/`, `src/ai-prompt-engine/`, `src/ai-analysis-sessions/` |
| Auditoría | `src/audit/` |
| Migraciones (26) | `src/database/migrations/` |
| Seeds | `src/database/seeds/` |
| Health | `src/health/probe-health.ts` |
| Despliegue | `Dockerfile`, `.github/workflows/deploy-backend.yml`, `cloudbuild.backend.yaml`, `scripts/` |
| Pruebas | `src/**/*.spec.ts`, `test/security/`, `test/*.e2e-spec.ts`, `test/jest-integration.json` |

## 2. Producción conocida

| Dato | Estado |
|---|---|
| Commit en producción | `5ffc65f` [V]. Es `origin/main` y tag `novex-circo-prod-20261027`; el deploy de Actions sobre él terminó bien el 2026-10-27 |
| Salud | `GET /health/ready` devuelve `{"status":"ready","checks":{"database":"up"}}` el 2026-11-06 [V] |
| Revisión de Cloud Run con tráfico | [?] `gcloud` sin sesión válida. Una nota previa la sitúa en `novex-backend-00090-baz` [H] |
| Migraciones aplicadas en producción | **[?] No verificadas.** La nota inicial de `docs/RELEASE_CIRCO.md` (26-oct) dice que producción tenía 18 migraciones y a la release le quedaban 9. La suma (27) frente a los 26 archivos se explica porque producción registra además `AllowAnalystUnassignedSituations1786500000000`, una migración que no existe en ningún commit (`docs/INCIDENTE-20261023-MIGRACIONES.md` §«Migración no versionada»). No hay constancia en el repo de que las 9 de la release se aplicaran en producción [H]. Detalle en [base-de-datos-y-migraciones.md](base-de-datos-y-migraciones.md). Comprobarlo requiere `migration:show` o una consulta de solo lectura, con autorización |
| Cloud SQL, backups, PITR | [?] `docs/RESTORE-TEST.md` registra un restore aislado el 2026-10-26 [H], pero `docs/BACKUP-DR.md` dice lo contrario |
| Cloud Scheduler para el barrido | No configurado según `docs/RELEASE_CIRCO.md` §8 [H]. El `@Cron` con `min-instances=0` no garantiza que se ejecute [V en configuración] |
| Despliegue | Un push a `main` despliega solo (`.github/workflows/deploy-backend.yml`) y **no aplica migraciones** [V]. Fue la causa del incidente del 23-oct (`docs/INCIDENTE-20261023-MIGRACIONES.md`) [H] |

## 3. Integración, ramas y worktrees

| Rama / ref | Commit | Estado |
|---|---|---|
| `origin/main` | `5ffc65f` | Producción [V] |
| `origin/integracion/cartas-circo` | `72e24fe` | `5ffc65f` + A1 (PR #2, fusionado el 2026-11-05) [V] |
| `origin/seguridad/a1-recomendaciones` | `ce8c5ad` | A1 [V] |
| `main` local | `49a6483` | **Anterior a Cartas y Circo, 32 commits por detrás.** No usar [V] |
| `integracion/cartas-circo` local | `5ffc65f` | Por detrás de `origin`; usar `origin/integracion/cartas-circo` [V] |
| `origin/release/circo-20261026`, `origin/recovery/pre-circo-compatible-20261027`, `origin/backup/main-pre-circo-20261026`, `origin/feat/*`, `origin/Alejo-Rama` | — | Release, recuperación o ramas antiguas; no son base de trabajo [V] |
| Tags | `novex-circo-prod-20261027` → `5ffc65f`; `novex-pre-circo-20261023` → `49a6483` | [V] |

- **Pull requests:** #1 (release → main) fusionado el 2026-10-27 y #2 (A1 → integración) fusionado el 2026-11-05. **Ninguno abierto** [V].

### Worktrees (comparten el `.git` de `NOVEX_BACKEND`) [V]

| Ruta | Rama / HEAD | Contenido local | `node_modules` |
|---|---|---|---|
| `C:\dev\novex\NOVEX_BACKEND` | `local/circo-5ffc65f` @ `5ffc65f` | 1 cambio sin commit en `src/database/seeds/seed-operaciones.ts` (añade un usuario; contiene datos personales: no copiar ni difundir) | Carpeta real |
| `C:\dev\novex\NOVEX_BACKEND_a1` | `seguridad/a1-recomendaciones` @ `ce8c5ad` | Limpio | **Junction** → `NOVEX_BACKEND\node_modules` |
| `C:\dev\novex\NOVEX_BACKEND_int` | HEAD desacoplado @ `72e24fe` | Limpio (validación de integración) | **Junction** |
| `C:\dev\novex\NOVEX_BACKEND_sec` | `security/fase0-a1-a2` @ `5ffc65f` | **A1 (sin commit, idéntico a `ce8c5ad`) + A2**, sin commit | **Junction** |
| `C:\dev\novex\NOVEX_BACKEND_m1` | `security/fase0-m1` @ `5ffc65f` | **M1** sin commit | **Junction** |

> **Riesgo al eliminar worktrees:** borrar un worktree con su junction dentro puede borrar el `node_modules` principal. Hay que quitar primero solo el enlace (`rmdir`), revisar `git status` y contar con autorización. Lo mismo vale para cualquier `clean`, `reset` o `checkout` en `_sec` o `_m1`: hoy el trabajo de A2 y M1 existe **solo en disco**.

## 4. Correcciones de seguridad (Fase 0)

| Id | Problema | Estado [V] | ¿En producción? |
|---|---|---|---|
| **A1** | IDOR: `GET/PATCH /recommendations/:id` sin alcance de situación | Commit `ce8c5ad`, fusionado en `origin/integracion/cartas-circo` | **No** |
| **A2** | Un COORDINADOR sin coordinación lista todas las situaciones (`resolveSituationListCoordinationId` devuelve `undefined`) | Sin commit en `_sec`: `src/auth/services/operational-scope.service.ts`, `src/situations/situations.service.ts`, `test/security/a2-*.spec.ts`, `test/security/support/`. **Sin rama publicada ni PR** | No |
| **M1** | `POST /situations/:id/analyze` y `POST /situations/:id/recommendations` usan el alcance de lectura | Sin commit en `_m1`: `src/ai-orchestration/ai-orchestration.controller.ts`, `src/situation-recommendations/situation-recommendations.controller.ts`, `test/security/m1-situation-writes-scope.spec.ts`. **Sin rama publicada ni PR** | No |

**A1 y A2 en el mismo worktree.** El worktree `_sec` mezcla A1 y A2. Para un PR independiente de A2 hay que excluir los archivos de A1 (`situation-recommendations.*` y `test/security/a1-*`), que ya están en integración.

**M1 necesita una decisión de producto.** La política provisional implementada (P1) limita al ANALISTA a analizar o crear recomendaciones solo en los casos que él reportó; además, analizar un caso cerrado devuelve 409. La alternativa no está documentada en el repo. **M1 no debe integrarse sin esa decisión** [H].

**Compatibilidad entre correcciones:**
- A1 y M1 solo comparten `situation-recommendations.controller.ts`, en clases distintas. Una fusión simulada a tres bandas no dio conflictos [V].
- Que las pruebas de A2 y M1 pasan consta solo en notas del 2026-11-05 [H]. **No se reejecutaron el 2026-11-06.**

### Hallazgos nuevos (no corregidos)

Verificados **por lectura de código** en `5ffc65f`; **sin prueba de explotación**:

- **N1.** Un ANALISTA autor de un reporte puede reasignar con `PATCH /situations/:id` su `coordinationId` a `coord-general`, porque el bloqueo de reasignación solo aplica a actores acotados por coordinación (`src/situations/situations.service.ts`, bloque `dto.coordinationId`). Después puede avanzarlo y resolverlo, porque `canResolveSituation` para ANALISTA solo exige que la responsable sea `coord-general` (`src/auth/services/operational-scope.service.ts`). Con eso elude la regla «solo el responsable soluciona».
- **N2.** El mismo `PATCH` reasigna la responsable de un INTER sin comprobar que siga siendo distinta de la afectada.

Observaciones adicionales de la Fase 2B, también por lectura de código y sin prueba de explotación. Detalle en [situaciones-y-reglas.md](situaciones-y-reglas.md) y [seguridad-y-correcciones.md](seguridad-y-correcciones.md):

- **O1.** En un `PATCH` que avanza OPEN → IN_PROGRESS solo se evalúa `assertCanAdvanceSituationToInProgress`, no `assertCanUpdateSituation`, pero el resto de campos del cuerpo (incluido `coordinationId`) se aplica (`src/situations/situations.service.ts`, ~L711-723). Es una variante de N1.
- **O2.** Un `PATCH` sin `status` sigue editando título, descripción, fecha y coordinación de un caso CLOSED.
- **O3.** La longitud mínima del título se valida antes de recortar espacios, y `description` no tiene longitud máxima en el `PATCH`.
- **O4.** La pista `canUpdate` del detalle no aplica el alcance de coordinación: la UI puede mostrar «editable» y el `PATCH` devolver 404.
- **Creación de INTER.** Cualquier ANALISTA o COORDINADOR puede crear un INTER entre dos coordinaciones ajenas. Puede ser intencional: está pendiente de una decisión de producto.
- **Controladores latentes.** `intelligence`, `operational-events`, `operational-areas` y `recommended-actions` no tienen `PermissionsGuard` ni alcance: volver a registrarlos los expondría.
- **Prompt guardado.** `prompt_snapshot` guarda el prompt enviado a Gemini, con datos del autor, y lo devuelve `GET /situations/:id/analysis/history/:version`. Ver [inteligencia-artificial.md](inteligencia-artificial.md).

## 5. Trabajo terminado y pendiente

**Terminado y en producción** [V]:
- RBAC en servidor.
- Ciclo de situación con resolución atómica y aprendizaje.
- INTERNAL e INTER.
- Afectaciones y severidad efectiva con historial append-only.
- Alta idempotente.
- Integridad y vidas por coordinación.
- KPIs del DIRECTOR.
- Health probes.
- Análisis Gemini (el alta ya no invoca Gemini; el análisis queda diferido).

**Pendiente:**
1. Llevar A1 de integración a `main` y producción, con autorización.
2. A2: rama y PR propios.
3. M1: decisión de producto, luego rama y PR.
4. Evaluar y corregir N1 y N2.
5. Verificar en solo lectura las migraciones aplicadas en producción.
6. Cloud Scheduler para el barrido SLA.
7. Reconciliar la documentación de backups.
8. Retirar los shims de compatibilidad cuando se decida (`docs/RELEASE_CIRCO.md` §9).
9. Eliminar el código sin rutas montadas.

## 6. Riesgos conocidos

| Riesgo | Detalle |
|---|---|
| Despliegue sin migraciones | Un push a `main` despliega código que puede exigir migraciones no aplicadas [V] |
| `main` local anterior a Cartas y Circo | Una rama creada desde ahí reintroduce código antiguo [V] |
| Trabajo solo en disco | A2 y M1 [V] |
| N1 y N2 | Autorización [V en código] |
| Barrido SLA | Puede no ejecutarse [H/V] |
| Auditoría | `audit_logs` sin trigger de inmutabilidad, y `AuditLogService.record` traga los errores (`src/audit/audit-log.service.ts`) [V] |
| Throttler | En memoria por instancia: con varias instancias el límite real se multiplica [I] |
| `/health/ready` | Expone `failure.message` sin autenticación si el arranque falla [V] |
| `cloudbuild.backend.yaml` | Incluye orígenes `localhost` en `CORS_ORIGINS` [V] |
| Rollback | Volver a `49a6483` no es viable si ya existen situaciones INTER (`docs/RELEASE_CIRCO.md` §10.2) [H] |

## 7. Documentos

| Documento | Estado |
|---|---|
| `CLAUDE.md`, `docs/empalme/README.md` | Vigentes (2026-11-06) |
| `docs/INTERNAL_VIVO.md` | Vigente |
| `DEPLOY_BACKEND.md` | Vigente |
| `docs/RESTORE-TEST.md` | Vigente |
| `docs/INCIDENTE-20261023-MIGRACIONES.md` | Vigente |
| `docs/SECRETS-AND-VARS.md` | Vigente |
| `docs/ARCHITECTURE.md`, `docs/COSTOS.md` | Vigentes a alto nivel |
| `docs/RELEASE_CIRCO.md` | Parcialmente vigente; no registra el cierre final |
| `docs/BACKUP-DR.md` | Contradice a `RESTORE-TEST.md` |
| `docs/DEPLOY.md`, `docs/RUNBOOK.md`, `docs/MONITORING.md` | Probablemente desactualizados (salud `/api/v1/auth/health`, sin migraciones manuales ni cron) |
| `docs/SECURITY.md` | Sin la Fase 0 |
| `docs/ENVIRONMENTS.md`, `docs/CUSTOM-DOMAIN.md` | Propuestas no aplicadas |
| `README.md` | Anterior a Cartas y Circo |
| `README_ESTADO_ACTUAL_NOVEX.md` | Cifras desactualizadas (dice 12 migraciones; hay 26) |
| `docs/AUDITORIA_INTEGRAL_NOVEX.md`, `docs/CLOSURE_PHASE_*.md`, `docs/FINAL_TECHNICAL_CLOSURE.md` | Históricos (agosto) |
| `C:\dev\novex\deploy\` y `C:\dev\novex\README_ESTADO_ACTUAL_NOVEX.md` (fuera del repo) | Obsoletos (septiembre) |

## 8. Repositorio complementario

- **Frontend:** `NOVEX_FRONTEND`, en `github.com/DesarrolloFabrica/NOVEX_FRONTEND` y localmente en `C:\dev\novex\NOVEX_FRONTEND`.
- Producción `b726c47`. El tutorial guiado está sin desplegar en `sync/casa-oficina-20261030`.
- Leer su `CLAUDE.md` y `docs/empalme/README.md`.
- **Compatibilidad [V]:** todos los endpoints que usa el frontend en producción existen aquí. La excepción es `/operational-events`: el frontend tiene un cliente que ningún código montado invoca, y aquí el módulo declara `controllers: []`.

### Cómo se referencia el otro repositorio

- **Documentación de empalme (`CLAUDE.md`, `docs/empalme/`):** al 2026-11-06 existe **solo en local**, sin commit (GitHub devuelve 404 para `blob/5ffc65f/docs/empalme/README.md`). Por eso se cita en texto plano («NOVEX_FRONTEND → `docs/empalme/…`») y no con enlaces.
- **Código publicado:** se puede consultar en GitHub fijando el commit. Todas estas URLs respondieron HTTP 200 el 2026-11-06:
  - Este repo en producción: <https://github.com/DesarrolloFabrica/NOVEX_BACKEND/tree/5ffc65f>
  - Este repo en integración (con A1): <https://github.com/DesarrolloFabrica/NOVEX_BACKEND/tree/72e24fe>
  - Frontend en producción: <https://github.com/DesarrolloFabrica/NOVEX_FRONTEND/tree/b726c47>
  - Rama del tutorial: <https://github.com/DesarrolloFabrica/NOVEX_FRONTEND/tree/7a49148>
- **Lo que no está en GitHub:** A2 (`_sec`), M1 (`_m1`), el seed local y los cambios del tutorial sin commit. No tienen URL.

## 9. Documentación pendiente (prioridad)

Cubierto en la Fase 2B (2026-11-06), ver [Mapa de documentos](#mapa-de-documentos):

| Tema previsto | Documento |
|---|---|
| Seguridad Fase 0 | [seguridad-y-correcciones.md](seguridad-y-correcciones.md) |
| Migraciones | [base-de-datos-y-migraciones.md](base-de-datos-y-migraciones.md) |
| RBAC | [autenticacion-y-permisos.md](autenticacion-y-permisos.md) |
| Dominio de situaciones | [situaciones-y-reglas.md](situaciones-y-reglas.md) |
| Pruebas | [pruebas-y-desarrollo.md](pruebas-y-desarrollo.md) |
| IA | [inteligencia-artificial.md](inteligencia-artificial.md) |

Pendiente:
1. Documento general de empalme común a ambos repos (en espera de aprobación).
2. ~~Corregir D1 y D2 en `CLAUDE.md`~~: hecho en la Fase 2C (2026-11-06).
3. Tabla de API exhaustiva por endpoint, con su forma de respuesta. Hoy los endpoints están en [arquitectura.md](arquitectura.md) y [autenticacion-y-permisos.md](autenticacion-y-permisos.md), y los consumidos por el frontend en NOVEX_FRONTEND → `docs/empalme/contratos-api.md`.
4. Revisar en detalle `operational-kpis`, `situation-impact`, `situation-evidence`, `coordinations` y `dashboard`: no se cubrieron en profundidad.
5. Consolidar `docs/DEPLOY.md` en `DEPLOY_BACKEND.md`; reconciliar `docs/BACKUP-DR.md`; actualizar `README.md`, `RUNBOOK.md` y `MONITORING.md` (fase posterior, con autorización).

## 10. Discrepancias (revisadas en la Fase 2C, 2026-11-06)

Hay dos tipos de estado:

- **Resuelta (doc.):** el error estaba en la documentación de empalme y se corrigió.
- **Abierta:** el desajuste está en el código, la configuración o en documentación histórica. Esta fase no modifica código ni documentos fuera de `CLAUDE.md` y `docs/empalme/`, así que se mantiene registrada para una fase posterior.

| Id | Documento afectado | Descripción | Evidencia [V] | Impacto para el empalme | Estado y acción |
|---|---|---|---|---|---|
| D1 | `CLAUDE.md` §8 | Presentaba `npm run lint` como validación sin efectos | `package.json` L17: `eslint "{src,test}/**/*.ts" --fix` | Quien «solo valida» modifica archivos | **Resuelta (doc.).** `CLAUDE.md` §8 separa `npx eslint "{src,test}/**/*.ts"` (solo lectura) de `npm run lint` (modifica); [pruebas-y-desarrollo.md](pruebas-y-desarrollo.md) ya lo advertía |
| D2 | `CLAUDE.md` §2; [pruebas-y-desarrollo.md](pruebas-y-desarrollo.md) L17 | Daban PostgreSQL 17 como versión de Cloud SQL | `docker-compose.yml` L9 (`${POSTGRES_VERSION:-17}`, local). `docs/RELEASE_CIRCO.md` §0 y `docs/RESTORE-TEST.md` indican 16 en Cloud SQL [H] | Riesgo de probar con una versión distinta de la real | **Resuelta (doc.).** Ambos documentos distinguen la versión local de la de Cloud SQL, que queda sin verificar [?] |
| D3 | `README.md` (histórico) | Dice que `register-with-analysis` llama a Gemini; lista módulos no montados; trata `RESOLVED` como estado normal | `src/ai-orchestration/ai-orchestrator.service.ts` (`analysis:null`); `controllers: []` en los módulos latentes; `situation.enums.ts` | Puede dar una idea equivocada del sistema a quien empiece por el README | **Abierta (doc. histórica).** La de empalme es correcta; actualizar `README.md` en una fase autorizada |
| D4 | `docs/ARCHITECTURE.md`, `RUNBOOK.md`, `MONITORING.md`, `CUSTOM-DOMAIN.md`, `CLOSURE_PHASE_2_…` (históricos) | Usan `/api/v1/auth/health` como sonda | `src/health/probe-health.ts`: sondas `/health` y `/health/ready`; `/api/v1/auth/health` se mantiene solo por compatibilidad | Uptime checks o diagnósticos contra una ruta heredada | **Abierta (doc. histórica).** [despliegue-y-operacion.md](despliegue-y-operacion.md) documenta las sondas reales |
| D5 | `docs/BACKUP-DR.md` L4 (histórico) | Dice que no se ejecutó un restore real | `docs/RESTORE-TEST.md` y `docs/RELEASE_CIRCO.md` §1 registran un restore aislado el 26-oct [H] | Incertidumbre sobre la capacidad real de recuperación | **Abierta (doc. histórica).** [base-de-datos-y-migraciones.md](base-de-datos-y-migraciones.md) expone ambas versiones; reconciliar con evidencia de GCP |
| D6 | `docs/DEPLOY.md`, `DEPLOY_BACKEND.md` L402 (históricos) | `DEPLOY.md` dice que el deploy solo cambia la imagen; `DEPLOY_BACKEND.md` cita `npm run deploy:gcp` | `.github/workflows/deploy-backend.yml` (probes, recursos, `--update-env-vars` L277); `deploy:gcp` no está en `package.json` | Instrucciones de despliegue no ejecutables o incompletas | **Abierta (doc. histórica).** [despliegue-y-operacion.md](despliegue-y-operacion.md) describe el flujo real |
| D7 | `cloudbuild.backend.yaml` L13, L103, L154 (configuración) | Usa `--set-env-vars` (reemplaza todas las variables); incluye `localhost` en `CORS_ORIGINS`; promueve `latestCreatedRevisionName` | Líneas citadas | Un despliegue manual con Cloud Build podría borrar variables (`ENABLE_EMAIL_LOGIN`, `SCHEDULER_OIDC_*`…) [I] | **Abierta (configuración).** No modificar sin autorización. Advertido en [despliegue-y-operacion.md](despliegue-y-operacion.md) |
| D8 | `docs/SECRETS-AND-VARS.md` L28 (histórico) | Señala `CATALOG_SEED_ON_BOOT=true` como pendiente de confirmar | El workflow lo fuerza a `false` (`deploy-backend.yml` L277) | Ninguno si se despliega con Actions | **Abierta (doc. histórica).** El valor real en Cloud Run no está verificado [?] |
| D9 | Comentario de `src/situations/sweep/situation-sweep.service.ts` L70-72 | Habla de Cloud Scheduler «cada 15 min» | Cloud Scheduler no está configurado según `RELEASE_CIRCO.md` §8 [H]; el `@Cron` en proceso es de 30 min | Puede hacer creer que el barrido está garantizado | **Abierta (comentario de código).** [situaciones-y-reglas.md](situaciones-y-reglas.md) documenta el comportamiento real |
| D10 | Comentario de `src/database/migrations/1787300000000-GrantReportingAndClosurePermissions.ts` L22 | Dice que ANALISTA no debe recibir `SITUATIONS_CLOSE` | `1787500000000-GrantAnalystSituationsClose` se lo concede | Confusión al auditar el RBAC | **Abierta (comentario en migración aplicada: no se edita).** [autenticacion-y-permisos.md](autenticacion-y-permisos.md) |
| D11 | `docs/CLOSURE_PHASE_2_SECURITY_HARDENING.md` L143 (histórico); comentario de `src/auth/contracts/auth-payload.contract.ts` L4 | Dicen que un cambio de rol exige nuevo login, o que los permisos del JWT autorizan sin consultas | `AuthorizationEnrichmentGuard` y `RbacService.resolveActiveAuthorization` recargan en cada petición | Expectativa equivocada sobre la revocación | **Abierta (doc. histórica / comentario).** [autenticacion-y-permisos.md](autenticacion-y-permisos.md) |
| D12 | Comentarios y un spec de `operational-scope` | Dicen que el ANALISTA crea sin coordinación | El alta INTERNAL o INTER exige coordinación; el contrato anterior rechaza al ANALISTA | El «Registro de analista» del overview solo refleja datos históricos | **Abierta (código).** [situaciones-y-reglas.md](situaciones-y-reglas.md) |
| D13 | `package.json` (scripts) y `src/database/seeds/` | `seed:rbac` y `seed:qa-internal-vivo` no llaman a `assertLocalDatabaseProfile`; `migration:*` y las suites e2e no tienen guarda contra `DB_CLOUD=true` | `grep assertLocalDatabaseProfile`: solo en `run-seed-operaciones.ts`, `run-seed-situations-mock.ts`, `run-clear-situations-mock.ts` y `seed-qa-director-h2.ts` | Ejecutar contra Cloud SQL por error | **Abierta (código).** Advertido en `CLAUDE.md` §5 (Fase 2C) y en [base-de-datos-y-migraciones.md](base-de-datos-y-migraciones.md) |
| D14 | Frontend | La UI toma los permisos del JWT y replica los umbrales de integridad | NOVEX_FRONTEND → `docs/empalme/README.md` §10 (D3, D4) | Controles desfasados; textos que pueden quedar desactualizados | **Abierta (código frontend).** |
| D15 | Este README, §2 (Fase 2A) | Calificaba de «inconsistente» la cifra de 18 + 9 migraciones | `docs/INCIDENTE-20261023-MIGRACIONES.md` L18 y L66: producción registra una migración no versionada | Ninguno | **Resuelta (doc.)** en la Fase 2B |
