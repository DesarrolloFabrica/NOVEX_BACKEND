#!/usr/bin/env bash
# Despliega novex-backend en Cloud Run — Operacion Producto y LMS.
# No contiene secretos. No crea ni sobrescribe secretos.
# No usa Cloud SQL de producto-backend-db ni carga-lms.
set -euo pipefail

PROJECT_ID="it-fab-contenido-edu-5"
REGION="us-central1"
SERVICE="novex-backend"
REPOSITORY="novex"
IMAGE="novex-backend"
CLOUD_SQL_INSTANCE="it-fab-contenido-edu-5:us-central1:novex-db"
SERVICE_ACCOUNT="550902908078-compute@developer.gserviceaccount.com"

CORS_ORIGINS="http://localhost:5173"
DB_USERNAME="novex"
DB_DATABASE="novex"
GOOGLE_CLIENT_ID="550902908078-biqvngn6c1eufs3occ54cnritqrfhvl5.apps.googleusercontent.com"
GEMINI_MODEL="gemini-3-flash-preview"
JWT_EXPIRES_IN="1h"
MEMORY="1Gi"
CPU="1"
MIN_INSTANCES="0"
MAX_INSTANCES="5"
CONCURRENCY="40"
TIMEOUT="300"

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE}:manual-$(date +%Y%m%d%H%M%S)"
IMAGE_LATEST="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE}:latest"

require_value() {
  local name="$1"
  local value="$2"
  if [[ -z "${value}" ]]; then
    echo "Falta el valor de '${name}'. Complételo al inicio del script." >&2
    exit 1
  fi
}

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI no está instalado o no está en el PATH." >&2
  exit 1
fi

echo "==> Cuenta activa:"
gcloud auth list --filter=status:ACTIVE --format="value(account)"

echo "==> Seleccionando proyecto ${PROJECT_ID}"
gcloud config set project "${PROJECT_ID}" >/dev/null

require_value "CLOUD_SQL_INSTANCE" "${CLOUD_SQL_INSTANCE}"
require_value "SERVICE_ACCOUNT" "${SERVICE_ACCOUNT}"
require_value "CORS_ORIGINS" "${CORS_ORIGINS}"
require_value "DB_USERNAME" "${DB_USERNAME}"
require_value "DB_DATABASE" "${DB_DATABASE}"
require_value "GOOGLE_CLIENT_ID" "${GOOGLE_CLIENT_ID}"

echo
echo "Se desplegará:"
echo "  Proyecto:        ${PROJECT_ID}"
echo "  Región:          ${REGION}"
echo "  Servicio:        ${SERVICE}"
echo "  Imagen:          ${IMAGE_URI}"
echo "  Cloud SQL:       ${CLOUD_SQL_INSTANCE}"
echo "  Service Account: ${SERVICE_ACCOUNT}"
echo "  CORS:            ${CORS_ORIGINS}"
echo
read -r -p "Escriba DEPLOY para confirmar (cualquier otra cosa cancela): " confirm
if [[ "${confirm}" != "DEPLOY" ]]; then
  echo "Despliegue cancelado."
  exit 1
fi

echo "==> Habilitando APIs necesarias..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com \
  --project="${PROJECT_ID}"

if ! gcloud artifacts repositories describe "${REPOSITORY}" \
  --location="${REGION}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "Creando repositorio Artifact Registry '${REPOSITORY}'..."
  gcloud artifacts repositories create "${REPOSITORY}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="NOVEX backend images" \
    --project="${PROJECT_ID}"
fi

echo "==> Construyendo imagen localmente..."
docker build -t "${IMAGE_URI}" -t "${IMAGE_LATEST}" .

echo "==> Autenticando Docker en Artifact Registry..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

echo "==> Subiendo imagen..."
docker push "${IMAGE_URI}"
docker push "${IMAGE_LATEST}"

DB_HOST="/cloudsql/${CLOUD_SQL_INSTANCE}"

echo "==> Desplegando Cloud Run..."
gcloud run deploy "${SERVICE}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${IMAGE_URI}" \
  --platform=managed \
  --execution-environment=gen2 \
  --port=8080 \
  --command="" \
  --args="" \
  --cpu-boost \
  --startup-probe="httpGet.path=/health/ready,httpGet.port=8080,initialDelaySeconds=0,timeoutSeconds=3,periodSeconds=5,failureThreshold=48" \
  --liveness-probe="httpGet.path=/health,httpGet.port=8080,timeoutSeconds=3,periodSeconds=10,failureThreshold=3" \
  --cpu="${CPU}" \
  --memory="${MEMORY}" \
  --concurrency="${CONCURRENCY}" \
  --timeout="${TIMEOUT}" \
  --min-instances="${MIN_INSTANCES}" \
  --max-instances="${MAX_INSTANCES}" \
  --service-account="${SERVICE_ACCOUNT}" \
  --add-cloudsql-instances="${CLOUD_SQL_INSTANCE}" \
  --set-secrets="DB_PASSWORD=omega-db-password:latest,JWT_SECRET=omega-jwt-secret:latest,GEMINI_API_KEY=omega-gemini-api-key:latest" \
  --set-env-vars="NODE_ENV=production,API_PREFIX=api/v1,CORS_ORIGINS=${CORS_ORIGINS},DB_HOST=${DB_HOST},DB_PORT=5432,DB_USERNAME=${DB_USERNAME},DB_DATABASE=${DB_DATABASE},DB_SSL=false,DB_SYNCHRONIZE=false,DB_LOGGING=false,INSTANCE_CONNECTION_NAME=${CLOUD_SQL_INSTANCE},JWT_EXPIRES_IN=${JWT_EXPIRES_IN},GEMINI_MODEL=${GEMINI_MODEL},GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID},CATALOG_SEED_ON_BOOT=false,DEMO_SEED_ENABLED=false" \
  --allow-unauthenticated

SERVICE_URL="$(gcloud run services describe "${SERVICE}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)')"

echo
echo "URL del servicio: ${SERVICE_URL}"
echo "==> Consultando /health ..."
if ! curl -fsS --max-time 30 "${SERVICE_URL}/health"; then
  echo
  echo "No se pudo consultar /health todavía. Revise logs y revisiones en Cloud Run." >&2
fi

echo
echo "Despliegue finalizado."
echo "Nota: cree previamente los secretos omega-db-password, omega-jwt-secret, omega-gemini-api-key."
echo "Rote GEMINI_API_KEY si estuvo expuesta en entornos locales."
