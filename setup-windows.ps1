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

# A server left running from an earlier install holds the build folder open.
try { Stop-ScheduledTask -TaskName "Finance server" -ErrorAction SilentlyContinue } catch {}
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
# Opens Chrome at your banks and imports the statements you download.
$bank = $shell.CreateShortcut("$desktop\Bank download.lnk")
$bank.TargetPath = "$PSScriptRoot\bank.cmd"
$bank.WorkingDirectory = $PSScriptRoot
$bank.Save()

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

Write-Host "Keeping the PC awake on mains power..."
# The app is the household's server: if the PC sleeps, nobody can reach it.
# The screen can still switch off. Laptops on battery keep their usual sleep.
try {
  powercfg /change standby-timeout-ac 0 | Out-Null
  powercfg /change hibernate-timeout-ac 0 | Out-Null
} catch {
  Write-Host "Could not change sleep settings; set Sleep to Never yourself." -ForegroundColor Yellow
}

Write-Host "Setting up access for phones and laptops (Tailscale)..."
# Tailscale links your devices privately; nothing is opened to the internet.
# Tailscale Serve gives the app an HTTPS address only your tailnet can open
# and tells the app which of you is using it. The app itself only listens on
# 127.0.0.1, so Serve is the only way in from another device.
$ts = "$env:ProgramFiles\Tailscale\tailscale.exe"
if (-not (Test-Path $ts)) {
  winget install -e --id tailscale.tailscale --accept-package-agreements --accept-source-agreements --silent
}

# Keep the app running in the background from login, so the phone link works
# without opening anything on the PC.
try {
  $serve = New-ScheduledTaskAction -Execute "powershell.exe" -WorkingDirectory $PSScriptRoot `
    -Argument "-NoProfile -WindowStyle Hidden -Command `"Set-Location '$PSScriptRoot'; npm run start -- -p 3000 -H 127.0.0.1`""
  $atLogon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
  $keep = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName "Finance server" -Action $serve -Trigger $atLogon -Settings $keep `
    -Description "Runs the Finance app in the background for phones and laptops." -Force | Out-Null
} catch {
  Write-Host "Background server not scheduled ($($_.Exception.Message)); open Finance from the desktop instead." -ForegroundColor Yellow
}

function Get-TailnetName {
  try {
    $st = & $ts status --json | ConvertFrom-Json
    if ($st.BackendState -eq "Running" -and $st.Self.DNSName) { return $st.Self.DNSName.TrimEnd(".") }
  } catch {}
  return $null
}

$hostName = $null
if (Test-Path $ts) { $hostName = Get-TailnetName }
if ($hostName) {
  # Publish http://127.0.0.1:3000 as https://<this-pc>.<tailnet>.ts.net
  & $ts serve --bg --https=443 http://127.0.0.1:3000
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Tailscale Serve could not start. In the Tailscale admin console, open DNS and turn on MagicDNS and HTTPS Certificates, then run setup.cmd again." -ForegroundColor Yellow
  }
  # Tell the app its address (for links and to accept forms posted from it).
  $envFile = "$PSScriptRoot\.env.local"
  $lines = @()
  $had = $false
  if (Test-Path $envFile) {
    $had = [bool](Select-String -Path $envFile -Pattern "^FINANCE_PUBLIC_HOST=$([regex]::Escape($hostName))$" -Quiet)
    $lines = @(Get-Content $envFile | Where-Object { $_ -notmatch '^FINANCE_PUBLIC_HOST=' })
  }
  $lines += "FINANCE_PUBLIC_HOST=$hostName"
  Set-Content -Path $envFile -Value $lines
  if (-not $had) {
    # The address is baked into the build's settings, so rebuild once.
    Write-Host "Rebuilding for $hostName..."
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Build failed" }
  }
  $base = "https://$hostName"
  Set-Content -Path "$PSScriptRoot\PHONE-LINK.txt" -Value @"
On each phone or laptop:
1. Install Tailscale and sign in. Your partner signs in with their own account
   once you have invited them (Tailscale admin console > Users > Invite).
2. Open $base/m (phone view) or $base (full app) in Chrome,
   then menu > Add to Home screen.
3. In Finance > Settings > People, press "That's me" on each person's device.
The PC needs to be on. Nobody outside your tailnet can reach it.
"@
} else {
  Set-Content -Path "$PSScriptRoot\PHONE-LINK.txt" -Value @"
Tailscale is installed but not signed in on this PC yet.
Sign in to Tailscale (it opens now), then run setup.cmd again to finish.
"@
}
try { Stop-ScheduledTask -TaskName "Finance server" -ErrorAction SilentlyContinue } catch {}
try { Start-ScheduledTask -TaskName "Finance server" } catch {}

Write-Host ""
Write-Host "Done. Open 'Finance' from your desktop, go to Settings, and follow" -ForegroundColor Green
Write-Host "'Phone alerts', 'People' and 'Off-PC backup'. To bring in your bank data, use the 'Bank download' shortcut." -ForegroundColor Green
if ($hostName) {
  Write-Host "Phones and laptops: see PHONE-LINK.txt ($base)." -ForegroundColor Green
} else {
  Write-Host "Sign in to Tailscale when it opens, then run setup.cmd again for phone access." -ForegroundColor Green
  if (Test-Path $ts) { Start-Process $ts -ArgumentList "up" -ErrorAction SilentlyContinue }
}
