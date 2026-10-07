<#
  Stops what scripts\local\start-local.ps1 started (web, worker, API, then PostgreSQL).
    powershell -ExecutionPolicy Bypass -File scripts\local\stop-local.ps1
  PostgreSQL is stopped cleanly with pg_ctl; its data in apps\api\.local-pg\data is kept.
#>
$ErrorActionPreference = 'Continue'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$run = Join-Path $repo '.local-run'
$pidFile = Join-Path $run 'pids.txt'
$entries = @()
if (Test-Path $pidFile) { $entries = Get-Content $pidFile | Where-Object { $_ -match '^\S+ \d+$' } }

foreach ($name in @('web', 'worker', 'api')) {
  foreach ($line in $entries | Where-Object { $_ -like "$name *" }) {
    $id = [int]($line.Split(' ')[1])
    if (Get-Process -Id $id -ErrorAction SilentlyContinue) {
      & taskkill.exe /PID $id /T /F | Out-Null
      Write-Output "stopped $name (pid $id)"
    }
  }
}

$pgCtl = Get-ChildItem -Path (Join-Path $repo 'node_modules\.pnpm') -Directory -Filter '@embedded-postgres+windows-x64*' -ErrorAction SilentlyContinue |
  ForEach-Object { Join-Path $_.FullName 'node_modules\@embedded-postgres\windows-x64\native\bin\pg_ctl.exe' } |
  Where-Object { Test-Path $_ } | Select-Object -First 1
$dataDir = Join-Path $repo 'apps\api\.local-pg\data'
if ($pgCtl -and (Test-Path (Join-Path $dataDir 'postmaster.pid'))) {
  & $pgCtl stop -D $dataDir -m fast -w | Out-Null
  Write-Output 'stopped PostgreSQL (data kept)'
}
foreach ($line in $entries | Where-Object { $_ -like 'postgres *' }) {
  $id = [int]($line.Split(' ')[1])
  if (Get-Process -Id $id -ErrorAction SilentlyContinue) { & taskkill.exe /PID $id /T /F | Out-Null }
}
if (Test-Path $pidFile) { Remove-Item $pidFile }
