<#
.SYNOPSIS
  Preflight de producción para publicar cartas y circo. SOLO LECTURA.

.DESCRIPTION
  1. Cloud Run: revisiones que REALMENTE reciben tráfico (status.traffic con
     percent > 0), su imagen tal como está declarada, el digest resuelto
     (status.imageDigest), si la imagen usa tag o digest y el tag de commit.
  2. Banderas no secretas de cada revisión que sirve tráfico (no del template).
  3. Instancia de Cloud SQL tomada de la anotación de la revisión servida, sus
     características (para estimar costes), copias y operaciones de restore.
  4. Logs del cron de SLA y jobs de Cloud Scheduler.
  5. Opcional (-RunDatabaseChecks): consultas de solo lectura a través de un
     proxy de Cloud SQL que este script inicia y cierra él mismo.

  Nunca imprime credenciales, tokens, cadenas de conexión ni valores de
  secretos. No escribe en ningún recurso de GCP.

.PARAMETER PasswordSource
  Cómo obtener la contraseña de la base (solo con -RunDatabaseChecks):
    Prompt         la pide por teclado (Read-Host -AsSecureString).
    SecretManager  lee en memoria la versión del secreto que la revisión
                   servida referencia en DB_PASSWORD. Requiere autorización
                   expresa: es acceso a un secreto.
#>
[CmdletBinding()]
param(
  [string]$Project = 'it-fab-contenido-edu-5',
  [string]$Region = 'us-central1',
  [switch]$RunDatabaseChecks,
  [ValidateSet('Docker', 'Native')]
  [string]$ProxyMode = 'Docker',
  # Imagen oficial (github.com/GoogleCloudPlatform/cloud-sql-proxy), fijada por
  # el digest del índice multiplataforma de la etiqueta 2.14.1.
  [string]$ProxyImage = 'gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.14.1@sha256:5cf206e6b9609aaa666db20c6c6632521985a5412ebbe4835e83d39bc76501e9',
  [int]$ProxyPort = 55499,
  [ValidateSet('Prompt', 'SecretManager')]
  [string]$PasswordSource = 'Prompt'
)

$ErrorActionPreference = 'Stop'
$BackendRoot = Split-Path -Parent $PSScriptRoot

# Banderas cuyo VALOR se puede mostrar (no son secretas).
$PublicFlags = @(
  'NODE_ENV', 'SITUATION_SWEEP_CRON_ENABLED', 'SEVERITY_ESCALATION_ENABLED',
  'CATALOG_SEED_ON_BOOT', 'DEMO_SEED_ENABLED', 'ENABLE_EMAIL_LOGIN',
  'DB_SYNCHRONIZE', 'DB_SSL'
)
# Variables de las que solo se informa si están definidas.
$PresenceOnly = @('SCHEDULER_OIDC_AUDIENCE', 'SCHEDULER_OIDC_SERVICE_ACCOUNT_EMAIL', 'CORS_ORIGINS')

# gcloud es un .ps1 que escribe avisos en stderr: con ErrorActionPreference=Stop
# PowerShell 5.1 los convierte en errores terminantes. Se ejecuta con Continue y
# se decide por el código de salida.
function Invoke-Native {
  param([Parameter(Mandatory)][scriptblock]$Command, [switch]$ShowErrors)
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    if ($ShowErrors) { return (& $Command 2>&1) }
    return (& $Command 2>$null)
  }
  finally { $ErrorActionPreference = $previousPreference }
}

function Invoke-GcloudJson {
  param(
    [Parameter(Mandatory)][string[]]$GcloudArgs,
    # Consulta auxiliar: si falla (API no habilitada, sin permiso de lectura),
    # avisa y devuelve $null en lugar de abortar el preflight.
    [switch]$Optional
  )
  $raw = Invoke-Native { & gcloud @GcloudArgs --project=$Project --format=json }
  if ($LASTEXITCODE -ne 0) {
    if ($Optional) { Write-Warning "No disponible: gcloud $($GcloudArgs[0..2] -join ' ')"; return $null }
    throw "gcloud falló: gcloud $($GcloudArgs -join ' ')"
  }
  if (-not $raw) { return $null }
  return ($raw -join "`n") | ConvertFrom-Json
}

function Get-ServingRevisions {
  param([string]$Service)
  $svc = Invoke-GcloudJson @('run', 'services', 'describe', $Service, "--region=$Region")
  foreach ($t in $svc.status.traffic) {
    if ([int]$t.percent -le 0) { continue }
    # Una entrada "latestRevision" no trae nombre: corresponde a la última lista.
    $revName = if ($t.revisionName) { $t.revisionName } else { $svc.status.latestReadyRevisionName }
    [pscustomobject]@{ Service = $Service; Revision = $revName; Percent = [int]$t.percent }
  }
}

function Get-EnvValue {
  param($Container, [string]$Name)
  $entry = $Container.env | Where-Object { $_.name -eq $Name } | Select-Object -First 1
  if (-not $entry) { return $null }
  return $entry
}

Write-Host "=== Proyecto $Project · región $Region (solo lectura)" -ForegroundColor Cyan

$serving = @()
foreach ($service in 'novex-backend', 'novex-frontend') {
  $serving += Get-ServingRevisions -Service $service
}

$backendRevisionInfo = $null
foreach ($s in $serving) {
  $rev = Invoke-GcloudJson @('run', 'revisions', 'describe', $s.Revision, "--region=$Region")
  $container = $rev.spec.containers[0]
  $declared = $container.image
  $usesDigest = $declared -match '@sha256:'
  $repoPath = ($declared -split '@')[0]
  if (-not $usesDigest) { $repoPath = $repoPath -replace ':[^:/]+$', '' }
  $digest = if ($rev.status.imageDigest) { ($rev.status.imageDigest -split '@')[-1] } elseif ($usesDigest) { ($declared -split '@')[-1] } else { $null }

  $tags = $null
  if ($digest) {
    $imgs = Invoke-GcloudJson -Optional @('artifacts', 'docker', 'images', 'list', $repoPath, '--include-tags', "--filter=version=$digest")
    $tags = ($imgs | ForEach-Object { $_.tags }) -join ','
  }

  Write-Host ""
  Write-Host ("--- {0}: revisión {1} ({2}% del tráfico)" -f $s.Service, $s.Revision, $s.Percent) -ForegroundColor Yellow
  Write-Host ("    imagen declarada: {0}" -f $declared)
  Write-Host ("    referencia por:   {0}" -f $(if ($usesDigest) { 'digest' } else { 'tag' }))
  Write-Host ("    digest servido:   {0}" -f $(if ($digest) { $digest } else { '(no disponible)' }))
  Write-Host ("    tags del digest:  {0}  <- el workflow etiqueta con el SHA corto del commit" -f $(if ($tags) { $tags } else { '(ninguno)' }))
  Write-Host ("    creada:           {0}" -f $rev.metadata.creationTimestamp)

  if ($s.Service -eq 'novex-backend') {
    Write-Host "    banderas (valor):"
    foreach ($name in $PublicFlags) {
      $entry = Get-EnvValue -Container $container -Name $name
      $shown = if (-not $entry) { '(no definida -> valor por defecto del código)' } elseif ($entry.valueFrom) { '(desde Secret Manager)' } else { $entry.value }
      Write-Host ("      {0} = {1}" -f $name, $shown)
    }
    Write-Host "    variables (solo presencia):"
    foreach ($name in $PresenceOnly) {
      Write-Host ("      {0} definida: {1}" -f $name, [bool](Get-EnvValue -Container $container -Name $name))
    }
    $ann = $rev.metadata.annotations
    $minScale = $ann.'autoscaling.knative.dev/minScale'
    Write-Host ("    min-instances: {0}" -f $(if ($minScale) { $minScale } else { '(no definido = 0)' }))
    $backendRevisionInfo = [pscustomobject]@{
      Revision    = $s.Revision
      Container   = $container
      SqlInstance = $ann.'run.googleapis.com/cloudsql-instances'
    }
  }
}

# --- Cloud SQL: instancia REAL desde la revisión servida ---------------------
if (-not $backendRevisionInfo -or -not $backendRevisionInfo.SqlInstance) {
  throw 'La revisión servida del backend no declara instancia de Cloud SQL.'
}
# @(...) evita que una sola instancia se desenvuelva a cadena ([0] = primer carácter).
$connectionNames = @($backendRevisionInfo.SqlInstance -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$connectionName = $connectionNames[0]
$instanceName = ($connectionName -split ':')[-1]
Write-Host ""
Write-Host "=== Cloud SQL (instancia de la revisión servida): $instanceName" -ForegroundColor Cyan
if ($connectionNames.Count -gt 1) { Write-Host "    AVISO: la revisión declara varias instancias; se usa la primera." }

$inst = Invoke-GcloudJson @('sql', 'instances', 'describe', $instanceName)
[pscustomobject]@{
  Version        = $inst.databaseVersion
  Edicion        = $inst.settings.edition
  Tier           = $inst.settings.tier
  DiscoGB        = $inst.settings.dataDiskSizeGb
  TipoDisco      = $inst.settings.dataDiskType
  Disponibilidad = $inst.settings.availabilityType
  IpPublica      = [bool]($inst.ipAddresses | Where-Object { $_.type -eq 'PRIMARY' })
  IpPrivada      = [bool]($inst.ipAddresses | Where-Object { $_.type -eq 'PRIVATE' })
  BackupsAuto    = $inst.settings.backupConfiguration.enabled
  PITR           = $inst.settings.backupConfiguration.pointInTimeRecoveryEnabled
  Retencion      = $inst.settings.backupConfiguration.backupRetentionSettings.retainedBackups
} | Format-List

Write-Host "--- Copias disponibles (últimas 10)"
Invoke-GcloudJson @('sql', 'backups', 'list', "--instance=$instanceName", '--limit=10') |
  Select-Object id, type, status, windowStartTime | Format-Table -AutoSize

Write-Host "--- Evidencia de restauraciones (operaciones RESTORE_VOLUME / CLONE en el proyecto)"
$allInstances = Invoke-GcloudJson @('sql', 'instances', 'list')
foreach ($i in $allInstances) {
  $ops = Invoke-GcloudJson -Optional @('sql', 'operations', 'list', "--instance=$($i.name)", '--limit=200')
  $ops | Where-Object { $_.operationType -in @('RESTORE_VOLUME', 'CLONE') } |
    Select-Object @{n = 'instancia'; e = { $i.name } }, operationType, status, startTime | Format-Table -AutoSize
}
Write-Host ("    Instancias en el proyecto: {0}" -f (($allInstances | ForEach-Object { $_.name }) -join ', '))

# --- Cron de SLA y Cloud Scheduler -------------------------------------------
Write-Host ""
Write-Host "=== Cron de SLA en producción (logs de 30 días)" -ForegroundColor Cyan
$filter = 'resource.type="cloud_run_revision" AND resource.labels.service_name="novex-backend" AND textPayload:"SLA sweep"'
$logs = Invoke-GcloudJson -Optional @('logging', 'read', $filter, '--freshness=30d', '--limit=20')
if ($logs) { $logs | Select-Object timestamp, textPayload | Format-Table -AutoSize -Wrap } else { Write-Host '    (sin líneas "SLA sweep": el cron solo registra cuando marca o avisa algo)' }

Write-Host "--- Jobs de Cloud Scheduler"
$jobs = Invoke-GcloudJson -Optional @('scheduler', 'jobs', 'list', "--location=$Region")
if ($jobs) { $jobs | Select-Object name, schedule, state | Format-Table -AutoSize } else { Write-Host '    (ninguno)' }

if (-not $RunDatabaseChecks) {
  Write-Host ""
  Write-Host "Consultas a la base omitidas (usar -RunDatabaseChecks)." -ForegroundColor DarkGray
  return
}

# --- Base de datos: SOLO LECTURA vía proxy propio -----------------------------
$container = $backendRevisionInfo.Container
$dbName = (Get-EnvValue -Container $container -Name 'DB_DATABASE').value
$dbUserEntry = Get-EnvValue -Container $container -Name 'DB_USERNAME'
if (-not $dbName -or -not $dbUserEntry -or $dbUserEntry.valueFrom) {
  throw 'DB_DATABASE o DB_USERNAME no están como valor plano en la revisión servida.'
}

$previous = @{}
foreach ($v in 'PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGOPTIONS', 'CSQL_PROXY_TOKEN') {
  $previous[$v] = [Environment]::GetEnvironmentVariable($v, 'Process')
}
$proxyProcess = $null
$proxyContainer = $null
try {
  if ($PasswordSource -eq 'SecretManager') {
    $secretRef = (Get-EnvValue -Container $container -Name 'DB_PASSWORD').valueFrom.secretKeyRef
    if (-not $secretRef) { throw 'DB_PASSWORD de la revisión servida no proviene de Secret Manager.' }
    $version = if ($secretRef.key) { $secretRef.key } else { 'latest' }
    $plain = Invoke-Native { & gcloud secrets versions access $version --secret=$($secretRef.name) --project=$Project }
    if ($LASTEXITCODE -ne 0 -or -not $plain) { throw 'No se pudo leer el secreto (no se muestra nada).' }
    $env:PGPASSWORD = ($plain -join "`n")
    Remove-Variable plain
  } else {
    $sec = Read-Host 'Contraseña de la base (no se muestra)' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    try { $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  }

  if ($ProxyMode -eq 'Docker') {
    # Token de acceso solo como variable de entorno del contenedor (no en argumentos).
    $env:CSQL_PROXY_TOKEN = Invoke-Native { & gcloud auth print-access-token }
    $proxyContainer = "novex-preflight-proxy-$PID"
    Invoke-Native { & docker run -d --rm --name $proxyContainer -e CSQL_PROXY_TOKEN `
      -p "127.0.0.1:${ProxyPort}:5432" $ProxyImage --address 0.0.0.0 --port 5432 $connectionName } | Out-Null
    if ($LASTEXITCODE -ne 0) { $proxyContainer = $null; throw 'No arrancó el contenedor del proxy.' }
  } else {
    $proxyExe = (Get-Command cloud-sql-proxy -ErrorAction Stop).Source
    $proxyProcess = Start-Process $proxyExe -ArgumentList "--gcloud-auth --port $ProxyPort $connectionName" -PassThru -WindowStyle Hidden
  }

  # Esperar a que el proxy acepte conexiones locales.
  $ready = $false
  for ($i = 0; $i -lt 30 -and -not $ready; $i++) {
    Start-Sleep -Seconds 1
    $ready = (Test-NetConnection 127.0.0.1 -Port $ProxyPort -WarningAction SilentlyContinue).TcpTestSucceeded
  }
  if (-not $ready) { throw "El proxy no respondió en 127.0.0.1:$ProxyPort." }

  $env:PGHOST = '127.0.0.1'
  $env:PGPORT = "$ProxyPort"
  $env:PGDATABASE = $dbName
  $env:PGUSER = $dbUserEntry.value
  $env:PGOPTIONS = '-c default_transaction_read_only=on'

  Push-Location $BackendRoot
  try { Invoke-Native -ShowErrors { & node scripts/run-readonly-sql.mjs scripts/release-circo-preflight-readonly.sql } | Out-Host }
  finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'Las consultas de solo lectura fallaron.' }
}
finally {
  # Cierra SOLO el proxy que inició este script.
  if ($proxyContainer) { Invoke-Native { & docker rm -f $proxyContainer } | Out-Null }
  if ($proxyProcess -and -not $proxyProcess.HasExited) { Stop-Process -Id $proxyProcess.Id -Confirm:$false }
  # Restaura las variables tal como estaban (o las elimina si no existían).
  foreach ($v in $previous.Keys) {
    [Environment]::SetEnvironmentVariable($v, $previous[$v], 'Process')
  }
}
