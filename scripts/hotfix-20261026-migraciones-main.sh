#!/usr/bin/env bash
# =============================================================================
# NOVEX · Corrección rápida 2026-10-26: las 5 migraciones de main (49a6483)
# =============================================================================
# Contexto: docs/INCIDENTE-20261023-MIGRACIONES.md. Se ejecuta en Cloud Shell
# (la red de oficina re-firma el TLS de Cloud SQL). Por FASES, para revisar el
# resultado de cada una antes de seguir:
#
#   A  solo lectura: migraciones aplicadas, pendientes EXACTAS de 49a6483,
#      recuentos de referencia e índices.
#   B  copia de Cloud SQL bajo demanda; registra id, hora y estado.
#   C  migration:run con el código de 49a6483 (solo si A confirma las 5).
#      Si falla, inspecciona índices inválidos y se detiene; no revierte.
#   D  solo lectura: sin pendientes, columnas e índices válidos, recuentos.
#   S  solo lectura: firma del esquema (scripts/schema-signature-readonly.sql).
#
# Uso: bash hotfix-20261026-migraciones-main.sh <A|B|C|D|S>
#
# Configuración (instancia, base, usuario, secreto) desde la revisión que
# recibe tráfico. La contraseña se lee EN MEMORIA de Secret Manager, no se
# imprime, no va en argumentos y se borra al salir.
# =============================================================================
set -euo pipefail

PHASE="${1:?Fase A, B, C o D}"
PROJECT="it-fab-contenido-edu-5"; REGION="us-central1"; PORT="55499"
COMMIT="49a6483"
WORK="$HOME/novex-hotfix-$COMMIT"
EXPECTED="AddSituationClientRequestId1787200000000
CreateSituationClientRequestUniqueIndex1787200000001
AddSituationAnalysisClaim1787300000000
AddSituationEvidenceClientKey1787400000000
CreateSituationEvidenceClientKeyIndex1787400000001"

for tool in gcloud cloud-sql-proxy git npm node jq psql pg_isready; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Falta $tool"; exit 1; }
done
gcloud config set project "$PROJECT" >/dev/null 2>&1

REV=$(gcloud run services describe novex-backend --region "$REGION" --format=json \
  | jq -r '[.status.traffic[] | select(.percent > 0) | .revisionName // empty][0]')
REV_JSON=$(gcloud run revisions describe "$REV" --region "$REGION" --format=json)
CONN=$(jq -r '.metadata.annotations["run.googleapis.com/cloudsql-instances"]' <<<"$REV_JSON" | cut -d, -f1)
INSTANCE="${CONN##*:}"
DB_NAME=$(jq -r '.spec.containers[0].env[] | select(.name=="DB_DATABASE") | .value' <<<"$REV_JSON")
DB_USER=$(jq -r '.spec.containers[0].env[] | select(.name=="DB_USERNAME") | .value' <<<"$REV_JSON")
SECRET_NAME=$(jq -r '.spec.containers[0].env[] | select(.name=="DB_PASSWORD") | .valueFrom.secretKeyRef.name' <<<"$REV_JSON")
SECRET_VERSION=$(jq -r '.spec.containers[0].env[] | select(.name=="DB_PASSWORD") | .valueFrom.secretKeyRef.key // "latest"' <<<"$REV_JSON")
echo "Fase $PHASE · revisión con tráfico: $REV · instancia: $INSTANCE · base: $DB_NAME"

# --- Fase B: solo la copia (no necesita proxy ni contraseña) -----------------
if [ "$PHASE" = "B" ]; then
  DESC="pre-hotfix-${COMMIT}-$(date -u +%Y%m%d%H%M%S)"
  # Espera a que la operación termine (comportamiento por defecto de gcloud).
  gcloud sql backups create --instance="$INSTANCE" --description="$DESC" >/dev/null
  gcloud sql backups list --instance="$INSTANCE" --filter="description=$DESC" \
    --format="table(id,type,status,windowStartTime,endTime,description)"
  STATUS=$(gcloud sql backups list --instance="$INSTANCE" --filter="description=$DESC" --format="value(status)")
  [ "$STATUS" = "SUCCESSFUL" ] || { echo "La copia NO terminó correctamente ($STATUS): detenerse."; exit 1; }
  echo "FASE_B_OK"
  exit 0
fi

# --- Proxy propio + contraseña en memoria -------------------------------------
cloud-sql-proxy --port "$PORT" "$CONN" >"/tmp/novex-hotfix-proxy.log" 2>&1 &
PROXY_PID=$!
trap 'unset PGPASSWORD DB_PASSWORD_LOCAL; kill "$PROXY_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do pg_isready -q -h 127.0.0.1 -p "$PORT" && break; sleep 1; done
pg_isready -q -h 127.0.0.1 -p "$PORT" || { echo "Proxy no listo"; exit 1; }

PGPASSWORD=$(gcloud secrets versions access "$SECRET_VERSION" --secret="$SECRET_NAME" 2>/dev/null)
export PGPASSWORD
[ -n "$PGPASSWORD" ] || { echo "No se pudo leer el secreto"; exit 1; }
CONNINFO="host=127.0.0.1 port=$PORT dbname=$DB_NAME user=$DB_USER sslmode=disable"
ro() { PGOPTIONS='-c default_transaction_read_only=on' psql "$CONNINFO" -X -v ON_ERROR_STOP=1 "$@"; }

# Código de 49a6483 (se reutiliza entre fases).
if [ ! -d "$WORK/.git" ]; then
  git clone -q https://github.com/DesarrolloFabrica/NOVEX_BACKEND "$WORK"
  git -C "$WORK" checkout -q "$COMMIT"
  (cd "$WORK" && npm ci --no-audit --no-fund >/dev/null 2>&1)
fi
[ "$(git -C "$WORK" rev-parse --short=7 HEAD)" = "$COMMIT" ] || { echo "El código no está en $COMMIT"; exit 1; }
export DB_CLOUD=false DB_HOST_LOCAL=127.0.0.1 DB_PORT_LOCAL="$PORT" DB_SSL_LOCAL=false
export DB_DATABASE_LOCAL="$DB_NAME" DB_USERNAME_LOCAL="$DB_USER" DB_PASSWORD_LOCAL="$PGPASSWORD"
pending() { (cd "$WORK" && npm run -s migration:show 2>/dev/null) | sed 's/\x1b\[[0-9;]*m//g' | sed -n 's/^\[ \] //p'; }

state() {
  [ "$(ro -At -c 'SHOW default_transaction_read_only')" = "on" ] || { echo "Sesión no READ ONLY"; exit 1; }
  echo "== Migraciones aplicadas:"; ro -At -c "SELECT count(*)||' (última: '||max(name)||')' FROM typeorm_migrations"
  echo "== Recuentos de referencia:"
  ro -c "SELECT (SELECT count(*) FROM situations) AS situaciones,
                (SELECT count(*) FROM situation_evidences) AS evidencias,
                (SELECT count(*) FROM situation_timeline_entries) AS eventos,
                (SELECT max(created_at) FROM situations) AS ultima_situacion,
                (SELECT max(created_at) FROM situation_evidences) AS ultima_evidencia"
  echo "== Columnas nuevas presentes:"
  ro -At -c "SELECT table_name||'.'||column_name||' '||data_type||' nullable='||is_nullable FROM information_schema.columns
             WHERE (table_name='situations' AND column_name IN ('client_request_id','request_fingerprint','analysis_claim_token','analysis_claim_expires_at'))
                OR (table_name='situation_evidences' AND column_name='client_key') ORDER BY 1"
  echo "== Índices nuevos (válido / listo):"
  ro -At -c "SELECT c.relname||' valid='||i.indisvalid||' ready='||i.indisready FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
             WHERE c.relname IN ('uq_situations_creator_client_request','uq_situation_evidences_client_key') ORDER BY 1"
}

case "$PHASE" in
  A)
    state
    P=$(pending)
    echo "== Pendientes según $COMMIT:"; echo "$P"
    [ "$P" = "$EXPECTED" ] && echo "FASE_A_OK: pendientes = exactamente las 5 previstas" \
      || { echo "FASE_A_STOP: las pendientes NO coinciden"; exit 1; }
    ;;
  C)
    P=$(pending)
    [ "$P" = "$EXPECTED" ] || { echo "FASE_C_STOP: pendientes distintas de las previstas:"; echo "$P"; exit 1; }
    set +e
    (cd "$WORK" && npm run -s migration:run 2>&1) | sed 's/\x1b\[[0-9;]*m//g' | grep -E "executed successfully|rror|Error"
    RC=${PIPESTATUS[0]}
    set -e
    if [ "$RC" -ne 0 ] || [ -n "$(pending)" ]; then
      echo "FASE_C_FALLO: estado parcial (no se revierte nada):"
      state
      echo "== Pendientes:"; pending
      exit 1
    fi
    echo "FASE_C_OK"
    ;;
  D)
    state
    P=$(pending)
    [ -z "$P" ] && echo "FASE_D_OK: sin pendientes según $COMMIT" || { echo "FASE_D_STOP: quedan pendientes:"; echo "$P"; exit 1; }
    ;;
  S)
    # Firma del esquema en solo lectura (para comparar con el esperado).
    [ "$(ro -At -c 'SHOW default_transaction_read_only')" = "on" ] || { echo "Sesión no READ ONLY"; exit 1; }
    ro -At -f "$(dirname "$0")/schema-signature-readonly.sql" | grep -vE '^(BEGIN|ROLLBACK)$'
    ;;
  *) echo "Fase desconocida"; exit 1 ;;
esac
