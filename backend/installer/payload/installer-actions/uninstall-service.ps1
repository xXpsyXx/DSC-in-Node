$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)

if (-not $isAdmin) {
    throw "Administrator privileges are required to uninstall the service."
}

$serviceName = "DigitalSignatureService"
$existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
$installRoot = Split-Path -Parent $PSScriptRoot
$serviceExe = Join-Path $installRoot "$serviceName.exe"

if (!$existingService) {
    Write-Host "Service not found: $serviceName"
    exit 0
}

if (Test-Path $serviceExe) {
    try {
        & $serviceExe stop | Out-Null
    } catch {
        # ignore
    }
    & $serviceExe uninstall | Out-Null
} else {
    sc.exe stop $serviceName | Out-Null
    sc.exe delete $serviceName | Out-Null
}

Write-Host "Removed service: $serviceName"
