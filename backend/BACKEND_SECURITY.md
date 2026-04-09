# Backend Security Implementation: Request Signing & TSA

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│  FRONTEND (Angular)                                     │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 1. User uploads PDF + enters PIN                   │ │
│  │ 2. Sign request with HMAC-SHA256                   │ │
│  │ 3. Add headers: X-Request-Signature, Timestamp      │ │
│  │ 4. POST to /api/sign                               │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                         ↓ (HTTPS)
┌─────────────────────────────────────────────────────────┐
│  BACKEND (Node.js + Express)                            │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Middleware: RequestSignerMiddleware                │ │
│  │ • Verify X-Request-Signature header                │ │
│  │ • Check timestamp freshness (95 minutes)           │ │
│  │ • Constant-time comparison                         │ │
│  │ ✓ Request authentic → pass to handler              │ │
│  │ ✗ Invalid signature → return 401 Unauthorized      │ │
│  └────────────────────────────────────────────────────┘ │
│                         ↓                                │
│  ┌────────────────────────────────────────────────────┐ │
│  │ SignHandler                                         │ │
│  │ • Load PDF with pdf-lib                            │ │
│  │ • Add signature stamp                              │ │
│  │ • Hash PDF (SHA-256)                               │ │
│  │ • Sign with USB token (RSA)                        │ │
│  │ • Request unique timestamp from TSA               │ │
│  │ • Build PKCS#7/CMS structure                       │ │
│  │ • Embed signature block in PDF                     │ │
│  └────────────────────────────────────────────────────┘ │
│                         ↓                                │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Timestamp Authority (TSA)                          │ │
│  │ • Quovadis (http://timestamp.quovadis.com/tsa)    │ │
│  │ • Cryptographically signed timestamp               │ │
│  │ • RFC 3161 TimeStampToken (DER-encoded)            │ │
│  │ • NO LOCAL FALLBACK - mandatory for legal validity │ │
│  └────────────────────────────────────────────────────┘ │
│                         ↓                                │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Output: Signed PDF                                 │ │
│  │ Headers:                                           │ │
│  │ • X-Signature-Format: PKCS#7/CMS                   │ │
│  │ • X-TSA-Enabled: true                              │ │
│  │ • X-Signed-Date: ISO timestamp                     │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                         ↓ (HTTPS)
┌─────────────────────────────────────────────────────────┐
│  FRONTEND (Angular)                                     │
│  • Download signed PDF                                  │
│  • Display success message                              │
└─────────────────────────────────────────────────────────┘
```

## Request Signing Flow

### Step 1: Frontend Signs Request

**Input:**

- Method: `POST`
- Path: `/api/sign`
- Timestamp: `1712700160000` (milliseconds)
- Shared Secret: `REQUEST_SIGNER_SECRET`

**Signature Generation:**

```typescript
signedMessage = 'POST\n/api/sign\n1712700160000';
signature = HMAC - SHA256(REQUEST_SIGNER_SECRET, signedMessage);
result = 'a1b2c3d4e5f... (hex)';
```

### Step 2: Frontend Sends Headers

```http
POST /api/sign HTTP/1.1
X-Request-Signature: a1b2c3d4e5f6g7h8...
X-Request-Timestamp: 1712700160000
Content-Type: multipart/form-data
```

### Step 3: Backend Verifies

```typescript
// RequestSignerMiddleware.verifyRequestSignature()
receivedSignature = "a1b2c3d4e5f6g7h8..."
receivedTimestamp = 1712700160000

// Reconstruct signed message
signedMessage = "POST\n/api/sign\n1712700160000"

// Compute expected signature
expectedSignature = HMAC-SHA256(REQUEST_SIGNER_SECRET, signedMessage)

// Constant-time comparison
if (crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
  ✓ VALID - proceed to signing
} else {
  ✗ INVALID - return 401 Unauthorized
}

// Also verify timestamp
timeDiff = Math.abs(Date.now() - receivedTimestamp)
if (timeDiff > 300000) {  // 5 minutes
  ✗ TOO OLD - return 401 "Timestamp too old"
}
```

## TSA (Timestamp Authority) Integration

### What TSA Does

1. **Receives**: Hash of signed PDF (SHA-256)
2. **Timestamping**: Adds cryptographic proof: "This hash existed at THIS exact time"
3. **Returns**: TimeStampToken (RFC 3161, DER-encoded)

### Why It's Important

**Without TSA:**

```
Attacker could claim:
"I signed this document on 2020-01-01"  ← Can't prove or disprove
```

**With TSA:**

```
Timestamp proof from Quovadis:
"This signature was created on 2024-04-09 13:02:40 UTC"
Signed by TSA → can't be forged
```

### PKCS#7/CMS Structure

```
SignedData
├── Version: 3
├── DigestAlgorithms: SHA-256
├── ContentInfo
│   └── OID: 1.2.840.113549.1.7.1 (data)
├── Certificates
│   └── Signer's X.509 certificate (from USB token)
├── SignerInfos
│   └── SignerInfo
│       ├── DigestAlgorithm: SHA-256
│       ├── AuthenticatedAttributes
│       │   ├── ContentType
│       │   ├── MessageDigest (hash of PDF)
│       │   └── SigningTime
│       ├── Signature (RSA by USB token)
│       └── UnsignedAttributes
│           └── TimeStampToken (from TSA) ← Digital proof of time
```

## Setup Instructions

### 1. Configure Secrets

**Backend (.env)**:

```bash
# Generate random secrets
openssl rand -hex 32  # Output: a1b2c3d4...

# Edit .env
REQUEST_SIGNER_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
REQUEST_SIGNER_TOLERANCE=300000
ENABLE_TSA=true
TSA_URL=http://timestamp.quovadis.com/tsa
```

**Frontend (.env or config)**:

```
REQUEST_SIGNER_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

**⚠️ CRITICAL**: Both must use the **same secret**!

### 2. Test Request Signing

```bash
# Terminal
TIMESTAMP=$(date +%s)000
SECRET="your-secret-here"
SIGNATURE=$(echo -n "POST\n/api/sign\n${TIMESTAMP}" | \
  openssl dgst -sha256 -mac HMAC -macopt key:${SECRET} | \
  sed 's/^(stdin)= //')

echo "Signature: ${SIGNATURE}"
echo "Timestamp: ${TIMESTAMP}"

# Test request
curl -X POST http://localhost:45763/api/sign \
  -H "X-Request-Signature: ${SIGNATURE}" \
  -H "X-Request-Timestamp: ${TIMESTAMP}" \
  -F "file=@test.pdf" \
  -F "pin=1234"
```

### 3. Monitor TSA in Production

Check logs for:

```
[signHandler] Requesting timestamp from TSA...
[signHandler] Timestamp obtained successfully ✓
```

If TSA fails:

```
[signHandler] TSA FAILED - signature cannot proceed without timestamp
```

## Security Checklist

- [ ] REQUEST_SIGNER_SECRET configured on backend
- [ ] REQUEST_SIGNER_SECRET matches on frontend
- [ ] HTTPS enabled (never HTTP in production)
- [ ] Secrets not committed to git
- [ ] TSA_URL set to production-grade TSA
- [ ] Request signature verification logs enabled
- [ ] Timestamp validation working (test with old timestamp)

## Troubleshooting

### "Invalid request signature"

- Check REQUEST_SIGNER_SECRET matches on both sides
- Verify timestamp is current (not old/cached)
- Check request path is exactly `/api/sign`

### "Timestamp too old"

- Frontend clock out of sync with backend
- Increase REQUEST_SIGNER_TOLERANCE if needed
- Verify both machines have correct system time

### TSA timeout

- Check internet connectivity
- Try alternate TSA endpoint
- Check TSA server status: https://timestamp.quovadis.com/

## Files Modified

**Backend:**

- Added: `src/middleware/request-signer.middleware.ts` (request verification)
- Updated: `src/routes/sign.route.ts` (apply middleware)
- Updated: `src/controllers/sign.controller.ts` (enforce TSA)
- Updated: `.env` (new secrets)

**Frontend:**

- Updated: `src/app/services/dsc.service.ts` (sign requests)
- Added: `src/app/services/request-signer.service.ts` (signing utilities)

**Documentation:**

- Created: `REQUEST_SIGNING.md` (setup guide)
- Created: `BACKEND_SECURITY.md` (this file)
