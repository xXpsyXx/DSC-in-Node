# RETMS API - Digital Signature System Flow

## Overview

This document provides a comprehensive deep-dive into how the RETMS API handles digital signing, key management, and signature verification. It clarifies the role of the **kid** (Key ID) variable and explains how the local app retrieves the public key.

---

## Quick Answers

### Q1: Is "kid" the public key?

**NO.** The `kid` is a **Key Identifier** (e.g., `"key-2026"`), not the public key itself. It's metadata stored in the JWT header to identify which signing key was used.

### Q2: How does the local app get the public key?

The frontend/local app retrieves the public key by making an **unprotected HTTP GET request** to:

```
GET /api/digital-signature/public-key
```

This returns:

```json
{
  "kid": "key-2026",
  "alg": "RS256",
  "use": "sig",
  "publicKey": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBg...\n-----END PUBLIC KEY-----"
}
```

---

## System Architecture

### 1. Key Management Layer

#### 1.1 DscKeyService

**Location:** `src/utils/dsc-key.service.ts`

**Purpose:** Manages the RSA-2048 key pair used for digital signatures.

**Key Features:**

- **Initialization Strategy:** Runs on module init to load or generate keys
- **Source Priority:**
  1. Load from environment variables: `DSC_PRIVATE_KEY` and `DSC_PUBLIC_KEY`
  2. Auto-generate RSA-2048 pair if env vars not set

**Key Pair Specifications:**

```javascript
{
  modulusLength: 2048,        // RSA-2048 encryption strength
  publicKeyEncoding: {
    type: 'spki',             // SubjectPublicKeyInfo format (standard)
    format: 'pem'             // PEM text format (-----BEGIN PUBLIC KEY-----)
  },
  privateKeyEncoding: {
    type: 'pkcs8',            // PKCS#8 format (standard)
    format: 'pem'             // PEM text format
  }
}
```

**Key Service Methods:**

```typescript
getPublicKey(): string
  → Returns PEM-format public key

getPrivateKey(): string
  → Returns PEM-format private key
```

**Flow Diagram:**

```
DscKeyService.onModuleInit()
    ↓
Check ENV: DSC_PRIVATE_KEY & DSC_PUBLIC_KEY
    ├─ YES → Load from environment variables
    └─ NO  → Generate new RSA-2048 keypair using crypto.generateKeyPairSync()
    ↓
Store private & public keys in service
```

---

### 2. Configuration & Key Identification

#### 2.1 Key Identifier (kid)

**What is it?**

- A **string identifier** that tags which key was used to sign a token
- Default value: `"key-2026"`
- Configurable via environment variable: `DSC_SIGNING_KEY_ID`

**Where it's used:**

1. **JWT Header** - Embedded when creating DSC tokens
2. **Public Key Endpoint** - Returned so client knows which key to use for verification

**Configuration Chain:**

```typescript
// In DscKeyService or JwtService:
const kid = this.configService.get<string>('DSC_SIGNING_KEY_ID', { infer: true }) || 'key-2026';

// Result: kid = "key-2026" (either from env or default)
```

**Example JWT Header with kid:**

```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "key-2026"          ← Key identifier (NOT the public key)
}
```

---

### 3. Token Generation (Signing)

#### 3.1 JWT Service

**Location:** `src/utils/jwt.service.ts`

**Purpose:** Creates and validates three types of JWT tokens.

#### 3.2 DSC (Digital Signature Certificate) Token Generation

**When?** When a document needs to be signed.

**Process:**

```
JwtService.generateDscSignToken(payload)
    ↓
[Step 1] Get Configuration
    ├─ Get kid: DSC_SIGNING_KEY_ID or default "key-2026"
    ├─ Get private key: DscKeyService.getPrivateKey()
    └─ Set expiry: 60 seconds
    ↓
[Step 2] Create JWT with header containing kid
    jwt.sign(payload, privateKey, {
      algorithm: 'RS256',           ← RSA with SHA256
      expiresIn: '60s',             ← Very short expiry for security
      header: {
        alg: 'RS256',
        typ: 'JWT',
        kid: 'key-2026'             ← KEY IDENTIFIER (your answer!)
      }
    })
    ↓
[Step 3] Return signed token
    eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImtleS0yMDI2In0...
```

**Full JWT Structure:**

```
HEADER.PAYLOAD.SIGNATURE

Header (base64url-decoded):
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "key-2026"
}

Payload (base64url-decoded):
{
  "iat": 1618641234,
  "exp": 1618641294,
  "sub": "user123",
  "purpose": "document_signing"
  // ... other claims
}

Signature: RSA-SHA256(
  base64url(header).base64url(payload),
  privateKey
)
```

**Why RS256 (RSA-based) instead of HS256 (HMAC)?**

- RS256 allows **asymmetric verification** - anyone can verify with public key
- HS256 requires sharing the secret - cannot expose to frontend safely
- For DSC tokens: Public key is intentionally public, private key stays server-side

---

### 4. Public Key Distribution (Client Retrieval)

#### 4.1 Digital Signature Controller

**Location:** `src/modules/digital-signature/controllers/digital-signature.controller.ts`

**Key Endpoint:**

```typescript
@Get('public-key')
@UseGuards(OptionalAuthGuard)  // NO authentication required
getPublicKey() {
  const kid = this.configService.get<string>('DSC_SIGNING_KEY_ID', { infer: true }) || 'key-2026';
  const publicKey = this.dscKeyService.getPublicKey();

  return {
    kid,                    // Key identifier so client knows which key this is
    alg: 'RS256',          // Algorithm used
    use: 'sig',            // Use: signature verification
    publicKey             // The actual public key in PEM format
  };
}
```

**HTTP Request/Response:**

```
REQUEST:
GET /api/digital-signature/public-key
Accept: application/json

RESPONSE (200 OK):
{
  "kid": "key-2026",
  "alg": "RS256",
  "use": "sig",
  "publicKey": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A\nMIIBIjANBgkqhkiG....",
  "timestamp": 1618641234
}
```

**Why is this endpoint unprotected?**

- Public keys are inherently PUBLIC
- Clients need to access it without authentication to verify signatures
- No security risk - asymmetric cryptography design

---

### 5. Complete Signing Flow

#### 5.1 High-Level Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                 CLIENT APPLICATION (Frontend)                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    [Step 1] Fetch Public Key
                    GET /api/digital-signature/public-key
                              ↓
        ┌───────────────────────────────────────────┐
        │ SERVER RESPONSE:                          │
        │ {                                         │
        │   kid: "key-2026",                       │
        │   alg: "RS256",                          │
        │   publicKey: "-----BEGIN PUBLIC KEY---"  │
        │ }                                         │
        └───────────────────────────────────────────┘
                              ↓
        [Step 2] Client stores publicKey for later verification
                              ↓
        ┌─────────────────────────────────────────────────────┐
        │ CLIENT: User selects document to sign               │
        │ Prepares: filename, fileHash, documentType, etc.   │
        └─────────────────────────────────────────────────────┘
                              ↓
        [Step 3] Request DSC token from server
        POST /api/digital-signature/request-signing
        {
          filename: "document.pdf",
          fileHash: "abc123...",
          documentType: "IR1"
        }
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                         SERVER SIDE                             │
├─────────────────────────────────────────────────────────────────┤
│  [Step 4a] JwtService.generateDscSignToken()                   │
│                                                                 │
│  - Get DscKeyService.getPrivateKey()                           │
│  - Get kid = "key-2026"                                        │
│  - Create JWT header: { alg, typ, kid }                        │
│  - Sign with PRIVATE KEY using RS256                          │
│                                                                 │
│  Returns: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImtleS0... │
└─────────────────────────────────────────────────────────────────┘
                              ↓
        [Step 4b] Response to client
        {
          dscSignToken: "eyJhbGciOiJSUzI1NiI...",
          requestId: "req_xyz",
          fileHash: "abc123..."
        }
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   CLIENT: SIGNATURE VERIFICATION                │
├─────────────────────────────────────────────────────────────────┤
│  [Step 5] Client has:                                           │
│   - dscSignToken (JWT)                                          │
│   - publicKey (from Step 1)                                     │
│   - fileHash (original data)                                    │
│                                                                 │
│  [Step 6] Verify JWT locally:                                  │
│   - Extract header: { alg: "RS256", kid: "key-2026" }          │
│   - Use publicKey + RS256 to verify SIGNATURE                  │
│   - Check expiry (60 seconds)                                   │
│   - Validate claims                                             │
│                                                                 │
│  Result: ✓ Token is valid and genuinely signed by server      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
[Step 7] Client can now trust the signed document
         and proceed with digital document submission
```

#### 5.2 Sequence Diagram

```
Client                Server                DscKeyService
  │                     │                         │
  ├───GET /public-key──→│                         │
  │                     │──getPublicKey()────────→│
  │                     │←────publicKey──────────│
  │←──{kid, publicKey}─│                         │
  │                     │                         │
  │      {Store publicKey for verification}      │
  │                     │                         │
  ├──POST /request-signing──→│                    │
  │   {filename, fileHash}   │                    │
  │                          │──getPrivateKey()──→│
  │                          │←────privateKey────│
  │                          │                    │
  │                    {JWT.sign with privateKey}
  │                          │                    │
  │←──{dscSignToken, requestId}─│                 │
  │                     │                         │
  │   {Verify JWT locally using stored publicKey}
  │                     │                         │
  ├──POST /submit-signature──→│                   │
  │     {dscSignToken, PDF}    │                  │
  │                     {Verify signature}       │
  │                     {Store document}         │
  │←─────{success}──────│                         │
```

---

### 6. Signature Verification (Backend)

#### 6.1 DscVerificationService

**Location:** `src/modules/digital-signature/services/dsc-verification.service.ts`

**When?** When backend needs to verify a signed PDF document.

**Verification Process:**

```
DscVerificationService.verifyPkcs7Signature(pdfBuffer)
    │
    ├─[Step 1] Extract PKCS#7 signature block from PDF
    │   └─ Read embedded signature bytes from PDF
    │
    ├─[Step 2] Parse signature container
    │   └─ Use node-forge library to decode PKCS#7 structure
    │
    ├─[Step 3] Extract X.509 certificate from signature
    │   └─ This certificate contains the signer's public key
    │
    ├─[Step 4] Get public key from certificate
    │   └─ Extract RSA public key from X.509 (different from app's key!)
    │
    ├─[Step 5] Verify digital signature
    │   ├─ Use node-forge primary verification
    │   └─ Fallback to Node.js crypto if needed
    │
    ├─[Step 6] Validate certificate
    │   ├─ Check expiry dates
    │   ├─ Validate chain
    │   ├─ Check key usage
    │   └─ Check revocation status
    │
    └─[Step 7] Return verification result
        {
          valid: true/false,
          signerName: "...",
          certPem: "-----BEGIN CERTIFICATE-----...",
          certSerial: "...",
          certExpiry: "2026-12-31",
          errors: []
        }
```

**Key Point:** This uses the **certificate's public key**, not the app's key. This is for verifying actual digital signatures on PDFs (different from JWT verification).

---

### 7. Authentication Token Types

The API uses **THREE different token types**:

#### 7.1 Access Token (HS256 - HMAC)

```
PURPOSE: User session authentication
ALGORITHM: HS256 (HMAC-SHA256)
SECRET: ACCESS_TOKEN_KEY (shared secret)
EXPIRY: 15 minutes
USE: Authenticate API requests to protected endpoints
PAYLOAD: { userId, role, permissions }
```

#### 7.2 Refresh Token (HS256 - HMAC)

```
PURPOSE: Get new access token without re-login
ALGORITHM: HS256 (HMAC-SHA256)
SECRET: REFRESH_TOKEN_KEY (different shared secret)
EXPIRY: 7 days
USE: Token refresh endpoint
PAYLOAD: { userId }
```

#### 7.3 DSC Sign Token (RS256 - RSA)

```
PURPOSE: Mark that server authorizes this document signing
ALGORITHM: RS256 (RSA with SHA256)
PUBLIC KEY: Available at /api/digital-signature/public-key
PRIVATE KEY: Kept secret on server (from env or generated)
EXPIRY: 60 seconds (very short!)
USE: Sent to client to prove server authorized this specific sign request
PAYLOAD: { iat, exp, sub, purpose: "document_signing" }
HEADER: { alg, typ, kid: "key-2026" }
```

---

### 8. Key Storage & Environment Configuration

#### 8.1 Environment Variables Required

```bash
# ============== DSC Key Management ==============
# The actual RSA private key (keep this SECRET!)
DSC_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7...
-----END PRIVATE KEY-----

# The corresponding public key (safe to expose)
DSC_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBIjANBgkqhkiG9w0BAQE...
-----END PUBLIC KEY-----

# Key identifier (version/name for this key pair)
DSC_SIGNING_KEY_ID=key-2026

# ============== Token Secrets ==============
# Used for Access Token (HMAC-based)
ACCESS_TOKEN_KEY=your-super-secret-access-key-min-32-chars

# Used for Refresh Token (HMAC-based)
REFRESH_TOKEN_KEY=your-super-secret-refresh-key-min-32-chars

# ============== Token Expiry ==============
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d
```

#### 8.2 Key Source Priority

```
[DscKeyService.onModuleInit()]
    ↓
Check: DSC_PRIVATE_KEY and DSC_PUBLIC_KEY in env?
    ├─ YES → Use them (recommended for production)
    └─ NO  → Generate new RSA-2048 pair dynamically
              (happens on every app restart - NOT recommended for production!)
```

---

### 9. Security Architecture

#### 9.1 Why Asymmetric (RS256) for DSC Tokens?

| Aspect           | HS256 (Symmetric)               | RS256 (Asymmetric)           |
| ---------------- | ------------------------------- | ---------------------------- |
| **Secret**       | Shared between server & client  | Private key server-only      |
| **Verification** | Requires secret = cannot expose | Uses public key = can expose |
| **Use Case**     | Server-to-server                | Server-to-client             |
| **Client Trust** | Can fake tokens (has secret)    | Cannot fake (no private key) |

**RETMS uses both:**

- HS256 for user authentication (server validates)
- RS256 for document signing (client can independently verify)

#### 9.2 Why Such Short Expiry (60s)?

```
DSC Token Lifecycle:
[Request]
  ├─ Generated at T=0
  ├─ Expires at T=60s
  │   ├─ Covers time to sign document
  │   ├─ Covers network latency
  │   ├─ Covers user signing delay (typically < 20s)
  │   └─ Does NOT allow reuse for different documents
  │
  └─ If Not Used Within 60s:
      └─ Request new token (prevents replay attacks)
```

#### 9.3 How Client Verifies Without Exposing It's Real?

```
Step 1: Client gets publicKey from /public-key endpoint
        (This is PUBLIC - anyone can get it)

Step 2: Client receives dscSignToken in JWT format
        (Contains signature made with PRIVATE key)

Step 3: Client uses publicKey to verify JWT.signature
        └─ Only tokens signed with matching privateKey will verify
        └─ Proves server legitimately created this token
        └─ Cannot be faked by attacker (no private key)

Step 4: Client can trust this is real server authorization
        → Proceed with document signing
```

---

### 10. Complete Data Flow Example

#### 10.1 Scenario: User Signs a Document

**Timeline:**

```
T=0s
  User: "I want to sign document.pdf"
  ↓
  Client: GET /api/digital-signature/public-key
  ↓
  Server Response:
  {
    kid: "key-2026",
    alg: "RS256",
    publicKey: "-----BEGIN PUBLIC KEY-----\n..."
  }
  ↓
  Client: Stores publicKey in memory

T=2s
  Client: POST /api/digital-signature/request-signing
  Payload: {
    filename: "document.pdf",
    fileHash: "sha256_abc123...",
    documentType: "IR1"
  }
  ↓
  Server [JwtService.generateDscSignToken()]:
    - kid = "key-2026" (from config)
    - privateKey = DscKeyService.getPrivateKey()
    - Create token with RS256
    - Expiry = current_time + 60s = T=62s
  ↓
  Server Response:
  {
    dscSignToken: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImtleS0yMDI2In0...",
    requestId: "dsc_req_2024_001",
    fileHash: "sha256_abc123..."
  }

T=5s
  Client [Local Verification]:
    - Decode JWT Header: { alg: "RS256", kid: "key-2026" }
    - Extract publicKey (from T=2s)
    - Verify signature using publicKey + RS256
    - Validate expiry: T=5s < T=62s ✓
    - Validate claims
  ↓
  Verification: ✓ PASS - Token is valid

T=8s
  Client: Shows user "Server authorizes signing"
  User: Clicks "Sign" button
  ↓
  Client: Sends signed PDF to server
  POST /api/digital-signature/submit-signature
  Payload: {
    dscSignToken: "eyJhbGciOiJSUzI1NiI...",
    pdf: <binary>,
    requestId: "dsc_req_2024_001"
  }

T=10s
  Server [Processing]:
    ├─ Validate dscSignToken (verify didn't expire)
    ├─ Check requestId matches original request
    ├─ Validate fileHash matches
    ├─ Extract PKCS#7 signature from PDF
    ├─ Verify document signature (using certificate's public key)
    ├─ Check certificate validity
    └─ Store signed document in database

T=11s
  Server Response: { success: true, documentId: "doc_xyz_2024_001" }
  ↓
  User: Document successfully signed ✓

[Scenario Complete]
```

---

### 11. File Locations Summary

| Component                    | File Path                                                                   | Purpose                   |
| ---------------------------- | --------------------------------------------------------------------------- | ------------------------- |
| **Key Service**              | `src/utils/dsc-key.service.ts`                                              | Load/generate RSA keys    |
| **JWT Service**              | `src/utils/jwt.service.ts`                                                  | Create & validate tokens  |
| **Public Key Endpoint**      | `src/modules/digital-signature/controllers/digital-signature.controller.ts` | Expose public key         |
| **Digital Signature Module** | `src/modules/digital-signature/`                                            | Complete signing feature  |
| **Verification Service**     | `src/modules/digital-signature/services/dsc-verification.service.ts`        | Verify PKCS#7 signatures  |
| **Configuration**            | `src/config/configuration.ts`                                               | Load environment settings |
| **Middleware**               | `src/middlewares/middleware.factory.ts`                                     | Handle authentication     |
| **Auth Service**             | `src/modules/auth/services/auth.service.ts`                                 | User login/registration   |

---

### 12. Troubleshooting Guide

#### Issue: Client gets 401 Unauthorized on /public-key

**Root Cause:** Endpoint might be accidentally protected
**Solution:** Check that `@Get('public-key')` has `@UseGuards(OptionalAuthGuard)` or no guards

#### Issue: Token verification fails on client

**Root Cause:**

- publicKey wrong format
- Token expired
- kid mismatch
  **Solution:**
- Verify publicKey starts with `-----BEGIN PUBLIC KEY-----`
- Check token expiry vs current time
- Verify kid matches signing kid in JWT header

#### Issue: Generated keys change on every restart

**Root Cause:** DSC_PRIVATE_KEY and DSC_PUBLIC_KEY not in .env
**Solution:** Set these in environment (production requirement)

#### Issue: Cannot verify document signatures

**Root Cause:**

- Certificate invalid
- PKCS#7 format issue
- Different key used for signing
  **Solution:**
- Check certificate expiry
- Validate PDF signature is proper PKCS#7
- Use correct document that was signed by API

---

## Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SIGNING SYSTEM SUMMARY                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. KEY ID (kid)                                                   │
│     └─ String identifier: "key-2026"                              │
│     └─ Tells client which key pair this is                        │
│     └─ Embedded in JWT header                                     │
│     └─ NOT the public key itself                                  │
│                                                                     │
│  2. PUBLIC KEY RETRIEVAL                                          │
│     └─ GET /api/digital-signature/public-key                      │
│     └─ No authentication required                                 │
│     └─ Returns: { kid, alg, publicKey }                          │
│     └─ PEM format: -----BEGIN PUBLIC KEY-----...                  │
│                                                                     │
│  3. SIGNING FLOW (RS256 / Asymmetric)                            │
│     ┌─────────────────────────────────────────────┐               │
│     │ Client → Fetch Public Key                   │               │
│     │ Client → Request DSC Token                  │               │
│     │ Server → Sign with Private Key (RS256)      │               │
│     │ Server → Return JWT with kid in header      │               │
│     │ Client → Verify with Public Key (RS256)     │               │
│     │ Client → Submit to server (can't fake)      │               │
│     │ Server → Final verification & storage       │               │
│     └─────────────────────────────────────────────┘               │
│                                                                     │
│  4. TOKEN TYPES IN API                                            │
│     └─ Access Token (HS256) - User auth (15m)                    │
│     └─ Refresh Token (HS256) - Token refresh (7d)                │
│     └─ DSC Token (RS256) - Document signing auth (60s)           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## References

- RSA Algorithm: https://en.wikipedia.org/wiki/RSA_(cryptosystem)
- JWT (JSON Web Tokens): https://tools.ietf.org/html/rfc7519
- PKCS#7: https://tools.ietf.org/html/rfc2315
- Node.js Crypto: https://nodejs.org/api/crypto.html
- node-forge Library: https://github.com/digitalbazaar/forge
