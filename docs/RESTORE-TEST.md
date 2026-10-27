# Prueba de restauración aislada del backup `1793034669505`

> Estado: **ejecutada el 2026-10-26 con resultado correcto** (autorizada
> expresamente; resultado al final del documento). Nada de este procedimiento
> escribe en `novex-db`. Script de las fases en Cloud Shell:
> `scripts/restore-test-cloudshell.sh`.

## Qué se demuestra y qué no

Se restaura **ese backup concreto** con `gcloud sql backups restore` sobre una
instancia nueva y vacía. `gcloud sql instances clone` NO sirve para esto: clona
el estado actual (o un instante por PITR) a partir de los logs, sin pasar por
el backup, y no demuestra que el backup sea restaurable.

| Backup | Valor (leído el 26-oct) |
|---|---|
| Id | `1793034669505` |
| Instancia origen | `novex-db` (PostgreSQL 16, Enterprise, `db-f1-micro`, zonal us-central1-a, 10 GB SSD) |
| Tipo | `ON_DEMAND`, `SNAPSHOT`, ubicación `us` |
| Ventana | 2026-10-26 17:11:09.505 → 17:12:40.976 UTC, `SUCCESSFUL` |
| Descripción | `pre-hotfix-49a6483-20261026171108` |
| Tamaño facturable | ~2,7 MB |

Se tomó **antes** de aplicar las 5 migraciones de `main`. Por eso la copia
restaurada permite ensayar la secuencia completa que seguirá producción:
5 de `main` (ya hecha en producción) y después las 9 de cartas.

## Destino y aislamiento

Instancia nueva `novex-restore-test-AAAAMMDD`, mismo proyecto y región, mismo
motor, edición y tier que el origen (requisito de compatibilidad de la
restauración; el disco debe ser ≥ 10 GB).

| Medida | Cómo | Evita |
|---|---|---|
| Nombre inequívoco | prefijo `novex-restore-test-` (el script se niega a operar sobre otro nombre). `gcloud sql instances create` en GA no admite etiquetas | confundirla con producción |
| Sin redes autorizadas | no se pasa `--authorized-networks` | conexiones directas por IP (`novex-db` sí tiene 3 IPs autorizadas) |
| Solo vía conector | `--connector-enforcement=REQUIRED` | conexiones por IP aunque alguien añada una red |
| Solo cifrado | `--ssl-mode=ENCRYPTED_ONLY` | tráfico sin TLS |
| Contraseña distinta | tras restaurar, la contraseña del usuario de la aplicación se cambia **en la copia** (API de Cloud SQL) por un valor aleatorio que solo vive en `/dev/shm` de Cloud Shell y se borra al terminar; se comprueba que la de producción ya no entra | que el backend de producción (o cualquiera con el secreto) pueda autenticarse en la copia aunque se le apunte por error |
| Ninguna app apunta a ella | no se crean secretos ni servicios; se comprueba antes y después que la anotación `cloudsql-instances` de `novex-backend` sigue siendo `novex-db` | conexión accidental desde Cloud Run |
| Sin copias propias | `--no-backup` | coste y datos duplicados que sobreviven al borrado |
| Disco fijo | `--no-storage-auto-increase` | crecimiento de coste inesperado |
| Datos personales | solo se consultan recuentos, nombres de migraciones y hashes; nada se exporta ni se descarga | fuga de datos de la copia |

La restauración sobrescribe los datos y usuarios de la instancia **destino**;
la configuración de red/TLS del destino se conserva. Se verifica tras
restaurar (paso 3).

## Dónde se ejecuta

En Cloud Shell: la red de oficina re-firma el TLS hacia Cloud SQL. Si hace
falta acceso SSH temporal, se comprueba antes que hay menos de 10 claves (el
26-oct había 9) para no desplazar ninguna, y se retira al terminar.

## Procedimiento (bash, Cloud Shell)

```bash
set -euo pipefail
PROJECT=it-fab-contenido-edu-5; REGION=us-central1
SOURCE=novex-db; BACKUP=1793034669505
TARGET="novex-restore-test-$(date -u +%Y%m%d)"

# 0) Salvaguardas
[ "$TARGET" != "$SOURCE" ] || { echo "destino = origen"; exit 1; }
gcloud sql backups describe "$BACKUP" --instance="$SOURCE" --project="$PROJECT" \
  --format='value(status)' | grep -qx SUCCESSFUL
! gcloud sql instances describe "$TARGET" --project="$PROJECT" >/dev/null 2>&1
gcloud run services describe novex-backend --region="$REGION" --project="$PROJECT" \
  --format='value(spec.template.metadata.annotations."run.googleapis.com/cloudsql-instances")'
#    → anotar: debe terminar en :novex-db

# 1) Instancia destino vacía y cerrada (≈5–10 min)
#    (--zone y --region son excluyentes; misma zona que novex-db)
gcloud sql instances create "$TARGET" --project="$PROJECT" \
  --database-version=POSTGRES_16 --edition=enterprise --tier=db-f1-micro \
  --zone=us-central1-a --availability-type=zonal \
  --storage-type=SSD --storage-size=10 --no-storage-auto-increase \
  --no-backup --connector-enforcement=REQUIRED --ssl-mode=ENCRYPTED_ONLY

# 2) Restaurar EL backup (medir el tiempo: RTO real)
date -u; time gcloud sql backups restore "$BACKUP" \
  --backup-instance="$SOURCE" --restore-instance="$TARGET" --project="$PROJECT" --quiet

# 3) El aislamiento sigue en pie tras restaurar
gcloud sql instances describe "$TARGET" --project="$PROJECT" --format='yaml(
  state,settings.ipConfiguration.authorizedNetworks,settings.ipConfiguration.sslMode,
  settings.connectorEnforcement,settings.backupConfiguration.enabled,settings.userLabels)'
#    → RUNNABLE, sin authorizedNetworks, ENCRYPTED_ONLY, REQUIRED, backups false
```

Los pasos 4 a 7 son las fases de `scripts/restore-test-cloudshell.sh`
(`P`, `B`, `B2`, `M5`, `M9`, `X`), que se detienen ante cualquier discrepancia.

4) **Contraseña nueva en la copia** (fase `P`). Se genera un valor aleatorio en
`/dev/shm` y se aplica con la API de Cloud SQL (`users.update`) leyéndolo de
ese archivo: no aparece en argumentos, salida ni logs. Se comprueba que la
contraseña nueva entra y que la de producción ya **no** autentica contra la
copia.

5) **Integridad (sesión `default_transaction_read_only=on`).** Valores de
referencia de la fase A de la corrección (17:0x UTC, minutos antes del backup):

| Comprobación | Esperado |
|---|---|
| `typeorm_migrations` por nombre | exactamente las 13 de la fase A (incluida `AllowAnalystUnassignedSituations1786500000000`) |
| Recuentos | situaciones 18, evidencias 44, eventos de timeline 236 |
| Últimas escrituras | `max(created_at)` de situaciones y evidencias = fase A |
| Recuentos por tabla y hash por tabla | para cada tabla de `public`: `count(*)` y `md5(string_agg(<columnas de la copia>::text, '|' ORDER BY id))` con `created_at <= '2026-10-26 17:11:09.505Z'`; la misma consulta en solo lectura contra `novex-db` debe dar lo mismo (las columnas nuevas de producción no entran porque la lista sale de la copia; una diferencia solo es admisible si la fila tiene `updated_at` posterior al backup) |
| Esquema | firma `scripts/schema-signature-readonly.sql` = la de producción menos lo que añaden las 5 migraciones de `main` (se confirma en el paso 6a) |
| Índices | ningún índice con `indisvalid = false` |
| (Opcional, escribe solo en la copia) | `CREATE EXTENSION amcheck` y `bt_index_check` sobre todos los índices btree |

6) **Ensayo de migraciones sobre la copia** (`DB_CLOUD=false`, `DB_*_LOCAL`
apuntando al proxy de `$TARGET`; antes, confirmar el destino con
`resolve-database-env` como indica `RELEASE_CIRCO.md` §2.2):

- a. Código `49a6483`: `migration:show` = exactamente las 5 de `main`;
  `migration:run`; 0 pendientes. La firma del esquema debe coincidir **línea a
  línea con la de producción actual** (459 líneas). Esto valida la copia y, a
  la vez, que producción quedó como dice el informe del incidente.
- b. Código de la release (commit exacto del PR): `migration:show` =
  exactamente las 9 de `RELEASE_CIRCO.md` §2.2; `migration:run`; 0 pendientes.
- c. Tras b: recuentos y hashes del paso 5 sin cambios en las columnas
  originales; `SITUATIONS_CREATE` solo en ANALISTA y COORDINADOR;
  `reported_severity` informada en todas las situaciones y una fila REPORTED
  por situación en el historial de severidad; triggers de
  `LegacySituationInsertCompatibility1788100000000` presentes; ningún índice
  inválido. Se mide la duración de cada lote.
- d. (Opcional) backend de la release en local contra la copia, solo lectura
  por la API con un usuario de la copia: listados y detalle 200. No se crean
  registros.

```bash
# 7) Limpieza (obligatoria, también si algo falla)
kill "$PROXY_PID"; unset PGPASSWORD NEWPW
gcloud sql instances delete "$TARGET" --project="$PROJECT" --quiet
gcloud sql instances list --project="$PROJECT" --format='value(name)'   # sin $TARGET
gcloud run services describe novex-backend --region="$REGION" --project="$PROJECT" \
  --format='value(spec.template.metadata.annotations."run.googleapis.com/cloudsql-instances")'
# borrar en Cloud Shell clones de código, logs del proxy y la clave SSH temporal
```

El backup `1793034669505` **no** se borra: sigue siendo el punto de retorno
previo a la corrección. Al borrar la instancia de prueba desaparecen también
sus datos; no queda ninguna copia fuera de `novex-db` y sus backups.

## Recursos y coste estimado

| Recurso | Supuesto | Coste |
|---|---|---|
| Instancia `db-f1-micro`, zonal, us-central1 | ~US$0,0105/h (precio de lista conocido; confirmar en la calculadora oficial antes de autorizar) | ~US$0,04 en 4 h |
| 10 GB SSD | ~US$0,17 por GB-mes → ~US$0,0023/h | ~US$0,01 en 4 h |
| IPv4 pública de la instancia | sin cargo mientras está en ejecución (supuesto; confirmar) | ~0 |
| Operación de restauración, Cloud Shell, egreso | sin cargo directo; egreso dentro de la región despreciable | ~0 |
| **Total** | prueba de 2–4 h | **< US$0,10** |
| Riesgo si se olvida | 30 días encendida | ~US$9 |

Duración estimada: 10–20 min de creación y restauración (la base son unos pocos
MB) más 45–60 min de verificaciones y ensayo.

## Resultado de la ejecución (2026-10-26)

Sin datos de filas: solo nombres, recuentos y comparaciones de hashes.

| Paso | Inicio → fin (UTC) | Resultado |
|---|---|---|
| Creación de `novex-restore-test-20261026` | 20:38:01 → 20:48:20 | `RUNNABLE`; PostgreSQL 16, Enterprise, `db-f1-micro`, zonal us-central1-a, 10 GB SSD sin autoaumento, sin backups |
| **Restauración del backup `1793034669505`** (`RESTORE_VOLUME`) | 20:48:44 → 21:04:17 | **correcta**; RTO medido ≈ 16 min (≈ 26 min contando la creación) |
| `P` · aislamiento | — | 0 redes autorizadas, `ENCRYPTED_ONLY`, conector `REQUIRED`, backups desactivados (se conservan tras restaurar); contraseña de la copia cambiada; la de producción ya no entra |
| `B` · estado del backup | — | migraciones: **exactamente las 13** por nombre; recuentos 18 / 44 / 236 y últimas escrituras = fase A de la corrección; 0 índices inválidos; 0 restricciones sin validar; firma de esquema de 452 líneas |
| `B` · copia vs producción (solo lectura) | — | 24 de 27 tablas idénticas (recuento + hash de filas con `created_at` ≤ backup). Las 3 restantes, explicadas en `B2` |
| `B2` · diferencias fila a fila | — | `typeorm_migrations` 13 vs 18: las 5 de la corrección, posteriores. `users`: 30 filas idénticas; la distinta es la única modificada en producción después del backup (`updated_at`), su clave sigue existiendo. `situation_affected_coordinations` (sin `created_at`): las 39 filas de la copia están idénticas en producción; producción tiene 2 nuevas |
| `M5` · 5 migraciones de `main` (`49a6483`) | 8 s | pendientes = exactamente las 5; ejecutadas; índices `uq_situations_creator_client_request` y `uq_situation_evidences_client_key` válidos y listos; **firma del esquema idéntica a la de producción actual (459 líneas)** |
| `M9` · 9 migraciones de la release (`f62ba68`) | 11 s | pendientes = exactamente las 9 por nombre; ejecutadas; 0 pendientes; `BackfillReportedSeverity`: «severidad reportada coincide con la actual en todas las situaciones» |
| `M9` · conservación | — | hash de todas las filas con las columnas previas al lote: **sin cambios** en todas las tablas salvo las esperadas (`permissions` 17 → 18, `role_permissions` 37 → 37 con distinto reparto, `typeorm_migrations` 18 → 27). Situaciones 18, evidencias 44, timeline 236; 0 evidencias o eventos huérfanos |
| `M9` · datos derivados | — | `reported_severity` sin nulos e igual a `severity`; exactamente 1 fila `REPORTED` por situación (18); `affected_coordination_id` = `coordination_id` en todas; `report_kind` = `INTERNAL` en las 18; `situation_consequences` vacía |
| `M9` · restricciones, índices, triggers | — | 0 índices inválidos; 0 restricciones sin validar; 4 triggers (append-only en `situation_consequences` y `situation_severity_changes`; `legacy_insert_defaults` y `ensure_reported_severity_change` en `situations`); **firma del esquema (509 líneas) idéntica a una base construida solo con las migraciones del repositorio** |
| `M9` · permisos | — | cambios: − `ADMIN:SITUATIONS_CREATE`, − `DIRECTOR:SITUATIONS_CREATE`, + `ANALISTA:SITUATIONS_CLOSE`, + `DIRECTOR:KPIS_VIEW`. `SITUATIONS_CREATE` queda solo en ANALISTA y COORDINADOR |
| Escalamiento automático | — | 0 situaciones con política de escalamiento; en la configuración prevista sigue apagado: `SEVERITY_ESCALATION_ENABLED` no está definida en la revisión servida ni la fija el workflow, y el código usa `false` por defecto |
| Borrado de la instancia | 21:15:25 → 21:17:26 | eliminada; `gcloud sql instances list` ya no la muestra |

No hubo fallos. No se arrancó el backend ni ningún cron contra la copia: solo
`migration:show` y `migration:run`.

**Limpieza.** Se eliminaron en Cloud Shell los clones de código, las salidas,
la contraseña de `/dev/shm` y los proxies; la clave SSH temporal se retiró
(quedan las 9 claves previas) y se borró en local. La base local de referencia
(contenedor desechable) se eliminó. Ningún dato de filas salió de Google Cloud:
al equipo local solo se copió la firma del esquema (metadatos).

**Producción sin cambios.** `novex-db`: `settingsVersion` 187 antes y después,
mismo tier, disco, redes y conector; su historial de operaciones no registra
nada después del backup de las 17:11. Tráfico: 100 % `novex-backend-00085-tug`
y 100 % `novex-frontend-00073-duy`, igual que antes.

**Coste.** Instancia viva 39,4 min (20:38:01 → 21:17:26). Precios vigentes del
catálogo de facturación (26-oct, us-central1): micro zonal US$0,0105/h, SSD
US$0,17 por GB-mes (≈ US$0,0023/h para 10 GB), IP US$0,01/h (supuesto: se
cobra mientras existe). Total ≈ **US$0,015**; ≈ US$0,023 aunque se facturara
una hora completa. La restauración no tiene cargo propio; sin backups de la
copia.

**Lo que esta prueba no cubre.** El arranque de la aplicación sobre la copia
(excluido a propósito) y el comportamiento de la base con el tráfico real
durante `migration:run`: las 9 migraciones tardaron 11 s con estos volúmenes.
