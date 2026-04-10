# DSC Signer - Installation & Setup Guide

## Quick Start (5 minutes)

### Option 1: Run the Service Directly (Recommended)

1. **Download Files**
   - `dsc-signer-win.exe` - Main application
   - Save to any location (e.g., `C:\DSC-Signer\` or `C:\Program Files\DSC-Signer\`)

2. **Run the Service**
   - Double-click `dsc-signer-win.exe`
   - Or run `run.bat` if available in the same directory

3. **Test**
   - Open browser: http://localhost:3001/health
   - You should see: `{"status":"ok"}`

### Option 2: Run as Windows Service (Auto-Start)

**Prerequisites:**

- Administrator access
- Service files: `service-install.js` and `service-uninstall.js`

**Steps:**

1. Copy all files to a directory (e.g., `C:\Program Files\DSC-Signer\`)
2. Open Command Prompt **as Administrator**
3. Run: `node service-install.js`
4. Windows will register "DSC-Signer" as a service
5. Service will auto-start on system reboot

**Manage Service:**

```powershell
net start DSC-Signer     # Start
net stop DSC-Signer      # Stop
services.msc             # View in GUI
```

## Configuration

### What is .env?

The `.env` file contains configuration settings for the service:

```
PORT=3001              # Server port (change if 3001 is in use)
NODE_ENV=production    # Run mode (production/development)
LOG_LEVEL=info         # Logging verbosity
```

### First Run

When you run `dsc-signer-win.exe` for the first time:

- If no `.env` exists, a default one is created automatically
- You can edit `.env` to customize settings
- Restart the service for changes to take effect

### Common Configuration Changes

**Change Port (if 3001 is in use):**

- Edit `.env` and change: `PORT=3002`
- Restart the service

**Enable Debug Logging:**

- Edit `.env` and change: `LOG_LEVEL=debug`
- Restart the service

## Troubleshooting

### Problem: Terminal Opens and Closes Immediately

**Solution 1: Run with Error Display**

```bash
# Using batch wrapper (if available)
run.bat

# Or run with error output visible
powershell -ExecutionPolicy Bypass -File diagnose.ps1
```

**Solution 2: Check Port**

- Port 3001 may already be in use
- Run: `netstat -ano | findstr :3001`
- If found, edit `.env` and change PORT value

**Solution 3: Check Configuration**

- Ensure `.env` file exists
- Ensure you have read permissions

### Problem: "Port Already in Use"

```powershell
# Find what's using the port
netstat -ano | findstr :3001

# Kill the process (replace PID with actual number)
taskkill /PID <PID> /F

# Or change the port in .env
# Edit: PORT=3002
```

### Problem: Service Won't Start

```powershell
# Check Windows Event Viewer for errors
eventvwr.msc

# Then navigate to: Windows Logs > Application
# Look for "DSC-Signer" errors

# Or run diagnostics
powershell -ExecutionPolicy Bypass -File diagnose.ps1
```

### Problem: Need to Run as Administrator

Right-click `run.bat` → Select **"Run as administrator"**

Or open Command Prompt as Admin:

```powershell
# Press Win+X then select "Terminal (Admin)"
cd C:\Path\To\DSC-Signer
dsc-signer-win.exe
```

### Problem: USB Token/Certificate Issues

If using Hypersecu USB token:

1. Verify device is connected
2. Check Device Manager for driver issues
3. Try unplugging and replugging the USB token
4. Check event logs for specific errors

## Files Included

| File                   | Purpose                              |
| ---------------------- | ------------------------------------ |
| `dsc-signer-win.exe`   | Main application (standalone)        |
| `.env`                 | Configuration (created on first run) |
| `run.bat`              | Batch wrapper with error handling    |
| `diagnose.ps1`         | Diagnostic tool (PowerShell)         |
| `service-install.js`   | Install as Windows service           |
| `service-uninstall.js` | Uninstall Windows service            |
| `INSTALLATION.md`      | This file                            |

## API Endpoints

Once running on `http://localhost:3001`:

### Health Check

```bash
curl http://localhost:3001/health
# Response: {"status":"ok"}
```

### Sign PDF (POST)

```bash
curl -X POST http://localhost:3001/api/sign \
  -F "file=@document.pdf"
```

### Verify Signature (POST)

```bash
curl -X POST http://localhost:3001/api/verify \
  -F "file=@signed.pdf"
```

## Logs

### For Direct Execution

- Logs appear in the terminal window
- Keep the window open to see real-time output

### For Service Installation

- Logs saved to Windows Event Viewer
- Open: `eventvwr.msc` → Windows Logs → Application
- Filter by "DSC-Signer"

## System Requirements

- **OS:** Windows 7, 10, 11, or Windows Server 2016+
- **Architecture:** x64 (64-bit)
- **Memory:** 100 MB minimum
- **Disk Space:** 100 MB
- **Port:** 3001 (or configured port) must be available

## Uninstallation

### If Running as Service

```powershell
node service-uninstall.js
```

### If Running Directly

- Simply delete the `.exe` file
- Configuration in `.env` file will be removed

## Security Notes

✅ Application is obfuscated (source code protected)  
✅ Bundled runtime (no external dependencies)  
✅ Standalone executable (no installation required)

⚠️ Important:

- Keep `.env` file secure (contains configuration)
- Restrict folder access to authorized users
- Use HTTPS in production if accessing remotely
- Regularly monitor event logs

## Getting Help

If the service doesn't start:

1. **Run diagnostics:**

   ```powershell
   powershell -ExecutionPolicy Bypass -File diagnose.ps1
   ```

2. **Check Windows Event Viewer:**

   ```powershell
   eventvwr.msc
   ```

3. **Try a different port:**
   - Edit `.env` and change PORT to 3002, 3003, etc.

4. **Run as administrator:**
   - Right-click → Run as Administrator

## Advanced Configuration

### Custom Port

```
Edit .env:
PORT=8080
```

### Verbose Logging

```
Edit .env:
LOG_LEVEL=debug
```

### CORS Configuration

```
Edit .env to add:
ALLOWED_ORIGINS=http://localhost:3000,https://myapp.com
```

## Performance

Typical resource usage:

- **Startup Time:** 2-3 seconds
- **Memory:** 50-100 MB
- **CPU:** <5% idle

## Support

For issues, try:

1. Check diagnostics: `powershell -ExecutionPolicy Bypass -File diagnose.ps1`
2. Review Windows Event Viewer logs
3. Verify port availability: `netstat -ano | findstr :3001`
4. Check `.env` file is present
5. Run as Administrator

---

**Version:** 1.0.0  
**Build Date:** April 10, 2026  
**Platform:** Windows x86-64
