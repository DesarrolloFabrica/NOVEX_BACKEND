[CmdletBinding()]
param(
  [int]$Port = 15432,
  [string]$InstanceConnectionName = 'it-fab-contenido-edu-5:us-central1:novex-db'
)

$ErrorActionPreference = 'Stop'

function Test-LocalPort {
  param([int]$TargetPort)

  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $connection = $client.ConnectAsync('127.0.0.1', $TargetPort)
    return $connection.Wait(500) -and $client.Connected
  }
  catch {
    return $false
  }
  finally {
    $client.Dispose()
  }
}

if (Test-LocalPort -TargetPort $Port) {
  Write-Host "Cloud SQL Proxy disponible en 127.0.0.1:$Port"
  return
}

$workspaceRoot = [System.IO.Path]::GetFullPath(
  (Join-Path $PSScriptRoot '..\..')
)
$proxyPath = Join-Path $workspaceRoot '.tools\cloud-sql-proxy.exe'
$adcPath = Join-Path $env:APPDATA 'gcloud\application_default_credentials.json'

if (-not (Test-Path -LiteralPath $proxyPath)) {
  throw "No se encontro Cloud SQL Auth Proxy en $proxyPath"
}
if (-not (Test-Path -LiteralPath $adcPath)) {
  throw 'Faltan credenciales ADC. Ejecute: gcloud auth application-default login'
}

$logDirectory = Join-Path $workspaceRoot 'NOVEX_BACKEND\logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stdout = Join-Path $logDirectory "cloud-sql-proxy-$stamp.out.log"
$stderr = Join-Path $logDirectory "cloud-sql-proxy-$stamp.err.log"

$process = Start-Process `
  -FilePath $proxyPath `
  -ArgumentList @(
    '--address',
    '127.0.0.1',
    '--port',
    $Port.ToString(),
    $InstanceConnectionName
  ) `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdout `
  -RedirectStandardError $stderr `
  -PassThru

for ($attempt = 1; $attempt -le 20; $attempt++) {
  if ($process.HasExited) {
    $details = Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue
    throw "Cloud SQL Proxy termino antes de abrir el puerto. $details"
  }
  if (Test-LocalPort -TargetPort $Port) {
    Write-Host "Cloud SQL Proxy iniciado (PID $($process.Id)) en 127.0.0.1:$Port"
    return
  }
  Start-Sleep -Milliseconds 500
}

throw "Cloud SQL Proxy no abrio 127.0.0.1:$Port. Revise $stderr"
