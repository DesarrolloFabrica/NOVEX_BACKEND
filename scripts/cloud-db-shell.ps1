[CmdletBinding()]
param(
  [string]$Command
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
if (-not $psql -or -not (Test-Path -LiteralPath $psql)) {
  throw "No se encontro psql en $psql"
}

$cloudPassword = & $gcloud secrets versions access latest `
  --secret='novex-db-password' `
  --project='it-fab-contenido-edu-5'
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrEmpty($cloudPassword)) {
  throw 'No se pudo leer novex-db-password desde Secret Manager'
}

$env:PGPASSWORD = $cloudPassword
try {
  $arguments = @(
    '-X',
    '-h', '127.0.0.1',
    '-p', '15432',
    '-U', 'novex',
    '-d', 'novex',
    '-v', 'ON_ERROR_STOP=1'
  )
  if ($Command) {
    $arguments += @('-c', $Command)
  }

  & $psql @arguments
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}
finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  $cloudPassword = $null
}
