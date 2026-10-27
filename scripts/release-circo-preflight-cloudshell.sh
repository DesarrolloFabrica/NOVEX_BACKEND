#!/usr/bin/env bash
# =============================================================================
# NOVEX · preflight de base de datos en SOLO LECTURA desde Cloud Shell
# =============================================================================
# Uso (en Cloud Shell, con este archivo y release-circo-preflight-readonly.sql
# subidos al mismo directorio):
#   bash novex-preflight-cloudshell.sh
#
# - Instancia, base y usuario se toman de la revisión de novex-backend que
#   RECIBE TRÁFICO (no se fijan a mano). El usuario no se imprime.
# - El proxy cifra la conexión con la instancia (mTLS de Cloud SQL); psql solo
#   habla con el proxy local en 127.0.0.1. No se desactiva TLS hacia Cloud SQL.
# - psql pide la contraseña por teclado y no la muestra.
# - Sesión forzada a solo lectura (PGOPTIONS) y el SQL va en una transacción
#   READ ONLY que termina en ROLLBACK.
# - El proxy se cierra al terminar, también si algo falla.
# =============================================================================
set -euo pipefail

PROJECT="it-fab-contenido-edu-5"
REGION="us-central1"
PORT="55499"
SQL_FILE="${1:-release-circo-preflight-readonly.sql}"

# 1) Herramientas necesarias.
for tool in gcloud cloud-sql-proxy psql pg_isready jq; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Falta la herramienta: $tool"; exit 1; }
done
[ -f "$SQL_FILE" ] || { echo "No encuentro $SQL_FILE en $(pwd)"; exit 1; }

gcloud config set project "$PROJECT" >/dev/null 2>&1

# 2) Revisión que recibe tráfico y su configuración real.
REV=$(gcloud run services describe novex-backend --region "$REGION" --format=json \
  | jq -r '[.status.traffic[] | select(.percent > 0) | .revisionName // empty][0]')
REV_JSON=$(gcloud run revisions describe "$REV" --region "$REGION" --format=json)
CONN=$(jq -r '.metadata.annotations["run.googleapis.com/cloudsql-instances"]' <<<"$REV_JSON" | cut -d, -f1)
DB_NAME=$(jq -r '.spec.containers[0].env[] | select(.name == "DB_DATABASE") | .value' <<<"$REV_JSON")
DB_USER=$(jq -r '.spec.containers[0].env[] | select(.name == "DB_USERNAME") | .value' <<<"$REV_JSON")
[ -n "$CONN" ] && [ -n "$DB_NAME" ] && [ -n "$DB_USER" ] || { echo "Configuración incompleta en $REV"; exit 1; }
echo "Revisión con tráfico: $REV · instancia: $CONN · base: $DB_NAME"

# 3) Proxy propio en segundo plano; se cierra siempre al salir.
cloud-sql-proxy --port "$PORT" "$CONN" >/tmp/novex-proxy.log 2>&1 &
PROXY_PID=$!
trap 'kill "$PROXY_PID" 2>/dev/null || true' EXIT

# 4) Esperar a que el proxy acepte conexiones.
for _ in $(seq 1 30); do
  pg_isready -q -h 127.0.0.1 -p "$PORT" && break
  sleep 1
done
pg_isready -q -h 127.0.0.1 -p "$PORT" || { echo "El proxy no quedó listo:"; tail -5 /tmp/novex-proxy.log; exit 1; }

# 5) Contraseña. Por defecto psql la pide por teclado. Con
#    PASSWORD_SOURCE=secret se lee EN MEMORIA el secreto que la revisión con
#    tráfico referencia en DB_PASSWORD; nunca se imprime ni se escribe, no va
#    en argumentos y se borra al salir.
trap 'unset PGPASSWORD; kill "$PROXY_PID" 2>/dev/null || true' EXIT
if [ "${PASSWORD_SOURCE:-prompt}" = "secret" ]; then
  SECRET_NAME=$(jq -r '.spec.containers[0].env[] | select(.name == "DB_PASSWORD") | .valueFrom.secretKeyRef.name // empty' <<<"$REV_JSON")
  SECRET_VERSION=$(jq -r '.spec.containers[0].env[] | select(.name == "DB_PASSWORD") | .valueFrom.secretKeyRef.key // "latest"' <<<"$REV_JSON")
  [ -n "$SECRET_NAME" ] || { echo "DB_PASSWORD no proviene de Secret Manager"; exit 1; }
  PGPASSWORD=$(gcloud secrets versions access "$SECRET_VERSION" --secret="$SECRET_NAME" 2>/dev/null)
  export PGPASSWORD
  [ -n "$PGPASSWORD" ] || { echo "No se pudo leer el secreto (no se muestra nada)"; exit 1; }
fi

CONNINFO="host=127.0.0.1 port=$PORT dbname=$DB_NAME user=$DB_USER sslmode=disable"
export PGOPTIONS='-c default_transaction_read_only=on'

# 6) Exigir que el SERVIDOR confirme la sesión de solo lectura.
RO=$(psql "$CONNINFO" -At -c "SHOW default_transaction_read_only")
[ "$RO" = "on" ] || { echo "La sesión NO es de solo lectura ($RO): se aborta"; exit 1; }
echo "Sesión de solo lectura confirmada por el servidor."

# 7) Consultas de solo lectura.
psql "$CONNINFO" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
