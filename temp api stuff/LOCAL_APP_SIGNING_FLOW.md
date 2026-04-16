# Local App (Agent) - PDF Signing & PIN Verification Flow

## Overview

The **Local App** (DSC Agent) is a separate Windows service running on `http://localhost:45763/api` that handles:
1. **PIN verification** (smart card/USB token access)
2. **PDF signing** with PKCS#7 digital signature
3. **Certificate handling** from smart card

This is NOT part of RETMS backend - it's a third-party signing service.

---

## When Frontend Calls Public Key

### Page: Designated Officer Dashboard
```
User navigates to: /pages/designated-officer-dashboard
                        ↓
DesignatedOfficerDashboard component loads
                        ↓
Constructor injects: DigitalSignatureService
                        ↓
DscService.constructor() called
                        ↓
startPeriodicPublicKeyFetch() starts:
  ├─ Immediate: GET /api/digital-signature/public-key
  └─ Then every 5 minutes: Repeat fetch
                        ↓
Public key stored in memory: BehaviorSubject
```

**File**: [src/app/modules/designated-officer/pages/designated-officer-dashboard/designated-officer-dashboard.ts](src/app/modules/designated-officer/pages/designated-officer-dashboard/designated-officer-dashboard.ts#L223)

---

## Local App Signing Flow (Complete)

### Architecture

```
┌─────────────────────────────────────────────────────┐
│ BROWSER (RETMS Frontend)                            │
│ /pages/designated-officer-dashboard                 │
└─────────────────────────────────────────────────────┘
                    ↓ HTTP Calls
┌─────────────────────────────────────────────────────┐
│ RETMS BACKEND SERVER                                │
│ Port 8080 (http://localhost:8080)                   │
│ - generate JWT                                      │
│ - verify signature                                  │
│ - store document                                    │
└─────────────────────────────────────────────────────┘
                    ↓ HTTP Calls
┌─────────────────────────────────────────────────────┐
│ LOCAL APP / DSC AGENT                               │
│ Port 45763 (http://localhost:45763)                │
│ Windows Service / Installed on user's computer      │
│ - Access smart card/USB token                       │
│ - Verify PIN                                        │
│ - Sign PDF with digital certificate                 │
│ - Create PKCS#7 signature                           │
└─────────────────────────────────────────────────────┘
```

---

## Step-by-Step: How Local App Signs & Verifies PIN

### Phase 1: User Initiates Signing

**Frontend Code:**
```typescript
// User clicks "Sign" button on designated-officer-dashboard
onSignClick(complaint: Complaint) {
  // Step 1: Show PIN modal
  this.showPinModal();
  
  // Step 2: User enters PIN
  // Modal waits for input
  
  // Step 3: User confirms (calls signComplaint with PIN)
}

signComplaint(pinValue: string) {
  // PIN is collected but NOT verified here
  // It's sent to LOCAL APP for verification
}
```

---

### Phase 2: Check Local Agent Health

**Before signing, frontend checks if local app is running:**

```
Frontend request:
GET http://localhost:45763/api/health

Expected response (200 OK):
{
  "status": "healthy",
  "version": "2.1.0",
  "agentReady": true,
  "smartCardConnected": true,
  "certificateLoaded": true,
  "timestamp": 1618641234567
}

If fails (connection refused):
→ Show error: "DSC Agent not running. 
              Please install and start the agent application."
→ Block signing
```

---

### Phase 3: Request Signing JWT from RETMS Backend

**Frontend:**
```http
POST http://localhost:8080/api/digital-signature/request-signing
Content-Type: application/json

{
  "filename": "complaint_2026_001234.pdf",
  "fileHash": "sha256:abc123def456789...",
  "documentType": "complaint",
  "documentId": "doc_2026_001234"
}
```

**Backend Response:**
```json
{
  "success": true,
  "data": {
    "dscSignToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImtleS0yMDI2In0...",
    "requestId": "dsc_req_2026_04_15_001",
    "fileHash": "sha256:abc123def456789...",
    "expiresIn": 60,
    "tokenCreatedAt": 1618641234567
  }
}
```

**Frontend stores:**
```typescript
this.dscSigningToken = response.data.dscSignToken
this.dscFileHash = response.data.fileHash
this.dscRequestId = response.data.requestId
```

---

### Phase 4: Download PDF from Backend

**Frontend:**
```http
GET http://localhost:8080/api/digital-signature/download-pdf/doc_2026_001234
Authorization: Bearer {accessToken}
```

**Backend Response:**
```
200 OK
Content-Type: application/pdf
Content-Length: 2500000

<binary PDF data - 2.5 MB>
```

**Frontend stores:**
```typescript
this.pdfBlob = response  // Binary PDF data
```

---

### Phase 5: LOCAL APP Signing (PIN Verification + Signature)

This is the **critical part** - PIN verification happens in the LOCAL APP.

#### 5.1 Frontend Sends Request to Local App

```http
POST http://localhost:45763/api/sign
Content-Type: multipart/form-data

FormData:
  - file: <Blob - PDF file>
  - pin: "1234"
  - jwt: "eyJhbGciOiJSUzI1NiIs..."
  - timestamp: 1618641250000

Headers:
  Authorization: Bearer {dscSignToken}
  X-Request-ID: dsc_req_2026_04_15_001
```

---

#### 5.2 Local App Processing (PIN Verification)

**LOCAL APP FLOW:**

```
Step 1: Receive PIN from Frontend
        pin = "1234"
        
Step 2: Initialize Smart Card Reader
        ├─ Connect to USB token/smart card reader
        ├─ Check if card is inserted
        └─ If not found: Return error "Smart card not detected"

Step 3: Verify PIN Against Smart Card
        This is the critical security step!
        
        Smart Card PIN Verification:
        ├─ Send PIN through secure channel to smart card
        ├─ Smart card's firmware verifies PIN internally
        │  (HSM - Hardware Security Module)
        ├─ Smart card has:
        │  ├─ Private key (NEVER leaves the card)
        │  ├─ PIN hash (stored on chip)
        │  └─ Attempts counter (3 wrong PIN = locked)
        │
        ├─ If PIN wrong:
        │  ├─ Attempts left: 3 → 2 → 1 → 0
        │  ├─ If 0: Smart card locked for security
        │  └─ Return error to frontend:
        │      "Incorrect PIN. Attempts remaining: X"
        │
        └─ If PIN correct:
           └─ Grant access to private key for signing

Step 4: Get Certificate from Smart Card
        ├─ Read certificate from smart card
        ├─ Serial Number: "ABC123DEF456"
        ├─ Subject: "CN=John Smith,O=XYZ Corp,..."
        ├─ Issuer: "CN=XYZ Root CA,..."
        ├─ Valid: From 2023-01-01 To 2027-12-31
        ├─ Key Usage: Digital Signature
        └─ Extract public key from certificate

Step 5: Load PDF into Memory
        ├─ Decode base64 or binary PDF
        ├─ Calculate SHA256 hash of PDF content
        ├─ Verify hash matches JWT fileHash:
        │   JWT hash:  "sha256:abc123..."
        │   PDF hash:  "sha256:abc123..."
        │   If mismatch: Return error "File modified"
        └─ Keep PDF in memory

Step 6: Sign PDF with PKCS#7 Format
        
        PKCS#7 (CMS - Cryptographic Message Syntax):
        ├─ Create signature container:
        │  ├─ Certificate chain (from smart card)
        │  ├─ Timestamp from TSA (Time Stamping Authority)
        │  ├─ Message digest (hash of PDF)
        │  ├─ Signature data (encrypted with private key)
        │  └─ Additional attributes
        │
        ├─ Request signature from smart card:
        │  ├─ Send PDF hash + PKCS#7 structure
        │  ├─ Smart card's private key signs the hash
        │  │  (Signature = RSA_Encrypt(hash, privateKey))
        │  └─ Private key NEVER leaves the card
        │
        ├─ Smart card returns: Signature bytes
        │  └─ Size: ~256-512 bytes (RSA-2048)
        │
        └─ Build final PKCS#7 signature:
           ├─ Embed certificate
           ├─ Embed TSA timestamp
           ├─ Embed signature bytes
           └─ Format: ASN.1 DER (binary format)

Step 7: Embed Signature in PDF
        ├─ Create PDF signature dictionary
        ├─ Contains references to PKCS#7
        ├─ Update PDF with signature
        ├─ Result: PDF with embedded digital signature
        └─ PDF can still be opened in PDF readers

Step 8: Return Signed PDF to Frontend
        ├─ Clear PIN from memory (security)
        ├─ Keep private key locked on card
        └─ Send response
```

---

#### 5.3 Local App Response

**Success Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/octet-stream
X-Signature-Valid: true
X-Signer-Name: John Smith
X-Certificate-Serial: ABC123DEF456
X-Signature-Timestamp: 2026-04-15T12:34:50Z
Content-Length: 2510000

<binary signed PDF data - 2.51 MB (slightly larger due to signature)>
```

**Error Response (Wrong PIN):**
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "success": false,
  "error": "PIN_VERIFICATION_FAILED",
  "message": "Incorrect PIN",
  "attemptsRemaining": 2,
  "timestamp": 1618641250000
}
```

**Error Response (Smart Card Locked):**
```http
HTTP/1.1 423 Locked
Content-Type: application/json

{
  "success": false,
  "error": "SMART_CARD_LOCKED",
  "message": "Smart card is locked due to too many incorrect PIN attempts",
  "unblockInstructions": "Contact your certificate provider to unlock",
  "timestamp": 1618641250000
}
```

---

### Phase 6: Frontend Receives Signed PDF

**Frontend Processing:**
```typescript
// Receive signed PDF from local app
signedPdfBlob = response.blob()

// Extract headers
signerName = response.headers.get('X-Signer-Name')  // "John Smith"
certSerial = response.headers.get('X-Certificate-Serial')
timestamp = response.headers.get('X-Signature-Timestamp')

// Store for submission
this.signedPdfBlob = signedPdfBlob
this.signerName = signerName
```

---

### Phase 7: Submit Signed PDF to Backend for Verification

**Frontend Request:**
```http
POST http://localhost:8080/api/digital-signature/submit-signed
Content-Type: multipart/form-data
Authorization: Bearer {accessToken}

FormData:
  - dscSignToken: "eyJhbGciOiJSUzI1NiI..."
  - requestId: "dsc_req_2026_04_15_001"
  - fileHash: "sha256:abc123..."
  - signedPdf: <Blob - signed PDF>
  - signerName: "John Smith"
  - signingTime: 1618641250000
```

**Backend Verification:**
```typescript
// 1. Verify JWT is still valid (< 60s)
jwt.verify(dscSignToken, publicKey)  // ✓ Valid

// 2. Extract PKCS#7 signature from PDF
pkcs7Signature = pdf.extractSignature()

// 3. Get certificate from signature
certificate = pkcs7Signature.getCertificate()

// 4. Extract public key from certificate
publicKeyFromCert = certificate.getPublicKey()

// 5. Verify PKCS#7 signature using certificate's public key
isSignatureValid = pkcs7Signature.verify(publicKeyFromCert)  // ✓ Valid

// 6. Validate certificate
├─ Check expiry: 2023-01-01 < now < 2027-12-31  ✓
├─ Validate chain: Root CA → Intermediate → Certificate  ✓
├─ Check revocation status (CRL/OCSP)  ✓
├─ Check key usage: digitalSignature allowed  ✓
└─ All checks passed ✓

// 7. Store document
await document.save({
  status: "SIGNED_AND_VERIFIED",
  signedAt: 1618641250000,
  signedBy: "John Smith",
  certificate: certificatePem,
  verified: true
})
```

**Backend Response (Success):**
```json
{
  "success": true,
  "data": {
    "documentId": "doc_2026_001234",
    "documentNumber": "COMPLAINT-2026-001234",
    "status": "SIGNED_AND_VERIFIED",
    "signedAt": 1618641250000,
    "signedBy": "John Smith",
    "verificationStatus": {
      "pkcsSignatureValid": true,
      "certificateValid": true,
      "certificateExpiry": "2027-12-31",
      "chainValid": true,
      "revocationStatus": "active"
    },
    "message": "Document signed and verified successfully"
  }
}
```

---

## How PIN Verification Actually Works (Deep Dive)

### Smart Card Architecture

```
┌──────────────────────────────────────┐
│  Smart Card / USB Token              │
│                                      │
│  ┌──────────────────────────────┐   │
│  │ Secure Hardware (HSM)        │   │
│  │                              │   │
│  │ ├─ PIN Hash: [encrypted]    │   │
│  │ ├─ Private Key: [locked]    │   │
│  │ ├─ Attempts: 3              │   │
│  │ └─ Certificate              │   │
│  └──────────────────────────────┘   │
└──────────────────────────────────────┘
```

### PIN Verification Process

```
User enters PIN: "1234"
        ↓
Transmitted through secure USB channel
        ↓
Smart Card Firmware:
        ├─ Take entered PIN: "1234"
        ├─ Hash it: SHA256("1234") = "xyz789..."
        ├─ Compare with stored PIN hash
        │  Stored: "xyz789..."  (encrypted on chip)
        │  Entered: "xyz789..."  (calculated from input)
        │
        ├─ If MATCH:
        │  └─ Unlock private key access (in memory, chip only)
        │     Return: SUCCESS ✓
        │
        └─ If NO MATCH:
           ├─ Decrement attempts counter: 3 → 2 → 1 → 0
           ├─ If attempts = 0:
           │  └─ LOCK the card (security feature)
           │     This prevents brute force attacks
           └─ Return: FAILURE ✗
```

### Why PIN Stays on Card

```
SECURE (Current Design):
  User enters PIN
         ↓
  PIN sent to Smart Card
         ↓
  Smart Card verifies in hardware ✓
         ↓
  PIN never stored in computer memory
         ↓
  Even if hacked, attacker doesn't see PIN

INSECURE (Bad Design):
  User enters PIN
         ↓
  PIN sent to Local App
         ↓
  Local App verifies in software
         ↓
  PIN could be read from memory ✗
         ↓
  Attacker can extract it
```

---

## Timeline: Actual Signing Process

```
T=0s    User opens /pages/designated-officer-dashboard
        ├─ DigitalSignatureService injected
        └─ Public key fetched (stored in memory)

T=5s    User clicks "Sign" button
        ├─ PIN modal appears
        └─ User enters: "1234"

T=7s    User confirms PIN
        ├─ Health check: Local app running? ✓
        └─ Request JWT from backend

T=8s    Backend creates RSC token
        ├─ kid: "key-2026"
        ├─ exp: 60 seconds
        └─ Private key signs it

T=9s    Frontend gets JWT + downloads PDF

T=10s   Frontend calls LOCAL APP with PIN
        POST http://localhost:45763/api/sign
        {file, pin: "1234", jwt}

T=11s   LOCAL APP verifies PIN on smart card
        ├─ Connect to USB token
        ├─ Send PIN through secure channel
        ├─ Smart card firmware checks PIN
        ├─ Result: ✓ Correct
        └─ Unlock signing capability

T=12s   LOCAL APP signs PDF with PKCS#7
        ├─ Get private key from smart card (now unlocked)
        ├─ Sign with RSA algorithm
        ├─ Embed certificate
        ├─ Add timestamp
        └─ Create signature: ~256 bytes

T=13s   LOCAL APP embeds signature in PDF
        ├─ Update PDF structure
        ├─ Add signature dictionary
        └─ Result: Signed PDF

T=14s   LOCAL APP returns signed PDF
        ├─ X-Signer-Name: John Smith
        ├─ X-Certificate-Serial: ABC123DEF456
        └─ Binary signed PDF data

T=15s   Frontend submits to backend
        POST /api/digital-signature/submit-signed
        {dscSignToken, signedPdf, requestId}

T=16s   Backend verifies everything:
        ├─ JWT valid? ✓ (< 60s)
        ├─ PKCS#7 signature valid? ✓
        ├─ Hash matches? ✓
        ├─ Certificate valid? ✓
        ├─ Certificate not revoked? ✓
        └─ Status: SIGNED_AND_VERIFIED ✓

T=17s   Frontend shows success
        ✓ Document signed and verified
        [Download] [View] [Back to Dashboard]
```

---

## Quick Comparison: Three Different Signatures

| Type | Who Signs | When | Format | Storage |
|------|-----------|------|--------|---------|
| **JWT DSC Token** | Backend | On request-signing | RS256 (RSA) | JWT header + payload |
| **PKCS#7 PDF Sig** | Smart Card | On local app signing | ASN.1 DER | Embedded in PDF |
| **User's Cert** | Different entity | Different context | X.509 | Certificate file |

---

## File References

- *Frontend Signing*: [designated-officer-dashboard.ts](src/app/modules/designated-officer/pages/designated-officer-dashboard/designated-officer-dashboard.ts#L1286)
- *Digital Signature Service*: [digital-signature.service.ts](src/app/services/digital-signature.service.ts#L50)
- *Backend JWT Creation*: [jwt.service.ts](src/utils/jwt.service.ts#L95)
- *Backend Verification*: [dsc-verification.service.ts](src/modules/digital-signature/services/dsc-verification.service.ts)

