# One-shot registration of the Sklavenitis scheduled tasks (see run-sklavenitis.ps1
# for why this chain runs locally). Safe to re-run: -Force replaces existing tasks.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\register-sklavenitis-tasks.ps1
#
# Tries the S4U principal first (runs headless, no logged-on session needed, no
# stored password) - that usually needs an elevated shell. Falls back to an
# Interactive-token task (runs only while the user is logged on, incl. locked
# screen) so registration still succeeds unelevated.

$ErrorActionPreference = 'Stop'
$wrapper = 'C:\Users\Work\prosforespantou-next\scripts\windows\run-sklavenitis.ps1'
$ps = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -WakeToRun `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 15) `
  -ExecutionTimeLimit (New-TimeSpan -Hours 3)

$defs = @(
  @{ Name = 'Sklavenitis Offers';  Args = '-Job offers';  Trigger = (New-ScheduledTaskTrigger -Daily -At 02:30) },
  @{ Name = 'Sklavenitis Catalog'; Args = '-Job catalog'; Trigger = (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 04:00) }
)

foreach ($d in $defs) {
  $action = New-ScheduledTaskAction -Execute $ps `
    -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}" {1}' -f $wrapper, $d.Args)
  $registered = $false
  try {
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Limited
    Register-ScheduledTask -TaskPath '\Prosfores\' -TaskName $d.Name `
      -Action $action -Trigger $d.Trigger -Settings $settings -Principal $principal -Force | Out-Null
    Write-Host ("registered (S4U, runs even when logged out): {0}" -f $d.Name)
    $registered = $true
  } catch {
    Write-Host ("S4U registration failed ({0}); falling back to Interactive token." -f $_.Exception.Message)
  }
  if (-not $registered) {
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskPath '\Prosfores\' -TaskName $d.Name `
      -Action $action -Trigger $d.Trigger -Settings $settings -Principal $principal -Force | Out-Null
    Write-Host ("registered (Interactive, runs while logged on incl. locked): {0}" -f $d.Name)
  }
}

Get-ScheduledTask -TaskPath '\Prosfores\' | Format-Table TaskName, State
