#!/usr/bin/env pwsh
<#
.SYNOPSIS
    DSC Signer - Diagnostic and Configuration Tool
.DESCRIPTION
    Helps diagnose issues with DSC Signer service on Windows
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File diagnose.ps1
#>

param(
    [switch]$RunService = $false
)

$ErrorActionPreference = "Continue"

# Color helper function
function Write-Status {
    param([string]$Message, [string]$Type = "Info")
    $colors = @{
        Info = "Green"
        Warn = "Yellow"
        Error = "Red"
    }
    Write-Host "$Message" -ForegroundColor $colors[$Type]
}

# Clear screen
Clear-Host

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       DSC Signer - Windows Service Diagnostics               ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Get script location
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExeFile = Join-Path $ScriptDir "dsc-signer-win.exe"
$EnvFile = Join-Path $ScriptDir ".env"

# Check 1: Verify executable exists
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-host "1. Checking Executable..." -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

if (Test-Path $ExeFile) {
    $fileInfo = Get-Item $ExeFile
    Write-Status "✓ Executable found: $ExeFile" "Info"
    Write-Host "  Size: $([math]::Round($fileInfo.Length / 1MB, 2)) MB"
    Write-Host "  Modified: $($fileInfo.LastWriteTime)"
} else {
    Write-Status "✗ Executable NOT found: $ExeFile" "Error"
    Write-Host ""
    exit 1
}

Write-Host ""

# Check 2: Verify .env file
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-host "2. Checking Configuration (.env file)..." -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

if (Test-Path $EnvFile) {
    Write-Status "✓ Configuration file found" "Info"
    $envContent = Get-Content $EnvFile | Where-Object { $_ -and -not $_.StartsWith("#") }
    Write-Host "  Settings:"
    foreach ($line in $envContent) {
        Write-Host "    $line"
    }
} else {
    Write-Status "⚠ Configuration file not found - will use defaults" "Warn"
    Write-Host "  File: $EnvFile"
}

Write-Host ""

# Check 3: Check port availability
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-host "3. Checking Port 3001..." -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

$portInUse = netstat -ano -p tcp | Select-String ":3001 "
if ($portInUse) {
    Write-Status "⚠ Port 3001 is already in use!" "Warn"
    Write-Host "  Connection: $($portInUse.Line.Trim())"
    Write-Host "  Solution: Change PORT in .env file to a different number"
    Write-Host "            (e.g., PORT=3002)"
} else {
    Write-Status "✓ Port 3001 is available" "Info"
}

Write-Host ""

# Check 4: Check system requirements
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-host "4. System Information..." -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

$osInfo = Get-CimInstance Win32_OperatingSystem
Write-Host "  OS: $($osInfo.Caption)"
Write-Host "  Architecture: $(if ([System.Environment]::Is64BitOperatingSystem) { 'x86-64' } else { 'x86' })"
Write-Host "  Available Memory: $([math]::Round($osInfo.TotalVisibleMemorySize / 1MB, 2)) MB"

Write-Host ""

# Check 5: Administrator check
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-host "5. Permissions..." -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if ($isAdmin) {
    Write-Status "✓ Running as Administrator" "Info"
} else {
    Write-Status "⚠ NOT running as Administrator" "Warn"
    Write-Host "  Note: Some features may require admin privileges"
}

Write-Host ""

# Summary
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-host "Summary" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

Write-Status "✓ All checks completed" "Info"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Review the diagnostic results above"
Write-Host "  2. If port 3001 is in use, edit .env and change PORT value"
Write-Host "  3. Run the service: $ScriptDir\run.bat"
Write-Host "  4. Test the service: curl http://localhost:3001/health"
Write-Host ""

if ($RunService) {
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-host "Starting Service..." -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""
    & $ExeFile
}
