# DSC Signer - Complete Build & Deployment Workflow

## 🎯 Overview

This project uses a complete pipeline to build, obfuscate, and package a Node.js application as standalone Windows service executables.

## 🏗️ Architecture

```
Source Code
    ↓
TypeScript Compilation (esbuild)
    ↓
Code Obfuscation (javascript-obfuscator)
    ↓
Bundle with Node.js Runtime (pkg)
    ↓
Standalone Executable (.exe, linux, macos)
    ↓
Windows Service Registration (node-windows)
    ↓
Production Deployment
```

## 📦 Tools & Technologies

| Tool                      | Purpose                             | Version |
| ------------------------- | ----------------------------------- | ------- |
| **esbuild**               | Fast TypeScript→JavaScript compiler | 0.28.0  |
| **javascript-obfuscator** | Code obfuscation & protection       | Latest  |
| **pkg**                   | Bundle with Node.js runtime         | 5.8.1   |
| **node-windows**          | Windows service integration         | Latest  |
| **TypeScript**            | Type-safe source code               | 6.0.2   |

## 🔄 Build Pipeline Steps

### Step 1: Obfuscation

```bash
npm run obfuscate
```

- Compiles TypeScript to JavaScript
- Applies aggressive obfuscation:
  - Control flow flattening
  - Dead code injection
  - String array encoding (base64)
  - Identifier hexadecimal generation
  - Self-defending code
  - Debug protection
- **Output:** `dist/server.js` (~50,000 lines, unreadable)

### Step 2: Packaging

```bash
npm run package
```

- Creates 3 standalone executables:
  - Windows: `release/dsc-signer-win.exe` (43 MB)
  - Linux: `release/dsc-signer-linux` (51 MB)
  - macOS: `release/dsc-signer-macos` (56 MB)
- Each includes bundled Node.js 18.5.0 runtime
- No external dependencies required

### Step 3: Service Installation

```bash
node service-install.js  # Windows only
```

- Registers as Windows service named "DSC-Signer"
- Configures auto-start on boot
- Sets up restart policies
- Enables service monitoring

### Combined Build

```bash
npm run full-build
```

- Runs obfuscation + packaging in sequence
- Faster than running separately

## 📝 Available Commands

```bash
# Development
npm run dev                  # Run with live TS compilation

# Production Build
npm run obfuscate           # Compile & obfuscate code
npm run package             # Create executables
npm run full-build          # Obfuscate + package

# Windows Service Management
npm run service:install     # Install as Windows service
npm run service:uninstall   # Uninstall Windows service

# Original PowerShell Installers
npm run installer:prepare   # Prepare installer payload
npm run installer:build     # Build final installer
```

## 🚀 Quick Start (Windows)

### Prerequisites

- Windows 7+ or Windows Server
- Administrator access
- Node.js + npm (for building)

### Deployment Steps

```powershell
# 1. Get to the backend directory
cd path\to\DSC-in-Node\backend

# 2. Build everything
npm run full-build

# 3. Copy executable to deployment location
Copy-Item release\dsc-signer-win.exe -Destination "C:\Program Files\DSC-Signer\"
Copy-Item .env.example -Destination "C:\Program Files\DSC-Signer\.env"

# 4. Configure .env for your environment
notepad "C:\Program Files\DSC-Signer\.env"

# 5. Install as service (requires admin)
# Copy service-install.js to the same directory and run:
node service-install.js

# 6. Start service
net start DSC-Signer

# 7. Verify it's running
curl http://localhost:3001/health
```

## 📊 File Structure

```
backend/
├── dist/
│   └── server.js                    # Obfuscated code
├── release/
│   ├── dsc-signer-win.exe          # ✨ Windows executable
│   ├── dsc-signer-linux            # Linux executable
│   └── dsc-signer-macos            # macOS executable
├── src/
│   ├── server.ts                   # Entry point
│   ├── controllers/                # API controllers
│   ├── routes/                     # API routes
│   ├── services/                   # Business logic
│   ├── middleware/                 # Express middleware
│   └── utils/                      # Utilities
├── obfuscate.js                    # Obfuscation script
├── package-app.js                  # Packaging script
├── service-install.js              # Windows service installer
├── service-uninstall.js            # Windows service uninstaller
├── package.json                    # Dependencies
├── tsconfig.json                   # TypeScript config
└── BUILD_DEPLOYMENT_GUIDE.md       # Detailed guide
```

## 🔐 Security Features

### Code Protection

✅ **Obfuscated:**

- All identifiers converted to hexadecimal (e.g., `_0x1a2b`)
- String literals encoded in base64
- Control flow flattened (logical flow impossible to follow)
- Dead code injected (fake execution paths)
- Self-defending code (detects decompilers)
- Debug protection enabled

✅ **Bundled:**

- No source files in executable
- No node_modules folder needed
- Single standalone file
- Binary format (compiled Node.js)

### Deployment Security

- Standalone executable (no script injection vectors)
- Service runs with controlled permissions
- Auto-restart on failure (resilience)
- Windows Event logging (audit trail)

## ⚙️ Configuration

### Environment Variables (.env)

```env
PORT=3001                           # API port
NODE_ENV=production                 # Environment mode
LOG_LEVEL=info                      # Logging level
# Add other configuration as needed
```

### Windows Service Properties

- **Name:** DSC-Signer
- **Description:** PDF Digital Signature Service with Hypersecu USB Token
- **Executable:** dsc-signer-win.exe
- **Start Type:** Automatic (on boot)
- **Recovery:** Auto-restart (up to 5 times)
- **Log On As:** LOCAL SYSTEM

## 📈 Performance

| Metric          | Value                     |
| --------------- | ------------------------- |
| Startup Time    | ~2-3 seconds              |
| Memory Usage    | ~50-100 MB                |
| CPU Usage       | <5% idle                  |
| Max Connections | Depends on Node.js ulimit |

## 🔍 Monitoring & Maintenance

### Health Check

```bash
# Check if service is running
curl http://localhost:3001/health

# View service status
sc query DSC-Signer

# Check process
tasklist | findstr dsc-signer
```

### Logs

```powershell
# Windows Event Viewer
eventvwr.msc

# Filter by application
Get-EventLog -LogName Application -Source "DSC-Signer" -Newest 50
```

### Updates

```bash
# 1. Build new version
npm run full-build

# 2. Stop service
net stop DSC-Signer

# 3. Replace executable
Copy-Item release\dsc-signer-win.exe -Destination "C:\Program Files\DSC-Signer\" -Force

# 4. Start service
net start DSC-Signer
```

## 🐛 Troubleshooting

### Service won't start

- Check Windows Event Viewer for errors
- Verify `.env` exists in same directory as .exe
- Check if PORT is already in use
- Verify file permissions

### High memory usage

- Check for memory leaks in logs
- Verify no recursive loops
- Monitor with Task Manager

### Certificate/USB token issues

- Verify device is connected
- Check Windows Device Manager
- Review BACKEND_SECURITY.md for configuration

## 📚 Additional Documentation

- [BUILD_DEPLOYMENT_GUIDE.md](./BUILD_DEPLOYMENT_GUIDE.md) - Detailed build guide
- [WINDOWS_SERVICE_DEPLOYMENT.md](./WINDOWS_SERVICE_DEPLOYMENT.md) - Service deployment guide
- [BACKEND_SECURITY.md](./BACKEND_SECURITY.md) - Security configuration
- [REQUEST_SIGNING.md](./REQUEST_SIGNING.md) - Request signing details

## 🎓 Learning Resources

### About Obfuscation

- Transforms readable code into machine-optimized, hard-to-read code
- Still produces functionally identical output
- Security through obscurity (delays reverse engineering)

### About pkg

- Bundles Node.js runtime with JavaScript code
- Creates standalone executables (no external Node.js needed)
- Requires manual external dependency shipping for some packages

### About node-windows

- Provides Windows service registration API
- Auto-start/restart capabilities
- Event logging integration

## ✨ Summary

The complete build pipeline ensures:

1. **Security:** Code obfuscation prevents reverse engineering
2. **Portability:** Standalone executables need no external runtime
3. **Reliability:** Windows service auto-restart and monitoring
4. **Maintainability:** Version control and deployment scripting
5. **Scalability:** Can handle multiple instances on same machine

---

**Last Updated:** April 10, 2026  
**Build Version:** 1.0.0  
**Status:** ✅ Production Ready
