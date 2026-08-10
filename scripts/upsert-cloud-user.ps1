[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Email,

  [Parameter(Mandatory = $true)]
  [string]$FullName,

  [ValidateSet('ADMIN', 'DIRECTOR', 'ANALISTA', 'COORDINADOR')]
  [string]$RoleCode = 'ADMIN',

  [switch]$UseProxy
)

$ErrorActionPreference = 'Stop'

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

$cloudPassword = & $gcloud secrets versions access latest `
  --secret='novex-db-password' `
  --project='it-fab-contenido-edu-5'
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrEmpty($cloudPassword)) {
  throw 'No se pudo leer novex-db-password desde Secret Manager. Ejecute: gcloud auth login'
}

if ($UseProxy) {
  & (Join-Path $PSScriptRoot 'start-cloud-sql-proxy.ps1')
  $cloudHost = '127.0.0.1'
  $cloudPort = '15432'
  $cloudSsl = 'false'
}
else {
  $instanceIp = & $gcloud sql instances describe novex-db `
    --project='it-fab-contenido-edu-5' `
    --format='value(ipAddresses[0].ipAddress)'
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($instanceIp)) {
    throw 'No se pudo resolver la IP publica de novex-db'
  }
  $cloudHost = $instanceIp.Trim()
  $cloudPort = '5432'
  $cloudSsl = 'true'
  Write-Host "Usando conexion directa a Cloud SQL: $cloudHost`:$cloudPort (SSL sin verificacion)"
}

$cloudEnvironment = @{
  CLOUD_DB_HOST          = $cloudHost
  CLOUD_DB_PORT          = $cloudPort
  CLOUD_DB_USERNAME      = 'novex'
  CLOUD_DB_PASSWORD      = $cloudPassword
  CLOUD_DB_DATABASE      = 'novex'
  CLOUD_DB_SSL           = $cloudSsl
  UPSERT_USER_EMAIL      = $Email.Trim().ToLower()
  UPSERT_USER_FULL_NAME  = $FullName.Trim()
  UPSERT_USER_ROLE_CODE  = $RoleCode
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
    & npx.cmd ts-node -P tsconfig.typeorm.json ./src/database/seeds/run-upsert-cloud-user.ts
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
