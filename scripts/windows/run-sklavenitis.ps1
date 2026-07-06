# Sklavenitis local runner - the OFFICIAL scheduled path for this chain.
# (ASCII only: Windows PowerShell 5.1 parses BOM-less UTF-8 as ANSI.)
#
# sklavenitis.gr (Akamai) 403s GitHub/Vercel datacenter IPs, and as of
# 2026-07-06 intermittently blocks even this machine's residential IP (blocks
# have rotated on/off since June). Owner chose the free local path over a paid
# proxy, so a Windows Scheduled Task runs this wrapper:
#   - Sklavenitis Offers   daily 02:30 local  -> -Job offers
#   - Sklavenitis Catalog  weekly Sun 04:00   -> -Job catalog (catalog + image mirror)
# Registration: scripts\windows\register-sklavenitis-tasks.ps1 (run once).
#
# Behavior on a 403 night: the adapter fails fast, this wrapper exits non-zero,
# Task Scheduler records the failure and retries per its RestartCount; the
# admin health tab alarms via EXPECTED_FEEDS (48h window) if no healthy run
# lands two nights straight. When Akamai rotates the block off, the next
# scheduled run self-heals with no manual action.
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

$exit = 0
if ($Job -eq 'offers') {
  # Adapter loads .env/.env.local itself (dotenv); mirrors offer images inline.
  $exit = Invoke-Step 'offers adapter' "`"$Node`" src\scripts\adapters\sklavenitis.mjs"
} else {
  $exit = Invoke-Step 'full catalog' "`"$Node`" src\scripts\sklavenitis-catalog.mjs"
  # Weekly catalog-image mirror rides along; worst exit code wins.
  $mirror = Invoke-Step 'catalog image mirror' "set CHAIN=sklavenitis&& `"$Node`" src\scripts\mirror-catalog.mjs"
  if ($mirror -ne 0 -and $exit -eq 0) { $exit = $mirror }
}

# Prune logs older than 45 days so the folder cannot grow unbounded.
Get-ChildItem $logDir -Filter '*.log' |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-45) } |
  Remove-Item -Force -ErrorAction SilentlyContinue

exit $exit
