param(
    [string]$InstallRoot = ""
)

$ErrorActionPreference = "Stop"

# Setup logging
$logDir = if ([string]::IsNullOrWhiteSpace($InstallRoot)) { 
    Split-Path -Parent $PSScriptRoot 
} else { 
    $InstallRoot 
}
if (!(Test-Path "$logDir\logs")) {
    New-Item -ItemType Directory -Path "$logDir\logs" -Force | Out-Null
}
$logFile = "$logDir\logs\install-service.log"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $logFile -Value "[$timestamp] Starting service installation script"

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)

if (-not $isAdmin) {
    Add-Content -Path $logFile -Value "[$timestamp] ERROR: Administrator privileges are required"
    throw "Administrator privileges are required to install the service."
}

Add-Content -Path $logFile -Value "[$timestamp] Running as administrator"

if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
    $InstallRoot = Split-Path -Parent $PSScriptRoot
}

$resolvedInstallRoot = (Resolve-Path $InstallRoot).Path
Add-Content -Path $logFile -Value "[$timestamp] Install root: $resolvedInstallRoot"

$nodeExe = Join-Path $resolvedInstallRoot "runtime\node.exe"
$tsxCli = Join-Path $resolvedInstallRoot "app\node_modules\tsx\dist\cli.mjs"
$serverScript = Join-Path $resolvedInstallRoot "app\src\server.ts"
$serviceName = "DSCBackendService"
$serviceExe = Join-Path $resolvedInstallRoot "$serviceName.exe"
$serviceConfig = Join-Path $resolvedInstallRoot "$serviceName.xml"
$serviceLogDir = Join-Path $resolvedInstallRoot "logs"

try {
    # Verify all required files exist
    if (!(Test-Path $nodeExe)) {
        throw "Node runtime not found at $nodeExe"
    }
    Add-Content -Path $logFile -Value "[$timestamp] Node runtime found"
    
    if (!(Test-Path $tsxCli)) {
        throw "tsx runtime not found at $tsxCli"
    }
    Add-Content -Path $logFile -Value "[$timestamp] tsx CLI found"
    
    if (!(Test-Path $serverScript)) {
        throw "Server entry file not found at $serverScript"
    }
    Add-Content -Path $logFile -Value "[$timestamp] Server script found"
    
    if (!(Test-Path $serviceExe)) {
        throw "Service wrapper executable not found at $serviceExe"
    }
    Add-Content -Path $logFile -Value "[$timestamp] Service executable found"
    
    if (!(Test-Path $serviceConfig)) {
        throw "Service wrapper config not found at $serviceConfig"
    }
    Add-Content -Path $logFile -Value "[$timestamp] Service config found"

    $existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($existingService) {
        Add-Content -Path $logFile -Value "[$timestamp] Existing service found, stopping and uninstalling..."
        try {
            & $serviceExe stop | Out-Null
        } catch {
            Add-Content -Path $logFile -Value "[$timestamp] Could not stop service: $_"
        }
        & $serviceExe uninstall | Out-Null
        Add-Content -Path $logFile -Value "[$timestamp] Uninstalled existing service"
    }

    Add-Content -Path $logFile -Value "[$timestamp] Installing service..."
    & $serviceExe install
    $installExitCode = $LASTEXITCODE
    if ($installExitCode -ne 0) {
        throw "Failed to install service with WinSW. Exit code: $installExitCode"
    }
    Add-Content -Path $logFile -Value "[$timestamp] Service installed successfully"

    # Set service to auto-start using sc.exe
    Add-Content -Path $logFile -Value "[$timestamp] Setting service to auto-start..."
    sc.exe config $serviceName start= auto
    $scExitCode = $LASTEXITCODE
    if ($scExitCode -ne 0) {
        throw "Failed to set service to auto-start. Exit code: $scExitCode"
    }
    Add-Content -Path $logFile -Value "[$timestamp] Service set to auto-start"

    Add-Content -Path $logFile -Value "[$timestamp] Starting service..."
    & $serviceExe start
    $startExitCode = $LASTEXITCODE
    if ($startExitCode -ne 0) {
        throw "Failed to start service with WinSW. Exit code: $startExitCode"
    }
    Add-Content -Path $logFile -Value "[$timestamp] Service start command executed"

    # Wait for service to be running
    Add-Content -Path $logFile -Value "[$timestamp] Waiting for service to reach running state..."
    for ($i = 0; $i -lt 15; $i++) {
        $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
        if ($service -and $service.Status -eq 'Running') {
            Add-Content -Path $logFile -Value "[$timestamp] Service is now running"
            Write-Host "Installed and started service: $serviceName"
            exit 0
        }
        Start-Sleep -Seconds 1
    }

    # Service didn't start - check error log
    $tail = ""
    $errLog = Join-Path $serviceLogDir "$serviceName.err.log"
    if (Test-Path $errLog) {
        $tail = (Get-Content $errLog -Tail 40 | Out-String)
        Add-Content -Path $logFile -Value "[$timestamp] Service error log:`n$tail"
    }

    throw "Service $serviceName was installed but did not start. Log tail:`n$tail"
} catch {
    $errorMsg = $_.Exception.Message
    Add-Content -Path $logFile -Value "[$timestamp] ERROR: $errorMsg"
    Write-Host "Service installation failed: $errorMsg"
    Write-Host "Check log file at: $logFile"
    exit 1
}
