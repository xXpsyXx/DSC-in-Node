# DSC Backend - Deployment Build Guide

## Overview

The new `deploy-build.ps1` script creates a **standalone Windows executable** that requires no Node.js, npm, or source code exposure. This is ideal for production deployments.

## What It Does

1. **Bundles TypeScript** - Converts `src/server.ts` and dependencies into a single CommonJS file using esbuild
2. **Minifies Code** - Removes unused code and compresses the bundle
3. **Creates EXE** - Packages the bundle into a standalone `DSCBackend.exe` using pkg
4. **Handles Native Modules** - Copies `pkcs11js` binaries for USB token support
5. **Generates Service Installer** - Creates `install-service.ps1` for Windows Service registration
6. **Includes Documentation** - Generates README with setup instructions

## Output Structure

After running the script, your `dist/` folder contains:

```
dist/
├── DSCBackend.exe          ← Standalone executable (no runtime needed!)
├── node_modules/
│   └── pkcs11js/           ← Native PKCS#11 module
├── .env                    ← Configuration
├── install-service.ps1     ← Windows Service installer
├── README.md               ← Deployment guide
└── logs/                   ← Runtime logs directory
```

## Running the Build (On Windows)

### Option 1: Quick Build with Defaults

```powershell
cd backend
npm run deploy:build
```

This creates `DSCBackend.exe` targeting Node.js 18 on 64-bit Windows.

### Option 2: Custom Configuration

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-build.ps1 `
  -AppName "MyDSCApp" `
  -NodeVersion "20" `
  -Platform "win-x64"
```

**Parameters:**

- `-AppName` - Output executable name (default: `DSCBackend`)
- `-NodeVersion` - Node.js version to target (default: `18`)
- `-Platform` - Target platform (default: `win-x64`, also supports `win-arm64`)

### Option 3: With Obfuscation (Extra Security)

If you want even more code protection:

```powershell
# Build and obfuscate first
npm run build:obfuscated

# Then create exe
npm run deploy:build
```

## Setup on Target Machine

On the **Windows machine** where you want to run the app:

### 1. Copy the Deployment Package

Copy the entire `dist/` folder to the target machine (e.g., `C:\DSCBackend\`)

### 2. Configure the Application

Edit `dist/.env`:

```env
PORT=5000
REQUEST_SIGNER_SECRET=your-secret-key
NODE_ENV=production
LOG_LEVEL=info
```

### 3. Install Optional USB Token Driver

If using PKCS#11 USB tokens:

- Install the manufacturer's PKCS#11 driver
- Plug in the USB token
- Application will auto-detect on startup

### 4. Option A: Run Directly

```powershell
cd C:\DSCBackend
.\DSCBackend.exe
```

The app is now running as a standalone executable!

### 4. Option B: Install as Windows Service (Recommended)

For production, register as an auto-starting Windows Service:

#### Step 1: Download NSSM

1. Download from: https://nssm.cc/download
2. Extract `nssm.exe` to `C:\DSCBackend\`

#### Step 2: Install Service

```powershell
cd C:\DSCBackend
powershell -ExecutionPolicy Bypass -File install-service.ps1
```

The script will:

- ✅ Register as "DSCBackendService"
- ✅ Set to auto-start on boot
- ✅ Configure logging to `logs/` directory
- ✅ Set up automatic restart on failure
- ✅ Start the service immediately

#### Verify Installation

```powershell
Get-Service -Name DSCBackendService
```

Should show Status: `Running`

## Security - .env File Protection

The `.env` file containing production secrets is protected with the most restrictive permissions:

### File Permissions

After service installation, only **SYSTEM** can read the `.env` file:

```
.env File Permissions:
  ✓ SYSTEM: Full Control (service process only)
  ✗ Administrators: NO ACCESS (blocked)
  ✗ Everyone Else: NO ACCESS (blocked)
```

This ensures:

- Service can read configuration and secrets
- Even administrators cannot view production secrets
- Maximum security isolation
- Secrets remain hidden from all user processes

### Verify Permissions

```powershell
# Check .env permissions
icacls "C:\DSCBackend\.env"

# Should show ONLY:
# NT AUTHORITY\SYSTEM:(I)(F)
#
# If you see anything else, permissions are incorrectly set
```

### Why SYSTEM Only?

- **Service Account**: The Windows Service runs as SYSTEM and needs read access
- **No Admin Access**: Even administrators cannot accidentally view secrets
- **Isolated Access**: Secrets accessible only to the service process
- **Prevents Leaks**: Reduces risk of credentials being exposed in logs/files

## Monitoring & Logging

Logs are automatically created in `dist/logs/`:

- **out.log** - Standard output and info messages
- **err.log** - Errors and exceptions

Logs rotate daily and are capped at 10MB each.

### View Logs

```powershell
# Real-time log viewing
Get-Content -Path "C:\DSCBackend\logs\out.log" -Wait

# Or in PowerShell
type "C:\DSCBackend\logs\err.log"
```

## Service Management

### Start Service

```powershell
Start-Service -Name DSCBackendService
```

### Stop Service

```powershell
Stop-Service -Name DSCBackendService
```

### View Service Status

```powershell
Get-Service -Name DSCBackendService | Format-List *
```

### Restart Service

```powershell
Restart-Service -Name DSCBackendService
```

### Uninstall Service

```powershell
# Download and place nssm.exe first, then:
nssm remove DSCBackendService confirm
```

## Troubleshooting

### Service won't start

1. **Check logs**: Look in `dist/logs/err.log` for error messages
2. **Verify .env**: Ensure `.env` file exists and is readable
3. **Port in use**: Check if port 5000 (or configured port) is already in use
4. **PKCS#11 driver**: If using USB tokens, verify driver is installed

Commands:

```powershell
# Check if port is in use
netstat -ano | findstr :5000

# Check service status
Get-Service -Name DSCBackendService

# View Windows Event Log
Get-EventLog -LogName System | Where { $_.Source -eq 'NSSM' } | Tail -20
```

### USB Token not detected

- Plug in token before starting the service
- Verify driver is installed: Look for device in Device Manager
- Restart the service: `Restart-Service -Name DSCBackendService`

### System won't boot after service installation

This is extremely rare, but if it happens:

1. Boot into Safe Mode
2. Run: `nssm remove DSCBackendService confirm`
3. Restart normally

## Security Notes

✅ **Source Code is Hidden**: All source code is bundled and minified  
✅ **No Runtime Downloads**: EXE includes everything needed  
✅ **No Development Tools**: Target machine doesn't need Node.js, npm, or build tools  
✅ **Optional Obfuscation**: Can enable extra code obfuscation for additional protection  
✅ **Native Modules Safe**: PKCS#11 module is properly isolated

## File Size

The standalone executable is typically:

- **Without native modules**: ~20-30 MB
- **With pkcs11js**: ~35-50 MB
- **Compresses to**: ~8-15 MB (with compression enabled)

## Performance

Startup time is typically **2-5 seconds** on modern hardware.

## Updating the Application

To deploy a new version:

1. Make code changes locally
2. Run `npm run deploy:build` on Windows
3. Copy new `dist/` folder to target machine
4. Restart service: `Restart-Service -Name DSCBackendService`

Or use a deployment tool like:

- **PowerShell Remoting** for automated updates
- **Windows Admin Center** for GUI management
- **Configuration Manager** for enterprise deployments

## Advanced: Signing the Executable

For additional security, you can code-sign the `.exe`:

```powershell
# Using your code-signing certificate
signtool sign /f "cert.pfx" /p "password" /t "http://timestamp.server" `
  "C:\DSCBackend\DSCBackend.exe"
```

This makes the application trusted by Windows SmartScreen and Windows Defender.

---

**Version**: 1.0.0  
**Last Updated**: April 2026  
**Platform**: Windows 7 SP1+  
**Requirements**: None (after deployment)
