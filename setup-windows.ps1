# One-time setup on Windows: installs what's needed, builds the app, adds a
# desktop shortcut and a daily background sync. Run via setup.cmd.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
Write-Host "Setting up Finance in $PSScriptRoot" -ForegroundColor Cyan

function Get-NodeMajor {
  try { [int]((node -v).TrimStart("v").Split(".")[0]) } catch { 0 }
}
if ((Get-NodeMajor) -lt 24) {
  Write-Host "Installing Node.js (one-off)..."
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
              [Environment]::GetEnvironmentVariable("Path", "User")
  if ((Get-NodeMajor) -lt 24) {
    throw "Node.js 24 or newer is needed. Install it from https://nodejs.org, then run setup.cmd again."
  }
}

Write-Host "Installing packages..."
# Install scripts are skipped: the database driver ships ready-made Windows
# binaries, so nothing needs compiling.
npm ci --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }

Write-Host "Building..."
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }
New-Item -ItemType Directory -Force -Path "$PSScriptRoot\data" | Out-Null

Write-Host "Adding desktop shortcut..."
$desktop = [Environment]::GetFolderPath("Desktop")
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut("$desktop\Finance.lnk")
$lnk.TargetPath = "$PSScriptRoot\finance.cmd"
$lnk.WorkingDirectory = $PSScriptRoot
$lnk.WindowStyle = 7
$lnk.IconLocation = "$env:SystemRoot\System32\imageres.dll,99"
$lnk.Save()

Write-Host "Scheduling the daily bank sync..."
$daily = "$PSScriptRoot\daily.cmd"
try {
  $action = New-ScheduledTaskAction -Execute $daily -WorkingDirectory $PSScriptRoot
  $triggers = @(
    (New-ScheduledTaskTrigger -Daily -At 7:30am),
    (New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME")
  )
  # StartWhenAvailable: if the PC was off at 7:30, run as soon as it's on.
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
  Register-ScheduledTask -TaskName "Finance daily sync" -Action $action -Trigger $triggers `
    -Settings $settings -Description "Syncs your banks and sends alerts when something needs doing." -Force | Out-Null
} catch {
  Write-Host "Falling back to a simple daily task ($($_.Exception.Message))"
  schtasks /Create /F /SC DAILY /ST 07:30 /TN "Finance daily sync" /TR "`"$daily`"" | Out-Null
}

Write-Host "Setting up phone access (Tailscale)..."
# Tailscale links your PC and phone privately; nothing is opened to the
# internet. Only devices signed in to your Tailscale account can reach the app.
$ts = "$env:ProgramFiles\Tailscale\tailscale.exe"
if (-not (Test-Path $ts)) {
  winget install -e --id tailscale.tailscale --accept-package-agreements --accept-source-agreements --silent
}
$node = (Get-Command node).Source
$fw = @"
Remove-NetFirewallRule -DisplayName 'Finance (Tailscale only)' -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName 'Finance (Tailscale only)' -Direction Inbound -Action Allow ``
  -Program '$node' -Protocol TCP -LocalPort 3000 -RemoteAddress 100.64.0.0/10 -Profile Any | Out-Null
"@
try {
  # One Windows permission prompt: the firewall rule needs administrator rights.
  $enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($fw))
  Start-Process powershell -Verb RunAs -Wait -ArgumentList "-NoProfile -EncodedCommand $enc"
} catch {
  Write-Host "Firewall rule skipped ($($_.Exception.Message)). Phone access may be blocked." -ForegroundColor Yellow
}
# Keep the app running in the background from login, so the phone link works
# without opening anything on the PC.
try {
  $serve = New-ScheduledTaskAction -Execute "powershell.exe" -WorkingDirectory $PSScriptRoot `
    -Argument "-NoProfile -WindowStyle Hidden -Command `"Set-Location '$PSScriptRoot'; npm run start -- -p 3000`""
  $atLogon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
  $keep = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName "Finance server" -Action $serve -Trigger $atLogon -Settings $keep `
    -Description "Runs the Finance app in the background for the phone view." -Force | Out-Null
  Start-ScheduledTask -TaskName "Finance server"
} catch {
  Write-Host "Background server not scheduled ($($_.Exception.Message)); open Finance from the desktop instead." -ForegroundColor Yellow
}
$phone = "http://$($env:COMPUTERNAME.ToLower()):3000/m"
Set-Content -Path "$PSScriptRoot\PHONE-LINK.txt" -Value @"
On your phone:
1. Install Tailscale from the Play Store and sign in with the same account as on this PC.
2. Open $phone in Chrome, then menu > Add to Home screen.
The PC needs to be on. Anyone not signed in to your Tailscale can't reach it.
"@

Write-Host ""
Write-Host "Done. Open 'Finance' from your desktop, go to Settings, and follow" -ForegroundColor Green
Write-Host "'Bank connection' and 'Phone alerts'." -ForegroundColor Green
Write-Host "Sign in to Tailscale when it opens, then see PHONE-LINK.txt for the phone." -ForegroundColor Green
if (Test-Path $ts) { Start-Process $ts -ArgumentList "up" -ErrorAction SilentlyContinue }
