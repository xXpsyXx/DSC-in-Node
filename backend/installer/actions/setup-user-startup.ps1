param(
    [string]$InstallRoot = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
    $InstallRoot = Split-Path -Parent $PSScriptRoot
}

$resolvedInstallRoot = (Resolve-Path $InstallRoot).Path
$nodeExe = Join-Path $resolvedInstallRoot "runtime\node.exe"
$serverScript = Join-Path $resolvedInstallRoot "app\src\server.js"
$userStartupFolder = [Environment]::GetFolderPath("Startup")

# Create a batch file that launches the service under the current user
$batchFileName = "DSC-Backend-Start.bat"
$batchFilePath = Join-Path $userStartupFolder $batchFileName
$batchContent = @"
@echo off
REM DSC Backend Service - Runs under current user for USB token access
REM This allows the PKCS#11 library to access USB tokens

cd /d "$resolvedInstallRoot\app"
"$nodeExe" "$serverScript"

REM If node crashes, restart after 5 seconds
timeout /t 5 /nobreak
GOTO start
:start
goto EOF

:EOF
"@

Write-Host "Creating user startup batch file at: $batchFilePath"
Set-Content -Path $batchFilePath -Value $batchContent -Force

# Also create a VBS wrapper for silent execution (no cmd window)
$vbsFileName = "DSC-Backend-Start.vbs"
$vbsFilePath = Join-Path $userStartupFolder $vbsFileName
$vbsContent = @"
Set objShell = CreateObject("WScript.Shell")
strCommand = "$batchFilePath"
objShell.Run strCommand, 0, False
"@

Write-Host "Creating VBS launcher at: $vbsFilePath"
Set-Content -Path $vbsFilePath -Value $vbsContent -Force

Write-Host "DSC Backend will start automatically when you log in."
Write-Host "Startup files created in: $userStartupFolder"
