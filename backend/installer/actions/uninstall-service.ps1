$ErrorActionPreference = "Stop"

$userStartupFolder = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $userStartupFolder "DSC Backend Service.lnk"

if (Test-Path $shortcutPath) {
    Write-Host "Removing startup shortcut: $shortcutPath"
    Remove-Item -Path $shortcutPath -Force
    Write-Host "Startup shortcut removed"
} else {
    Write-Host "Startup shortcut not found"
}

Write-Host ""
Write-Host "DSC Backend uninstalled successfully."
Write-Host "To remove the application, delete the installation folder manually."

