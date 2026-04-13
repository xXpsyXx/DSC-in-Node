param(
    [string]$NodeVersion = "v22.14.0",
    [string]$Arch = "x64",
    [string]$InnoCompilerPath = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Write-Host "=== Building and Obfuscating Code ===" -ForegroundColor Cyan
Push-Location $repoRoot
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Build and obfuscation failed."
    }
} finally {
    Pop-Location
}

Write-Host "`n=== Preparing Installer Payload ===" -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts\build-installer-payload.ps1") -NodeVersion $NodeVersion -Arch $Arch
if ($LASTEXITCODE -ne 0) {
    throw "Payload preparation failed."
}

Write-Host "`n=== Building Installer ===" -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts\build-installer.ps1") -NodeVersion $NodeVersion -Arch $Arch -InnoCompilerPath $InnoCompilerPath
if ($LASTEXITCODE -ne 0) {
    throw "Installer build failed."
}

Write-Host "`n=== Build Complete ===" -ForegroundColor Green
Write-Host "Installer location: $repoRoot\installer\output\DSCBackendSetup.exe"
