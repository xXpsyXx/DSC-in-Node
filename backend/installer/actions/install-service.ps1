param(
    [string]$InstallRoot = ""
)

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)

if (-not $isAdmin) {
    throw "Administrator privileges are required to install the application."
}

if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
    $InstallRoot = Split-Path -Parent $PSScriptRoot
}

$resolvedInstallRoot = (Resolve-Path $InstallRoot).Path
$nodeExe = Join-Path $resolvedInstallRoot "runtime\node.exe"
$serverScript = Join-Path $resolvedInstallRoot "app\src\server.js"
$appRoot = Join-Path $resolvedInstallRoot "app"
$envFile = Join-Path $appRoot ".env"
$envExampleFile = Join-Path $appRoot ".env.example"

if (!(Test-Path $nodeExe)) {
    throw "Node runtime not found at $nodeExe"
}
if (!(Test-Path $serverScript)) {
    throw "Server entry file not found at $serverScript"
}

# Create .env from .env.example if it doesn't exist
if (!(Test-Path $envFile)) {
    if (!(Test-Path $envExampleFile)) {
        throw ".env.example template not found at $envExampleFile. Cannot create .env."
    }
    Write-Host "Creating .env from .env.example template..."
    Copy-Item -Path $envExampleFile -Destination $envFile -Force
    Write-Host "Created .env at $envFile"
}

# Create a PowerShell launcher script
$launcherScript = Join-Path $resolvedInstallRoot "start-backend.ps1"
$launcherContent = @"
# DSC Backend Service Launcher
# Runs Node.js backend under current user context for USB token access
# This ensures PKCS#11 library can access USB security tokens

`\$appRoot = "$appRoot"
`\$nodeExe = "$nodeExe"
`\$serverScript = "$serverScript"

Set-Location `\$appRoot
Write-Host "Starting DSC Backend Service..."
Write-Host "Working directory: `\$appRoot"
Write-Host "Node executable: `\$nodeExe"
Write-Host "Server script: `\$serverScript"
Write-Host ""

# Run the Node.js server
& "`\$nodeExe" "`\$serverScript"
"@

Set-Content -Path $launcherScript -Value $launcherContent -Force
Write-Host "Created launcher script: $launcherScript"

# Create a Windows shortcut in user Startup folder
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$userStartupFolder = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $userStartupFolder "DSC Backend Service.lnk"

$WshShell = New-Object -ComObject WScript.Shell
$shortcut = $WshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `\"$launcherScript`\""
$shortcut.WorkingDirectory = $appRoot
$shortcut.Description = "DSC Backend Service - PDF Signing"
$shortcut.WindowStyle = 7  # Hidden window
$shortcut.Save()

Write-Host "Created startup shortcut: $shortcutPath"
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "DSC Backend Installation Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANT: User Application (not a service)" -ForegroundColor Yellow
Write-Host "Why? Windows services cannot reliably access USB devices."
Write-Host "Your USB token requires user-context access."
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Edit config: $envFile"
Write-Host "2. Update PKCS11_LIBRARY_PATH_WINDOWS with your driver path"
Write-Host "3. Log out/in, or run manually:"
Write-Host "   & '$launcherScript'"
Write-Host ""
Write-Host "Verify it's running: http://localhost:45763/health" -ForegroundColor Cyan
Write-Host ""

