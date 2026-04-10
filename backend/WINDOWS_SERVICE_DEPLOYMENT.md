# DSC Signer - Windows Service Deployment Checklist

## ✅ Build Status
- [x] Code obfuscated successfully (`dist/server.js` - 50K+ lines)
- [x] Windows executable created: `dsc-signer-win.exe` (43.06 MB)
- [x] Linux executable created: `dsc-signer-linux` (51.29 MB)
- [x] macOS executable created: `dsc-signer-macos` (56.04 MB)

## 📦 Package Contents

### Windows Service (`dsc-signer-win.exe`)
```
Type: PE32+ executable (x86-64, console mode)
Size: 43.06 MB
Includes: Node.js 18.5.0 runtime + all dependencies
Ready to run: No external dependencies required
```

### Deployment Steps (Windows)

#### 1. **Prepare Files**
```bash
# Copy the executable to target location
Copy-Item .\release\dsc-signer-win.exe -Destination "C:\Program Files\DSC-Signer\"
Copy-Item .\src\.env.example -Destination "C:\Program Files\DSC-Signer\.env"
```

#### 2. **Configure Service**
Edit `C:\Program Files\DSC-Signer\.env`:
```env
PORT=3001
NODE_ENV=production
LOG_LEVEL=info
# Add other configuration as needed
```

#### 3. **Install as Windows Service** (Admin required)
```powershell
# Run as Administrator
cd C:\Program Files\DSC-Signer
node service-install.js
```

Expected output:
```
✅ Service installed successfully!
📋 Service Name: DSC-Signer
   Start: net start DSC-Signer
   Stop:  net stop DSC-Signer
```

#### 4. **Verify Installation**
```powershell
# Check service properties
Get-Service | Where-Object {$_.Name -eq 'DSC-Signer'}

# Verify it's running
sc query DSC-Signer
```

#### 5. **Start the Service**
```powershell
# Manual start
net start DSC-Signer

# Or through Services
services.msc
  → Find "DSC-Signer"
  → Right-click → Start
```

#### 6. **Test Connectivity**
```bash
# Test the API endpoint
curl http://localhost:3001/health

# Check service logs in Event Viewer
eventvwr.msc
  → Windows Logs → Application
  → Look for "DSC-Signer" entries
```

## 🔧 Service Management Commands

```powershell
# Start service
net start DSC-Signer

# Stop service
net stop DSC-Signer

# Restart service
net stop DSC-Signer && net start DSC-Signer

# Check status
sc query DSC-Signer

# View service in GUI
services.msc
```

## 🛠️ Troubleshooting

### Service Won't Start
1. **Check Event Viewer**
   ```powershell
   eventvwr.msc
   # Navigate to: Windows Logs > Application
   # Search for error entries with source "DSC-Signer"
   ```

2. **Verify Configuration**
   - Ensure `.env` file exists in the same directory as executable
   - Check for permission issues on `.env` file
   - Verify PORT is not already in use

3. **Check Port Usage**
   ```powershell
   netstat -ano | findstr :3001
   # If found, the port is in use - change PORT in .env
   ```

### Certificate/USB Token Issues
- Verify Hypersecu USB token is connected
- Check Windows Device Manager for driver issues
- Test with the frontend application first

### Permission Denied
- Run Command Prompt/PowerShell **as Administrator**
- Check file permissions: right-click → Properties → Security
- Account running service needs read access to executable and config

## 📊 Monitoring

### Windows Event Viewer
```powershell
# Open Event Viewer
eventvwr.msc

# View real-time logs
Get-EventLog -LogName Application -Source "DSC-Signer" -Newest 20
```

### Performance Monitoring
```powershell
# Monitor process in Task Manager
Get-Process | Where-Object {$_.ProcessName -like "*dsc-signer*"}

# Check memory usage
Get-Process | Where-Object {$_.Name -like "*dsc-signer*"} | Select-Object Name, WorkingSet64
```

## 🔄 Updates & Maintenance

### Updating the Application
1. **Stop the service**
   ```powershell
   net stop DSC-Signer
   ```

2. **Build new version**
   ```bash
   npm run full-build
   ```

3. **Replace executable**
   ```powershell
   Copy-Item .\release\dsc-signer-win.exe -Destination "C:\Program Files\DSC-Signer\" -Force
   ```

4. **Restart service**
   ```powershell
   net start DSC-Signer
   ```

### Uninstalling Service
```powershell
# Run as Administrator
cd "C:\Program Files\DSC-Signer"
node service-uninstall.js
```

## 🔐 Security Checklist

- [x] Code is obfuscated (prevents reverse engineering)
- [x] Standalone executable (no source code exposed)
- [ ] Use HTTPS in production (configure certificate)
- [ ] Secure `.env` file permissions (restricted access)
- [ ] Enable Windows Firewall rules (allow only necessary ports)
- [ ] Regular backups of configuration files
- [ ] Monitor event logs for errors
- [ ] Keep Windows and Node.js updated

## 📋 Configuration Reference

### Environment Variables (.env)
```env
# Core
PORT=3001
NODE_ENV=production
LOG_LEVEL=info

# Database/API Settings
# Add as needed based on your configuration

# Token/Certificate Settings
# Configure Hypersecu USB token paths
# Configure certificate paths
```

### Firewall Rules (Windows)
```powershell
# Allow inbound on port 3001
netsh advfirewall firewall add rule name="DSC-Signer" dir=in action=allow protocol=tcp localport=3001 profile=public

# Remove rule if needed
netsh advfirewall firewall delete rule name="DSC-Signer"
```

## 📞 Support

**For issues:**
1. Check Windows Event Viewer (eventvwr.msc)
2. Review error logs for specific error codes
3. Verify service status: `sc query DSC-Signer`
4. Check documentation in `BACKEND_SECURITY.md`
5. Verify USB token connection and drivers

**Service Location:** `C:\Program Files\DSC-Signer\`

**Log Location:** Windows Event Viewer → Application logs

---

**Build Date:** April 10, 2026  
**Version:** 1.0.0  
**Platform:** Windows x86-64
