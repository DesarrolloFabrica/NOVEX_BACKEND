[CmdletBinding()]
param(
  [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'

& (Join-Path $PSScriptRoot 'start-cloud-sql-proxy.ps1')

$gcloudCommand = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
$gcloud = if ($gcloudCommand) {
  $gcloudCommand.Source
}
else {
  Join-Path $env:LOCALAPPDATA 'Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd'
}
$psqlCommand = Get-Command psql.exe -ErrorAction SilentlyContinue
$psql = if ($psqlCommand) {
  $psqlCommand.Source
}
else {
  Get-ChildItem (Join-Path $env:ProgramFiles 'PostgreSQL\*\bin\psql.exe') `
    -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not (Test-Path -LiteralPath $gcloud)) {
  throw "No se encontro gcloud en $gcloud"
}

$cloudPassword = & $gcloud secrets versions access latest `
  --secret='novex-db-password' `
  --project='it-fab-contenido-edu-5'
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrEmpty($cloudPassword)) {
  throw 'No se pudo leer novex-db-password desde Secret Manager'
}

$cloudEnvironment = @{
  DB_HOST             = '127.0.0.1'
  DB_PORT             = '15432'
  DB_USERNAME         = 'novex'
  DB_PASSWORD         = $cloudPassword
  DB_DATABASE         = 'novex'
  DB_SSL              = 'false'
  DB_SYNCHRONIZE      = 'false'
  DB_LOGGING          = 'false'
  CATALOG_SEED_ON_BOOT = 'false'
  DEMO_SEED_ENABLED   = 'false'
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

  if ($ValidateOnly) {
    if (-not $psql -or -not (Test-Path -LiteralPath $psql)) {
      throw "No se encontro psql en $psql"
    }
    $env:PGPASSWORD = $cloudPassword
    & $psql -X -h 127.0.0.1 -p 15432 -U novex -d novex `
      -v ON_ERROR_STOP=1 -Atc 'SELECT 1;'
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
    Write-Host 'Conexion de desarrollo a Cloud SQL validada.'
    return
  }

  Push-Location (Join-Path $PSScriptRoot '..')
  try {
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
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  $cloudPassword = $null
}
