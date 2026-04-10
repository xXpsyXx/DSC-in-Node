# Local Backend Setup & Testing Guide (v2.0)

**Last Updated:** April 10, 2026  
**Status:** Production-Ready for Local Development

---

## Overview

This guide covers setting up and testing the **Local Backend (localbackend)** configuration for DSC-in-Node. The local backend runs on `http://localhost:45763` and serves as the signing agent for PDF digital signatures.

### Architecture

```
Frontend (Angular)
    │
    ├─ HMAC-SHA256 Request Signing (Local Development)
    │  OR
    └─ JWT Token (Production Backend - Future Integration)
             │
             ▼
    Local Backend (localhost:45763)
    ├─ Request Signature Verification
    ├─ Optional JWT Verification
    ├─ PDF Signing (USB Token)
    ├─ TSA Integration (RFC 3161)
    └─ PKCS#7/CMS Encoding
```

---

## Prerequisites

### Required Software

- **Node.js:** v18+ (v22.14.0 recommended)
- **npm:** 9+
- **TypeScript:** 6.0+
- **USB DSC Token:** Hypersecu ePass3000 or compatible PKCS#11 token
- **PKCS#11 Driver:** Must be installed & configured

### Environment Setup

```bash
cd /home/psy/Projects/DSC-in-Node/backend

# Install dependencies
npm install

# Verify installation
npm list

# Check critical packages
npm list @types/express jsonwebtoken express
```

---

## Configuration (localbackend)

### Backend .env Setup

```bash
# backend/.env

# Server
PORT=45763
NODE_ENV=production

# Request Signing (HMAC-SHA256 - Local Development)
REQUEST_SIGNER_SECRET=your-request-signer-secret-change-this-in-production
REQUEST_SIGNER_TOLERANCE=300000  # 5 minutes

# JWT Authentication (Disabled by Default)
ENABLE_JWT_AUTH=false

# Public Key Fetch (for Production Backend Integration - Future)
PUBLIC_KEY_URL=https://api.yourdomain.com/auth/public-keys
KEY_REFRESH_INTERVAL=600000  # 10 minutes

# TSA Configuration (RFC 3161)
TSA_URL=http://timestamp.quovadis.com/tsa

# PKCS#11 USB Token Driver
PKCS11_LIBRARY_PATH_WINDOWS=C:\\Windows\\System32\\eps2003csp11v2.dll
PKCS11_LIBRARY_PATH_LINUX=/usr/lib/libcastle_v2.so

# Security
MAX_REQUEST_SIZE_MB=10
RATE_LIMIT=10
```

### Frontend Configuration

The frontend is **already configured** to use `http://localhost:45763/api`:

```typescript
// frontend/src/app/services/dsc.service.ts
private apiUrl = 'http://localhost:45763/api';

// Request signer secret (must match backend .env)
private readonly REQUEST_SIGNER_SECRET = 'your-request-signer-secret-change-this-in-production';
```

**⚠️ Important:** Update `REQUEST_SIGNER_SECRET` in both backend `.env` and frontend service if you change it.

---

## Starting the Backend

### Development Mode (with auto-reload)

```bash
cd backend

# Start with tsx (auto-reload on file changes)
npm run dev

# Output:
# DSC Helper running on http://localhost:45763
```

### Production Mode

```bash
cd backend

# Start with Node.js
npm start

# Output:
# DSC Helper running on http://localhost:45763
```

### Health Check

```bash
# In another terminal
curl http://localhost:45763/health

# Expected Response:
# Helper app running
```

---

## Testing Endpoints

### 1. **Sign PDF Endpoint**

**Endpoint:** `POST /api/sign`

**Authentication:** HMAC-SHA256 Request Signing (frontendautomatically signs)

**Test with curl (Manual Signature):**

```bash
#!/bin/bash

# Configuration
BACKEND_URL="http://localhost:45763"
API_ENDPOINT="/api/sign"
SECRET="your-request-signer-secret-change-this-in-production"

# Get current timestamp
TIMESTAMP=$(date +%s)000

# Create signed message
SIGNED_MESSAGE="POST\n${API_ENDPOINT}\n${TIMESTAMP}"

# Compute HMAC-SHA256
SIGNATURE=$(echo -ne "$SIGNED_MESSAGE" | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)

echo "=== Signing Request ==="
echo "Timestamp: $TIMESTAMP"
echo "Signature: $SIGNATURE"

# Make request with signature headers
curl -X POST "$BACKEND_URL$API_ENDPOINT" \
  -H "X-Request-Signature: $SIGNATURE" \
  -H "X-Request-Timestamp: $TIMESTAMP" \
  -F "file=@test-document.pdf" \
  -F "pin=1234" \
  -o signed-document.pdf
```

**Expected Response:**

- Status: 200 OK
- Body: Signed PDF (binary)
- Headers: `X-Signed-Date`, `X-Cert-Days-Remaining`, etc.

### 2. **Verify Signature Endpoint**

**Endpoint:** `POST /api/verify`

**Test:**

```bash
curl -X POST http://localhost:45763/api/verify \
  -F "file=@signed-document.pdf" \
  -H "Content-Type: multipart/form-data"
```

**Expected Response:**

```json
{
  "isValid": true,
  "fileName": "signed-document.pdf",
  "hash": "a1b2c3d4...",
  "signature": {
    "name": "John Doe",
    "reason": "Document Approval",
    "date": "2026-04-10T15:30:00Z",
    "contentLength": 2048
  },
  "verification": {
    "status": "valid",
    "message": "Signature is valid",
    "cryptographicallyValid": true
  }
}
```

### 3. **Certificate Status Endpoint**

**Endpoint:** `POST /api/cert-status`

**Test:**

```bash
curl -X POST http://localhost:45763/api/cert-status \
  -F "pin=1234"
```

**Expected Response:**

```json
{
  "status": "valid",
  "daysRemaining": 180,
  "expiryDate": "2026-10-08T00:00:00Z",
  "signerName": "John Doe",
  "message": "Certificate valid"
}
```

### 4. **Auto-Detect Token Endpoint**

**Endpoint:** `GET /api/auto-detect-token`

**Test:**

```bash
curl http://localhost:45763/api/auto-detect-token
```

**Expected Response:**

```json
{
  "detected": true,
  "driverName": "Hypersecu ePass3000",
  "driverPath": "C:\\Windows\\System32\\eps2003csp11v2.dll",
  "message": "USB token detected"
}
```

### 5. **Supported Drivers Endpoint**

**Endpoint:** `GET /api/supported-drivers`

**Test:**

```bash
curl http://localhost:45763/api/supported-drivers
```

---

## Frontend Integration Testing

### Setup

```bash
cd frontend

# Install dependencies
npm install

# Check frontend configuration
grep -n "apiUrl\|REQUEST_SIGNER_SECRET" src/app/services/dsc.service.ts
```

### Run Frontend

```bash
# Development mode (with auto-reload)
npm start

# Open browser: http://localhost:4200
```

### Test Signing Flow

1. **Navigate to localhost:4200**
2. **Upload a PDF** using the "PDF Signer" component
3. **Enter USB Token PIN** (e.g., 1234)
4. **Click "Sign PDF"**
5. **Observe signing process:**
   - ✅ Request signature automatically computed
   - ✅ PDF sent to local backend with headers
   - ✅ Backend verifies signature
   - ✅ Signed PDF downloaded
6. **Verify signature:**
   - Upload signed PDF to "Verify Signature" component
   - Verify results displayed

---

## Middleware & Authentication Flow

### Request Authentication Chain

```
1. Frontend signs request (HMAC-SHA256)
   ├─ Timestamp = Date.now()
   ├─ Message = "POST\n/api/sign\n{timestamp}"
   └─ Signature = HMAC(SECRET, message)

2. Frontend adds headers
   ├─ X-Request-Signature: {signature}
   └─ X-Request-Timestamp: {timestamp}

3. Backend receives request
   └─ combinedAuthMiddleware()
      ├─ Check Authorization header (JWT) - if present
      │  └─ If JWT: Skip HMAC, use JWT auth
      │
      └─ No JWT header: Use HMAC-SHA256
         ├─ Extract signature & timestamp
         ├─ Verify timestamp freshness (5 min tolerance)
         ├─ Reconstruct signed message
         ├─ Constant-time comparison
         └─ ✓ Proceed or ✗ 401 Unauthorized

4. Handler processes authenticated request
```

### HMAC Verification Tolerance

```typescript
// backend/.env
REQUEST_SIGNER_TOLERANCE = 300000; // 5 minutes (milliseconds)

// If request timestamp is older than 5 minutes:
// → 401 Unauthorized: "Timestamp too old"
```

### JWT Support (Future - Disabled by Default)

```typescript
// backend/.env
ENABLE_JWT_AUTH = false; // Disabled for local development

// When enabled:
// 1. JWT verification becomes optional first check
// 2. Falls back to HMAC-SHA256 if no JWT
// 3. Public keys auto-refresh every 10 minutes
```

---

## Error Handling & Troubleshooting

### Common Issues & Solutions

#### 1. **Backend Won't Start**

```bash
# Error: EADDRINUSE: address already in use :::45763

# Solution: Kill process on port
lsof -i :45763
kill -9 <PID>

# Or change port in .env
PORT=45764
```

#### 2. **Authentication Failed (401)**

```
Error: "Invalid request signature"

Causes:
✗ Frontend & backend SECRET mismatch
✗ System clock misalignment (> 5 min diff)
✗ Request took > 5 minutes to send

Solutions:
1. Verify REQUEST_SIGNER_SECRET in both .env files
2. Sync system clocks: timedatectl set-ntp true
3. Check browser → backend latency
```

#### 3. **USB Token Not Detected**

```
Error: "USB token not found" (404) or "PKCS#11 error"

Solutions:
1. Verify token is inserted
2. Check PKCS#11 driver installed:
   Windows: C:\Windows\System32\eps2003csp11v2.dll
   Linux: /usr/lib/libcastle_v2.so
3. Verify path in .env matches actual driver location
4. Test driver manually: pkcs11-tool --list-slots
```

#### 4. **TSA Unavailable (503)**

```
Error: "TSA service unavailable"

Causes:
✗ Network connectivity issue
✗ Timestamp Authority down
✗ Firewall blocking TSA endpoint

Solutions:
1. Test TSA connectivity:
   curl -v http://timestamp.quovadis.com/tsa
2. Check firewall rules
3. Switch to alternate TSA:
   TSA_URL=http://timestamp.globalsign.com/tsa
```

#### 5. **Certificate Expired (403)**

```
Error: "Certificate expired or critical"

Solution:
1. Replace USB token certificate
2. Or allow signing with warning:
   Check BACKEND_SECURITY.md for configuration
```

## Performance Metrics

### Expected Signing Times

```
Operation                         Duration
─────────────────────────────────────────
PDF Parsing (1-10 MB)            50-200 ms
Hash Computation (SHA-256)       20-50 ms
USB Token Authentication (PIN)   100-200 ms
RSA Signature Generation         50-150 ms
TSA Request (RFC 3161)           500-2000 ms
PKCS#7/CMS Assembly              30-80 ms
PDF Embedding                    20-50 ms
─────────────────────────────────────────
TOTAL SIGNING TIME               770-2530 ms
```

### Memory Usage

```
Per Request:  2-6 MB
Max Heap:     512-2048 MB (configurable)
```

Set heap limit:

```bash
node --max-old-space-size=2048 node_modules/tsx/dist/cli.mjs src/server.ts
```

---

## Deployment Checklist (localbackend)

### Before Production Testing

- [ ] Backend compiles without errors (0 errors)
- [ ] Frontend compiles without errors
- [ ] USB token inserted and recognized
- [ ] PKCS#11 driver installed & verified
- [ ] REQUEST_SIGNER_SECRET changed from default
- [ ] Backend starts on port 45763
- [ ] Health check responds: `curl http://localhost:45763/health`
- [ ] Can sign test PDF successfully
- [ ] Can verify signed PDF
- [ ] Certificate status shows valid
- [ ] TSA integration working (logs show timestamp token)
- [ ] Network firewall allows TSA endpoint access
- [ ] Clock synchronized (within 5 seconds of NTP)

### Backend Startup Logs (Expected)

```
[PublicKeyService] JWT authentication is disabled
[sign.route] ✅ REQUEST_SIGNER_SECRET configured
[server] DSC Helper running on http://localhost:45763
```

---

## Next Steps (Production Backend Integration)

### When Ready for Production Integration

1. **Enable JWT Authentication:**

   ```env
   ENABLE_JWT_AUTH=true
   PUBLIC_KEY_URL=https://api.yourdomain.com/auth/public-keys
   ```

2. **Configure Production Backend:**
   - Set up production REST API for JWT issuance
   - Implement public key endpoints
   - Add signature verification & audit logging

3. **Update Frontend:**
   - Add production backend API calls
   - Implement JWT request flow
   - Handle token refresh

4. **Security Review:**
   - HTTPS everywhere
   - Enable CORS restrictions
   - Implement rate limiting
   - Add request logging & audit trails

---

## Support & Debugging

### Enable Verbose Logging

```bash
# Development mode with debug output
DEBUG=* npm run dev

# Or specific modules
DEBUG=sign:* npm run dev
```

### Check System Compatibility

```bash
# Node.js version
node --version  # Should be v18+

# npm version
npm --version  # Should be 9+

# TypeScript version
npx tsc --version  # Should be 6.0+

# PKCS#11 support
npm list pkcs11js
```

### Validate Configuration

```bash
# Check backend .env
cat backend/.env

# Check frontend service
grep -A 5 "apiUrl" frontend/src/app/services/dsc.service.ts

# Verify ports
netstat -ln | grep :45763  # Backend
netstat -ln | grep :4200   # Frontend
```

---

## Document Version

- **Version:** 2.0
- **Last Updated:** April 10, 2026
- **Status:** Complete with JWT Support & Full Testing Guide
