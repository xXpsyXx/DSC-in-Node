param(
    [string]$InstallRoot = ""
)

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)

if (-not $isAdmin) {
    throw "Administrator privileges are required to install the service."
}

if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
    $InstallRoot = Split-Path -Parent $PSScriptRoot
}

$resolvedInstallRoot = (Resolve-Path $InstallRoot).Path
$nodeExe = Join-Path $resolvedInstallRoot "runtime\node.exe"
$serverScript = Join-Path $resolvedInstallRoot "app\src\server.js"
$serviceName = "DSCBackendService"
$serviceExe = Join-Path $resolvedInstallRoot "$serviceName.exe"
$serviceConfig = Join-Path $resolvedInstallRoot "$serviceName.xml"
$serviceLogDir = Join-Path $resolvedInstallRoot "logs"

if (!(Test-Path $nodeExe)) {
    throw "Node runtime not found at $nodeExe"
}
if (!(Test-Path $serverScript)) {
    throw "Server entry file not found at $serverScript"
}
if (!(Test-Path $serviceExe)) {
    throw "Service wrapper executable not found at $serviceExe"
}
if (!(Test-Path $serviceConfig)) {
    throw "Service wrapper config not found at $serviceConfig"
}

$existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existingService) {
    try {
        & $serviceExe stop | Out-Null
    } catch {
        # ignore
    }
    & $serviceExe uninstall | Out-Null
}

& $serviceExe install | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Failed to install service with WinSW. Exit code: $LASTEXITCODE"
}

& $serviceExe start | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Failed to start service with WinSW. Exit code: $LASTEXITCODE"
}

for ($i = 0; $i -lt 15; $i++) {
    $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($service -and $service.Status -eq 'Running') {
        Write-Host "Installed and started service: $serviceName"
        exit 0
    }
    Start-Sleep -Seconds 1
}

$tail = ""
$errLog = Join-Path $serviceLogDir "$serviceName.err.log"
if (Test-Path $errLog) {
    $tail = (Get-Content $errLog -Tail 40 | Out-String)
}

throw "Service $serviceName was installed but did not start. Log tail:`n$tail"
