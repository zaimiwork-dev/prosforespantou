# Sklavenitis local runner - the OFFICIAL scheduled path for this chain.
# (ASCII only: Windows PowerShell 5.1 parses BOM-less UTF-8 as ANSI.)
#
# sklavenitis.gr (Akamai) 403s GitHub/Vercel datacenter IPs, and as of
# 2026-07-06 intermittently blocks even this machine's residential IP (blocks
# have rotated on/off since June). Owner chose the free local path over a paid
# proxy, so a Windows Scheduled Task runs this wrapper:
#   - Sklavenitis Offers   daily 02:30 local  -> -Job offers
#   - Sklavenitis Catalog  daily 03:00 local  -> -Job catalog (catalog + image mirror)
#     (weekly until 2026-11-23; daily so regular prices are never a week old)
# Registration: scripts\windows\register-sklavenitis-tasks.ps1 (run once).
#
# Behavior on a 403 night: the adapter fails fast and this wrapper retries up
# to 4 times, an hour apart (see the loop below); then it exits non-zero, Task
# Scheduler records the failure, and the admin health tab alarms via
# EXPECTED_FEEDS (48h window) if no healthy run lands two nights straight.
# Moving off this PC entirely = a paid Greek proxy (GitHub issue #3).
#
# Logs: <repo>\logs\sklavenitis\YYYYMMDD-HHmm-<job>.log (pruned after 45 days).

param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('offers', 'catalog')]
  [string]$Job
)

$ErrorActionPreference = 'Continue'
$Repo = 'C:\Users\Work\prosforespantou-next'
$Node = 'C:\Program Files\nodejs\node.exe'

Set-Location $Repo
$logDir = Join-Path $Repo 'logs\sklavenitis'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force $logDir | Out-Null }
$log = Join-Path $logDir ("{0}-{1}.log" -f (Get-Date -Format 'yyyyMMdd-HHmm'), $Job)

# cmd.exe handles the >> redirection so PowerShell 5.1 never wraps the node
# process's stderr into NativeCommandError records (scrapers log progress there).
function Invoke-Step([string]$Label, [string]$CommandLine) {
  Add-Content -Path $log -Value ("== {0} - {1} ==" -f (Get-Date -Format 'u'), $Label)
  cmd /c "$CommandLine >> `"$log`" 2>&1"
  $code = $LASTEXITCODE
  Add-Content -Path $log -Value ("== {0} - {1} exit {2} ==" -f (Get-Date -Format 'u'), $Label, $code)
  return $code
}

function Invoke-Job {
  if ($Job -eq 'offers') {
    # Adapter loads .env/.env.local itself (dotenv); mirrors offer images inline.
    return (Invoke-Step 'offers adapter' "`"$Node`" src\scripts\adapters\sklavenitis.mjs")
  }
  $code = Invoke-Step 'full catalog' "`"$Node`" src\scripts\sklavenitis-catalog.mjs"
  # Catalog-image mirror rides along; worst exit code wins.
  $mirror = Invoke-Step 'catalog image mirror' "set CHAIN=sklavenitis&& `"$Node`" src\scripts\mirror-catalog.mjs"
  if ($mirror -ne 0 -and $code -eq 0) { $code = $mirror }
  return $code
}

# Retry inside the wrapper (2026-11-27). Task Scheduler's RestartCount only
# covers a task that fails to START, not a script that exits non-zero, so a
# 403 (this PC not on a Greek connection, e.g. a VPN; 11-26 09:09) used to
# wait a whole day. Now: up to 4 attempts, 60 min apart, inside the task's
# 6 h ExecutionTimeLimit (offers ~10 min, catalog ~25 min per attempt).
$MaxAttempts = 4
$RetryMinutes = 60
$exit = 0
for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
  Add-Content -Path $log -Value ("== {0} - attempt {1} of {2} ==" -f (Get-Date -Format 'u'), $attempt, $MaxAttempts)
  $exit = Invoke-Job
  if ($exit -eq 0) { break }
  if ($attempt -lt $MaxAttempts) {
    Add-Content -Path $log -Value ("== {0} - failed (exit {1}), next attempt in {2} min ==" -f (Get-Date -Format 'u'), $exit, $RetryMinutes)
    Start-Sleep -Seconds ($RetryMinutes * 60)
  }
}

# Prune logs older than 45 days so the folder cannot grow unbounded.
Get-ChildItem $logDir -Filter '*.log' |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-45) } |
  Remove-Item -Force -ErrorAction SilentlyContinue

exit $exit
