#!/usr/bin/env bash
# =============================================================================
# NOVEX · Prueba de restauración aislada de un backup de novex-db
# =============================================================================
# Procedimiento: docs/RESTORE-TEST.md. Se ejecuta en Cloud Shell (la red de
# oficina re-firma el TLS de Cloud SQL) DESPUÉS de crear la instancia de prueba
# y restaurar en ella el backup (gcloud, pasos 1–3 del documento).
#
#   P   aislamiento de la copia + contraseña nueva del usuario de la app EN LA
#       COPIA (API de Cloud SQL; el valor vive en /dev/shm, nunca en argumentos
#       ni en salida) + la contraseña de producción ya no entra en la copia.
#   B   solo lectura: migraciones por nombre, recuentos, índices, firma del
#       esquema y hash por tabla de las filas anteriores al backup, comparado
#       con la MISMA consulta en solo lectura contra novex-db.
#   B2  explica fila a fila (hashes) las diferencias de B: escrituras de
#       producción posteriores al backup.
#   M5 las 5 migraciones de main (49a6483) en la copia; firma = producción.
#   M9  las 9 de la release en la copia; conservación, permisos, triggers.
#   X   limpieza de Cloud Shell (clones, salidas, /dev/shm, proxies).
#
# Uso: bash restore-test-cloudshell.sh <P|B|M5|M9|X> <instancia-de-prueba>
# Salida: solo nombres, recuentos y hashes; ningún contenido de filas.
# Nunca arranca el backend ni crones: solo `migration:show` / `migration:run`.
# =============================================================================
set -euo pipefail

PHASE="${1:?Fase}"; TARGET="${2:?Instancia de prueba}"
PROJECT="it-fab-contenido-edu-5"; REGION="us-central1"; SOURCE="novex-db"
BACKUP_START="2026-10-26 17:11:09.505+00"
MAIN_COMMIT="49a6483"; RELEASE_COMMIT="${RELEASE_COMMIT:-f62ba68}"
REPO="https://github.com/DesarrolloFabrica/NOVEX_BACKEND"
P_COPY=55511; P_PROD=55512
W="$HOME/novex-restore-test"; OUT="$W/out"; PWFILE="/dev/shm/novex-restore-test.pw"
mkdir -p "$W" "$OUT"

case "$TARGET" in novex-restore-test-*) ;; *) echo "STOP: el destino no es una instancia de prueba"; exit 1 ;; esac
[ "$TARGET" != "$SOURCE" ] || { echo "STOP: destino = origen"; exit 1; }
for t in gcloud cloud-sql-proxy git npm node jq psql pg_isready md5sum; do
  command -v "$t" >/dev/null || { echo "Falta $t"; exit 1; }
done
gcloud config set project "$PROJECT" >/dev/null 2>&1

EXPECTED_BASE="AddIncidentCategorySelectableAndIcon1787000000000
AddSituationRelatedCoordinations1786500000000
AddSituationResolutions1787200000000
AddSituationSlaFields1786900000000
AddUserOnboardingState1786400000000
AllowAnalystUnassignedSituations1786500000000
CreateAuditLogs1786800000000
GrantReportingAndClosurePermissions1787300000000
InitialSchema1785790534246
MakeSituationCoordinationNullable1786700000000
MakeUserCoordinationNullable1786100000000
MergeSocialLabAndAddServicios1786600000000
SeedSelectableIncidentCategories1787100000000"
EXPECTED_MAIN="AddSituationClientRequestId1787200000000
CreateSituationClientRequestUniqueIndex1787200000001
AddSituationAnalysisClaim1787300000000
AddSituationEvidenceClientKey1787400000000
CreateSituationEvidenceClientKeyIndex1787400000001"
EXPECTED_RELEASE="AddSituationReportKindAndAffectedCoordination1787400000000
GrantAnalystSituationsClose1787500000000
GrantDirectorKpisView1787600000000
AddSituationSeverityHistory1787700000000
BackfillReportedSeverity1787800000000
AddSituationConsequences1787900000000
AddConsequenceAndEscalationTimelineEvents1788000000000
LegacySituationInsertCompatibility1788100000000
RevokeAdminDirectorSituationsCreate1788200000000"

# Configuración de la app (no secreta) desde la revisión que recibe tráfico.
REV=$(gcloud run services describe novex-backend --region "$REGION" --format=json \
  | jq -r '[.status.traffic[] | select(.percent > 0) | .revisionName][0]')
REV_JSON=$(gcloud run revisions describe "$REV" --region "$REGION" --format=json)
DB_NAME=$(jq -r '.spec.containers[0].env[] | select(.name=="DB_DATABASE") | .value' <<<"$REV_JSON")
DB_USER=$(jq -r '.spec.containers[0].env[] | select(.name=="DB_USERNAME") | .value' <<<"$REV_JSON")
SECRET_NAME=$(jq -r '.spec.containers[0].env[] | select(.name=="DB_PASSWORD") | .valueFrom.secretKeyRef.name' <<<"$REV_JSON")
SECRET_VERSION=$(jq -r '.spec.containers[0].env[] | select(.name=="DB_PASSWORD") | .valueFrom.secretKeyRef.key // "latest"' <<<"$REV_JSON")
PROD_CONN=$(jq -r '.metadata.annotations["run.googleapis.com/cloudsql-instances"]' <<<"$REV_JSON")
[ "${PROD_CONN##*:}" = "$SOURCE" ] || { echo "STOP: la app no apunta a $SOURCE"; exit 1; }
COPY_CONN="$PROJECT:$REGION:$TARGET"
echo "Fase $PHASE · copia $TARGET · app $REV → $SOURCE"

PIDS=()
cleanup() { unset PGPASSWORD PROD_PW COPY_PW DB_PASSWORD_LOCAL; for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT
proxy() { # <conn> <puerto>
  cloud-sql-proxy --port "$2" "$1" >"$W/proxy-$2.log" 2>&1 & PIDS+=($!)
  for _ in $(seq 1 30); do pg_isready -q -h 127.0.0.1 -p "$2" && return 0; sleep 1; done
  echo "STOP: proxy $2 no listo"; exit 1
}
prod_pw() { PROD_PW=$(gcloud secrets versions access "$SECRET_VERSION" --secret="$SECRET_NAME" 2>/dev/null); [ -n "$PROD_PW" ]; }
copy_pw() { [ -s "$PWFILE" ] || { echo "STOP: falta la contraseña de la copia (fase P)"; exit 1; }; COPY_PW=$(cat "$PWFILE"); }
# Sesiones: UTC + ISO para que el texto de las filas (y su hash) no dependa del cliente.
OPTS_RO='-c default_transaction_read_only=on -c TimeZone=UTC -c DateStyle=ISO,MDY -c extra_float_digits=1'
copy_ro() { PGPASSWORD="$COPY_PW" PGOPTIONS="$OPTS_RO" psql "host=127.0.0.1 port=$P_COPY dbname=$DB_NAME user=$DB_USER sslmode=disable" -X -At -v ON_ERROR_STOP=1 "$@"; }
prod_ro() { PGPASSWORD="$PROD_PW" PGOPTIONS="$OPTS_RO" psql "host=127.0.0.1 port=$P_PROD dbname=$DB_NAME user=$DB_USER sslmode=disable" -X -At -v ON_ERROR_STOP=1 "$@"; }
assert_ro() { [ "$("$1" -c 'SHOW default_transaction_read_only')" = "on" ] || { echo "STOP: sesión $1 no READ ONLY"; exit 1; }; }

# Genera, en la copia, una consulta por tabla: recuento + hash de filas (columnas
# actuales de la copia). $1 = corte por created_at ('' = todas las filas).
gen_hash_sql() {
  copy_ro -v cutoff="$1" <<'SQL'
SELECT format(
  'SELECT %L, count(*), coalesce(md5(string_agg(h, '''' ORDER BY h)), ''-'') FROM (SELECT md5(ROW(%s)::text) AS h FROM public.%I %s) s;',
  c.table_name,
  string_agg(quote_ident(c.column_name), ',' ORDER BY c.ordinal_position),
  c.table_name,
  CASE WHEN :'cutoff' <> '' AND bool_or(c.column_name = 'created_at')
       THEN format('WHERE created_at <= %L', :'cutoff') ELSE '' END)
FROM information_schema.columns c
JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
GROUP BY c.table_name ORDER BY c.table_name;
SQL
}
signature() { "$1" -f "$W/schema-signature-readonly.sql" | grep -vE '^(BEGIN|ROLLBACK)$'; }
code_at() { # <dir> <commit>
  if [ ! -d "$1/.git" ]; then git clone -q "$REPO" "$1"; git -C "$1" checkout -q "$2"; (cd "$1" && npm ci --no-audit --no-fund >/dev/null 2>&1); fi
  [ "$(git -C "$1" rev-parse --short=7 HEAD)" = "$2" ] || { echo "STOP: $1 no está en $2"; exit 1; }
}
migr() { # <dir> <show|run>  (contra la COPIA: DB_*_LOCAL apunta a su proxy)
  (cd "$1" && DB_CLOUD=false DB_HOST_LOCAL=127.0.0.1 DB_PORT_LOCAL="$P_COPY" DB_SSL_LOCAL=false \
     DB_DATABASE_LOCAL="$DB_NAME" DB_USERNAME_LOCAL="$DB_USER" DB_PASSWORD_LOCAL="$COPY_PW" \
     npm run -s "migration:$2" 2>&1) | sed 's/\x1b\[[0-9;]*m//g'
}
pending() { migr "$1" show | sed -n 's/^\[ \] //p'; }
target_is_copy() { # el destino de las migraciones es la copia, nunca producción
  (cd "$1" && DB_CLOUD=false DB_HOST_LOCAL=127.0.0.1 DB_PORT_LOCAL="$P_COPY" DB_SSL_LOCAL=false \
     DB_DATABASE_LOCAL="$DB_NAME" DB_USERNAME_LOCAL="$DB_USER" DB_PASSWORD_LOCAL="$COPY_PW" npx ts-node -T -e \
    "const r=require('./src/configuration/resolve-database-env').resolveDatabaseEnv(process.env);console.log(r.profile,r.host,r.port)") \
    | grep -qx "local 127.0.0.1 $P_COPY" || { echo "STOP: el destino de migraciones no es la copia"; exit 1; }
}

case "$PHASE" in
  P)
    echo "== Aislamiento de la copia"
    gcloud sql instances describe "$TARGET" --format=json | jq -r '
      "estado=\(.state) version=\(.databaseVersion) tier=\(.settings.tier) edicion=\(.settings.edition) disponibilidad=\(.settings.availabilityType)",
      "redes_autorizadas=\(.settings.ipConfiguration.authorizedNetworks // [] | length) ssl=\(.settings.ipConfiguration.sslMode) conector=\(.settings.connectorEnforcement)",
      "backups=\(.settings.backupConfiguration.enabled) pitr=\(.settings.backupConfiguration.pointInTimeRecoveryEnabled) disco=\(.settings.dataDiskSizeGb)GB autoresize=\(.settings.storageAutoResize)",
      "etiquetas=\(.settings.userLabels | tojson)"'
    gcloud sql instances describe "$TARGET" --format=json | jq -e '
      .state=="RUNNABLE" and ((.settings.ipConfiguration.authorizedNetworks // []) | length)==0
      and .settings.connectorEnforcement=="REQUIRED" and .settings.ipConfiguration.sslMode=="ENCRYPTED_ONLY"
      and (.settings.backupConfiguration.enabled|not)' >/dev/null || { echo "STOP: aislamiento incompleto"; exit 1; }
    echo "== Contraseña nueva del usuario de la app, solo en la copia"
    umask 077; openssl rand -base64 33 | tr -d '\n/+=' | head -c 40 > "$PWFILE"
    NEWPW_FILE="$PWFILE" TOKEN_CMD="gcloud auth print-access-token" node -e '
      const fs=require("fs"),{execSync}=require("child_process");
      const t=execSync(process.env.TOKEN_CMD,{encoding:"utf8"}).trim();
      const [p,i,u]=process.argv.slice(1);
      const base=`https://sqladmin.googleapis.com/v1/projects/${p}/instances/${i}`;
      (async()=>{
        const r=await fetch(`${base}/users?name=${encodeURIComponent(u)}`,{method:"PUT",headers:{Authorization:`Bearer ${t}`,"Content-Type":"application/json"},
          body:JSON.stringify({name:u,password:fs.readFileSync(process.env.NEWPW_FILE,"utf8")})});
        const op=await r.json(); if(!r.ok){console.log("ERROR",r.status,op.error?.message);process.exit(1);}
        for(let k=0;k<60;k++){const s=await (await fetch(`https://sqladmin.googleapis.com/v1/projects/${p}/operations/${op.name}`,{headers:{Authorization:`Bearer ${t}`}})).json();
          if(s.status==="DONE"){ if(s.error){console.log("ERROR",JSON.stringify(s.error.errors?.map(e=>e.code)));process.exit(1);} console.log("contraseña de la copia cambiada (valor no mostrado)");return;}
          await new Promise(x=>setTimeout(x,2000));}
        console.log("ERROR: la operación no terminó");process.exit(1);
      })();' "$PROJECT" "$TARGET" "$DB_USER"
    proxy "$COPY_CONN" "$P_COPY"
    copy_pw
    [ "$(copy_ro -c 'SELECT 1')" = "1" ] && echo "la contraseña nueva entra en la copia"
    prod_pw
    if PGPASSWORD="$PROD_PW" PGCONNECT_TIMEOUT=10 psql "host=127.0.0.1 port=$P_COPY dbname=$DB_NAME user=$DB_USER sslmode=disable" -X -At -c 'SELECT 1' >/dev/null 2>&1; then
      echo "STOP: la contraseña de producción todavía entra en la copia"; exit 1
    fi
    echo "la contraseña de producción ya NO entra en la copia"
    echo "FASE_P_OK"
    ;;
  B)
    copy_pw; prod_pw
    proxy "$COPY_CONN" "$P_COPY"; proxy "$PROD_CONN" "$P_PROD"
    assert_ro copy_ro; assert_ro prod_ro
    code_at "$W/main" "$MAIN_COMMIT"
    cp "$W/main/scripts/schema-signature-readonly.sql" "$W/" 2>/dev/null \
      || git -C "$W/main" show "$RELEASE_COMMIT:scripts/schema-signature-readonly.sql" > "$W/schema-signature-readonly.sql" 2>/dev/null \
      || { git -C "$W/main" fetch -q origin release/circo-20261026 && git -C "$W/main" show FETCH_HEAD:scripts/schema-signature-readonly.sql > "$W/schema-signature-readonly.sql"; }
    echo "== Migraciones en la copia (por nombre)"
    copy_ro -c 'SELECT name FROM typeorm_migrations ORDER BY name' > "$OUT/b-migraciones.txt"
    wc -l < "$OUT/b-migraciones.txt"
    [ "$(cat "$OUT/b-migraciones.txt")" = "$EXPECTED_BASE" ] && echo "= exactamente las 13 del momento del backup" \
      || { echo "STOP: no coinciden con las 13 esperadas"; diff <(echo "$EXPECTED_BASE") "$OUT/b-migraciones.txt" || true; exit 1; }
    echo "== Recuentos y últimas escrituras (esperado 18 | 44 | 236 | 2026-10-19 15:43:10.786372+00 | 2026-10-06 22:16:29.682165+00)"
    copy_ro -c "SELECT (SELECT count(*) FROM situations), (SELECT count(*) FROM situation_evidences),
                       (SELECT count(*) FROM situation_timeline_entries),
                       (SELECT max(created_at) FROM situations), (SELECT max(created_at) FROM situation_evidences)" | tee "$OUT/b-recuentos.txt"
    [ "$(cat "$OUT/b-recuentos.txt")" = "18|44|236|2026-10-19 15:43:10.786372+00|2026-10-06 22:16:29.682165+00" ] \
      && echo "= coinciden con la fase A de la corrección" || { echo "STOP: recuentos distintos"; exit 1; }
    echo "== Índices inválidos y restricciones sin validar"
    copy_ro -c "SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT (i.indisvalid AND i.indisready)"
    copy_ro -c "SELECT count(*) FROM pg_constraint co JOIN pg_namespace n ON n.oid=co.connamespace WHERE n.nspname='public' AND NOT co.convalidated"
    echo "== Firma del esquema de la copia"
    signature copy_ro > "$OUT/b-firma-copia.txt"; wc -l < "$OUT/b-firma-copia.txt"
    echo "== Hash por tabla de filas con created_at <= backup: copia vs producción (solo lectura)"
    gen_hash_sql "$BACKUP_START" > "$OUT/hash-backup.sql"
    copy_ro -f "$OUT/hash-backup.sql" > "$OUT/b-hash-copia.txt"
    prod_ro -f "$OUT/hash-backup.sql" > "$OUT/b-hash-prod.txt"
    echo "tablas: $(wc -l < "$OUT/b-hash-copia.txt")"
    if diff "$OUT/b-hash-copia.txt" "$OUT/b-hash-prod.txt" > "$OUT/b-hash-diff.txt"; then echo "= idénticas en todas las tablas"
    else echo "Diferencias (tabla|filas|hash):"; cat "$OUT/b-hash-diff.txt"
      echo "-- filas de producción modificadas después del backup (updated_at), por tabla:"
      prod_ro <<SQL
SELECT format('SELECT %L, count(*) FROM public.%I WHERE updated_at > %L;', table_name, table_name, '$BACKUP_START')
FROM information_schema.columns WHERE table_schema='public' AND column_name='updated_at' ORDER BY table_name \gexec
SQL
    fi
    echo "FASE_B_FIN"
    ;;
  B2)
    # Explica las diferencias de B fila a fila (hashes por fila, sin contenido):
    # cada fila de la copia que no está igual en producción debe ser una fila
    # que producción modificó DESPUÉS del backup.
    copy_pw; prod_pw
    proxy "$COPY_CONN" "$P_COPY"; proxy "$PROD_CONN" "$P_PROD"
    assert_ro copy_ro; assert_ro prod_ro
    for T in ${B2_TABLES:-users situation_affected_coordinations}; do
      COLS=$(copy_ro -c "SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='$T'")
      HAS_CREATED=$(copy_ro -c "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='$T' AND column_name='created_at'")
      KEY=$(copy_ro -c "SELECT string_agg(quote_ident(a.attname), ',' ORDER BY a.attnum) FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) WHERE i.indrelid='public.$T'::regclass AND i.indisprimary")
      copy_ro -c "SELECT md5(ROW($COLS)::text) FROM public.$T" | sort > "$OUT/b2-$T-copia.txt"
      prod_ro -c "SELECT md5(ROW($COLS)::text) FROM public.$T" | sort > "$OUT/b2-$T-prod.txt"
      copy_ro -c "SELECT md5(ROW($KEY)::text) FROM public.$T WHERE md5(ROW($COLS)::text) IN ($(comm -23 "$OUT/b2-$T-copia.txt" "$OUT/b2-$T-prod.txt" | sed "s/.*/'&'/" | paste -sd, - | sed 's/^$/NULL/'))" | sort > "$OUT/b2-$T-claves-solo-copia.txt"
      echo "$T: created_at=$HAS_CREATED clave=($KEY) filas copia=$(wc -l < "$OUT/b2-$T-copia.txt") prod=$(wc -l < "$OUT/b2-$T-prod.txt")"
      echo "  filas iguales en ambas: $(comm -12 "$OUT/b2-$T-copia.txt" "$OUT/b2-$T-prod.txt" | wc -l)"
      echo "  solo en la copia (cambiadas o borradas después en producción): $(wc -l < "$OUT/b2-$T-claves-solo-copia.txt")"
      echo "  solo en producción (nuevas o cambiadas después): $(comm -13 "$OUT/b2-$T-copia.txt" "$OUT/b2-$T-prod.txt" | wc -l)"
      if [ -s "$OUT/b2-$T-claves-solo-copia.txt" ]; then
        UPD=$(copy_ro -c "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='$T' AND column_name='updated_at'")
        if [ "$UPD" = "1" ]; then
          prod_ro -c "SELECT md5(ROW($KEY)::text) FROM public.$T WHERE updated_at > '$BACKUP_START'" | sort > "$OUT/b2-$T-claves-prod-posteriores.txt"
          echo "  de ellas, modificadas en producción después del backup (updated_at): $(comm -12 "$OUT/b2-$T-claves-solo-copia.txt" "$OUT/b2-$T-claves-prod-posteriores.txt" | wc -l)"
        fi
        echo "  de ellas, cuya clave ya no existe en producción: $(prod_ro -c "SELECT md5(ROW($KEY)::text) FROM public.$T" | sort | comm -23 "$OUT/b2-$T-claves-solo-copia.txt" - | wc -l)"
      fi
    done
    echo "FASE_B2_FIN"
    ;;
  M5)
    copy_pw; prod_pw
    proxy "$COPY_CONN" "$P_COPY"; proxy "$PROD_CONN" "$P_PROD"
    code_at "$W/main" "$MAIN_COMMIT"; target_is_copy "$W/main"
    P=$(pending "$W/main"); echo "== Pendientes según $MAIN_COMMIT:"; echo "$P"
    [ "$P" = "$EXPECTED_MAIN" ] || { echo "STOP: no son exactamente las 5"; exit 1; }
    START=$(date +%s)
    migr "$W/main" run | grep -E "executed successfully|rror" || true
    echo "duración: $(( $(date +%s) - START )) s"
    [ -z "$(pending "$W/main")" ] || { echo "FALLO: quedan pendientes"; pending "$W/main"; exit 1; }
    assert_ro copy_ro; assert_ro prod_ro
    copy_ro -c "SELECT c.relname||' valid='||i.indisvalid||' ready='||i.indisready FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relname IN ('uq_situations_creator_client_request','uq_situation_evidences_client_key') ORDER BY 1"
    echo "== Firma: copia tras las 5 vs producción actual"
    signature copy_ro > "$OUT/m5-firma-copia.txt"; signature prod_ro > "$OUT/m5-firma-prod.txt"
    echo "líneas copia=$(wc -l < "$OUT/m5-firma-copia.txt") prod=$(wc -l < "$OUT/m5-firma-prod.txt")"
    diff "$OUT/m5-firma-copia.txt" "$OUT/m5-firma-prod.txt" && echo "= esquema idéntico al de producción" || echo "DIFERENCIAS de esquema (arriba)"
    echo "== Instantánea de datos para el lote de la release (todas las filas, columnas actuales)"
    gen_hash_sql "" > "$OUT/hash-todo.sql"
    copy_ro -f "$OUT/hash-todo.sql" > "$OUT/m5-hash.txt"; cat "$OUT/m5-hash.txt" | cut -d'|' -f1,2 | tr '\n' ' '; echo
    copy_ro -c "SELECT r.code||':'||p.code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id ORDER BY 1" > "$OUT/m5-permisos.txt"
    echo "FASE_M5_OK"
    ;;
  M9)
    copy_pw
    proxy "$COPY_CONN" "$P_COPY"
    code_at "$W/release" "$RELEASE_COMMIT"; target_is_copy "$W/release"
    P=$(pending "$W/release"); echo "== Pendientes según la release $RELEASE_COMMIT:"; echo "$P"
    [ "$P" = "$EXPECTED_RELEASE" ] || { echo "STOP: no son exactamente las 9"; exit 1; }
    START=$(date +%s)
    migr "$W/release" run | grep -E "executed successfully|rror|Severidad reportada" || true
    echo "duración: $(( $(date +%s) - START )) s"
    [ -z "$(pending "$W/release")" ] || { echo "FALLO: quedan pendientes"; pending "$W/release"; exit 1; }
    assert_ro copy_ro
    echo "== Conservación: mismas columnas que antes del lote, todas las filas"
    copy_ro -f "$OUT/hash-todo.sql" > "$OUT/m9-hash.txt"
    diff "$OUT/m5-hash.txt" "$OUT/m9-hash.txt" > "$OUT/m9-hash-diff.txt" && echo "= ninguna tabla cambia" \
      || { echo "tablas con cambios (esperado solo role_permissions, permissions, typeorm_migrations):"; grep '^>' "$OUT/m9-hash-diff.txt" | cut -d'|' -f1,2; }
    echo "== Recuentos por tabla nuevos (tablas creadas por el lote)"
    gen_hash_sql "" | grep -vFf <(cut -d'|' -f1 "$OUT/m5-hash.txt" | sed "s/.*/'&'/") > "$OUT/m9-nuevas.sql" || true
    [ -s "$OUT/m9-nuevas.sql" ] && copy_ro -f "$OUT/m9-nuevas.sql" | cut -d'|' -f1,2
    echo "== Integridad referencial y de datos"
    copy_ro <<'SQL'
SELECT 'situaciones', count(*) FROM situations;
SELECT 'evidencias', count(*) FROM situation_evidences;
SELECT 'timeline', count(*) FROM situation_timeline_entries;
SELECT 'evidencias huérfanas', count(*) FROM situation_evidences e LEFT JOIN situations s ON s.id=e.situation_id WHERE s.id IS NULL;
SELECT 'timeline huérfano', count(*) FROM situation_timeline_entries t LEFT JOIN situations s ON s.id=t.situation_id WHERE s.id IS NULL;
SELECT 'reported_severity nula', count(*) FROM situations WHERE reported_severity IS NULL;
SELECT 'reported_severity distinta de severity', count(*) FROM situations WHERE reported_severity <> severity;
SELECT 'situaciones sin exactamente 1 REPORTED', count(*) FROM situations s WHERE (SELECT count(*) FROM situation_severity_changes c WHERE c.situation_id=s.id AND c.source='REPORTED') <> 1;
SELECT 'affected_coordination_id <> coordination_id', count(*) FROM situations WHERE coordination_id IS NOT NULL AND affected_coordination_id IS DISTINCT FROM coordination_id;
SELECT 'report_kind', report_kind::text||'='||count(*) FROM situations GROUP BY report_kind;
SELECT 'política de escalamiento informada', count(*) FROM situations WHERE severity_escalation_policy_code IS NOT NULL;
SELECT 'índices inválidos', count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT (i.indisvalid AND i.indisready);
SELECT 'restricciones sin validar', count(*) FROM pg_constraint co JOIN pg_namespace n ON n.oid=co.connamespace WHERE n.nspname='public' AND NOT co.convalidated;
SQL
    echo "== Triggers de la release"
    copy_ro -c "SELECT event_object_table||'.'||trigger_name||' '||action_timing||' '||event_manipulation FROM information_schema.triggers WHERE trigger_schema='public' ORDER BY 1"
    echo "== Permisos: cambios del lote (- antes / + después)"
    copy_ro -c "SELECT r.code||':'||p.code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id ORDER BY 1" > "$OUT/m9-permisos.txt"
    diff "$OUT/m5-permisos.txt" "$OUT/m9-permisos.txt" | grep -E '^[<>]' | sed 's/^</-/; s/^>/+/' || true
    echo "SITUATIONS_CREATE: $(grep ':SITUATIONS_CREATE$' "$OUT/m9-permisos.txt" | cut -d: -f1 | tr '\n' ' ')"
    echo "== Firma del esquema tras la release"
    signature copy_ro > "$OUT/m9-firma-copia.txt"; wc -l < "$OUT/m9-firma-copia.txt"
    echo "FASE_M9_FIN"
    ;;
  X)
    rm -f "$PWFILE"
    rm -r --one-file-system "$W"
    pkill -u "$USER" -x cloud-sql-proxy 2>/dev/null || true
    test ! -e "$W" && test ! -e "$PWFILE" && echo "limpieza de Cloud Shell: hecha"
    ;;
  *) echo "Fase desconocida"; exit 1 ;;
esac
