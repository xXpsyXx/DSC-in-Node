# DSC Signer - Build & Deployment Guide

## Overview

This guide covers building, obfuscating, packaging, and deploying the DSC (Digital Signature Certificate) Signer application as a Windows service.

## Build Pipeline

### 1. **Development**

```bash
npm run dev
```

Runs the application directly with live TypeScript compilation using tsx.

### 2. **Obfuscation**

```bash
npm run obfuscate
```

Compiles TypeScript to JavaScript and applies code obfuscation:

- **Control Flow Flattening**: Makes code harder to follow
- **Dead Code Injection**: Adds fake code paths
- **String Array Encoding**: Obfuscates string literals
- **Self-Defending**: Protects against decompilation
- Output: `dist/server.js` (50K+ lines, fully obfuscated)

### 3. **Package to Executables**

```bash
npm run package
```

Creates standalone Windows, Linux, and macOS executables using `pkg`:

- **Windows**: `release/dsc-signer-win.exe`
- **Linux**: `release/dsc-signer-linux`
- **macOS**: `release/dsc-signer-macos`

Each executable includes Node.js runtime (no external dependencies needed).

### 4. **Complete Build (Recommended)**

```bash
npm run full-build
```

Runs obfuscation then packaging in sequence.

## Windows Service Installation

### Prerequisites

- Windows Administrator access
- The Windows executable must exist: `release/dsc-signer-win.exe`

### Install as Service

```bash
node service-install.js
```

This creates a Windows service named **DSC-Signer** that:

- Auto-starts on system reboot
- Auto-restarts if it crashes (max 5 restarts)
- Runs in the background

**Output:**

```
✅ Service installed successfully!
📋 Service Name: DSC-Signer
   Start: net start DSC-Signer
   Stop:  net stop DSC-Signer
```

### Manage Service

```powershell
# Start service
net start DSC-Signer

# Stop service
net stop DSC-Signer

# Check status
sc query DSC-Signer

# Or use Services app
services.msc
```

### Uninstall Service

```bash
node service-uninstall.js
```

## Deployment Workflow

### Step-by-step on Windows:

```bash
# 1. Build everything
npm run full-build

# 2. Verify executables exist
ls release/
# Output:
#   dsc-signer-win.exe
#   dsc-signer-linux
#   dsc-signer-macos

# 3. Install as Windows service (requires admin)
node service-install.js

# 4. The service will auto-start and be visible in:
#    Settings > Services > DSC-Signer
```

## Troubleshooting

### Service won't start

- Check Windows Event Viewer for errors
- Verify the `.exe` path exists
- Check file permissions (should be readable by system)
- Review `.env` configuration

### Executable is too large

- This is expected (includes Node.js runtime: ~40-50 MB)
- Use compression/archiving for distribution

### Port already in use

- Change the PORT in `.env`
- Or find and kill the process using the port

### Cannot install service (permission denied)

- Run Command Prompt or PowerShell **as Administrator**
- Then run `node service-install.js`

## File Structure

```
backend/
├── dist/
│   └── server.js              # Obfuscated code
├── release/
│   ├── dsc-signer-win.exe     # Windows executable
│   ├── dsc-signer-linux       # Linux executable
│   └── dsc-signer-macos       # macOS executable
├── obfuscate.js               # Obfuscation script
├── package-app.js             # Packaging script
├── service-install.js         # Windows service installer
├── service-uninstall.js       # Windows service uninstaller
└── src/
    └── server.ts              # Source code
```

## Environment Variables

Create a `.env` file in the `release/` directory (or same directory as executable):

```env
PORT=3001
NODE_ENV=production
# Add other configuration as needed
```

## Security Notes

✅ **Implemented:**

- Code obfuscation to prevent reverse engineering
- Bundled Node.js runtime (no source exposure)
- Standalone executable (single `.exe` file)

⚠️ **Additional Recommendations:**

- Keep `.env` files secure (restrict file permissions)
- Use HTTPS in production
- Implement request signing (already configured)
- Monitor service logs
- Regular security updates

## Support

For issues or questions:

1. Check Windows Event Viewer for service logs
2. Review the backend security documentation: `BACKEND_SECURITY.md`
3. Check the request signing guide: `REQUEST_SIGNING.md`
