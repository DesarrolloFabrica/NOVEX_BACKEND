# Publicación de la versión de cartas y circo — procedimiento y recuperación

Versión que pasa a ser la oficial: experiencia de cartas y circo (frontend) con
su backend, integrada con la corrección de duplicados de producción del 23-oct.

| Repo | Respaldo de la versión anterior (`origin/main` antes de integrar) | Rama preparada |
|---|---|---|
| NOVEX_FRONTEND | `backup/main-pre-circo-20261026` → `b20ffd312336cf66278661f3cce5beadcf07f5e8` | `release/circo-20261026` |
| NOVEX_BACKEND | `backup/main-pre-circo-20261026` → `49a64838face6ae131ad3c30dba7276f73f84a6f` | `release/circo-20261026` |

Los dos respaldos están publicados en el remoto. Las ramas `release/*` se
publican el 26-oct con PR en borrador hacia `main` (sin fusionar).

---

> **Actualización 2026-10-26 17:14 UTC.** Incidente corregido: aplicadas las 5
> migraciones de `main` y tráfico de vuelta a `novex-backend-00085-tug`
> (`docs/INCIDENTE-20261023-MIGRACIONES.md`). Producción tiene ahora 18
> migraciones; a la release le quedan **9** (ensayado en base desechable con
> ese estado). Recuentos reales: A = 0, B = 0, C = 0. ADMIN y DIRECTOR tienen hoy
> `SITUATIONS_CREATE` (migración del 22-sep); la release lo retira.

## 0. Estado verificado de producción (2026-10-26, solo lectura)

| | Backend | Frontend |
|---|---|---|
| Revisión con el 100 % del tráfico | `novex-backend-00085-tug` | `novex-frontend-00073-duy` |
| Imagen (por digest) | `…/novex-backend@sha256:55cabdcb…5df` | `…/novex-frontend@sha256:8a9bcc5d…1a5` |
| Tag del digest = commit | `49a6483` | `b20ffd3` |
| Respaldo `backup/main-pre-circo-20261026` | coincide | coincide |

Configuración del backend servido: `NODE_ENV=production`,
`CATALOG_SEED_ON_BOOT=false`, `DEMO_SEED_ENABLED=false`,
`ENABLE_EMAIL_LOGIN=false`, `DB_SYNCHRONIZE=false`;
`SITUATION_SWEEP_CRON_ENABLED` y `SEVERITY_ESCALATION_ENABLED` no definidas
(valores por defecto del código); `SCHEDULER_OIDC_*` no definidas;
min-instances 0. Instancia `novex-db` (PostgreSQL 16, Enterprise,
`db-f1-micro`, zonal, 10 GB SSD, IP pública, CA `GOOGLE_MANAGED_INTERNAL_CA`).

**Incidencia del 23-oct (corregida el 26-oct, no causada por esta release).**
Las 5 migraciones de `49a6483` no se habían aplicado y toda consulta de
situaciones fallaba. Detalle en `docs/INCIDENTE-20261023-MIGRACIONES.md`.

**Acceso a la base desde la red de oficina:** el firewall de la oficina
re-firma el TLS del conector de Cloud SQL; el proxy lo rechaza, como debe. Las consultas
de §2.2 deben ejecutarse desde una red sin inspección TLS (p. ej. Cloud Shell)
o con una excepción de inspección para la instancia.

**Copias:** 7 automáticas diarias (`SUCCESSFUL`, la última el 26-oct) más 2
bajo demanda (04-ago y 22-sep); PITR habilitado, 7 días de logs. El historial
de operaciones de `novex-db` llega a su creación (30-jul) y no contiene
ninguna restauración ni clon: **no hay evidencia de un restore probado**.

**Cloud Scheduler:** los 5 jobs del proyecto encienden y apagan otras
instancias (`producto-backend-db`, `carga-lms-desarrollo`); ninguno afecta a
NOVEX.

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
| Compatibilidad: el backend `49a6483` lista, muestra, da de alta con el contrato anterior, reintenta sin duplicar y guarda notas con `clientKey` sobre el esquema con las 9 migraciones | PostgreSQL 16 local desechable, 21/21 (§10.1); sin producción ni Gemini real |

### Pendiente (no verificado)

| Qué | Por qué | Cómo cerrarlo |
|---|---|---|
| Validación manual en producción con usuario real: login, listado y detalle de situaciones existentes; y, si el usuario tiene una situación real que registrar, guardado de notas y una sola aparición en el listado. **Pendiente de confirmación del usuario.** No se provocan dobles clics ni situaciones ficticias en producción. No se aprueba por ausencia de errores en logs. **Comprobación previa al despliegue (27-oct, sobre el frontend anterior `b20ffd3`, publicado y confirmada por el usuario): login, listado y detalle de situaciones existentes correctos. No se ha hecho alta nueva.** Pendiente: alta con una situación real y revisión visual de cartas y circo al publicar | requiere un usuario real | `docs/INCIDENTE-20261023-MIGRACIONES.md` §«Prueba manual» |
| Repetir §2.2 justo antes de migrar | el estado puede cambiar hasta la ventana | §2.2 |

Ya cerrado el 26-oct (solo lectura, Cloud Shell): revisiones y configuración
servidas, migraciones aplicadas por nombre y recuentos (A = B = C = 0).

Prueba de restauración del backup `1793034669505` en una instancia aislada
(26-oct, `docs/RESTORE-TEST.md`): restauración correcta (≈ 16 min), datos
idénticos a producción salvo escrituras posteriores explicadas fila a fila, y
sobre la copia las 5 de `main` (esquema = producción) y las 9 de la release
(esquema = repositorio, datos conservados, `SITUATIONS_CREATE` solo en
ANALISTA y COORDINADOR) en 8 s y 11 s. Instancia eliminada.
| Flujos del frontend anterior distintos del alta (p. ej. cierres) contra el backend nuevo durante la ventana | solo se verificó el alta | ventana corta: FE se publica justo después del BE |

---

## 2. Verificaciones previas (solo lectura, PowerShell)

Ningún paso de esta sección escribe en producción ni muestra secretos. Los
comandos están versionados y corrigen lo que no era fiable en la versión
anterior de este documento:

- se consultan las revisiones que **reciben tráfico** (`status.traffic` con
  porcentaje > 0) y no `spec.template`, que puede ser otra revisión;
- banderas, instancia de Cloud SQL y `min-instances` se leen de esas
  revisiones;
- se distingue imagen por tag o por digest y se usa el digest servido
  (`status.imageDigest`) para encontrar el tag del commit;
- el nombre de la instancia sale de la anotación de la revisión servida;
- el proxy lo inicia y lo cierra el propio script (`try/finally`), y las
  variables `PG*` se restauran aunque falle la consulta.

```powershell
# Paso interactivo previo (abre el navegador):
gcloud auth login

cd C:\dev\Novex\NOVEX_BACKEND

# Cloud Run, Cloud SQL (copias y restores), logs del cron de SLA, Scheduler:
.\scripts\release-circo-preflight.ps1

# Además, consultas de solo lectura a la base (proxy en contenedor + Node `pg`;
# la contraseña se pide por teclado):
.\scripts\release-circo-preflight.ps1 -RunDatabaseChecks -PasswordSource Prompt
```

Herramientas: si `cloud-sql-proxy` no está instalado, el script usa la imagen
oficial en Docker (`-ProxyMode Docker`, por defecto; descargarla es una
instalación). `psql` no es necesario: `scripts/run-readonly-sql.mjs` usa el
cliente `pg` del backend, abre la sesión con
`default_transaction_read_only=on`, aborta si el servidor no lo confirma y
contrasta las migraciones **por nombre** con `src/database/migrations`.

`migration:show` es opcional (la consulta 01 da la misma información). El
script real es `npm run typeorm -- migration:show -d ./src/database/data-source.ts`;
`data-source.ts` carga `.env` sin sobrescribir las variables de la sesión y
elige local o nube con `DB_CLOUD`. Para usarlo hay que fijar en la sesión
`DB_CLOUD=false` y `DB_*_LOCAL` apuntando al proxy, y confirmar antes el
destino con:

```powershell
npx ts-node -T -e "const r=require('./src/configuration/resolve-database-env').resolveDatabaseEnv(process.env);console.log(r.profile,r.host,r.port,r.database)"
```

Las migraciones pendientes se contrastan por nombre: no se presupone un número.
Producción (26-oct, tras la corrección) tiene 18 aplicadas, entre ellas las 2
de cartas del despliegue manual del 22-sep (`AddSituationResolutions1787200000000`
y `GrantReportingAndClosurePermissions1787300000000`). Esas dos no se repiten:
su `name` coincide con las filas de `typeorm_migrations`, y su código es el de
`4a8d936` (la segunda solo difiere en el salto de línea de la declaración de
clase, por lint; idénticas ignorando espacios). Quedan **9**:

```
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

Si aparece otra combinación, **detenerse** y revisar.
`AllowAnalystUnassignedSituations1786500000000` figura en producción y no en el
repositorio: no deja huella en el esquema (§ del informe del incidente) y no
impide ejecutar las 9.

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
gcloud sql backups create --instance=<INSTANCIA_DEL_PREFLIGHT> --project=it-fab-contenido-edu-5 \
  --description="pre-circo-$(date +%Y%m%d-%H%M)"

# Confirmar que terminó (estado SUCCESSFUL) y anotar su ID
gcloud sql backups list --instance=<INSTANCIA_DEL_PREFLIGHT> --project=it-fab-contenido-edu-5 --limit=3
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

**Principios**

- **Disponibilidad no es comportamiento anterior.** Volver al backend `49a6483`
  devuelve el servicio, pero **conserva el esquema nuevo**: permisos (`SITUATIONS_CREATE`
  retirado a ADMIN y DIRECTOR), severidad reportada, historial de severidad,
  consecuencias y ayudas de compatibilidad. No restaura el estado de producción de antes de la release.
- **Frontend y backend se mueven como pareja.** El frontend de circo usa rutas y
  campos que `49a6483` no tiene (KPIs Director, historial de severidad, INTER). **No dejar
  el frontend de circo apuntando al backend anterior.** La compatibilidad probada
  (§10.1) es solo la del backend con el contrato de alta del frontend `b20ffd3`.
- **Pareja anterior, válida solo mientras no existan reportes INTER** (servida el 26-oct y el 27-oct; comprobada en §10.1 sin INTER y **no válida con INTER**, §10.2):
  frontend `novex-frontend-00073-duy` (`b20ffd3`) + backend `novex-backend-00085-tug` (`49a6483`).
- **Ninguna acción de esta sección es automática.** Restaurar backups, revertir
  migraciones, lanzar `workflow_dispatch` o revertir código requieren aprobación explícita.

| Situación | Acción (con aprobación) | Qué se recupera / limitación |
|---|---|---|
| Falla el backend nuevo; el frontend de circo no se ha publicado todavía | Tráfico a `novex-backend-00085-tug` y frontend a `novex-frontend-00073-duy` (`update-traffic` en ambos) | Disponibilidad con la pareja anterior. El esquema y los permisos nuevos se mantienen. **Probado el 27-oct (§10.2): no viable una vez existe un INTER.** Con reportes INTER creados por la release, `49a6483` devuelve 500 en el listado de **todos** los roles y en el detalle de los INTER. Sin INTER, la pareja anterior sí sirve (§10.1). Ver la fila siguiente |
| Falla tras publicar el frontend de circo | Corregir hacia delante. Volver a la pareja anterior **de los dos servicios a la vez** solo si **no existe ningún reporte INTER**. Si ya existe alguno, la vuelta atrás de código no es viable (§10.2): corregir hacia delante, o asumir indisponibilidad de lectura hasta la corrección | Igual que la fila anterior: disponibilidad, no comportamiento anterior. Afectaciones INTER y cambios de severidad hechos en la ventana siguen en la base |
| Hay que desplegar el backend anterior desde su respaldo de código | `workflow_dispatch` de *Deploy Backend* sobre `backup/main-pre-circo-20261026`, solo con aprobación | Mismo esquema nuevo; `1788100000000` sigue aplicada para aceptar el contrato anterior |
| Pérdida o corrupción de datos | Restaurar **el backup on-demand tomado en la ventana de despliegue** (§3) en una instancia nueva, verificar, y decidir la reconciliación con el responsable | Recupera los datos hasta ese backup. Lo escrito después se pierde salvo reconciliación. **No usar `1793034669505`**: es anterior a la corrección y a las escrituras posteriores. Restaurar sobrescribe la instancia destino; nunca sobre `novex-db` sin aprobación |
| Revertir el esquema | **No recomendado**: `migration:revert` borra afectaciones, historial de severidad, severidad reportada y permisos, y se bloquea en `1787400000000` si hay problemas INTER | Ninguna vía segura sin restaurar un backup |
| Devolver `main` al código anterior | `git revert -m 1 <merge>` en cada repo (PR), con aprobación | Crea commits nuevos y dispara despliegue; no reescribe historia |

### 7.1 Datos existentes: qué cambia al verlos con la versión de cartas

Comprobado con datos generados por la API de la versión anterior (§10). Las
migraciones no borran ni alteran ningún registro existente; estas son las
diferencias de **visualización** y lo que requiere decisión:

| Caso | Efecto en cartas | Regla | Acción |
|---|---|---|---|
| Situación antigua de **analista sin coordinación** y activa | Aparece en «Mis reportes» del analista y en el registro de analista del Director, no en ninguna carta ni KPI de coordinación. **Nadie puede avanzarla ni resolverla** (403 para autor, Director y Admin) | el dominio de cartas exige coordinación; no se inventa | ver propuesta A (§7.2), según la consulta 05 |
| `RESOLVED` legado sin `closed_at` | La carta y el KPI base no la cuentan (activas = OPEN + IN_PROGRESS); el KPI de estado sí («activo al corte»): para B2B se vio 4 frente a 5 | regla documentada en `coordination-integrity.ts` vs. corte temporal | Decidir solo si la consulta 4 da > 0; la versión anterior ya no producía ese estado |
| Coordinación **inactiva** con situaciones | Desaparece de cartas, totales y KPIs (404); sus registros siguen en el listado | catálogo activo | Revisar solo si la consulta 5 da filas |
| Categoría que dejó de ser seleccionable | Se sigue mostrando con su nombre | — | ninguna |
| Situación cerrada antes de cartas | Sin aprendizaje: cuenta como «sin aprendizaje» y no aparece en la lista de aprendizajes | intencional (`1787200000000` no rellena) | ninguna |
| Severidad editada en la versión anterior | `reported_severity` = la del alta; el historial muestra una sola fila REPORTED | backfill de `1787800000000` | ninguna; la consulta 7 da cuántas |
| Permiso de alta de ADMIN y DIRECTOR | `1787300000000` lo concedía; `1788200000000` lo retira (estado actual de producción) | catálogo de permisos y frontend | commit separado; descartarlo si la concesión era intencionada |

### 7.2 Propuestas de tratamiento de excepciones (no ejecutadas)

Cada propuesta solo aplica si su consulta del preflight devuelve más de 0. No
se reasigna ningún registro, no se inventan fechas de cierre ni aprendizajes y
no se usan `created_at`/`updated_at` como fecha de cierre.

**A. Situaciones activas sin coordinación** (consulta 05, estados OPEN, IN_PROGRESS o RESOLVED)

- Hoy (49a6483): las ve todo rol con `SITUATIONS_VIEW`; quien las registró
  (el analista) puede avanzarlas y cerrarlas (`ownsSituation`: autoría).
- Con la release: siguen visibles (listado, «Mis reportes» del autor y
  registro de analista del Director), pero **nadie** puede avanzarlas ni
  resolverlas: las reglas nuevas exigen coordinación responsable y declaran
  expresamente que la autoría no concede permiso. Siguen generando avisos SLA.
- Propuesta mínima (requiere tu decisión, porque cambia una regla de la
  release): conservar para estas filas antiguas la regla vigente hoy, es
  decir, que solo su autor pueda avanzarlas y resolverlas con aprendizaje
  escrito por él. Cambio acotado en `canResolveSituation` y
  `canAdvanceSituationToInProgress`: la condición
  `coordinationId === null && autor === actor && rol ANALISTA`. No se amplía
  a ningún otro rol ni a filas con coordinación.
- Alternativa sin código: que una persona autorizada revise cada caso y lo
  asigne a su coordinación real con la regla de negocio que se acuerde.

**B. RESOLVED sin `closed_at`** (consulta 06) — decisión pendiente, sin cambios

- Regla de NOVEX: activos = OPEN e IN_PROGRESS; un RESOLVED sin `closed_at`
  no cuenta como cierre histórico.
- Cumplen esa regla: cartas, vidas y overview (`coordination-integrity.ts`,
  pruebas `coordination-integrity.spec.ts`, `coordination-life-points.spec.ts`,
  `operational-overview.service.spec.ts`) y los KPIs de cierres y tiempo de
  resolución (exigen `closed_at`).
- NO la cumplen los KPIs «al corte» (snapshot, antigüedad y backlog del
  historial, añadidos en 3f53b42): cuentan como activo todo lo no cerrado
  antes del corte y presentan RESOLVED como IN_PROGRESS; lo fijan
  `operational-kpi-aging.spec.ts` y `operational-kpi-snapshot.repository.spec.ts`.
- La corrección coherente estaría en esos KPIs, no en las cartas, pero exige
  decidir qué estado tenía una fila RESOLVED en cortes pasados (no hay
  historial de estados). No se toca hasta conocer el recuento real y decidir.

**C. Coordinaciones inactivas con situaciones** (consulta 07)

- Hoy: sus situaciones aparecen en el listado general para los roles que lo
  ven. Con la release: siguen en `GET /situations` y su detalle abre con las
  mismas reglas, pero la coordinación no tiene carta y sus KPIs responden 404.
- Propuesta mínima: si hay filas, dar una vía de consulta histórica de solo
  lectura (filtro por coordinación que admita inactivas en el historial, para
  los roles que ya tienen `SITUATIONS_VIEW`). No se reactivan coordinaciones
  ni se mueven registros. Si solo hay cerradas, basta con documentarlo.

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

### 10.1 Compatibilidad del backend 49a6483 con el esquema de la release (2026-10-27, local)

Pregunta: ¿el backend que sigue sirviendo en producción durante la ventana
funciona contra el esquema con las 9 migraciones aplicadas? Respuesta: **sí**,
en una base PostgreSQL 16 local desechable. Sin credenciales ni datos de
producción. No sustituye a la validación manual con usuario real (§1).

**Procedimiento (copias de trabajo aisladas; las ramas no se tocaron)**

1. Esquema del estado de producción (18 migraciones): las 15 de `49a6483`
   (ficheros idénticos a los de la release), más `AddSituationResolutions1787200000000`
   y `GrantReportingAndClosurePermissions1787300000000` de la release, más una
   fila en `typeorm_migrations` para `AllowAnalystUnassignedSituations1786500000000`
   (sin fichero en el repo, como en producción). Catálogos y usuarios sintéticos
   con el seed E2E del backend `49a6483`, sin cargar datos reales.
   Comprobación: 18 filas en `typeorm_migrations`, 17 permisos, 37 `role_permissions`.
2. Datos sintéticos con la API de `49a6483` (7 situaciones con análisis, notas,
   reintentos, PATCH de estado, clave reutilizada y un analista sin coordinación).
   Gemini se sustituye por el stub de E2E del propio repo (`test/e2e-support/gemini-stub.ts`).
3. Las 9 migraciones con el CLI de la release: `npm run migration:run`
   (12,9 s, sin errores; 18 → 27 filas en `typeorm_migrations`).
4. `49a6483` arrancado contra ese esquema y la batería de comprobaciones de abajo.

**Resultados**

| Comprobación | Resultado |
|---|---|
| Datos anteriores tras migrar: situaciones, evidencias, timeline, usuarios y coordinaciones | huella idéntica antes y después |
| Permisos | 17 → 18; `SITUATIONS_CREATE` solo en ANALISTA y COORDINADOR; `role_permissions` 37 (reparto distinto) |
| Listado por rol (coordinador A y B, analista, Director, Admin) | igual que antes de migrar |
| Detalle de los registros anteriores (4 situaciones) y estado conservado | 200; estado IN_PROGRESS intacto |
| Evidencias de un registro anterior | 2 notas, sin duplicar |
| Alta con el contrato del frontend `b20ffd3` (sin `reportKind`) | 201 con situación y análisis |
| Reintento con la misma `Idempotency-Key` | mismo id, `replayed: true`, ninguna fila nueva |
| Misma clave con otro cuerpo | 422 `IDEMPOTENCY_KEY_REUSED` |
| Analista sin coordinación (contrato anterior) | 201 |
| Nota con `clientKey` repetida | devuelve la misma evidencia |
| Nota con `clientKey` nueva | 201, crea la evidencia |
| Campos añadidos por la release en filas nuevas | `reported_severity` no nulo, `report_kind = INTERNAL`, una fila REPORTED por situación |
| Errores en logs de `49a6483` | 0 `QueryFailedError` |
| Llamadas al stub de Gemini | 7 (una por alta que analiza) |

Total: **21/21 comprobaciones pasan**. No fue necesario corregir ninguna
incompatibilidad en la release.

**Limitaciones (lo que esta prueba no demuestra)**

- Gemini es el stub de E2E: la respuesta de análisis es una fixture válida, no
  un modelo real. Mide compatibilidad de aplicación y de esquema, no calidad del análisis.
- El cron de SLA se desactivó en el JavaScript compilado de la copia de trabajo
  (sin tocar el fuente). `49a6483` no tiene interruptor para ese cron.
- `GOOGLE_CLIENT_ID` es un valor de marcador (el arranque lo exige); el acceso
  fue por el login por correo de desarrollo (`ENABLE_EMAIL_LOGIN=true`), no por Google.
- El esquema se construyó a partir de los ficheros y del seed del repo, no se
  comparó con la firma del esquema de producción (no se accedió a producción).
- Los catálogos de permisos y coordinaciones vienen del seed de `49a6483`; los de
  producción pueden diferir en datos, no en estructura verificada.
- El frontend no se ejecutó: el payload y las cabeceras se copiaron del código
  de `b20ffd3` (`situationRegistration.service.ts`, `situations.api.ts`). No hay prueba en navegador.
- Sin concurrencia real ni tráfico. La prueba de concurrencia de idempotencia
  sigue en §10 (base desechable, API real).
- Una ejecución fallida del generador dejó una situación sintética extra antes
  de la instantánea; los conteos de este apartado la incluyen.

**Reproducción**

- Contenedor `postgres:16` local con base `novex_compat_test`; arrancar `49a6483`
  con `DB_CLOUD=false`, `ENABLE_EMAIL_LOGIN=true`, `GEMINI_BASE_URL` apuntando al stub
  y `GOOGLE_CLIENT_ID` de marcador. El backend se compiló con `nest build` y se ejecutó `dist/src/main.js`.
- Las 9 migraciones: `npm run migration:run` en la release, con `DB_CLOUD=false` y `DB_*_LOCAL`
  apuntando a la base local. Nunca contra `novex-db`.

### 10.2 Recuperación con reportes INTER (2026-10-27, local)

Pregunta: ¿se puede volver al backend `49a6483` después de que la release haya
creado reportes INTER? Respuesta: **no**. Misma base local de §10.1, con los datos
de referencia de §10.1 más dos reportes INTER creados por el backend release
(`fc43d2f`) con su contrato real (`reportKind`, `affectedCoordinationId`,
`affectedProcess`, `pendingDelivery`).

| Comprobación | Backend release `fc43d2f` | Backend `49a6483` |
|---|---|---|
| Alta de INTER (2 casos) | 201 | no aplica |
| Listado coordinador A / B / analista / Director / Admin | 200 (7 / 3 / 10 / 10 / 10) | **500 en los cinco roles** |
| Detalle de cada INTER | 200 | **500 o 404** según rol |
| Alta con contrato anterior tras los INTER | no aplica | 201; detalle 200 |

Causa: los INTER se guardan con `category_id` nulo (la release no pide categoría
en INTER). `49a6483` asume categoría en el listado y lanza `TypeError`; los logs
registran `unhandled_exception` en `GET /situations`.

**Consecuencias para la recuperación**

- Volver a `49a6483` **no es una recuperación de disponibilidad** una vez existe
  cualquier INTER: deja sin listado a todos los roles y sin detalle de los INTER.
  Esto corrige la afirmación anterior de que el fallo era solo del listado global
  Director/Admin.
- Antes del primer INTER, la vuelta atrás sí está probada en §10.1, aunque no es
  un plan de recuperación: el backend antiguo no conoce las nuevas reglas ni los permisos nuevos.
- Recuperación real con INTER: corrección hacia delante en la release (con
  aprobación), o aceptar indisponibilidad de lectura de los INTER hasta esa corrección.
  No se toca el esquema ni los datos para «arreglar» el listado antiguo.
- No se modificó ninguna base distinta de la local desechable. No hubo acceso a producción.
