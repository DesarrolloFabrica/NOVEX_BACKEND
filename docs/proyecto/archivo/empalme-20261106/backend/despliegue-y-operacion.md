# Despliegue y operación

> **Propósito:** explicar cómo llega el backend a Cloud Run, qué configuración necesita, cómo se observa y qué procedimientos de recuperación existen, separando lo verificado de lo histórico.
> **Revisión:** 2026-11-06 · **Código de referencia:** NOVEX_BACKEND `5ffc65f` (producción = origin/main)
> **Leyenda:** [V] verificado en código/archivo · [H] histórico/documental · [?] no verificado · [I] inferido

**Este documento no es un runbook autorizado.** Desplegar, mover tráfico, migrar, restaurar o rotar secretos son cambios de producción y **requieren autorización explícita** ([CLAUDE.md](../../CLAUDE.md)). **Un push a `main` despliega producción automáticamente.**

---

## 1. Estado conocido (2026-11-06)

| Dato | Estado |
|---|---|
| Commit en producción | `5ffc65f` = `origin/main`; el workflow terminó bien el 2026-10-27 según la API de Actions [V] |
| Salud pública | `GET /health/ready` → `ready`, `database: up` [V] |
| Revisión de Cloud Run con tráfico | [?] Una nota previa indica `novex-backend-00090-baz` [H] |
| Configuración viva de Cloud Run (env, secretos, Cloud SQL adjunta) | [?] `gcloud` requiere reautenticación |
| Migraciones aplicadas | [?] ver [base-de-datos-y-migraciones.md](base-de-datos-y-migraciones.md) §3 |
| Cloud Scheduler para el barrido | No configurado según [RELEASE_CIRCO](../RELEASE_CIRCO.md) §8 [H]; estado actual [?] |

---

## 2. Imagen

[Dockerfile](../../Dockerfile) [V]: multi-stage `node:20-alpine`; `npm ci` + `nest build`; runtime con `npm ci --omit=dev`, usuario no root `novex`, `NODE_ENV=production`, `PORT=8080`, `CMD ["node","dist/main.js"]`. CI usa Node 20 (`actions/setup-node`) [V]. `package.json` no declara `engines` [V].

---

## 3. GitHub Actions: `Deploy Backend`

Archivo: [.github/workflows/deploy-backend.yml](../../.github/workflows/deploy-backend.yml) [V]. Es el único workflow del repositorio.

| Aspecto | Detalle |
|---|---|
| Disparadores | `push` a `main` y `workflow_dispatch` (entrada opcional `reason`). **No corre en PR** |
| Concurrencia | `deploy-backend-<ref>`, sin cancelar el que está en curso |
| Variables de repositorio | `GCP_PROJECT_ID`, `GCP_REGION` (obligatorias); `ARTIFACT_REGISTRY_REPOSITORY` (`novex`), `BACKEND_IMAGE_NAME` (`novex-backend`), `CLOUD_RUN_SERVICE_BACKEND` (`novex-backend`) opcionales |
| Secreto | `GCP_SERVICE_ACCOUNT_KEY`: clave JSON de cuenta de servicio (migrar a WIF está como deuda en `docs/SECURITY.md`) |

**Job `validate`:** `npm ci` → `npm run lint` → `npm test -- --passWithNoTests` → `npm run test:security` → `npm run build`.

**Job `build-push-deploy`** (requiere `validate`):

1. Resuelve metadatos; imagen `<región>-docker.pkg.dev/<proyecto>/novex/novex-backend:<sha7>`.
2. `docker build` con etiquetas OCI.
3. **Contrato de la imagen** en local: `CMD` exacto, `/health` 200 y `/health/ready` **503** sin PostgreSQL.
4. Push y resolución del **digest**.
5. **Valida la configuración ya existente del servicio** (sin mostrar valores): existen `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `CORS_ORIGINS`; `DB_PASSWORD` y `JWT_SECRET` vienen de Secret Manager; `CORS_ORIGINS` incluye el frontend; hay instancia Cloud SQL adjunta y `DB_HOST` es `/cloudsql/<misma instancia>`.
6. `gcloud run deploy` por digest con `--no-traffic` y tag `candidate-<sha7>`: gen2, puerto 8080, CPU 1, 1 GiB, concurrencia 40, min 0 / max 5, timeout 300 s, `--cpu-boost`, startup probe `/health/ready` (cada 5 s, 48 fallos), liveness `/health` (cada 10 s, 3 fallos) y `--update-env-vars` que **fuerza** `NODE_ENV=production`, `DB_SSL=false`, `DB_SYNCHRONIZE=false`, `CATALOG_SEED_ON_BOOT=false`, `DEMO_SEED_ENABLED=false`, `ENABLE_EMAIL_LOGIN=false`. No pasa `--set-secrets`, `--add-cloudsql-instances` ni cuenta de servicio: esas piezas se conservan de la revisión anterior.
7. **Smoke sobre la candidata:** `/health` ok; espera `/health/ready` 200 hasta 5 min (aborta si el cuerpo trae `failure`); `GET /api/v1/auth/me` = 401; preflight CORS 204 con el origen del frontend en `POST /api/v1/situations/register-with-analysis`.
8. Si falla tras desplegar: quita el tag candidato (la revisión queda sin tráfico).
9. **Promoción:** `update-traffic` al 100 % de la candidata; verifica `"database":"up"` y 401 en `/auth/me`; limpia tags `candidate-*`.

**Lo que NO hace:** ejecutar migraciones, consultar tablas de dominio ni comprobar que el esquema coincide con el código. Un esquema atrasado pasa todas sus comprobaciones (lección del 23-oct) [H] [INCIDENTE](../INCIDENTE-20261023-MIGRACIONES.md).

---

## 4. Vías alternativas (manuales)

| Vía | Archivo | Diferencias relevantes [V] |
|---|---|---|
| Cloud Build | [cloudbuild.backend.yaml](../../cloudbuild.backend.yaml) | Manual (`gcloud builds submit`). Usa `--set-secrets` (`DB_PASSWORD`, `JWT_SECRET`, `GEMINI_API_KEY` desde Secret Manager) y **`--set-env-vars`, que reemplaza todas las variables** del servicio [I]: no incluye `CATALOG_SEED_ON_BOOT`, `ENABLE_EMAIL_LOGIN`, `SITUATION_SWEEP_*` ni `SCHEDULER_OIDC_*`. Fija cuenta de servicio y Cloud SQL, `--allow-unauthenticated`, gen2, min 0 / max 5, mismos probes. Sus `_CORS_ORIGINS` por defecto **incluyen `localhost:5173` y `127.0.0.1:5173`**. Etiqueta también `:latest`. Promueve `latestCreatedRevisionName`, no la revisión etiquetada [I: riesgo si hay otro despliegue simultáneo] |
| Scripts | [deploy-backend.ps1](../../scripts/deploy-backend.ps1), [deploy-backend.sh](../../scripts/deploy-backend.sh) | Piden escribir `DEPLOY`; usan `--set-secrets` y `--set-env-vars` (incluye `CATALOG_SEED_ON_BOOT=false`, `DEMO_SEED_ENABLED=false`). Último cambio de agosto–septiembre [V git] |
| Carpeta `C:\dev\novex\deploy` (fuera del repo) | `01-snapshot.ps1`, `99-rollback.ps1`, `RUNBOOK.md` | Del 22-sep, para desplegar la rama `feat/admin-operational-cards-mvp` (`4a8d936`). **Obsoleta**; ese despliegue dejó migraciones aplicadas fuera de `main` [H] [INCIDENTE](../INCIDENTE-20261023-MIGRACIONES.md) |

Ninguna vía ejecuta migraciones [V].

---

## 5. Cloud Run y Cloud SQL

- Servicio `novex-backend`, región `us-central1` [V scripts/workflow]. Ingress público; autorización por JWT de la aplicación ([DEPLOY_BACKEND](../../DEPLOY_BACKEND.md), «Configuración Cloud Run recomendada») [H].
- Conexión a Cloud SQL por socket unix `DB_HOST=/cloudsql/<INSTANCE_CONNECTION_NAME>` con la instancia adjunta; `DB_SSL=false` en ese modo [V].
- Instancia documentada: `novex-db`, PostgreSQL 16, `db-f1-micro`, zonal, 10 GB SSD, IP pública con redes autorizadas [H] [RELEASE_CIRCO](../RELEASE_CIRCO.md) §0, [RESTORE-TEST](../RESTORE-TEST.md). Los scripts operativos toman el nombre real de la revisión que sirve tráfico [V].
- `min-instances=0`: hay arranques en frío; la conexión a BD reintenta 6 × 3 s en producción [V] [database.config.ts](../../src/configuration/database.config.ts).
- Acceso desde la oficina: el firewall re-firma el TLS; usar Cloud Shell [H].

---

## 6. Variables de entorno

Validadas al arrancar por [env.validation.ts](../../src/configuration/env.validation.ts) y leídas en [configuration.ts](../../src/configuration/configuration.ts); plantilla en `.env.example` (solo nombres aquí) [V].

| Variable | Propósito | Origen en Cloud Run |
|---|---|---|
| `NODE_ENV` | `production` desactiva seeds de catálogo y activa logs HTTP por defecto | Forzada por workflow |
| `PORT` | Puerto (8080 en la imagen; 3001 por defecto local) | Imagen / Cloud Run |
| `API_PREFIX` | Prefijo, por defecto `api/v1` | Env del servicio |
| `CORS_ORIGINS` | Orígenes permitidos; **obligatoria en producción** (falla el arranque si falta) [V `cors.config.ts`] | Env del servicio |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_DATABASE` | Conexión PostgreSQL (`DB_HOST` = socket `/cloudsql/…`) | Env del servicio |
| `DB_PASSWORD` | Contraseña de BD | **Secret Manager** (exigido por el workflow) |
| `DB_SSL`, `DB_SYNCHRONIZE`, `DB_LOGGING` | TLS, sincronización (ignorada: siempre `false` en código), log SQL | Workflow fuerza `DB_SSL`/`DB_SYNCHRONIZE=false` |
| `DB_CLOUD`, `DB_*_LOCAL`, `DB_*_CLOUD` | Selección de perfil para CLI/scripts locales | Solo local |
| `INSTANCE_CONNECTION_NAME` | Nombre de la instancia (lo fija Cloud Build) | Env del servicio [?] |
| `JWT_SECRET` | Firma de JWT | **Secret Manager** (exigido) |
| `JWT_EXPIRES_IN` | Caducidad, por defecto `1h` | Env |
| `GOOGLE_CLIENT_ID` | Audiencia del ID token de Google | Env (exigida) |
| `ENABLE_EMAIL_LOGIN` | Login por correo; solo local | Forzada `false` |
| `GEMINI_API_KEY` | Clave Gemini; opcional al arrancar | **Secret Manager** (Cloud Build); el workflow no la comprueba |
| `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS` | Modelo y timeout | Env |
| `GEMINI_BASE_URL`, `GEMINI_THROTTLE_LIMIT` | Servidor de pruebas (ignorado en producción) y límite de throttling para E2E | Solo pruebas |
| `CATALOG_SEED_ON_BOOT`, `DEMO_SEED_ENABLED` | Seeds al arrancar | Forzadas `false` |
| `SITUATION_SWEEP_CRON_ENABLED` | `@Cron` de respaldo del barrido (omitido = activo) | No definida según [H] RELEASE_CIRCO §0 |
| `SEVERITY_ESCALATION_ENABLED` | Escalamiento automático (omitido = apagado) | No definida [H] |
| `SCHEDULER_OIDC_AUDIENCE`, `SCHEDULER_OIDC_SERVICE_ACCOUNT_EMAIL` | Identidad de Cloud Scheduler para `POST /api/v1/internal/jobs/situation-sweep`; vacías = rechaza todo | No definidas [H] |
| `HTTP_REQUEST_LOGGING` | Logs JSON por petición (por defecto activos en producción) | — |
| `BOOT_VERBOSE` | Trazas de arranque | — |
| `ALLOW_CLOUD_SEED`, `CLOUD_SQL`, `UPSERT_USER_*`, `MOCK_SITUATIONS_*` | Scripts locales ([base-de-datos-y-migraciones.md](base-de-datos-y-migraciones.md) §5) | Nunca en Cloud Run |

**Secret Manager** [V `cloudbuild.backend.yaml`, scripts]: `novex-db-password` → `DB_PASSWORD`, `novex-jwt-secret` → `JWT_SECRET`, `novex-gemini-api-key` → `GEMINI_API_KEY`, montados como `:latest`. Rotación: [DEPLOY_BACKEND](../../DEPLOY_BACKEND.md) §26 y `docs/SECRETS-AND-VARS.md`; rotar `JWT_SECRET` invalida las sesiones (requiere autorización).

---

## 7. Migraciones en el ciclo de despliegue

Las migraciones se aplican **a mano, antes** de desplegar el código que las necesita, tras una copia de Cloud SQL y revisando el lote ([DEPLOY_BACKEND](../../DEPLOY_BACKEND.md) §17, [RELEASE_CIRCO](../RELEASE_CIRCO.md) §3–§4) [H].

**Incidente del 23-oct** [H] [INCIDENTE](../INCIDENTE-20261023-MIGRACIONES.md): se desplegó `49a6483` sin sus 5 migraciones → `column Situation.client_request_id does not exist` en toda consulta de situaciones y fallos del cron de SLA del 23 al 26-oct. Mitigación: tráfico a una revisión anterior; corrección el 26-oct con [hotfix-20261026-migraciones-main.sh](../../scripts/hotfix-20261026-migraciones-main.sh) (copia bajo demanda + migraciones desde Cloud Shell) y vuelta del tráfico. Causas: el workflow no migra y su smoke no toca tablas de dominio; un despliegue manual de una rama (22-sep) dejó migraciones fuera de `main`.

Detalle de migraciones, riesgos y verificación de solo lectura: [base-de-datos-y-migraciones.md](base-de-datos-y-migraciones.md).

---

## 8. Health checks

Registrados en Express **antes** de cargar Nest ([probe-health.ts](../../src/health/probe-health.ts), excluidos del prefijo en [main.ts](../../src/main.ts)) [V]:

| Endpoint | Respuesta | Uso |
|---|---|---|
| `GET /health` | 200 `{status:"ok"}` mientras el proceso vive | Liveness probe |
| `GET /health/ready` | 200 `ready` + `checks.database:"up"` solo si Nest terminó `init()` y `SELECT 1` funciona; si no 503 (con `failure` si el arranque falló) | Startup probe y gate de promoción |
| `GET /api/v1/auth/health` | 200 `{status:"ok",module:"auth"}` o 503 `starting`, con la misma lógica de readiness | Legacy: uptime check histórico ([MONITORING](../MONITORING.md)) |

`/health/ready` no valida el esquema: con migraciones pendientes responde `ready` [I, confirmado por el incidente H].

---

## 9. Logs y observabilidad

- **Request-id** [V]: [request-context.middleware.ts](../../src/common/request-context/request-context.middleware.ts) reutiliza `x-request-id` entrante o genera un UUID y lo devuelve en `X-Request-Id`; lo incluyen el filtro global de excepciones, `audit_logs.request_id` y los logs de Gemini.
- **Logs HTTP** [V]: [http-logging.interceptor.ts](../../src/common/logging/http-logging.interceptor.ts) emite JSON `http_request_completed` / `http_request_failed`, activo por defecto en producción (`HTTP_REQUEST_LOGGING`).
- Cloud Logging, Error Reporting, uptime checks y alertas (5xx, CPU, memoria, CPU de Cloud SQL) están descritos en [MONITORING](../MONITORING.md) [H]; su estado actual [?].
- Señales útiles tras desplegar ([RELEASE_CIRCO](../RELEASE_CIRCO.md) §5) [H]: ausencia de `QueryFailedError`; líneas `Alta con el contrato anterior` solo durante ventanas de convivencia; `Barrido: N vencidas, N avisos, 0 escalamientos`.

**Barrido SLA** [V]: `@Cron` cada 30 min en [situation-sla.scheduler.ts](../../src/situations/situation-sla.scheduler.ts), respaldo en proceso. Con `min-instances=0` **no está garantizado** que se ejecute. La fuente prevista es Cloud Scheduler (cada 15 min) contra `POST /internal/jobs/situation-sweep` con OIDC ([situation-sweep.service.ts](../../src/situations/sweep/situation-sweep.service.ts)); no configurado [H]. Activación: `docs/INTERNAL_VIVO.md` (requiere autorización).

---

## 10. Copias de seguridad

Ver [base-de-datos-y-migraciones.md](base-de-datos-y-migraciones.md) §7. Resumen: copias diarias + PITR documentados [H]; restauración aislada probada el 26-oct [H] [RESTORE-TEST](../RESTORE-TEST.md), en contradicción con el encabezado de [BACKUP-DR](../BACKUP-DR.md); estado actual [?].

---

## 11. Procedimientos de recuperación existentes (descritos, no autorizados)

| Escenario | Qué documenta el repo | Limitaciones |
|---|---|---|
| Fallo de app tras un despliegue | Mover el 100 % del tráfico a una revisión anterior (`gcloud run services update-traffic`) [H] [DEPLOY_BACKEND](../../DEPLOY_BACKEND.md) §21, [DEPLOY](../DEPLOY.md) | No toca el esquema. **Volver a `49a6483` (pre-cartas) no es viable si existe algún reporte INTER**: 500 en listados de todos los roles [H] [RELEASE_CIRCO](../RELEASE_CIRCO.md) §7, §10.2 |
| Hay INTER y hay que volver atrás | Pareja de recuperación `recovery/pre-circo-compatible-20261027` (backend `4e59f99`, frontend `2127658`) por `workflow_dispatch` [H] RELEASE_CIRCO §7.3 | **No desplegada nunca**; sin prueba en Cloud SQL real; pierde visibilidad de la coordinación afectada; no lanzar IA sobre INTER |
| Desplegar el código anterior desde respaldo | `workflow_dispatch` sobre `backup/main-pre-circo-20261026` [H] RELEASE_CIRCO §7 | Mantiene el esquema nuevo; mismo límite INTER |
| Revertir esquema | `migration:revert` — **no recomendado** [H] RELEASE_CIRCO §7 | Pierde datos; se bloquea con INTER |
| Pérdida/corrupción de datos | Restaurar la copia de la ventana de despliegue **en instancia nueva**, verificar, reconciliar [H] RELEASE_CIRCO §7, [RESTORE-TEST](../RESTORE-TEST.md) | Se pierde lo escrito después; nunca sobre `novex-db` sin aprobación |
| Revertir código en `main` | `git revert -m 1 <merge>` por PR [H] RELEASE_CIRCO §7 | Dispara despliegue automático |

Frontend y backend se mueven como pareja: no dejar el frontend de circo apuntando a un backend anterior [H] RELEASE_CIRCO §7. Frontend: NOVEX_FRONTEND → `docs/empalme/pruebas-y-desarrollo.md`.

---

## Límites de verificación

- `gcloud` no se pudo usar (reautenticación pendiente): revisiones, tráfico, variables y secretos montados, instancia Cloud SQL, copias, PITR, Scheduler, alertas y uptime checks **sin verificar** el 2026-11-06.
- Verificado solo: código y configuración del repo en `5ffc65f`, resultado del workflow del 27-oct (API de Actions) y `GET /health/ready` público.
- Los valores de `vars`/`secrets` de GitHub no son visibles; solo sus nombres.
- No se revisó en detalle `scripts/deploy-backend.ps1|.sh` ni los scripts `start-cloud-*`.
- Todo lo marcado [H] procede de documentos del 26–27 oct y puede haber cambiado.

## Documentos relacionados

- [README.md](README.md) · [arquitectura.md](arquitectura.md) · [situaciones-y-reglas.md](situaciones-y-reglas.md) · [autenticacion-y-permisos.md](autenticacion-y-permisos.md) · [base-de-datos-y-migraciones.md](base-de-datos-y-migraciones.md) · [seguridad-y-correcciones.md](seguridad-y-correcciones.md) · [inteligencia-artificial.md](inteligencia-artificial.md) · [pruebas-y-desarrollo.md](pruebas-y-desarrollo.md)
- [CLAUDE.md](../../CLAUDE.md) · [DEPLOY_BACKEND](../../DEPLOY_BACKEND.md) · [RELEASE_CIRCO](../RELEASE_CIRCO.md) · [INCIDENTE 23-oct](../INCIDENTE-20261023-MIGRACIONES.md) · [RESTORE-TEST](../RESTORE-TEST.md) · [BACKUP-DR](../BACKUP-DR.md) · [DEPLOY](../DEPLOY.md) · [RUNBOOK](../RUNBOOK.md) · [MONITORING](../MONITORING.md) · [SECRETS-AND-VARS](../SECRETS-AND-VARS.md)
- Frontend: NOVEX_FRONTEND → `docs/empalme/pruebas-y-desarrollo.md`
