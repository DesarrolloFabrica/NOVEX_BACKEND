# Publicación de la versión de cartas y circo — procedimiento y recuperación

Versión que pasa a ser la oficial: experiencia de cartas y circo (frontend) con
su backend, integrada con la corrección de duplicados de producción del 23-oct.

| Repo | Respaldo de la versión anterior (`origin/main` antes de integrar) | Rama preparada |
|---|---|---|
| NOVEX_FRONTEND | `backup/main-pre-circo-20261026` → `b20ffd312336cf66278661f3cce5beadcf07f5e8` | `release/circo-20261026` |
| NOVEX_BACKEND | `backup/main-pre-circo-20261026` → `49a64838face6ae131ad3c30dba7276f73f84a6f` | `release/circo-20261026` |

Los dos respaldos están publicados en el remoto. Las ramas `release/*` todavía no.

---

## 1. Qué está comprobado y qué sigue pendiente

### Comprobado

| Qué | Cómo |
|---|---|
| CI de ambos repositorios en verde con los mismos pasos que los workflows | ejecución local (ver §8) |
| Idempotencia del alta sin análisis IA: concurrentes, reintento, clave reutilizada, clave nueva, evidencias | tests unitarios + API real + e2e real con navegador |
| La afectación inicial y la fila REPORTED no se duplican | e2e real (consulta a la base) |
| El frontend publicado (sin `reportKind`) registra contra el backend nuevo | API real y e2e real |
| Las claves de idempotencia creadas por el backend anterior siguen reconociéndose | API real (replay de una clave creada por `main` antes de migrar) |
| Orden efectivo de migraciones con timestamps repetidos | base desechable: las 9 de cartas se aplican tras las 5 de `main` |
| El backend anterior crea y lista situaciones con el esquema nuevo | base desechable, con `1788100000000` aplicada (sin ella: 500) |
| Panel Director (lectura continua) sobre datos reales sin errores de KPIs | e2e real |
| Registros creados por el backend ANTERIOR siguen visibles y consultables (listados por rol idénticos, todos los detalles 200, cartas y gráficas cuadran con SQL) | base aislada con datos generados por la API de 49a6483 (§10) |
| Sin mocks en la app publicada | grafo de imports desde `main.tsx` + búsqueda en el bundle de producción + guarda `production-data-sources.test.ts` |
| Error de API → aviso de error, nunca cifras ni gráficas | navegador sobre la base aislada (overview y KPIs caídos) |
| Barrido: sin `SEVERITY_ESCALATION_ENABLED` no se escala aunque exista política | prueba contra PostgreSQL |

### Pendiente (no verificado)

| Qué | Por qué | Cómo cerrarlo |
|---|---|---|
| Revisión, imagen y configuración que sirve hoy Cloud Run | `gcloud` exige reautenticación interactiva | §2.1 |
| Migraciones aplicadas y recuentos de datos reales de producción | sin conexión autorizada de lectura | §2.2 |
| Que el cron de SLA corre de verdad en producción | ídem (logs y eventos SLA) | §2.1 (logs) y consulta 8 de §2.2 |
| Decisiones sobre datos existentes (§7.1) | dependen de los recuentos reales | §2.2 |
| Prueba de restauración de Cloud SQL | riesgo abierto previo | `docs/BACKUP-DR.md` |
| Flujos del frontend anterior distintos del alta (p. ej. cierres) contra el backend nuevo durante la ventana | solo se verificó el alta | ventana corta: FE se publica justo después del BE |

---

## 2. Verificaciones previas (solo lectura, PowerShell)

Ningún comando de esta sección escribe en producción ni muestra secretos.

### 2.1 Cloud Run: qué se sirve hoy y con qué configuración

```powershell
# Autenticación interactiva (abre el navegador). El token no se comparte con nadie.
gcloud auth login
gcloud config set project it-fab-contenido-edu-5
$Region = 'us-central1'

# Tráfico (revisión y %) e imagen de cada servicio. No incluye variables.
foreach ($svc in 'novex-backend', 'novex-frontend') {
  gcloud run services describe $svc --region=$Region `
    --format="yaml(status.traffic,spec.template.spec.containers[0].image)"
}

# Últimas revisiones del backend (para un rollback por tráfico)
gcloud run revisions list --service=novex-backend --region=$Region --limit=5

# Commit de la imagen servida: se despliega por digest y el workflow la etiqueta
# con el SHA corto del commit.
foreach ($svc in 'novex-backend', 'novex-frontend') {
  $img = gcloud run services describe $svc --region=$Region `
    --format="value(spec.template.spec.containers[0].image)"
  $repo, $digest = $img -split '@'
  "$svc -> etiquetas: " + (gcloud artifacts docker images list $repo --include-tags `
    --filter="version=$digest" --format="value(tags)")
}

# Configuración del backend SIN secretos: nombres de todas las variables y valor
# solo de las banderas no secretas que afectan a esta publicación.
$svcJson = gcloud run services describe novex-backend --region=$Region --format=json | ConvertFrom-Json
$vars = $svcJson.spec.template.spec.containers[0].env
$vars | ForEach-Object { $_.name } | Sort-Object
$flags = 'NODE_ENV', 'SITUATION_SWEEP_CRON_ENABLED', 'SEVERITY_ESCALATION_ENABLED',
         'CATALOG_SEED_ON_BOOT', 'DEMO_SEED_ENABLED', 'ENABLE_EMAIL_LOGIN', 'DB_SYNCHRONIZE'
$vars | Where-Object { $flags -contains $_.name } | Select-Object name, value
'SCHEDULER_OIDC_AUDIENCE', 'SCHEDULER_OIDC_SERVICE_ACCOUNT_EMAIL' |
  ForEach-Object { "$_ definida: " + [bool]($vars | Where-Object name -eq $_) }

# min-instances: con 0, el @Cron de SLA solo corre mientras haya una instancia viva.
$svcJson.spec.template.metadata.annotations.'autoscaling.knative.dev/minScale'

# ¿Corre hoy el cron de SLA? Líneas de log de los últimos 30 días.
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="novex-backend" AND textPayload:"SLA sweep"' `
  --freshness=30d --limit=20 --format="value(timestamp,textPayload)"

# ¿Existe ya un job de Cloud Scheduler para el barrido?
gcloud scheduler jobs list --location=$Region --format="table(name,schedule,state)"

# Copias de Cloud SQL disponibles
gcloud sql backups list --instance=novex-db --limit=5
```

Debe corresponder a `b20ffd3` (frontend) y `49a6483` (backend), que son los
últimos despliegues correctos de GitHub Actions (23-oct). Con
`SITUATION_SWEEP_CRON_ENABLED` ausente o `true` y `SEVERITY_ESCALATION_ENABLED`
ausente, la publicación conserva los avisos de SLA y no escala.

### 2.2 Datos de producción: migraciones y recuentos (solo lectura)

`scripts/release-circo-preflight-readonly.sql` corre en una transacción
`READ ONLY` que termina en `ROLLBACK` y solo devuelve recuentos.

```powershell
cd C:\dev\Novex\NOVEX_BACKEND
# Datos de conexión NO secretos tomados de Cloud Run (§2.1 deja $svcJson y $vars).
$conn = $svcJson.spec.template.metadata.annotations.'run.googleapis.com/cloudsql-instances'
$db   = ($vars | Where-Object name -eq 'DB_DATABASE').value
$user = ($vars | Where-Object name -eq 'DB_USERNAME').value

# Proxy de Cloud SQL (v2) en un puerto que no usa nada de NOVEX.
$proxy = Start-Process cloud-sql-proxy.exe -ArgumentList "$conn --port 55499" -PassThru -NoNewWindow

# Sesión FORZADA a solo lectura. psql pide la contraseña sin mostrarla.
$env:PGOPTIONS = '-c default_transaction_read_only=on'
psql "host=127.0.0.1 port=55499 dbname=$db user=$user sslmode=disable" `
  -v ON_ERROR_STOP=1 -f scripts\release-circo-preflight-readonly.sql
Remove-Item Env:PGOPTIONS
Stop-Process -Id $proxy.Id
```

`migration:show` (opcional; la consulta 1 del script ya da la misma lista).
El script real del repositorio es
`npm run typeorm -- migration:show -d ./src/database/data-source.ts`.
`data-source.ts` carga `.env` **sin sobrescribir** lo que ya está en la sesión
y elige local o nube con `DB_CLOUD`; por eso se fija todo en la sesión y se
confirma el destino antes de ejecutarlo:

```powershell
# Con el proxy de arriba en marcha:
$env:DB_CLOUD = 'false'
$env:DB_HOST_LOCAL = '127.0.0.1'; $env:DB_PORT_LOCAL = '55499'; $env:DB_SSL_LOCAL = 'false'
$env:DB_DATABASE_LOCAL = $db; $env:DB_USERNAME_LOCAL = $user
$sec = Read-Host 'Contraseña de la base' -AsSecureString
$env:DB_PASSWORD_LOCAL = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))

# 1) Destino efectivo (solo perfil, host, puerto y base; nunca la contraseña).
#    Debe decir: local 127.0.0.1 55499 <base de producción>
npx ts-node -T -e "const r=require('./src/configuration/resolve-database-env').resolveDatabaseEnv(process.env);console.log(r.profile,r.host,r.port,r.database)"

# 2) Solo si el destino es el correcto:
npm run migration:show

Remove-Item Env:DB_PASSWORD_LOCAL, Env:DB_USERNAME_LOCAL, Env:DB_DATABASE_LOCAL,
  Env:DB_HOST_LOCAL, Env:DB_PORT_LOCAL, Env:DB_SSL_LOCAL, Env:DB_CLOUD
```

Esperado antes de publicar: aplicadas todas hasta
`CreateSituationEvidenceClientKeyIndex1787400000001` (las 5 de `main` del
23-oct) y pendientes exactamente estas 11:

```
AddSituationResolutions1787200000000
GrantReportingAndClosurePermissions1787300000000
AddSituationReportKindAndAffectedCoordination1787400000000
GrantAnalystSituationsClose1787500000000
GrantDirectorKpisView1787600000000
AddSituationSeverityHistory1787700000000
BackfillReportedSeverity1787800000000
AddSituationConsequences1787900000000
AddConsequenceAndEscalationTimelineEvents1788000000000
LegacySituationInsertCompatibility1788100000000
RevokeAdminDirectorSituationsCreate1788200000000
```

Si aparece otra combinación (p. ej. migraciones de cartas ya aplicadas por un
despliegue manual, o las 5 de `main` sin aplicar), **detenerse** y revisar.

Tres migraciones de cartas comparten timestamp con migraciones de `main`
(`1787200000000`, `1787300000000`, `1787400000000`) con nombres distintos.
TypeORM identifica por nombre y aplica las pendientes aunque sean
"anteriores": comprobado en base desechable. No se renombran.

---

## 3. Respaldos

**Código.** Las ramas `backup/main-pre-circo-20261026` apuntan al `origin/main`
exacto anterior a la integración (tabla inicial). Nunca se reescribe `main`.

**Base de datos.** Imprescindible: las migraciones de cartas no se pueden
deshacer sin perder datos (§7).

```bash
# Copia bajo demanda inmediatamente antes de migrar
gcloud sql backups create --instance=novex-db --project=it-fab-contenido-edu-5 \
  --description="pre-circo-$(date +%Y%m%d-%H%M)"

# Confirmar que terminó (estado SUCCESSFUL) y anotar su ID
gcloud sql backups list --instance=novex-db --project=it-fab-contenido-edu-5 --limit=3
```

---

## 4. Orden de publicación

El backend nuevo admite el frontend anterior (alta sin `reportKind`) y el
backend anterior admite el esquema nuevo (`1788100000000`). Eso permite
publicar **sin ventana de alta caída**, en este orden:

1. **Congelar `main`** en ambos repos (nadie fusiona durante la ventana).
2. **Verificaciones** §2.1 y §2.2. Si algo no coincide, detenerse.
3. **Backup de Cloud SQL** §3.
4. **Migraciones en producción**, con el backend anterior todavía sirviendo:
   ```bash
   npm run migration:show   # revisar que el lote es exactamente el de §2.2
   npm run migration:run    # aplica el lote completo
   npm run migration:show   # todas aplicadas
   ```
   Comprobar en seguida (backend anterior + esquema nuevo): alta de una
   situación de prueba y listado de situaciones. Si falla, §6.
5. **Backend**: PR `release/circo-20261026` → `main` con *merge commit* (sin
   squash ni rebase). El push a `main` dispara `Deploy Backend`; esperar
   *Validate* verde, revisión candidata sana y promoción.
6. **Comprobaciones del backend** (§5, bloque backend). Si fallan, §6.
7. **Frontend**: PR `release/circo-20261026` → `main` con *merge commit*.
   `Deploy Frontend` hace smoke y CORS contra el backend ya publicado.
8. **Comprobaciones completas** (§5).
9. Descongelar `main`.

Entre 5 y 7 el frontend anterior sigue registrando contra el backend nuevo. La
excepción es el **analista**, que en el contrato anterior registraba sin
coordinación: recibe 400 `LEGACY_REGISTRATION_REQUIRES_COORDINATION` y debe
recargar tras el paso 7.

---

## 5. Comprobaciones posteriores

Backend:

- `GET /health` 200 y `GET /health/ready` con `"database":"up"`; `GET /api/v1/auth/me` → 401.
- Logs: ningún `QueryFailedError`; las líneas `Alta con el contrato anterior` solo durante la ventana.
- Logs del primer barrido (`Barrido: N vencidas, N avisos, 0 escalamientos`): escalamientos debe ser 0.

Frontend (con usuarios reales de cada rol):

- Login con Google y escena de circo; abanico de cartas y personaje.
- Coordinador: registrar un problema interno y una dependencia INTER; reintentar el mismo envío no duplica.
- Resolver con aprendizaje.
- Director: KPIs y modo Estado en lectura continua.
- Analista: alta desde las cartas eligiendo coordinación.
- Rutas antiguas (`/panorama`, `/reportes`, `/red-impacto`, …) redirigen al centro operacional.

## 6. Condiciones para detener el despliegue

- §2.1 o §2.2 no coinciden con lo esperado.
- El backup de Cloud SQL no termina en `SUCCESSFUL`.
- `migration:run` falla o aplica algo distinto del lote revisado.
- Tras migrar, el backend anterior no puede crear o listar situaciones.
- El workflow falla en *Validate*, *smoke* o promoción (el workflow no promueve una revisión candidata fallida).
- Errores 5xx sostenidos, `QueryFailedError` o escalamientos > 0 en el barrido.

Detenerse = no fusionar el siguiente PR y aplicar §7.

## 7. Recuperación y limitaciones

| Situación | Acción | Limitación |
|---|---|---|
| Falla el backend nuevo y ya hay revisión anterior de cartas sana | `gcloud run services update-traffic novex-backend --to-revisions=REV=100` | ninguna (mismo esquema) |
| Hay que volver al backend **anterior a cartas** | `workflow_dispatch` de *Deploy Backend* sobre `backup/main-pre-circo-20261026`, o tráfico a su revisión | funciona porque `1788100000000` sigue aplicada; **el listado global (Director/Admin) da 500 en cuanto existe un problema INTER** (espera categoría) |
| Hay que volver al frontend anterior | `workflow_dispatch` de *Deploy Frontend* sobre el respaldo, o tráfico a su revisión | solo tiene sentido junto con el backend anterior |
| Devolver `main` al código anterior sin reescribirlo | `git revert -m 1 <merge>` en cada repo (PR) | crea commits nuevos y dispara despliegue |
| Deshacer el esquema | **no recomendado**: `migration:revert` borra afectaciones, historial de severidad, severidad reportada y permisos, y se bloquea en `1787400000000` si hay problemas INTER | la vía real es restaurar el backup de §3, perdiendo lo escrito después |

### 7.1 Datos existentes: qué cambia al verlos con la versión de cartas

Comprobado con datos generados por la API de la versión anterior (§10). Las
migraciones no borran ni alteran ningún registro existente; estas son las
diferencias de **visualización** y lo que requiere decisión:

| Caso | Efecto en cartas | Regla | Acción |
|---|---|---|---|
| Situación antigua de **analista sin coordinación** y activa | Aparece en «Mis reportes» del analista y en el registro de analista del Director, no en ninguna carta ni KPI de coordinación. **Nadie puede avanzarla ni resolverla** (403 para autor, Director y Admin) | el dominio de cartas exige coordinación; no se inventa | **Decisión pendiente** según la consulta 3 de §2.2: asignar a mano cada caso a su coordinación real o cerrarlos con la regla que se acuerde. No se automatiza |
| `RESOLVED` legado sin `closed_at` | La carta y el KPI base no la cuentan (activas = OPEN + IN_PROGRESS); el KPI de estado sí («activo al corte»): para B2B se vio 4 frente a 5 | regla documentada en `coordination-integrity.ts` vs. corte temporal | Decidir solo si la consulta 4 da > 0; la versión anterior ya no producía ese estado |
| Coordinación **inactiva** con situaciones | Desaparece de cartas, totales y KPIs (404); sus registros siguen en el listado | catálogo activo | Revisar solo si la consulta 5 da filas |
| Categoría que dejó de ser seleccionable | Se sigue mostrando con su nombre | — | ninguna |
| Situación cerrada antes de cartas | Sin aprendizaje: cuenta como «sin aprendizaje» y no aparece en la lista de aprendizajes | intencional (`1787200000000` no rellena) | ninguna |
| Severidad editada en la versión anterior | `reported_severity` = la del alta; el historial muestra una sola fila REPORTED | backfill de `1787800000000` | ninguna; la consulta 7 da cuántas |
| Permiso de alta de ADMIN y DIRECTOR | `1787300000000` lo concedía; `1788200000000` lo retira (estado actual de producción) | catálogo de permisos y frontend | commit separado; descartarlo si la concesión era intencionada |

Preferencia: corregir hacia delante dentro de la versión de cartas. El respaldo
de código no basta para recuperar producción si las migraciones ya corrieron.

```bash
# Despliegue manual de la versión anterior SIN tocar main (desde GitHub → Actions
# → Deploy Backend → Run workflow → rama backup/main-pre-circo-20261026).
# Equivalente con la CLI de GitHub, si está instalada:
gh workflow run deploy-backend.yml --ref backup/main-pre-circo-20261026 -f reason="rollback pre-circo"
```

## 8. Barrido automático, avisos de SLA y escalamiento

| | Versión publicada (49a6483) | Versión de cartas |
|---|---|---|
| Avisos y vencimientos de SLA | `SituationSlaScheduler`, `@Cron` cada 30 min, siempre activo | mismo `@Cron`, ahora vía `SituationSweepService`; `SITUATION_SWEEP_CRON_ENABLED` (por defecto activo) |
| Escalamiento automático de severidad | no existe | fase del barrido con interruptor PROPIO `SEVERITY_ESCALATION_ENABLED` (por defecto **apagado**) |
| ¿Puede cambiar severidades al publicar? | — | no: interruptor apagado **y** política activa `NULL` en filas nuevas y existentes |

Confirmado en código y en pruebas (PostgreSQL): sin el interruptor, una fila
con política vence por SLA pero no escala. **No confirmado en producción**: que
el `@Cron` corra de verdad (Cloud Run con `min-instances=0` solo ejecuta crones
mientras hay una instancia viva); se comprueba con los logs de §2.1 y la
consulta 8 de §2.2.

Diferencias de la nueva implementación de SLA (no de su significado): procesa
hasta 5 000 filas por fase y ejecución (antes 200/300), la ventana de aviso
usa la severidad reportada y el vencimiento no toca `updated_at`. El primer
barrido tras publicar puede generar de golpe los avisos que el cron anterior
no alcanzó.

Configuración inicial: **sin cambios de variables**. Cloud Scheduler no se
configura en esta publicación; sin `SCHEDULER_OIDC_*` el endpoint
`POST /internal/jobs/situation-sweep` rechaza todas las llamadas. Activación
posterior: `docs/INTERNAL_VIVO.md`, sección *Barrido y Cloud Scheduler*.
Activar el escalamiento exige las dos cosas: una política aprobada en
`severity-escalation.policy.ts` y `SEVERITY_ESCALATION_ENABLED=true`.

## 9. Elementos transitorios a retirar

Cuando ya no haga falta convivir con el frontend ni el backend anteriores:

- `SituationsService.createLegacyContract` y la opcionalidad de `reportKind` en `CreateSituationDto`.
- Los triggers de `1788100000000` (con una migración nueva que los elimine; no revertir la existente).

## 10. Resultados de validación (2026-10-26, local)

| Repo | Paso del workflow | Resultado |
|---|---|---|
| Backend (`release/circo-20261026`, exportación limpia + `npm ci`) | lint (con `--fix`, como el CI) | 0 errores, 54 avisos; el `--fix` no modifica ningún archivo |
| | tests unitarios | 768 passed, 38 skipped (las suites que exigen PostgreSQL) |
| | `test:security` | 44/44 |
| | build | correcto |
| | contrato del contenedor (imagen Docker) | CMD `node dist/main.js`, liveness 200, readiness 503 sin BD |
| Frontend (exportación limpia + `npm ci`) | lint, typecheck | correctos |
| | tests unitarios | 1397/1397 |
| | build | correcto |

Antes de la integración, la candidata no pasaba el CI del backend: el paso de
lint ejecuta `eslint --fix`, que quitaba aserciones de tipo sobre
`manager.query` (falso positivo de `no-unnecessary-type-assertion`) y dejaba
el build con TS7006, además de 249 errores de lint.

Pruebas reales (base desechable, backend y navegador reales):

- Migraciones: lote de §2.2 sobre el estado de `main`, orden verificado; el
  backend anterior crea y lista tras migrar (sin `1788100000000`: 500);
  reversión completa bloqueada en `1787400000000` con problemas INTER.
- API: concurrentes (5 → 1), reintento (`replayed`), clave reutilizada (422),
  clave nueva, evidencias simultáneas (3 → 1), contrato anterior (201 /
  analista 400), replay de clave creada por `main`, INTER, resolución con
  aprendizaje, overview.
- `e2e-real` (navegador): 9/9 en dos ejecuciones completas seguidas; en una
  primera ejecución en frío falló una vez «recarga tras respuesta perdida»
  porque el detalle no se abrió solo (sin duplicado: verificado en la base).
- Datos de la versión anterior (base aislada, creados por la API de 49a6483
  con coordinadores de dos coordinaciones y un analista; solo se ajustaron por
  SQL la antigüedad, un `RESOLVED` legado y una categoría histórica):
  - listados por rol idénticos antes y después (Director/Admin/Analista 12,
    Coord. General 6, B2B 4) y todos los detalles responden 200;
  - cartas y gráficas del Director cuadran con SQL (General: 4 activos al
    corte, 4 reportados y 1 cerrado en el ciclo; carga 2/4/4 por mes);
  - coordinación sin datos → estados vacíos; overview o KPIs caídos → aviso de
    error, sin estados ni gráficas; navegador 7/7;
  - el backend anterior sigue creando tras migrar (1 fila REPORTED) y el nuevo
    también, con y sin `reportKind`; `internal-vivo.pg.spec` 8/8.
- Suite e2e del frontend con mocks (31 specs que no regeneran capturas):
  release 160 passed / 50 failed / 49 skipped; la candidata original
  (`7559ce1`) da 161 / 49 / 49. Los 49 fallos son los mismos (geometría de
  mesa, subbaraja y selección: deuda previa de la candidata). El único
  distinto («detalle crece… 1920x1080») es inestable en ambas versiones
  (aislado: release 2/2, candidata 1/2).
