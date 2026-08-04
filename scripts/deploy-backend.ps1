#Requires -Version 5.1
<#
.SYNOPSIS
  Despliega novex-backend en Cloud Run — proyecto Operacion Producto y LMS.

.DESCRIPTION
  No contiene secretos. No crea ni sobrescribe secretos en Secret Manager.
  No usa instancias Cloud SQL de otros productos (producto-backend-db, carga-lms).
  Requiere confirmación explícita antes de desplegar.
#>

$ErrorActionPreference = 'Stop'

# -----------------------------------------------------------------------------
# Variables — proyecto Operacion Producto y LMS
# -----------------------------------------------------------------------------
$PROJECT_ID = "it-fab-contenido-edu-5"
$REGION = "us-central1"
$SERVICE = "novex-backend"
$REPOSITORY = "novex"
$IMAGE = "novex-backend"

# Cloud SQL NOVEX (creada para este backend; no usar producto-backend-db ni carga-lms)
$CLOUD_SQL_INSTANCE = "it-fab-contenido-edu-5:us-central1:novex-db"

# Identidad default del proyecto (project number 550902908078)
$SERVICE_ACCOUNT = "550902908078-compute@developer.gserviceaccount.com"

# Frontend NOVEX en Cloud Run + desarrollo local
$CORS_ORIGINS = "http://localhost:5173,https://omega-frontend-550902908078.us-central1.run.app"

# Usuario/base de la instancia NUEVA (crear junto con Cloud SQL)
$DB_USERNAME = "novex"
$DB_DATABASE = "novex"

$GOOGLE_CLIENT_ID = "550902908078-biqvngn6c1eufs3occ54cnritqrfhvl5.apps.googleusercontent.com"
$GEMINI_MODEL = "gemini-3-flash-preview"
$JWT_EXPIRES_IN = "1h"
$MEMORY = "1Gi"
$CPU = "1"
$MIN_INSTANCES = "0"
$MAX_INSTANCES = "5"
$CONCURRENCY = "40"
$TIMEOUT = "300"

# El esquema se administra exclusivamente mediante migraciones TypeORM.
$DB_SYNCHRONIZE = "false"

$IMAGE_URI = "$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/${IMAGE}:manual-$(Get-Date -Format 'yyyyMMddHHmmss')"
$IMAGE_LATEST = "$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/${IMAGE}:latest"

function Assert-NonEmpty([string]$Name, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "Falta el valor de '$Name'. Complételo al inicio del script y vuelva a ejecutar."
  }
}

# gcloud.ps1 escribe avisos en stderr; con ErrorAction=Stop eso aborta el script.
function Invoke-GCloud {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$GcloudArgs,
    [switch]$IgnoreExitCode
  )

  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $lines = & gcloud @GcloudArgs 2>&1
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev

  $text = @(
    $lines | ForEach-Object {
      if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() }
      else { "$_" }
    }
  ) -join [Environment]::NewLine

  if (-not $IgnoreExitCode -and $code -ne 0) {
    throw "gcloud falló (exit=$code): $text"
  }

  return $text
}

Write-Host "==> Verificando gcloud..."
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw "gcloud CLI no está instalado o no está en el PATH."
}

Write-Host "==> Cuenta activa:"
Invoke-GCloud -GcloudArgs @('auth', 'list', '--filter=status:ACTIVE', '--format=value(account)') | Write-Host

Write-Host "==> Seleccionando proyecto $PROJECT_ID"
Invoke-GCloud -GcloudArgs @('config', 'set', 'project', $PROJECT_ID) | Out-Null

Assert-NonEmpty "CLOUD_SQL_INSTANCE" $CLOUD_SQL_INSTANCE
Assert-NonEmpty "SERVICE_ACCOUNT" $SERVICE_ACCOUNT
Assert-NonEmpty "CORS_ORIGINS" $CORS_ORIGINS
Assert-NonEmpty "DB_USERNAME" $DB_USERNAME
Assert-NonEmpty "DB_DATABASE" $DB_DATABASE
Assert-NonEmpty "GOOGLE_CLIENT_ID" $GOOGLE_CLIENT_ID

Write-Host ""
Write-Host "Se desplegará:"
Write-Host "  Proyecto:        $PROJECT_ID"
Write-Host "  Región:          $REGION"
Write-Host "  Servicio:        $SERVICE"
Write-Host "  Imagen:          $IMAGE_URI"
Write-Host "  Cloud SQL:       $CLOUD_SQL_INSTANCE"
Write-Host "  Service Account: $SERVICE_ACCOUNT"
Write-Host "  CORS:            $CORS_ORIGINS"
Write-Host "  DB_SYNCHRONIZE:  $DB_SYNCHRONIZE"
Write-Host ""
$confirm = Read-Host "Escriba DEPLOY para confirmar (cualquier otra cosa cancela)"
if ($confirm -ne 'DEPLOY') {
  Write-Host "Despliegue cancelado."
  exit 1
}

Write-Host "==> Habilitando APIs necesarias..."
Invoke-GCloud -GcloudArgs @(
  'services', 'enable',
  'run.googleapis.com',
  'artifactregistry.googleapis.com',
  'cloudbuild.googleapis.com',
  'secretmanager.googleapis.com',
  'sqladmin.googleapis.com',
  "--project=$PROJECT_ID"
) | Write-Host

Write-Host "==> Comprobando Artifact Registry '$REPOSITORY'..."
$repoOut = Invoke-GCloud -IgnoreExitCode -GcloudArgs @(
  'artifacts', 'repositories', 'describe', $REPOSITORY,
  "--location=$REGION",
  "--project=$PROJECT_ID",
  '--format=value(name)'
)
$repoExists = $repoOut -match 'projects/.+/locations/.+/repositories/'

if (-not $repoExists) {
  Write-Host "Creando repositorio Artifact Registry '$REPOSITORY'..."
  Invoke-GCloud -GcloudArgs @(
    'artifacts', 'repositories', 'create', $REPOSITORY,
    '--repository-format=docker',
    "--location=$REGION",
    '--description=NOVEX backend images',
    "--project=$PROJECT_ID"
  ) | Write-Host
} else {
  Write-Host "Repositorio '$REPOSITORY' encontrado."
}

Write-Host "==> Construyendo imagen localmente..."
$prev = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
docker build -t $IMAGE_URI -t $IMAGE_LATEST .
$dockerCode = $LASTEXITCODE
$ErrorActionPreference = $prev
if ($dockerCode -ne 0) {
  throw "docker build falló (exit=$dockerCode)."
}

Write-Host "==> Autenticando Docker en Artifact Registry..."
Invoke-GCloud -GcloudArgs @('auth', 'configure-docker', "$REGION-docker.pkg.dev", '--quiet') | Out-Null

Write-Host "==> Subiendo imagen..."
$ErrorActionPreference = 'Continue'
docker push $IMAGE_URI
if ($LASTEXITCODE -ne 0) { $ErrorActionPreference = 'Stop'; throw "docker push falló ($IMAGE_URI)." }
docker push $IMAGE_LATEST
if ($LASTEXITCODE -ne 0) { $ErrorActionPreference = 'Stop'; throw "docker push falló ($IMAGE_LATEST)." }
$ErrorActionPreference = 'Stop'

$DB_HOST = "/cloudsql/$CLOUD_SQL_INSTANCE"

Write-Host "==> Desplegando Cloud Run..."
Invoke-GCloud -GcloudArgs @(
  'run', 'deploy', $SERVICE,
  "--project=$PROJECT_ID",
  "--region=$REGION",
  "--image=$IMAGE_URI",
  '--platform=managed',
  '--execution-environment=gen2',
  '--port=8080',
  '--command=',
  '--args=',
  '--cpu-boost',
  '--startup-probe=httpGet.path=/health/ready,httpGet.port=8080,initialDelaySeconds=0,timeoutSeconds=3,periodSeconds=5,failureThreshold=48',
  '--liveness-probe=httpGet.path=/health,httpGet.port=8080,timeoutSeconds=3,periodSeconds=10,failureThreshold=3',
  '--readiness-probe=httpGet.path=/health/ready,httpGet.port=8080,timeoutSeconds=3,periodSeconds=5,failureThreshold=3,successThreshold=1',
  "--cpu=$CPU",
  "--memory=$MEMORY",
  "--concurrency=$CONCURRENCY",
  "--timeout=$TIMEOUT",
  "--min-instances=$MIN_INSTANCES",
  "--max-instances=$MAX_INSTANCES",
  "--service-account=$SERVICE_ACCOUNT",
  "--add-cloudsql-instances=$CLOUD_SQL_INSTANCE",
  '--set-secrets=DB_PASSWORD=omega-db-password:latest,JWT_SECRET=omega-jwt-secret:latest,GEMINI_API_KEY=omega-gemini-api-key:latest',
  "--set-env-vars=NODE_ENV=production,API_PREFIX=api/v1,CORS_ORIGINS=$CORS_ORIGINS,DB_HOST=$DB_HOST,DB_PORT=5432,DB_USERNAME=$DB_USERNAME,DB_DATABASE=$DB_DATABASE,DB_SSL=false,DB_SYNCHRONIZE=$DB_SYNCHRONIZE,ALLOW_PRODUCTION_DB_SYNC=$DB_SYNCHRONIZE,DB_LOGGING=false,INSTANCE_CONNECTION_NAME=$CLOUD_SQL_INSTANCE,JWT_EXPIRES_IN=$JWT_EXPIRES_IN,GEMINI_MODEL=$GEMINI_MODEL,GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID,CATALOG_SEED_ON_BOOT=false,DEMO_SEED_ENABLED=false",
  '--allow-unauthenticated'
) | Write-Host

$SERVICE_URL = (Invoke-GCloud -GcloudArgs @(
  'run', 'services', 'describe', $SERVICE,
  "--project=$PROJECT_ID",
  "--region=$REGION",
  '--format=value(status.url)'
)).Trim()

Write-Host ""
Write-Host "URL del servicio: $SERVICE_URL"
Write-Host "==> Consultando /health ..."
try {
  $health = Invoke-RestMethod -Uri "$SERVICE_URL/health" -Method Get -TimeoutSec 30
  $health | ConvertTo-Json -Depth 5
} catch {
  Write-Warning "No se pudo consultar /health todavía. Revise logs y revisiones en Cloud Run."
  Write-Warning $_.Exception.Message
}

Write-Host ""
Write-Host "Despliegue finalizado."
Write-Host "Cuando el esquema esté estable, cambie DB_SYNCHRONIZE a false en este script."
Write-Host "Rote GEMINI_API_KEY si estuvo expuesta en entornos locales."
