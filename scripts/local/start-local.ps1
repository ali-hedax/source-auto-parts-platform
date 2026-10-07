<#
  Source: run the site on this computer WITHOUT Docker (development mode, real API and database).

    powershell -ExecutionPolicy Bypass -File scripts\local\start-local.ps1
    powershell -ExecutionPolicy Bypass -File scripts\local\stop-local.ps1

  Starts, each only if its port is free:
    PostgreSQL 18  127.0.0.1:55432  (embedded binaries; data in apps\api\.local-pg\data)
    API            http://localhost:4000
    worker         inline queue (no Redis), quote PDFs with Microsoft Edge
    web            http://localhost:3000/fa   (production build of the web app)
  Development mode only: payment is the labelled test simulator, the sign-in code is shown on
  the page and files are not virus-scanned. Never use this for real customers.
  Secrets come from .env; the API and worker need `pnpm build` first. Logs and process ids are
  in .local-run\ (not in git). After pulling new code: pnpm build, then start with -Rebuild
  (the web build bakes in the addresses above).
#>
param([switch]$Rebuild)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$run = Join-Path $repo '.local-run'
New-Item -ItemType Directory -Force -Path (Join-Path $run 'logs') | Out-Null

function Test-Port([int]$port) {
  $client = New-Object Net.Sockets.TcpClient
  try { $client.Connect('127.0.0.1', $port); return $true } catch { return $false } finally { $client.Close() }
}
function Wait-Port([int]$port, [int]$seconds, [string]$what) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) { if (Test-Port $port) { return }; Start-Sleep -Milliseconds 500 }
  throw "$what did not start within $seconds s (logs: $run\logs)"
}
function Invoke-Node([string]$name, [string]$dir, [string[]]$arguments) {
  # Waits; output goes to files, so a tool writing to stderr does not stop this script.
  $p = Start-Process -FilePath 'node' -ArgumentList $arguments -WorkingDirectory $dir -WindowStyle Hidden -Wait -PassThru `
    -RedirectStandardOutput (Join-Path $run "logs\$name.log") -RedirectStandardError (Join-Path $run "logs\$name.err.log")
  if ($p.ExitCode -ne 0) { throw "$name failed (see $run\logs\$name.log and $name.err.log)" }
}
function Start-Node([string]$name, [string]$dir, [string[]]$arguments) {
  $p = Start-Process -FilePath 'node' -ArgumentList $arguments -WorkingDirectory $dir -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $run "logs\$name.log") -RedirectStandardError (Join-Path $run "logs\$name.err.log")
  Add-Content -Path (Join-Path $run 'pids.txt') -Value "$name $($p.Id)"
  Write-Output "started $name (pid $($p.Id))"
}

foreach ($needed in @('.env', 'apps\api\dist\main.js', 'apps\worker\dist\main.js')) {
  if (-not (Test-Path (Join-Path $repo $needed))) { throw "missing ${needed}: create .env from .env.example and run pnpm build first (README)" }
}

# Environment: .env, then the values this local run needs (local database, inline queue, cache purge).
foreach ($line in Get-Content (Join-Path $repo '.env')) {
  if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') {
    $value = ($Matches[2] -replace '\s+#.*$', '').Trim().Trim('"').Trim("'")
    [Environment]::SetEnvironmentVariable($Matches[1], $value, 'Process')
  }
}
$secretFile = Join-Path $run 'revalidate-secret'
if (-not (Test-Path $secretFile)) {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  Set-Content -Path $secretFile -Value ([Convert]::ToBase64String($bytes)) -NoNewline -Encoding ascii
}
$pgPassword = $env:LOCAL_PG_PASSWORD
if (-not $pgPassword) { $pgPassword = 'hedax-local-dev-only' }  # default of apps\api\scripts\local-db.mjs (127.0.0.1 only)
$env:APP_ENV = 'development'
$env:PORT = '4000'
$env:PUBLIC_BASE_URL = 'http://localhost:3000'
$env:DATABASE_URL = "postgresql://hedax:$pgPassword@127.0.0.1:55432/hedax?schema=public"
$env:QUEUE_DRIVER = 'inline'
$env:REDIS_URL = 'redis://127.0.0.1:6391'
$env:WEB_INTERNAL_URL = 'http://localhost:3000'
$env:REVALIDATE_SECRET = (Get-Content -Raw $secretFile).Trim()
$env:LOCAL_STORAGE_DIR = Join-Path $repo 'apps\api\storage'
$env:PAYMENT_PROVIDER = 'simulator'
$env:SMS_PROVIDER = 'dev-log'
$env:MALWARE_SCANNER = 'none-dev'
$env:PDF_BROWSER_CHANNEL = 'msedge'
$env:API_INTERNAL_URL = 'http://localhost:4000/api/v1'
$env:NEXT_PUBLIC_WS_URL = 'http://localhost:4000'
$env:HEDAX_DATA_SOURCE = 'api'

$api = Join-Path $repo 'apps\api'
if (Test-Port 55432) { Write-Output 'PostgreSQL already running on 55432' } else {
  Start-Node 'postgres' $api @('scripts/local-db.mjs')
  Wait-Port 55432 120 'PostgreSQL'
}

Invoke-Node 'migrate' $api @('node_modules/prisma/build/index.js', 'migrate', 'deploy')
Write-Output 'database migrations up to date'

if (Test-Port 4000) { Write-Output 'API already running on 4000' } else {
  Start-Node 'api' $api @('dist/main.js')
  Wait-Port 4000 90 'API'
}
if (Get-Content (Join-Path $run 'pids.txt') -ErrorAction SilentlyContinue | Where-Object { $_ -match '^worker (\d+)$' -and (Get-Process -Id $Matches[1] -ErrorAction SilentlyContinue) }) {
  Write-Output 'worker already running'
} else {
  Start-Node 'worker' (Join-Path $repo 'apps\worker') @('dist/main.js')
}

$web = Join-Path $repo 'apps\web'
if (Test-Port 3000) { Write-Output 'web already running on 3000' } else {
  if ($Rebuild -or -not (Test-Path (Join-Path $web '.next\BUILD_ID'))) {
    Write-Output 'building the web app (a few minutes)'
    Invoke-Node 'web-clean' $web @('scripts/clean-dev-cache.mjs')
    Invoke-Node 'web-build' $web @('node_modules/next/dist/bin/next', 'build')
  }
  Start-Node 'web' $web @('node_modules/next/dist/bin/next', 'start', '--port', '3000')
  Wait-Port 3000 120 'web'
}

Write-Output ''
Write-Output 'Store:  http://localhost:3000/fa   (English: http://localhost:3000/en)'
Write-Output 'Admin:  http://localhost:3000/fa/staff/login   (owner e-mail and password: .local-dev-credentials)'
Write-Output 'Test payment simulator and on-page sign-in codes only (development mode).'
