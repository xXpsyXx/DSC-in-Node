@echo off
REM ============================================================================
REM DSC Signer - Service Launcher with Error Diagnostics
REM ============================================================================
REM This batch file runs the DSC Signer executable and captures any errors

setlocal enabledelayedexpansion

REM Get the directory where this batch file is located
set "SCRIPT_DIR=%~dp0"
set "EXE_FILE=%SCRIPT_DIR%dsc-signer-win.exe"
set "ENV_FILE=%SCRIPT_DIR%.env"
set "LOG_FILE=%SCRIPT_DIR%startup-error.log"

echo.
echo ============================================================================
echo  DSC Signer - Launcher
echo ============================================================================
echo.

REM Check if .exe exists
if not exist "%EXE_FILE%" (
    color 0C
    echo ERROR: dsc-signer-win.exe not found in current directory!
    echo Expected location: %EXE_FILE%
    echo.
    pause
    exit /b 1
)

echo [INFO] Executable found: %EXE_FILE%

REM Check if .env file exists
if not exist "%ENV_FILE%" (
    echo.
    echo [WARN] .env file not found. Creating default configuration...
    echo.
    
    REM Create default .env
    (
        echo # DSC Signer Configuration
        echo # Edit this file to customize the service
        echo.
        echo # Server Configuration
        echo PORT=3001
        echo NODE_ENV=production
        echo LOG_LEVEL=info
        echo.
        echo # API Configuration
        echo ALLOW_ORIGINS=*
    ) > "%ENV_FILE%"
    
    echo [OK] Default .env file created: %ENV_FILE%
    echo     You can edit this file to change configuration
    echo.
    timeout /t 2
)

REM Reset color to normal
color 0F

echo [INFO] Starting DSC Signer service...
echo [INFO] Port: 3001 ^(configurable in .env^)
echo [INFO] Health check: http://localhost:3001/health
echo [INFO] Press Ctrl+C to stop the service
echo.

REM Run the executable and capture output
"%EXE_FILE%" 2>&1

REM Check if process failed
if !errorlevel! neq 0 (
    color 0C
    echo.
    echo ============================================================================
    echo ERROR: Service exited with code !errorlevel!
    echo ============================================================================
    echo.
    echo Troubleshooting steps:
    echo   1. Check if .env file exists: %ENV_FILE%
    echo   2. Check if PORT 3001 is already in use:
    echo      netstat -ano ^| findstr :3001
    echo   3. Try changing PORT in .env to a different number
    echo   4. Run as Administrator ^(right-click -^> Run as admin^)
    echo   5. Ensure Hypersecu USB token is connected ^(if using certificate signing^)
    echo.
    echo   For detailed diagnostics, run: powershell -ExecutionPolicy Bypass -File diagnose.ps1
    echo.
    pause
    exit /b 1
)

exit /b 0
