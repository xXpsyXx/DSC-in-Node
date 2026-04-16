# DSC Signing Flow - Complete Request/Response Examples

## Complete End-to-End Flow with Real Payloads

This document shows **exactly what** gets sent and received at each step of the digital signature process.

---

## Phase 1: App Startup (Automatic)

### Step 1.1: Frontend Fetches Public Key (Automatic on App Load)

**Request:**
```http
GET /api/digital-signature/public-key HTTP/1.1
Host: localhost:8080
Accept: application/json
Accept-Language: en-US
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)
```

**Response (200 OK):**
```json
{
  "kid": "key-2026",
  "alg": "RS256",
  "use": "sig",
  "publicKey": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBIjANBgkqhkiG9w0BAQEFAAOCAQkA\nMIIBgjANBgkqhkiG9w0BAQEFAAOCAQgAMIIBfgIBAAKBgQDU8W+eDpgMAj3NzfM\nhIgZrV5v8g7h7JOWQ+3K8yS2AkJ0P+3cBcJk+7K3K8S2EhYVT+jK+TjEkE7b9gWE\nqTK7Z9Y3K8Q9LwVqh+K5TflK+P3A0S8K2mR7m+S4L0VqD+I5TgmL/P3A1R9L/Q==\n-----END PUBLIC KEY-----",
  "timestamp": 1618641234567,
  "expiresAt": 1618645834567
}
```

**Frontend stores in memory:**
```typescript
publicKeySubject.next("-----BEGIN PUBLIC KEY-----\nMII...\n-----END PUBLIC KEY-----")
kid = "key-2026"
alg = "RS256"
```

---

## Phase 2: User Initiates Document Signing

### Step 2.1: Frontend Sends File Info to Backend

**What user does:**
- Opens dashboard
- Clicks "Sign Document"
- Uploads file OR selects from list
- File gets hashed locally

**Request:**
```http
POST /api/digital-signature/request-signing HTTP/1.1
Host: localhost:8080
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2MWY3ZDU4OGI0ZWI0YzAwMzAwMDAwMDEiLCJpYXQiOjE2MTg2NDEyMzQsImV4cCI6MTYxODcyNzYzNH0.signature...
Cookie: accessToken=eyJhbGciOiJIUzI1NiI...
```

**Body:**
```json
{
  "filename": "demolition_permit_2026_04_15.pdf",
  "fileHash": "sha256:abc123def456789abcdef123456789abcdef123456789abcdef123456789abc",
  "documentType": "IR1",
  "description": "Demolition permit for property at Block 45, Plot 12",
  "userId": "61f7d588b4eb4c0030000001",
  "documentId": "doc_2026_001234"
}
```

---

### Step 2.2: Backend Creates DSC Token (JWT with kid)

**Backend Processing:**
```typescript
// 1. Get private key from DscKeyService
privateKey = "-----BEGIN PRIVATE KEY-----\nMII...\n-----END PRIVATE KEY-----"

// 2. Get kid from environment
kid = "key-2026"  // from DSC_SIGNING_KEY_ID

// 3. Create payload
payload = {
  iat: 1618641234,        // Issued at
  exp: 1618641294,        // Expires at (60 seconds later)
  sub: "user_61f7d588b4eb4c0030000001",
  documentId: "doc_2026_001234",
  documentType: "IR1",
  fileHash: "sha256:abc123def456789abcdef123456789abcdef123456789abcdef123456789abc",
  purpose: "document_signing",
  requestId: "dsc_req_2026_04_15_001"
}

// 4. Sign JWT with RS256 (RSA) using private key
// Header includes kid
token = jwt.sign(payload, privateKey, {
  algorithm: 'RS256',
  expiresIn: '60s',
  header: {
    alg: 'RS256',
    typ: 'JWT',
    kid: 'key-2026'  ← KEY IDENTIFIER
  }
})
```

**Backend Response (200 OK):**
```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "success": true,
  "data": {
    "dscSignToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImtleS0yMDI2In0.eyJpYXQiOjE2MTg2NDEyMzQsImV4cCI6MTYxODY0MTI5NCwic3ViIjoidXNlcl82MWY3ZDU4OGI0ZWI0YzAwMzAwMDAwMDEiLCJkb2N1bWVudElkIjoiZG9jXzIwMjZfMDAxMjM0IiwiZmlsZUhhc2giOiJzaGEyNTY6YWJjMTIzZGVmNDU2Nzg5YWJjZGVmMTIzNDU2Nzg5YWJjZGVmMTIzNDU2Nzg5YWJjZGVmIiwicHVycG9zZSI6ImRvY3VtZW50X3NpZ25pbmciLCJyZXF1ZXN0SWQiOiJkc2NfcmVxXzIwMjZfMDRfMTVfMDAxIn0.Signature_Created_With_Private_Key_RS256...",
    "requestId": "dsc_req_2026_04_15_001",
    "fileHash": "sha256:abc123def456789abcdef123456789abcdef123456789abcdef123456789abc",
    "kid": "key-2026",
    "expiresIn": 60,
    "tokenCreatedAt": 1618641234567,
    "tokenExpiresAt": 1618641294567
  },
  "message": "DSC signing token generated successfully"
}
```

---

### Step 2.3: Frontend Receives JWT and Validates It

**Frontend Processing:**
```typescript
// 1. Receive response
token = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImtleS0yMDI2In0..."

// 2. Decode JWT (without verifying first)
decoded = jwt.decode(token)
// Result:
// {
//   header: { alg: "RS256", typ: "JWT", kid: "key-2026" },
//   payload: { iat, exp, sub, documentId, ... },
//   signature: "Signature_Created_With_Private_Key_RS256..."
// }

// 3. Get public key from memory (fetched earlier)
publicKey = "-----BEGIN PUBLIC KEY-----\nMII...\n-----END PUBLIC KEY-----"

// 4. Verify JWT signature using public key
isValid = jwt.verify(token, publicKey, { algorithms: ['RS256'] })
// ✓ Verification passes because:
//   - Signature was created with private key
//   - We verify with matching public key
//   - Same data structure
//   - NOT expired (60s window)

if (isValid) {
  console.log("✓ Token is genuine - signed by server")
  console.log("✓ Kid matches:", decoded.header.kid === "key-2026")
  console.log("✓ Not expired: current time < exp")
  showUserMessage("Server authorized. Ready to sign document.")
} else {
  console.error("✗ Token verification failed")
  showError("Server token is invalid")
}
```

**Frontend UI Update:**
```
[Before] "Preparing to sign..."
[After]  "✓ Server authorized. Click 'Sign' to proceed" [Sign Button]
```

---

## Phase 3: User Signs with Local App

### Step 3.1: Frontend Launches Local Signing Software

**What happens:**
```
Frontend shows: [Sign Document with Smart Card/DSC]
                [Smart Card Name: XYZ Corp DSC Signing Key]
                [Insert Card or Select Certificate]

User clicks: [Sign]
    ↓
Frontend opens local signing app (Windows SmartCard Reader, etc.)
    ↓
Local app prompts: "Enter PIN for certificate"
    ↓
User enters PIN: "1234"
    ↓
Local app:
  1. Reads certificate from smart card
  2. Gets private key from smart card
  3. Signs the PDF with PKCS#7 format
  4. Returns signed PDF to browser
```

**What frontend sends to local app:**
```json
{
  "pdfData": "<binary PDF content>",
  "dscSignToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImtleS0yMDI2In0...",
  "fileHash": "sha256:abc123def456789abcdef123456789abcdef123456789abcdef123456789abc",
  "documentType": "IR1",
  "userName": "Officer John",
  "timestamp": 1618641250000
}
```

**What local app returns to frontend:**
```json
{
  "signedPdfData": "<binary signed PDF content>",
  "signature": "3082... (PKCS#7 binary signature)",
  "signerCertificate": "-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----",
  "signerName": "John Smith",
  "signingTime": 1618641260000,
  "success": true
}
```

---

## Phase 4: Frontend Submits Signed Document to Backend

### Step 4.1: Frontend Sends Signed PDF + JWT Token

**Request:**
```http
POST /api/digital-signature/submit-signature HTTP/1.1
Host: localhost:8080
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Cookie: accessToken=eyJhbGciOiJIUzI1NiI...
```

**Body (multipart):**
```
------WebKitFormBoundary
Content-Disposition: form-data; name="dscSignToken"

eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImtleS0yMDI2In0.eyJpYXQiOjE2MTg2NDEyMzQsImV4cCI6MTYxODY0MTI5NCwic3ViIjoidXNlcl82MWY3ZDU4OGI0ZWI0YzAwMzAwMDAwMDEiLCJkb2N1bWVudElkIjoiZG9jXzIwMjZfMDAxMjM0IiwiZmlsZUhhc2giOiJzaGEyNTY6YWJjMTIzZGVmNDU2Nzg5YWJjZGVmMTIzNDU2Nzg5YWJjZGVmMTIzNDU2Nzg5YWJjZGVmIiwicHVycG9zZSI6ImRvY3VtZW50X3NpZ25pbmciLCJyZXF1ZXN0SWQiOiJkc2NfcmVxXzIwMjZfMDRfMTVfMDAxIn0.Signature_Created_With_Private_Key_RS256...
------WebKitFormBoundary
Content-Disposition: form-data; name="requestId"

dsc_req_2026_04_15_001
------WebKitFormBoundary
Content-Disposition: form-data; name="fileHash"

sha256:abc123def456789abcdef123456789abcdef123456789abcdef123456789abc
------WebKitFormBoundary
Content-Disposition: form-data; name="signedPdf"; filename="demolition_permit_2026_04_15_SIGNED.pdf"
Content-Type: application/pdf

<binary PDF data - 2.5 MB of actual PDF content>
------WebKitFormBoundary
Content-Disposition: form-data; name="signerName"

John Smith
------WebKitFormBoundary
Content-Disposition: form-data; name="signingTime"

1618641260000
------WebKitFormBoundary--
```

---

### Step 4.2: Backend Receives and Validates

**Backend Processing:**
```typescript
// 1. Extract token from request
dscSignToken = request.body.dscSignToken

// 2. Verify JWT is still valid
try {
  publicKey = dscKeyService.getPublicKey()
  
  decoded = jwt.verify(dscSignToken, publicKey, {
    algorithms: ['RS256'],
    issuer: 'retms-api',
    maxAge: '60s'
  })
  console.log("✓ JWT is valid and within 60s window")
  console.log("✓ Kid matches expected:", decoded.header.kid === "key-2026")
  console.log("✓ DocumentID matches:", decoded.payload.documentId === request.body.documentId)
  
} catch (error) {
  return error 401 - "Token expired or invalid"
}

// 3. Verify file hash matches
providedHash = request.body.fileHash
decodedHash = decoded.payload.fileHash
if (providedHash !== decodedHash) {
  return error 400 - "File hash mismatch"
}

// 4. Extract PDF and verify PKCS#7 signature
pdfBuffer = request.file.buffer

dscVerificationResult = dscVerificationService.verifyPkcs7Signature(pdfBuffer)
// Returns:
// {
//   valid: true,
//   signerName: "John Smith",
//   certPem: "-----BEGIN CERTIFICATE-----\n...",
//   certSerial: "ABC123DEF456",
//   certExpiry: "2027-12-31",
//   errors: []
// }

if (!dscVerificationResult.valid) {
  return error 422 - "PKCS#7 signature verification failed"
}

// 5. Store signed document
documentRecord = {
  originalFilename: "demolition_permit_2026_04_15.pdf",
  signedFilename: "demolition_permit_2026_04_15_SIGNED.pdf",
  fileHash: providedHash,
  documentType: "IR1",
  signedBy: decodedHash.sub,
  signerName: request.body.signerName,
  signerCertificate: dscVerificationResult.certPem,
  signerCertSerial: dscVerificationResult.certSerial,
  signingTime: request.body.signingTime,
  serverVerificationTime: Date.now(),
  dscTokenUsed: "dsc_req_2026_04_15_001",
  status: "signed_and_verified",
  uploadedAt: Date.now(),
  fileLocation: "s3://retms-documents/signed/doc_2026_001234.pdf"
}

await documentRepository.save(documentRecord)
console.log("✓ Document stored successfully")
```

---

### Step 4.3: Backend Sends Success Response

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "documentId": "doc_2026_001234",
    "documentNumber": "IR1-2026-00001234",
    "filename": "demolition_permit_2026_04_15_SIGNED.pdf",
    "status": "signed_and_verified",
    "signedAt": 1618641260000,
    "signedBy": "61f7d588b4eb4c0030000001",
    "signerName": "John Smith",
    "signerCertSerialNumber": "ABC123DEF456",
    "verificationStatus": {
      "pkcsSignatureValid": true,
      "certificateValid": true,
      "certificateExpiry": "2027-12-31",
      "certificateChainValid": true
    },
    "downloadLink": "/api/documents/download/doc_2026_001234",
    "viewLink": "/dashboard/documents/view/IR1-2026-00001234",
    "message": "Document successfully signed and verified"
  },
  "timestamp": 1618641270000
}
```

---

### Step 4.4: Frontend Receives Success

**Frontend Processing:**
```typescript
// 1. Receive response
response = {
  success: true,
  data: {
    documentId: "doc_2026_001234",
    documentNumber: "IR1-2026-00001234",
    status: "signed_and_verified",
    ...
  }
}

// 2. Update UI
showSuccessNotification("✓ Document signed and verified successfully!")
showDocumentDetails({
  number: response.data.documentNumber,
  status: response.data.status,
  signedBy: response.data.signerName,
  signedAt: formatDate(response.data.signedAt)
})

// 3. Display action buttons
[Download Document] [View in Dashboard] [Sign Another Document] [Print]

// 4. Log success for audit trail
auditLog.add({
  action: "document_signed",
  documentId: response.data.documentId,
  user: currentUser,
  timestamp: Date.now()
})
```

---

## Complete Flow Summary

```
┌─────────────────────────────────────────────────────────────┐
│                   COMPLETE DSC FLOW                         │
└─────────────────────────────────────────────────────────────┘

PHASE 1: SETUP (App Load - T=0)
┌────────────────────────────────────────────────────────────┐
│ Frontend → GET /api/digital-signature/public-key          │
│ Backend ← {kid: "key-2026", publicKey: "..."}             │
│ Frontend: Store publicKey in memory                        │
└────────────────────────────────────────────────────────────┘

PHASE 2: REQUEST SIGNING (User clicks Sign - T=10s)
┌────────────────────────────────────────────────────────────┐
│ Frontend → POST /api/digital-signature/request-signing    │
│           {filename, fileHash, documentType}               │
│                                                            │
│ Backend: Create JWT with RS256 + kid                      │
│ Backend ← {dscSignToken, requestId, fileHash}             │
│                                                            │
│ Frontend: Verify JWT with stored publicKey                │
│           ✓ Signature valid                               │
│           ✓ Not expired (< 60s)                           │
│           ✓ Kid matches ("key-2026")                       │
│           Show: "Ready to sign"                            │
└────────────────────────────────────────────────────────────┘

PHASE 3: LOCAL SIGNING (User signs - T=15s)
┌────────────────────────────────────────────────────────────┐
│ Frontend → Local Signing App: {pdf, dscSignToken, ...}    │
│ Local App: Opens smart card reader, asks for PIN          │
│ User: Enters PIN "1234"                                    │
│ Local App: Signs PDF with PKCS#7, returns signed PDF      │
│ Local App → Frontend: {signedPdf, signature, ...}          │
└────────────────────────────────────────────────────────────┘

PHASE 4: SEND TO BACKEND (T=20s)
┌────────────────────────────────────────────────────────────┐
│ Frontend → POST /api/digital-signature/submit-signature  │
│           {dscSignToken, signedPdf, requestId, fileHash}   │
│                                                            │
│ Backend: Verify JWT (still < 60s window) ✓               │
│ Backend: Extract PKCS#7 signature from PDF                │
│ Backend: Verify signature with certificate's public key   │
│ Backend: Validate certificate                             │
│ Backend: Store document in database                       │
│                                                            │
│ Backend ← {success: true, documentId, status: "signed..."}│
│                                                            │
│ Frontend: Show success notification                       │
│           Display downloadable link                       │
│           Update dashboard                                │
└────────────────────────────────────────────────────────────┘

Total Time: ~20 seconds (most of it is user waiting for PIN)
Token Lifetime: 60 seconds (covers the entire process)
Requests: 3 major (public-key at startup, request-signing, submit)
Data Sent: ~2.5 MB (the PDF itself)
```

---

## Error Scenarios

### Scenario 1: JWT Expired

**Frontend sends after 2 minutes:**
```
Frontend → POST /api/digital-signature/submit-signature
           {dscSignToken (issued 2 minutes ago), ...}

Backend:
  jwt.verify(token, publicKey) throws:
  "Token expired"

Backend ← {
  success: false,
  error: "SIGNING_TOKEN_EXPIRED",
  message: "Your authorization to sign has expired. Please request a new signing token.",
  timestamp: 1618641300000
}

Frontend: Show error "Your request expired. Please start over."
          Disable submit button
          Show: [Request New Signing Token] button
```

---

### Scenario 2: File Hash Mismatch

**Frontend modifies PDF and sends:**
```
Frontend → POST /api/digital-signature/submit-signature
           {
             dscSignToken (fileHash: "abc123..."),
             signedPdf (actual hash: "xyz789..." - modified!),
             ...
           }

Backend:
  decodedHash = jwt.decode(token).fileHash  // "abc123..."
  providedHash = calculateHash(pdfBuffer)   // "xyz789..."
  if (decodedHash !== providedHash) ERROR

Backend ← {
  success: false,
  error: "FILE_HASH_MISMATCH",
  message: "The document appears to have been modified after signing authorization. Signing rejected.",
  expectedHash: "abc123...",
  providedHash: "xyz789...",
  timestamp: 1618641270000
}

Frontend: Show error "Document was modified. Please upload original."
```

---

### Scenario 3: Invalid Signature

**Backend can't verify PKCS#7:**
```
Backend:
  dscVerificationService.verifyPkcs7Signature(pdf)
  returns: {
    valid: false,
    errors: [
      "Certificate expired",
      "Chain validation failed"
    ]
  }

Backend ← {
  success: false,
  error: "INVALID_SIGNATURE",
  message: "The document signature could not be verified.",
  details: {
    valid: false,
    errors: ["Certificate expired", "Chain validation failed"]
  },
  timestamp: 1618641270000
}

Frontend: Show error with details
          Suggest: Update SmartCard certificate, try again
```

---

## Key Points in This Flow

1. **Public Key Fetched First** - App startup, no user action needed
2. **JWT Created on Demand** - When user clicks "Sign", not when PDF sent
3. **JWT Verified Client-Side** - Frontend doesn't trust blindly, verifies with public key
4. **JWT is Time-Limited** - 60 seconds, covers the entire signing process
5. **kid Identifies the Key** - Always included in JWT header ("key-2026")
6. **Local App Signs PDF** - Creates PKCS#7 signature (different from JWT)
7. **Backend Verifies Everything** - JWT valid + PKCS#7 signature valid + hash match
8. **Document Stored Only After All Checks** - Belt and suspenders security
9. **User Not Authenticated Twice** - Access token (user auth) + DSC token (signing auth)

---

## File References

- JWT Creation: [src/utils/jwt.service.ts](src/utils/jwt.service.ts#L95)
- Public Key Endpoint: [src/modules/digital-signature/controllers/digital-signature.controller.ts](src/modules/digital-signature/controllers/digital-signature.controller.ts#L69)
- Key Management: [src/utils/dsc-key.service.ts](src/utils/dsc-key.service.ts)
- Verification: [src/modules/digital-signature/services/dsc-verification.service.ts](src/modules/digital-signature/services/dsc-verification.service.ts)
- Frontend Service: [src/app/services/digital-signature.service.ts](src/app/services/digital-signature.service.ts)

