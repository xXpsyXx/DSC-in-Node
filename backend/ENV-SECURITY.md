# .env Security Implementation

## ✅ Problem Solved

**Before**: The `.env` file containing production secrets (API keys, database credentials, etc.) was being copied to the installer and deployment packages, making it readable in plaintext.

**After**: `.env` is now **never included** in any build artifacts. Instead, only `.env.example` is provided as a template.

## 🔒 Security Measures

### 1. Deploy Build (deploy-build.ps1)

✅ **Does NOT copy `.env` file to dist/**

- Creates `.env.example` template only
- Shows warning if `.env` exists in source repo
- Service installer checks that `.env` exists on target before proceeding
- Secures `.env` permissions to SYSTEM + Admins only

### 2. Inno Setup Build (build-installer-payload.ps1)

✅ **Does NOT include `.env` in installer**

- Creates `.env.example` template in payload
- Shows security warning during build
- Users must create `.env` manually on target machine

### 3. Version Control (.gitignore)

✅ **`.env` is never committed to git**

- Added to `.gitignore` to prevent accidental commits
- `.env.example` can be committed (no secrets)

## 📋 Deployment Workflow

### On Build Machine (Windows)

```powershell
# Run build (no .env needed)
npm run deploy:build

# Creates dist/ with:
# - DSCBackend.exe
# - .env.example (template, no secrets)
# - install-service.ps1
# - node_modules/pkcs11js
# (NO .env file)
```

### On Target Machine

```powershell
# 1. Copy dist/ folder to target
# 2. Create .env from template
Copy-Item '.env.example' '.env'

# 3. Edit with actual secrets (NEVER share this file!)
notepad .env

# 4. Set secure permissions
icacls .env /inheritance:r /grant:r "%USERNAME%:F"

# 5. Install as service
.\install-service.ps1
```

## 🛡️ Security Best Practices

### ✅ DO

- [x] Keep `.env` on target machine only
- [x] Protect `.env` with restrictive file permissions
- [x] Use environment variables for secrets
- [x] Rotate secrets regularly
- [x] Store `.env` example in version control (for reference)
- [x] Backup `.env` securely (encrypted)

### ❌ DON'T

- [ ] Never commit `.env` to version control
- [ ] Never email or share `.env` file
- [ ] Never expose `.env` in logs or error messages
- [ ] Never store `.env` in public cloud (unencrypted)
- [ ] Never deploy with example values - change them!

## 🔐 File Permissions

### On Windows (install-service.ps1)

The script automatically sets:

```
.env (Maximum Security)
  ✓ SYSTEM: Full Control (only entity that can read)
  ✗ Administrators: No Access (blocked from reading secrets)
  ✗ Everyone Else: No Access
  ✗ No Inheritance from Parent
```

Why SYSTEM only?

- Service runs as SYSTEM account, needs to read configuration
- Even local administrators cannot view production secrets
- Prevents unauthorized secret exposure
- Isolates secrets to service process only

### Verification

```powershell
# Check permissions
icacls "C:\path\to\.env"

# Output should show ONLY:
# NT AUTHORITY\SYSTEM:(I)(F)
```

## 📝 Template Files

### .env.example (included in distribution)

```env
# No secrets - just shows what variables are available
PORT=5000
REQUEST_SIGNER_SECRET=your-secret-key-here-change-this
API_TIMEOUT=30000
```

### .env (created on target machine)

```env
# Real secrets - NEVER shared or committed
PORT=5000
REQUEST_SIGNER_SECRET=your-actual-secret-xyz123abc...
API_TIMEOUT=30000
```

## 🚨 If .env is Compromised

If your `.env` file is leaked or exposed:

1. **Immediate**: Rotate all secrets immediately
2. **Update**: Change all secret values in `.env`
3. **Restart**: Restart service to load new values
4. **Notify**: Alert users if credentials were exposed
5. **Audit**: Check logs for unauthorized access

Commands:

```powershell
# Change secret in .env
notepad .env

# Restart service
Restart-Service -Name DSCBackendService

# Check logs for suspicious activity
Get-Content "C:\path\to\logs\err.log" -Tail 50
```

## 📊 Security Comparison

| Aspect                  | OLD                  | NEW                       |
| ----------------------- | -------------------- | ------------------------- |
| `.env` in installer     | ✗ Included (SECRET!) | ✓ NOT included            |
| `.env` in dist/ folder  | ✗ Copied (SECRET!)   | ✓ NOT copied              |
| `.env` readable by all  | ✗ YES (DANGEROUS!)   | ✓ NO (System Only)        |
| Permissions management  | ✗ None               | ✓ System exclusive access |
| Admins can read secrets | ✗ Could leak         | ✓ NO (blocked)            |
| Template provided       | ✗ No                 | ✓ Yes (.env.example)      |
| Version control         | ✗ Could leak         | ✓ .gitignore safe         |

## ✅ Verification Checklist

After deployment, verify security:

```powershell
# 1. Check .env is ONLY accessible by SYSTEM
icacls ".env"
# Should return ONLY:
#   NT AUTHORITY\SYSTEM:(I)(F)
# Should NOT show Administrators or anyone else

# 2. Verify Admins cannot read it
Get-Content ".env"
# Should return: Access Denied (or show nothing)
# (even for administrators without SYSTEM privilege)

# 3. Check .env.example exists (template)
Test-Path ".env.example"
# Should return: True

# 4. Verify service can read secrets
Get-Service -Name DSCBackendService | Start-Service
# Should start without errors

# 5. Check logs for "environment" loaded successfully
Get-Content "logs\out.log" | Select-String "env|config"
```

## 🔍 Audit Trail

All deployment scripts now log security actions:

```
[13:45:22] ✓ Created .env.example template
[13:45:23] ⚠️  WARNING: .env file exists in source directory
[13:45:24] ⚠️  For security, .env is NOT automatically copied to dist/
[13:45:25] ✓ Creating .env.example template (do NOT include .env for security!)
[13:45:26] ⚠️  SECURITY NOTE: .env file is NOT included in installer
[13:45:27] ⚠️  SECURITY ALERT: .env file not found!
[13:45:28] ✓ .env permissions restricted (SYSTEM + Admins only)
```

## 📚 References

- [.NET FileSystemRights](https://docs.microsoft.com/en-us/dotnet/api/system.security.accesscontrol.filesystemrights)
- [Windows File Permissions](https://docs.microsoft.com/en-us/windows/win32/secauthz/access-control)
- [PowerShell icacls Documentation](https://docs.microsoft.com/en-us/windows-server/administration/windows-commands/icacls)
- [Environment Variables Best Practices](https://12factor.net/config)

---

**Version**: 1.0.0  
**Last Updated**: April 2026  
**Status**: ✅ Security hardened
