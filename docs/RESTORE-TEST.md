# Prueba de restauración aislada del backup `1793034669505`

> Estado: **propuesta, no ejecutada**. Crear la instancia y restaurar en ella
> copia datos de producción a infraestructura nueva: requiere autorización
> expresa. Nada de este procedimiento escribe en `novex-db`.

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
| Nombre y etiquetas inequívocos | `purpose=restore-test`, `delete-after=AAAA-MM-DD` | confundirla con producción |
| Sin redes autorizadas | no se pasa `--authorized-networks` | conexiones directas por IP (`novex-db` sí tiene 3 IPs autorizadas) |
| Solo vía conector | `--connector-enforcement=REQUIRED` | conexiones por IP aunque alguien añada una red |
| Solo cifrado | `--ssl-mode=ENCRYPTED_ONLY` | tráfico sin TLS |
| Contraseña distinta | tras restaurar, la contraseña del usuario de la aplicación se cambia **en la copia** por un valor aleatorio que solo vive en memoria | que el backend de producción (o cualquiera con el secreto) pueda autenticarse en la copia aunque se le apunte por error |
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
gcloud sql instances create "$TARGET" --project="$PROJECT" \
  --database-version=POSTGRES_16 --edition=ENTERPRISE --tier=db-f1-micro \
  --region="$REGION" --availability-type=ZONAL \
  --storage-type=SSD --storage-size=10 --no-storage-auto-increase \
  --no-backup --connector-enforcement=REQUIRED --ssl-mode=ENCRYPTED_ONLY \
  --labels=purpose=restore-test,delete-after=$(date -u -d '+1 day' +%Y-%m-%d)

# 2) Restaurar EL backup (medir el tiempo: RTO real)
date -u; time gcloud sql backups restore "$BACKUP" \
  --backup-instance="$SOURCE" --restore-instance="$TARGET" --project="$PROJECT" --quiet

# 3) El aislamiento sigue en pie tras restaurar
gcloud sql instances describe "$TARGET" --project="$PROJECT" --format='yaml(
  state,settings.ipConfiguration.authorizedNetworks,settings.ipConfiguration.sslMode,
  settings.connectorEnforcement,settings.backupConfiguration.enabled,settings.userLabels)'
#    → RUNNABLE, sin authorizedNetworks, ENCRYPTED_ONLY, REQUIRED, backups false
```

4) **Contraseña nueva en la copia.** Proxy a `$TARGET` en un puerto propio;
primera conexión con la contraseña de producción leída en memoria de Secret
Manager (como en `scripts/hotfix-20261026-migraciones-main.sh`). Se genera
`NEWPW=$(openssl rand -base64 32)` y se aplica con
`\getenv newpw NEWPW` + `ALTER ROLE <usuario> PASSWORD :'newpw'` (psql ≥ 15;
si la versión es menor, detenerse): la contraseña no aparece en argumentos,
archivos ni logs. Desde aquí solo se usa `NEWPW`. Comprobar que la contraseña
de producción ya **no** autentica contra la copia.

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

## Qué se documenta al terminar

- Hora de inicio y fin de cada paso; RTO real (paso 2).
- Resultado de cada verificación del paso 5 y diferencias, si las hay.
- Pendientes y duración de cada lote de migraciones (paso 6).
- Confirmación del borrado y de que `novex-backend` sigue apuntando a `novex-db`.
