param(
    [string]$AppName = "DSCBackend",
    [string]$NodeVersion = "18",
    [string]$Platform = "win-x64"
)

$ErrorActionPreference = "Stop"

Write-Host "================================" -ForegroundColor Cyan
Write-Host "DSC Backend - Production EXE Build" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$distDir = Join-Path $repoRoot "dist"
$srcDir = Join-Path $repoRoot "src"
$nodeModulesDir = Join-Path $repoRoot "node_modules"
$bundleFile = Join-Path $distDir "bundle.js"
$exeFile = Join-Path $distDir "$AppName.exe"
$pkcs11ModuleDir = Join-Path $distDir "node_modules" "pkcs11js"

# Check prerequisites
Write-Host "`n[1/7] Checking prerequisites..." -ForegroundColor Yellow
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (!$npmCmd) {
    throw "npm is not installed or not in PATH"
}
Write-Host "[OK] npm found: $(npm -v)" -ForegroundColor Green

# Install dependencies if needed
Write-Host "`n[2/7] Installing build dependencies..." -ForegroundColor Yellow
if (!(Test-Path (Join-Path $nodeModulesDir "esbuild"))) {
    Write-Host "Installing esbuild and pkg..." -ForegroundColor Cyan
    npm install --save-dev esbuild pkg
}
Write-Host "[OK] Dependencies ready" -ForegroundColor Green

# Clean dist directory
Write-Host "`n[3/7] Cleaning dist directory..." -ForegroundColor Yellow
if (Test-Path $distDir) {
    Remove-Item -Path $distDir -Recurse -Force
}
New-Item -ItemType Directory -Path $distDir -Force | Out-Null
Write-Host "[OK] Cleaned dist directory" -ForegroundColor Green

# Create esbuild bundle configuration
Write-Host "`n[4/7] Bundling TypeScript with esbuild..." -ForegroundColor Yellow

$esbuildConfig = @"
import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

try {
  const result = await esbuild.build({
    entryPoints: [path.join(repoRoot, 'src', 'server.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: path.join(repoRoot, 'dist', 'bundle.js'),
    external: ['pkcs11js', 'sharp', 'formidable'],
    minify: true,
    sourcemap: false,
    logLevel: 'info',
    loader: {
      '.ts': 'ts',
    },
    define: {
      'process.env.NODE_ENV': '"production"'
    }
  });
  
  console.log('[OK] Bundle created successfully');
  process.exit(0);
} catch (error) {
  console.error('[ERROR] Bundle failed:', error.message);
  process.exit(1);
}
"@

$esbuildConfigFile = Join-Path $distDir "esbuild-config.mjs"
Set-Content -Path $esbuildConfigFile -Value $esbuildConfig -Encoding UTF8

try {
    # Run esbuild
    & node $esbuildConfigFile
    if ($LASTEXITCODE -ne 0) {
        throw "esbuild bundling failed"
    }
    
    # Remove config file
    Remove-Item -Path $esbuildConfigFile -Force
    
    Write-Host "[OK] Bundle created: $bundleFile" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Bundling failed: $_" -ForegroundColor Red
    throw $_
}

# Create wrapper entry point for pkg
Write-Host "`n[5/7] Creating pkg entry point..." -ForegroundColor Yellow

$pkgEntryPoint = @"
#!/usr/bin/env node
require('./bundle.js');
"@

$pkgEntry = Join-Path $distDir "server.js"
Set-Content -Path $pkgEntry -Value $pkgEntryPoint -Encoding UTF8

Write-Host "[OK] Entry point created" -ForegroundColor Green

# Run pkg to create executable
Write-Host "`n[6/7] Creating Windows executable with pkg..." -ForegroundColor Yellow

try {
    $pkgCmd = @(
        "pkg",
        $pkgEntry,
        "--target", "node$NodeVersion-$Platform",
        "--output", $exeFile,
        "--compress", "GzipCompressed",
        "--quiet"
    )
    
    Write-Host "Running: $($pkgCmd -join ' ')" -ForegroundColor Gray
    & npm exec -- @pkgCmd
    
    if ($LASTEXITCODE -ne 0) {
        throw "pkg executable creation failed"
    }
    
    if (!(Test-Path $exeFile)) {
        throw "Executable file was not created: $exeFile"
    }
    
    Write-Host "[OK] Executable created: $exeFile" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Executable creation failed: $_" -ForegroundColor Red
    throw $_
}

# Copy pkcs11js native module
Write-Host "`n[7/7] Copying native modules (pkcs11js)..." -ForegroundColor Yellow

$pkcs11Source = Join-Path $nodeModulesDir "pkcs11js"
if (Test-Path $pkcs11Source) {
    New-Item -ItemType Directory -Path $pkcs11ModuleDir -Force | Out-Null
    Copy-Item -Path "$pkcs11Source\*" -Destination $pkcs11ModuleDir -Recurse -Force
    Write-Host "[OK] pkcs11js copied to: $pkcs11ModuleDir" -ForegroundColor Green
} else {
    Write-Host "[WARN] pkcs11js not found in node_modules, skipping..." -ForegroundColor Yellow
}

# Create .env with sensible defaults (app works immediately!)
$envDefault = @"
# DSC Backend Configuration
# This file contains working defaults - edit as needed for your environment

PORT=5000
NODE_ENV=production
LOG_LEVEL=info

# API Configuration - CHANGE THIS FOR PRODUCTION!
REQUEST_SIGNER_SECRET=default-insecure-key-change-in-production
API_TIMEOUT=30000

# PKCS#11 Configuration (if using USB tokens)
PKCS11_MODULE_PATH=
PKCS11_SLOT=
"@

$envFile = Join-Path $distDir ".env"
Set-Content -Path $envFile -Value $envDefault -Encoding UTF8
Write-Host "[OK] Created .env with working defaults (app runs immediately!)" -ForegroundColor Green

# Also create .env.example for reference
$envExample = @"
# DSC Backend Configuration - REFERENCE ONLY
# The .env file in this directory contains your configuration
# Edit .env to customize for your environment

# Server Configuration
PORT=5000
NODE_ENV=production
LOG_LEVEL=info

# API Security - MUST CHANGE FOR PRODUCTION!
REQUEST_SIGNER_SECRET=your-secure-secret-key-here
API_TIMEOUT=30000

# PKCS#11 / USB Token Configuration (optional)
# Set these if using hardware security tokens
PKCS11_MODULE_PATH=
PKCS11_SLOT=
"@

$envExampleFile = Join-Path $distDir ".env.example"
Set-Content -Path $envExampleFile -Value $envExample -Encoding UTF8
Write-Host "[OK] Created .env.example as reference" -ForegroundColor Gray

Write-Host "`n[WARN] PRODUCTION SECURITY: Change REQUEST_SIGNER_SECRET in .env!" -ForegroundColor Yellow

# Check if .env should be included in deployment
if (Test-Path (Join-Path $repoRoot ".env")) {
    Write-Host "`n[WARN] WARNING: .env file exists in source directory" -ForegroundColor Yellow
    Write-Host "      Source .env is NOT copied to dist/ for security" -ForegroundColor Yellow
    Write-Host "      Edit the generated .env in dist/ instead" -ForegroundColor Yellow
}

# Generate install-service.ps1
Write-Host "`nGenerating install-service.ps1..." -ForegroundColor Cyan

$installServiceScript = @"
<#
.SYNOPSIS
    Installs the DSC Backend as a Windows Service using NSSM (Non-Sucking Service Manager)

.DESCRIPTION
    This script registers DSCBackend.exe as an automatic Windows Service that starts on boot.
    Requires NSSM to be installed (can be downloaded from https://nssm.cc/download)

.PARAMETER ServiceName
    Name of the Windows Service (default: DSCBackendService)

.PARAMETER ServiceDisplayName
    Display name in Services panel (default: DSC Backend Service)

.PARAMETER NssmPath
    Path to NSSM executable (default: .\nssm.exe in current directory)

.EXAMPLE
    .\install-service.ps1 -ServiceName "DSCBackendService"
#>

param(
    [string]`$ServiceName = "DSCBackendService",
    [string]`$ServiceDisplayName = "DSC Backend Service",
    [string]`$NssmPath = (Join-Path `$PSScriptRoot "nssm.exe")
)

`$ErrorActionPreference = "Stop"

Write-Host "================================" -ForegroundColor Cyan
Write-Host "DSC Backend Service Installation" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Check if running as Administrator
`$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if (!`$isAdmin) {
    Write-Host "[ERROR] This script must be run as Administrator" -ForegroundColor Red
    Write-Host "[INFO] Please run: powershell -ExecutionPolicy Bypass -File install-service.ps1 -RunAs Administrator" -ForegroundColor Yellow
    exit 1
}

# Check if NSSM exists
if (!(Test-Path `$NssmPath)) {
    Write-Host "[ERROR] NSSM not found at: `$NssmPath" -ForegroundColor Red
    Write-Host "Download NSSM from: https://nssm.cc/download" -ForegroundColor Yellow
    Write-Host "Extract to: `$(Split-Path `$NssmPath)" -ForegroundColor Yellow
    exit 1
}

`$scriptDir = `$PSScriptRoot
`$exePath = Join-Path `$scriptDir "DSCBackend.exe"
`$logDir = Join-Path `$scriptDir "logs"
`$envPath = Join-Path `$scriptDir ".env"
`$envExamplePath = Join-Path `$scriptDir ".env.example"

# SECURITY: Check for .env file (should be created manually on target machine)
if (!(Test-Path `$envPath)) {
    Write-Host "`n[ALERT] SECURITY: .env file not found!" -ForegroundColor Red
    Write-Host "        Cannot proceed without .env configuration" -ForegroundColor Red
    Write-Host "`n[INFO] To create .env:" -ForegroundColor Yellow
    if (Test-Path `$envExamplePath) {
        Write-Host "       1. Copy .env.example to .env:" -ForegroundColor Gray
        Write-Host "          Copy-Item '.env.example' '.env'" -ForegroundColor Gray
        Write-Host "       2. Edit .env and set your configuration:" -ForegroundColor Gray
        Write-Host "          - REQUEST_SIGNER_SECRET (required)" -ForegroundColor Gray
        Write-Host "          - PKCS11_MODULE_PATH if using USB tokens" -ForegroundColor Gray
        Write-Host "       3. Run this script again" -ForegroundColor Gray
    }
    exit 1
}

# Create logs directory
if (!(Test-Path `$logDir)) {
    New-Item -ItemType Directory -Path `$logDir -Force | Out-Null
}

Write-Host "`nService Configuration:" -ForegroundColor Yellow
Write-Host "  Service Name: `$ServiceName" -ForegroundColor Gray
Write-Host "  Display Name: `$ServiceDisplayName" -ForegroundColor Gray
Write-Host "  Executable: `$exePath" -ForegroundColor Gray
Write-Host "  Work Dir: `$scriptDir" -ForegroundColor Gray
Write-Host "  Logs: `$logDir" -ForegroundColor Gray

# Remove existing service if it exists
`$existingService = Get-Service -Name `$ServiceName -ErrorAction SilentlyContinue
if (`$existingService) {
    Write-Host "`nRemoving existing service..." -ForegroundColor Yellow
    & `$NssmPath remove `$ServiceName confirm
}

# Install service
Write-Host "`nInstalling service..." -ForegroundColor Yellow
& `$NssmPath install `$ServiceName `$exePath
if (`$LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to install service" -ForegroundColor Red
    exit 1
}

# Configure service
Write-Host "Configuring service..." -ForegroundColor Yellow
& `$NssmPath set `$ServiceName DisplayName `$ServiceDisplayName
& `$NssmPath set `$ServiceName AppDirectory `$scriptDir
& `$NssmPath set `$ServiceName AppStdout `$(Join-Path `$logDir "out.log")
& `$NssmPath set `$ServiceName AppStderr `$(Join-Path `$logDir "err.log")
& `$NssmPath set `$ServiceName AppRotateFiles 1
& `$NssmPath set `$ServiceName AppRotateOnline 1
& `$NssmPath set `$ServiceName AppRotateSeconds 86400
& `$NssmPath set `$ServiceName AppRotateBytes 10485760

# Set to start automatically on boot
Write-Host "Setting to auto-start on boot..." -ForegroundColor Yellow
& `$NssmPath set `$ServiceName Start SERVICE_AUTO_START
& `$NssmPath set `$ServiceName Type SERVICE_WIN32_OWN_PROCESS

# Restart behavior
Write-Host "Configuring restart on failure..." -ForegroundColor Yellow
& `$NssmPath set `$ServiceName AppExit Default Restart
& `$NssmPath set `$ServiceName AppRestartDelay 5000

# Secure .env file permissions
`$envPath = Join-Path `$scriptDir ".env"
if (Test-Path `$envPath) {
    Write-Host "Securing .env file permissions (SYSTEM ONLY)..." -ForegroundColor Yellow
    
    # Remove inheritance and set restrictive permissions
    `$acl = Get-Acl `$envPath
    `$acl.SetAccessRuleProtection(`$true, `$false)
    
    # Remove all permissions
    `$acl.Access | ForEach-Object { `$acl.RemoveAccessRule(`$_) } | Out-Null
    
    # Grant ONLY SYSTEM (service account)
    `$systemIdentity = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18')
    
    `$system = New-Object System.Security.AccessControl.AccessRule (
        `$systemIdentity,
        [System.Security.AccessControl.FileSystemRights]::FullControl,
        [System.Security.AccessControl.InheritanceFlags]::None,
        [System.Security.AccessControl.PropagationFlags]::None,
        [System.Security.AccessControl.AccessControlType]::Allow
    )
    
    `$acl.AddAccessRule(`$system)
    Set-Acl `$envPath `$acl
    
    Write-Host "[OK] .env permissions set to SYSTEM ONLY (no other access)" -ForegroundColor Green
} else {
    Write-Host "[WARN] .env file not found!" -ForegroundColor Yellow
    Write-Host "       Create .env from .env.example and fill in your settings" -ForegroundColor Yellow
}

# Start the service
Write-Host "`nStarting service..." -ForegroundColor Yellow
Start-Service -Name `$ServiceName

# Verify service is running
Start-Sleep -Seconds 2
`$service = Get-Service -Name `$ServiceName
if (`$service.Status -eq "Running") {
    Write-Host "[OK] Service installed and started successfully!" -ForegroundColor Green
    Write-Host "`nService Details:" -ForegroundColor Green
    Write-Host "  Status: `$(`$service.Status)" -ForegroundColor Green
    Write-Host "  Startup Type: `$(`$service.StartType)" -ForegroundColor Green
    Write-Host "  Logs: `$logDir" -ForegroundColor Green
} else {
    Write-Host "[WARN] Service installed but not running" -ForegroundColor Yellow
    Write-Host "Check logs at: `$logDir" -ForegroundColor Yellow
}

Write-Host "`nTo uninstall the service later, run:" -ForegroundColor Cyan
Write-Host "  nssm remove `$ServiceName confirm" -ForegroundColor Gray
"@

$installServiceFile = Join-Path $distDir "install-service.ps1"
Set-Content -Path $installServiceFile -Value $installServiceScript -Encoding UTF8
Write-Host "[OK] Generated: $installServiceFile" -ForegroundColor Green

# Generate README
$readmeFile = Join-Path $distDir "README.md"
$readme = @"
# DSC Backend - Standalone Executable

This folder contains everything needed to run the DSC Backend on a Windows machine without requiring Node.js or development tools to be installed.

## Contents

- **DSCBackend.exe** - The main application executable
- **node_modules/pkcs11js** - Native module for PKCS#11 token support
- **.env** - Application configuration
- **install-service.ps1** - PowerShell script to register as Windows Service
- **nssm.exe** - Service manager (required for Windows Service installation)

## Prerequisites

1. Windows 7 SP1 or later (tested on Windows Server 2016+)
2. PKCS#11 driver installed (if using USB tokens)
3. Administrator privileges for service installation

## Running the Application

### Option 1: Direct Execution

Simply run the executable:

\`\`\`powershell
.\DSCBackend.exe
\`\`\`

The application listens on http://localhost:5000 (configurable via .env)

### Option 2: Install as Windows Service (Recommended)

1. Download NSSM from: https://nssm.cc/download
2. Extract nssm.exe to this directory
3. Run the installation script as Administrator:

\`\`\`powershell
powershell -ExecutionPolicy Bypass -File install-service.ps1
\`\`\`

4. The service will be registered as "DSCBackendService" and auto-start on boot

## Configuration

Edit the **.env** file to configure:

- **PORT** - Application port (default: 5000)
- **REQUEST_SIGNER_SECRET** - Secret for request signing
- **LOG_LEVEL** - Logging level (default: info)

After editing .env, restart the service or application.

## Logs

Logs are stored in the **logs/** directory:

- **out.log** - Standard output
- **err.log** - Error output

## Troubleshooting

### Service won't start
1. Check logs in the logs/ folder
2. Verify .env file exists and is readable
3. Ensure PKCS#11 drivers are properly installed
4. Check that PORT is not already in use

### PKCS#11 Token Issues
1. Install the USB token driver from manufacturer
2. Plug in the USB token
3. Restart the service

## Uninstalling the Service

As Administrator:

\`\`\`powershell
nssm remove DSCBackendService confirm
\`\`\`

---

**Version:** 1.0.0
**Built:** $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
"@

Set-Content -Path $readmeFile -Value $readme -Encoding UTF8
Write-Host "[OK] Generated: $readmeFile" -ForegroundColor Green

# Summary
Write-Host "`n================================" -ForegroundColor Green
Write-Host "Build Complete!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green

Write-Host "`nDeployment Package Contents:" -ForegroundColor Cyan
Write-Host "  Location: $distDir" -ForegroundColor Gray
Write-Host "  - DSCBackend.exe (standalone executable)" -ForegroundColor Gray
Write-Host "  - node_modules/pkcs11js (native module)" -ForegroundColor Gray
Write-Host "  - .env (configuration)" -ForegroundColor Gray
Write-Host "  - install-service.ps1 (service installer)" -ForegroundColor Gray
Write-Host "  - README.md (documentation)" -ForegroundColor Gray

Write-Host "`nNext Steps:" -ForegroundColor Yellow
Write-Host "1. Copy the entire dist/ folder to target Windows machine" -ForegroundColor Gray
Write-Host "2. Edit .env with your configuration" -ForegroundColor Gray
Write-Host "3. (Optional) Download nssm.exe to the dist/ folder" -ForegroundColor Gray
Write-Host "4. (Optional) Run: powershell -ExecutionPolicy Bypass -File install-service.ps1" -ForegroundColor Gray
Write-Host "5. Start the application or service" -ForegroundColor Gray

Write-Host "`n[OK] Ready for deployment!" -ForegroundColor Green
