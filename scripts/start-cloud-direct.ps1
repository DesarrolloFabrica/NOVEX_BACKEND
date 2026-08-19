[CmdletBinding()]
param(
  [switch]$ValidateOnly,
  [string]$InstanceName = 'novex-db',
  [string]$ProjectId = 'it-fab-contenido-edu-5'
)

$ErrorActionPreference = 'Stop'

# Preferido: en .env pon DB_CLOUD=true y npm run start:dev (credenciales DB_*_CLOUD).
# Este script queda como fallback si hay que leer la password desde Secret Manager.
# El proxy (start-cloud-dev.ps1) suele fallar con inspeccion TLS (FortiGate) en 3307.

$gcloudCommand = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
$gcloud = if ($gcloudCommand) {
  $gcloudCommand.Source
}
else {
  Join-Path $env:LOCALAPPDATA 'Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd'
}
if (-not (Test-Path -LiteralPath $gcloud)) {
  throw "No se encontro gcloud en $gcloud"
}

$instanceIp = & $gcloud sql instances describe $InstanceName `
  --project=$ProjectId `
  --format='value(ipAddresses[0].ipAddress)'
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($instanceIp)) {
  throw "No se pudo resolver la IP publica de $InstanceName"
}

$cloudPassword = & $gcloud secrets versions access latest `
  --secret='novex-db-password' `
  --project=$ProjectId
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrEmpty($cloudPassword)) {
  throw 'No se pudo leer novex-db-password desde Secret Manager'
}

$cloudEnvironment = @{
  DB_HOST              = $instanceIp.Trim()
  DB_PORT              = '5432'
  DB_USERNAME          = 'novex'
  DB_PASSWORD          = $cloudPassword
  DB_DATABASE          = 'novex'
  DB_SSL               = 'true'
  DB_SYNCHRONIZE       = 'false'
  DB_LOGGING           = 'false'
  CATALOG_SEED_ON_BOOT = 'false'
  DEMO_SEED_ENABLED    = 'false'
}
$previousEnvironment = @{}

try {
  foreach ($entry in $cloudEnvironment.GetEnumerator()) {
    $previousEnvironment[$entry.Key] = [Environment]::GetEnvironmentVariable(
      $entry.Key,
      'Process'
    )
    [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
  }

  Push-Location (Join-Path $PSScriptRoot '..')
  try {
    if ($ValidateOnly) {
      & npx.cmd ts-node -P tsconfig.typeorm.json `
        -e "import('./src/database/database-preflight').then((m) => m.verifyDatabaseConnection()).then(() => console.log('Conexion directa a Cloud SQL validada.')).catch((error) => { console.error(error); process.exit(1); })"
      if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
      }
      return
    }

    & npm.cmd run start:dev
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }
  finally {
    Pop-Location
  }
}
finally {
  foreach ($entry in $previousEnvironment.GetEnumerator()) {
    [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
  }
  $cloudPassword = $null
}
