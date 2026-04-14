# DSC-in-Node: System Design Document

**Project:** Digital Signature Certificate Signing in Node.js  
**Version:** 1.0  
**Last Updated:** April 9, 2026  
**Status:** Production-Ready

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Component Overview](#component-overview)
4. [Data Flow Diagrams](#data-flow-diagrams)
5. [Technology Stack](#technology-stack)
6. [Security Architecture](#security-architecture)
7. [Scalability & Performance](#scalability--performance)
8. [Deployment Architecture](#deployment-architecture)
9. [Error Handling & Resilience](#error-handling--resilience)
10. [API Endpoints Reference](#api-endpoints-reference)

---

## Executive Summary

**DSC-in-Node** is a secure, enterprise-grade system for digitally signing PDF documents using USB-based Digital Signature Certificates (DSC). The system combines a **Node.js/Express backend** with an **Angular frontend** to provide a user-friendly interface for cryptographic document signing.

### Key Capabilities

- **PDF Signing**: RFC 2630/5652 (PKCS#7/CMS) compliant signatures
- **Timestamp Authority**: RFC 3161 compliant timestamp generation (Quovadis TSA)
- **Hardware Security**: USB token integration with PKCS#11 driver
- **Request Authentication**: HMAC-SHA256 based API protection
- **Signature Verification**: Validate digital signatures on PDFs
- **Device Auto-Detection**: Automatic USB token driver detection
- **Certificate Management**: Expiration checking and validation
- **Cross-Platform**: Windows Service + Linux deployment support

### Target Use Cases

- Legal document signing
- Contract authorization
- Compliance-driven workflows
- Multi-party approval workflows

---

## System Architecture

### High-Level Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                       END USER CLIENTS                           │
│                    (Browser / Web Application)                   │
└──────────────────┬───────────────────────────────────────────────┘
                   │ HTTPS
                   │
        ┌──────────▼──────────┐
        │                     │
        │   FRONTEND LAYER    │
        │   (Angular)         │
        │ ┌─────────────┐     │
        │ │ PDF Signer  │     │◄─────┐
        │ │ Component   │     │      │
        │ ├─────────────┤     │      │
        │ │ Verify      │     │      │
        │ │ Signature   │     │      │
        │ │ Component   │     │      │
        │ └─────────────┘     │      │
        │ ┌─────────────┐     │      │
        │ │ Crypto Svc  │     │  UI  │
        │ │ (HMAC Sign) │     │      │
        │ └─────────────┘     │      │
        └──────┬──────────────┘      │
               │ HTTPS               │
               │ (X-Request-Sig)     │
               │                     │
    ┌──────────▼────────────────────┐
    │                               │
    │    APPLICATION LAYER          │
    │  (Express/Node.js Backend)    │
    │                               │
    │  ┌──────────────────────────┐ │
    │  │ Authentication Layer      │ │  Uses USB Token
    │  │ • Request Sig Verify      │ │  Private Key
    │  │ • Timestamp Validation    │ │
    │  └──────────────────────────┘ │
    │           ↓                    │
    │  ┌──────────────────────────┐ │
    │  │ API Endpoints            │ │
    │  │ • POST /api/sign         │ │
    │  │ • POST /api/verify       │ │
    │  │ • POST /api/cert-status  │ │
    │  │ • GET /api/auto-detect   │ │
    │  └──────────────────────────┘ │
    │           ↓                    │
    │  ┌──────────────────────────┐ │
    │  │ Business Logic           │ │
    │  │ • PDF Processing         │ │
    │  │ • Hash Computation       │ │
    │  │ • Signature Embedding    │ │
    │  │ • TSA Integration        │ │
    │  │ • PKCS#7/CMS Formation   │ │
    │  └──────────────────────────┘ │
    └──────┬───────────────────┬────┘
           │ PKCS#11 Driver    │ HTTP (RFC 3161)
           │                   │
    ┌──────▼─────┐     ┌──────▼──────────────────┐
    │   USB Token │     │ Timestamp Authority    │
    │   (DSC)     │     │ (Quovadis TSA)        │
    │             │     │ timestamp.quovadis.com │
    └─────────────┘     └───────────────────────┘
```

### Layered Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                   │
│              (Angular SPA - Browser-based)              │
│  • PDF Upload & Download                                │
│  • PIN Entry                                            │
│  • Request Signing (HMAC-SHA256)                        │
│  • Signature Verification Display                       │
└──────────────────────┬──────────────────────────────────┘

┌──────────────────────┴──────────────────────────────────┐
│               API / GATEWAY LAYER                       │
│           (Express Routes + Middleware)                 │
│  • HTTP Routes: /sign, /verify, /cert-status            │
│  • Request Signature Verification (HMAC-SHA256)         │
│  • CORS & Error Handling                                │
│  • Response Formatting with signature metadata          │
└──────────────────────┬──────────────────────────────────┘

┌──────────────────────┴──────────────────────────────────┐
│            BUSINESS LOGIC LAYER                         │
│           (Services & Controllers)                      │
│  • SignService: Orchestrates signing workflow           │
│  • VerifyService: Validates signatures                  │
│  • PdfSignerService: PDF manipulation                   │
│  • HashService: SHA-256 computation                     │
│  • TsaService: RFC 3161 timestamp requests              │
│  • Pkcs7SignerService: PKCS#7/CMS encoding              │
│  • Request signing verification                         │
└──────────────────────┬──────────────────────────────────┘

┌──────────────────────┴──────────────────────────────────┐
│            EXTERNAL INTEGRATION LAYER                   │
│  • USB Token / PKCS#11 Driver                           │
│  • Timestamp Authority (TSA - Quovadis)                 │
│  • System Console Logging                               │
└─────────────────────────────────────────────────────────┘
```

---

## Component Overview

### Backend Components

#### 1. **API Layer** (`backend/src/routes/`, `backend/src/controllers/`)

| Component            | Purpose                                           |
| -------------------- | ------------------------------------------------- |
| `sign.route.ts`      | HTTP POST/GET routes for signing and verification |
| `sign.controller.ts` | Request handler & parameter validation            |
| Middleware           | Request signature verification, error handling    |

**Endpoints:**

- `POST /api/sign` - Sign PDF with DSC (requires request signature)
- `POST /api/verify` - Verify signature on PDF
- `POST /api/cert-status` - Check certificate expiration status
- `GET /api/auto-detect-token` - Auto-detect USB token device
- `GET /api/supported-drivers` - List supported USB token drivers

#### 2. **Core Services** (`backend/src/services/`)

| Service                | Responsibility                       | Key Methods                           |
| ---------------------- | ------------------------------------ | ------------------------------------- |
| **SignService**        | Orchestrates entire signing workflow | `sign(pdf, pin, options)`             |
| **PdfSignerService**   | PDF manipulation with pdf-lib        | `addSignatureBox(pdf, coords)`        |
| **HashService**        | Cryptographic hash computation       | `sha256(data)`                        |
| **Pkcs7SignerService** | PKCS#7/CMS container creation        | `createPkcs7Signature(...)`           |
| **TsaService**         | RFC 3161 timestamp generation        | `requestTimestampToken(hash, tsaUrl)` |
| **VerifyService**      | Signature validation                 | `verifySignature(pdf, publicKey)`     |

#### 3. **Middleware** (`backend/src/middleware/`)

| Middleware                     | Purpose                                                     |
| ------------------------------ | ----------------------------------------------------------- |
| `request-signer.middleware.ts` | Verify HMAC-SHA256 request signatures & timestamp freshness |

### Frontend Components

#### 1. **Components** (`frontend/src/app/components/`)

| Component                       | Purpose                                |
| ------------------------------- | -------------------------------------- |
| `pdf-signer.component.ts`       | PDF upload, PIN entry, sign initiation |
| `verify-signature.component.ts` | Display & verify signature results     |

#### 2. **Services** (`frontend/src/app/services/`)

| Service                  | Purpose                     | Key Methods                                   |
| ------------------------ | --------------------------- | --------------------------------------------- |
| **DscService**           | Backend API communication   | `signPDF(file, pin)`, `verifySignature(file)` |
| **RequestSignerService** | HMAC-SHA256 request signing | `signRequest(method, path)`                   |

#### 3. **App Configuration** (`frontend/src/app/`)

| File            | Purpose                   |
| --------------- | ------------------------- |
| `app.config.ts` | Angular app configuration |
| `app.routes.ts` | Frontend routing          |

---

## Data Flow Diagrams

### PDF Signing Flow (Complete Request-Response Cycle)

```
USER INTERACTION                FRONTEND                  BACKEND               EXTERNAL
┌──────────────────┐
│  User selects    │
│  PDF file &      │
│  enters PIN      │
└────────┬─────────┘
         │
         │ Select file: document.pdf
         ▼
    ┌────────────────────────┐
    │ 1. Load PDF into       │
    │    memory (Uint8Array) │
    └────────┬───────────────┘
             │
             │ Read file bytes
             ▼
         ┌──────────────────────────────┐
         │ 2. Sign HTTP Request         │
         │  • Method: "POST"            │
         │  • Path: "/api/sign"         │
         │  • Timestamp: Date.now()     │
         │  • Compute HMAC-SHA256       │
         │                              │
         │ signedMessage =              │
         │  "POST\n/api/sign\n{TIME}"  │
         │                              │
         │ X-Request-Signature =        │
         │  HMAC(SECRET, signedMsg)     │
         └────────┬─────────────────────┘
                  │
                  │ HTTPS POST
                  │ Headers: X-Request-Signature
                  │          X-Request-Timestamp
                  ▼
        ┌─────────────────────────────────────┐
        │ 3. Verify Request Signature         │
        │    (RequestSignerMiddleware)        │
        │                                     │
        │ • Extract signature & timestamp     │
        │ • Verify timestamp freshness        │
        │   (within 5 minutes)                │
        │ • Reconstruct X-Request-Signature   │
        │ • Constant-time comparison         │
        │ ✓ Valid → proceed                  │
        │ ✗ Invalid → 401 Unauthorized       │
        └────────┬────────────────────────────┘
                 │
                 │ Request authenticated
                 ▼
        ┌─────────────────────────────────────┐
        │ 4. SignController.signPdf()         │
        │                                     │
        │ • Validate input (PDF, PIN)         │
        │ • Load USB token via PKCS#11        │
        │ • Verify PIN with token            │
        │ ✓ PIN valid → continue             │
        │ ✗ PIN invalid → 403 Forbidden      │
        └────────┬────────────────────────────┘
                 │
                 │ Authenticate with USB token
                 ▼
        ┌─────────────────────────────────────┐
        │ 5. SignService.sign()               │
        │    (Main orchestration)             │
        │                                     │
        │ Calls:                              │
        │  a) PdfSignerService →              │
        │  b) HashService →                   │
        │  c) TsaService → (HTTP RFC 3161)   │
        │  d) Pkcs7SignerService →            │
        └────────┬────────────────────────────┘
                 │
                 │ 5a. Add signature stamp
                 ▼
        ┌─────────────────────────────────────┐
        │ 5a. PdfSignerService                │
        │                                     │
        │ • Load PDF with pdf-lib             │
        │ • Add signature placeholder box     │
        │ • Add signature image/text          │
        │ • Return PDFDocument                │
        └────────┬────────────────────────────┘
                 │
                 │ PDF with signature box
                 ▼
        ┌─────────────────────────────────────┐
        │ 5b. HashService.sha256()            │
        │                                     │
        │ • Serialize PDF bytes               │
        │ • Compute SHA-256 hash              │
        │ • Return 32-byte hash               │
        └────────┬────────────────────────────┘
                 │
                 │ SHA-256 hash
                 ▼
        ┌─────────────────────────────────────┐
        │ 5c. TsaService.requestTimestamp()   │
        │     (NO FALLBACK - MANDATORY)       │
        │                                     │
        │ RFC 3161 TimeStampRequest:          │
        │  • Version: 1                       │
        │  • MessageImprint.hashAlgo: SHA-256 │
        │  • MessageImprint.hashedMessage: {..}
        └────────┬────────────────────────────┼─────────┐
                 │                            │         │
                 │ POST RFC 3161 req          │         │
                 │                            │    ┌────▼───────────────┐
                 │                            │    │ QUOVADIS TSA       │
                 │                            │    │ timestamp.        │
                 │                            │    │ quovadis.com      │
                 │                            │    │                   │
                 │                            │    │ • Verify hash     │
                 │    ┌────────────────────────┼────│ • Add timestamp   │
                 │    │ TimeStampToken (DER)   │    │ • Sign token      │
                 │    │ • TSA cert             │    │ (RFC 3161)        │
                 │    │ • Signed timestamp     │    └───────────────────┘
                 │    │ • Status: granted      │
                 ▼    ▼                        │
        ┌─────────────────────────────────────┐
        │ 5d. Pkcs7SignerService              │
        │                                     │
        │ • Load private key from USB token   │
        │   (PKCS#11 driver)                  │
        │ • Sign hash with RSA                │
        │ • Get signer certificate            │
        │ • Build PKCS#7 structure:           │
        │   - Content type: signed data       │
        │   - Signer info (cert + sig)        │
        │   - Authenticated attrs             │
        │   - TimeStampToken (from TSA)       │
        │ • DER-encode container              │
        │ → Return binary signature block     │
        └────────┬────────────────────────────┘
                 │
                 │ PKCS#7/CMS signature block
                 ▼
        ┌─────────────────────────────────────┐
        │ 5e. Embed in PDF                    │
        │                                     │
        │ • Locate signature box              │
        │ • Embed PKCS#7 block                │
        │ • Update PDF validation             │
        │ • Output signed PDF                 │
        └────────┬────────────────────────────┘
                 │
                 │ Signed PDF
                 ▼
        ┌─────────────────────────────────────┐
        │ 6. Return Response                  │
        │                                     │
        │ - Content-Type: application/pdf     │
        │ - X-Signature-Format: PKCS#7/CMS    │
        │ - X-TSA-Enabled: true               │
        │ - X-Signed-Date: ISO timestamp      │
        │ - Body: Signed PDF (Binary)         │
        └────────┬────────────────────────────┘
                 │
                 │ HTTPS Response
                 ▼
    ┌────────────────────────────┐
    │ 7. Download Signed PDF      │
    │                             │
    │ • Save to user's Downloads  │
    │ • Display success message   │
    └─────────────────────────────┘
```

### Signature Verification Flow

```
┌──────────────────────┐
│  User uploads PDF    │
│  with signature      │
└──────────┬───────────┘
           │
           ▼
    ┌──────────────────────────────┐
    │ Frontend: POST /verify        │
    │ (with Request-Sig headers)    │
    └──────────┬───────────────────┘
               │
               ▼
    ┌──────────────────────────────────┐
    │ Backend: VerifyService           │
    │                                  │
    │ 1. Extract PKCS#7 block from PDF │
    │ 2. Verify RSA signature          │
    │ 3. Validate signer certificate   │
    │ 4. Verify TSA timestamp          │
    │ 5. Check certificate revocation  │
    │ 6. Return results                │
    └──────────┬───────────────────────┘
               │
               ▼
    ┌──────────────────────────────┐
    │ Response:                    │
    │ {                            │
    │   valid: true/false,         │
    │   signer: "John Doe",        │
    │   timestamp: ISO,            │
    │   certSubject: {...},        │
    │   tsa: {                     │
    │     enabled: true,           │
    │     time: ISO,               │
    │     provider: "Quovadis"     │
    │   }                          │
    │ }                            │
    └──────────┬───────────────────┘
               │
               ▼
    ┌──────────────────────────────┐
    │ Frontend: Display Results     │
    │ • Signature valid/invalid     │
    │ • Signer information          │
    │ • Timestamp details           │
    │ • Certificate chain           │
    └──────────────────────────────┘
```

---

## Technology Stack

### Backend

| Layer              | Technology             | Purpose                       |
| ------------------ | ---------------------- | ----------------------------- |
| **Runtime**        | Node.js 18+            | JavaScript execution          |
| **Framework**      | Express.js             | HTTP server & routing         |
| **Language**       | TypeScript             | Type-safe development         |
| **PDF Processing** | pdf-lib                | PDF manipulation & signatures |
| **Cryptography**   | node-pkcs11            | USB token / PKCS#11 access    |
| **Hash**           | crypto (Node built-in) | SHA-256 computation           |
| **HTTP Client**    | axios / node-fetch     | TSA communication             |
| **Configuration**  | dotenv                 | Environment variables         |
| **Logging**        | winston / pino         | Structured logging            |

### Frontend

| Layer           | Technology       | Purpose               |
| --------------- | ---------------- | --------------------- |
| **Framework**   | Angular 17+      | SPA framework         |
| **Language**    | TypeScript       | Type-safe development |
| **Styling**     | CSS 3            | UI styling            |
| **HTTP Client** | HttpClientModule | Backend communication |
| **Crypto**      | Web Crypto API   | HMAC-SHA256 signing   |
| **Build Tool**  | Angular CLI      | Build & development   |

### Deployment

| Component           | Technology                      |
| ------------------- | ------------------------------- |
| **Windows Service** | WinSW (Windows Service Wrapper) |
| **Installer**       | Inno Setup                      |
| **Process Manager** | PM2 (optional for Linux)        |
| **Web Server**      | Nginx / IIS (reverse proxy)     |

---

## Security Architecture

### 1. Request Authentication (HMAC-SHA256)

**Purpose:** Prevent unauthorized API access

**Flow:**

```
Frontend:
  signedMessage = "POST\n/api/sign\n{timestamp}"
  signature = HMAC-SHA256(REQUEST_SIGNER_SECRET, signedMessage)
  headers: { X-Request-Signature: signature, X-Request-Timestamp: timestamp }

Backend:
  Verify: signature == HMAC-SHA256(REQUEST_SIGNER_SECRET, signedMessage)
  Check: |now - timestamp| < tolerance (5 minutes default)
```

**Protection:** ✓ API injection attacks ✓ Unauthorized sign requests ✓ Timestamp freshness

### 2. USB Token Security

**Private Key Storage:** Hardware-based (USB token)

- Private key never exposed in software
- PKCS#11 driver interface
- PIN-protected access

**Authentication:**

```
1. User enters PIN
2. Backend verifies PIN with token
3. Token unlocks private key
4. Sign operation executes
5. Private key locked after signature
```

### 3. Timestamp Authority (RFC 3161)

**Purpose:** Prevent signature backdating

**Security Properties:**

- Cryptographically signed by TSA
- Timestamps are verifiable and tamper-proof
- Mandatory (no local fallback)
- Uses external authority (Quovadis)

**Implementation:**

```
TimeStampRequest → TSA → TimeStampToken (DER-encoded)
              ↓
        Embedded in PKCS#7
              ↓
        Proves signature time
```

### 4. PKCS#7/CMS Signature Container (RFC 2630/5652)

**Structure:**

```
PKCS#7 SignedData
├── Content (signed data)
├── Signer Info
│   ├── Signer Certificate
│   ├── RSA Signature
│   └── Authenticated Attributes
│       └── Timestamp (from TSA)
└── Certificate Chain
```

**Security Benefits:**

- Industry standard (Adobe Reader compatible)
- Verifiable signature chain
- Timestamp embedded (integrity proof)
- Multiple signature support

### 5. Transport Security

**HTTPS / TLS 1.3:**

- Encrypted request/response (in-transit)
- Certificate pinning (recommended)
- Perfect forward secrecy

### Threat Mitigation

| Threat                    | Mitigation                          |
| ------------------------- | ----------------------------------- |
| Request injection/forgery | HMAC-SHA256 request signing         |
| Unauthorized signing      | Request authentication + PIN        |
| Key theft                 | Hardware USB token (PKCS#11)        |
| Signature backdating      | RFC 3161 TSA (mandatory)            |
| Signature tampering       | PKCS#7/CMS validation               |
| MITM attacks              | HTTPS/TLS with cert pinning         |
| Replay attacks            | Timestamp validation (5-min window) |

---

## Scalability & Performance

### Horizontal Scaling

**Stateless Backend:**

- Each request is independent
- No session state on server
- Can run multiple instances behind load balancer

**Architecture:**

```
┌─────────────┐
│ Load Balancer
│ (Nginx)     │
└─────┬───────┘
      │
    ┌─┴─┬────┬────┐
    ▼   ▼    ▼    ▼
   [BE1][BE2][BE3][BE4]  ← Identical Node instances
    │   │    │    │
    └───┴────┴────┘
        │
    [USB Token]  ← Single hardware device
```

**Bottleneck:** USB token (single device) → requires:

- Token pooling (multiple tokens for parallel signing)
- Request queuing
- Load balancing across tokens

### Performance Metrics

| Operation             | Duration        |
| --------------------- | --------------- |
| PDF parsing (1-10 MB) | 50-200 ms       |
| SHA-256 hash          | 10-50 ms        |
| TSA request           | 500-2000 ms     |
| RSA signature         | 20-100 ms       |
| PKCS#7 assembly       | 30-80 ms        |
| **Total signing**     | **700-2300 ms** |

**Optimization Strategies:**

1. Async TSA requests (parallel with other ops)
2. Caching hash computations
3. PDF streaming (for large files)
4. Token request queueing

### Memory Management

**Per-Request Memory:**

- PDF buffer: ~1 MB (configurable)
- Hash computations: ~1 KB
- PKCS#7 container: ~2-5 KB
- Total: ~2-6 MB per concurrent request

**Memory Limits:**

- Set Node heap max: `--max-old-space-size=2048`
- Monitor GC pressure
- Implement request pooling

---

## Deployment Architecture

### Windows Deployment

```
┌──────────────────────────────────────┐
│  Windows Server 2019/2022            │
│                                      │
│  ┌──────────────────────────────────┐│
│  │ WinSW Windows Service             ││
│  │ (DSCBackendService)               ││
│  │                                   ││
│  │  ┌──────────────────────────────┐││
│  │  │ Node.js Runtime (v18+)        │││
│  │  │                               │││
│  │  │  ┌────────────────────────────┐│││
│  │  │  │ Express Server (port 3000) │││││
│  │  │  │ Signing API                │││││
│  │  │  └────────────────────────────┘│││
│  │  │                               │││
│  │  │ USB Token (PKCS#11 driver)    │││
│  │  └──────────────────────────────┘││
│  │                                   ││
│  │ .env: REQUEST_SIGNER_SECRET, ... ││
│  └──────────────────────────────────┘│
│                                      │
│  ┌──────────────────────────────────┐│
│  │ IIS / Nginx (Reverse Proxy)      ││
│  │ :80 → :3000 (HTTPS termination)  ││
│  └──────────────────────────────────┘│
│                                      │
│  ┌──────────────────────────────────┐│
│  │ Angular Frontend (Static SPA)    ││
│  │ dist/frontend/browser/           ││
│  └──────────────────────────────────┘│
└──────────────────────────────────────┘
```

### Linux Deployment

```
┌──────────────────────────────────────┐
│  Linux Server (Ubuntu 22.04+)        │
│                                      │
│  ┌──────────────────────────────────┐│
│  │ Docker Container (Optional)      ││
│  │                                   ││
│  │  ┌──────────────────────────────┐││
│  │  │ Node.js 18+ (slim image)     │││
│  │  │ Express Server               │││
│  │  │ USB Token access (passthrough)│││
│  │  └──────────────────────────────┘││
│  │                                   ││
│  │  ┌──────────────────────────────┐││
│  │  │ PM2 / systemd (Process Mgmt) │││
│  │  └──────────────────────────────┘││
│  └──────────────────────────────────┘│
│                                      │
│  ┌──────────────────────────────────┐│
│  │ Nginx (Reverse Proxy, SSL/TLS)   ││
│  │ Port 443 → 3000                  ││
│  │ Static SPA serving               ││
│  └──────────────────────────────────┘│
│                                      │
│  /var/log/dsc-backend/error.log     │
│  /var/log/dsc-backend/app.log       │
└──────────────────────────────────────┘
```

### Configuration Management

**Environment Variables (.env):**

```env
# Server
NODE_ENV=production
PORT=3000

# Request Signing
REQUEST_SIGNER_SECRET=<shared-secret-with-frontend>
REQUEST_SIGNER_TOLERANCE=300000  # 5 minutes

# TSA
ENABLE_TSA=true
TSA_URL=http://timestamp.quovadis.com/tsa

# USB Token
PKCS11_MODULE_PATH=/path/to/libpkcs11.so

# CORS
FRONTEND_URL=https://yourdomain.com
```

---

## State Management

**Stateless API Design:**

- No client sessions or server-side state
- Each request is self-contained and authenticated
- Request signature headers (X-Request-Signature, X-Request-Timestamp) provide authentication
- Signed PDFs returned directly to client (signatures embedded in document)
- No database or persistent signature storage required

---

## Error Handling & Resilience

### Error Categories & Handling

| Error Type                | Cause                            | Response                  |
| ------------------------- | -------------------------------- | ------------------------- |
| **Request Sig Invalid**   | Bad X-Request-Signature header   | 401 Unauthorized          |
| **Timestamp Stale**       | X-Request-Timestamp > 5 min old  | 401 Unauthorized          |
| **PDF Invalid**           | Corrupted or unsupported PDF     | 400 Bad Request           |
| **USB Token Error**       | Token disconnected / driver fail | 500 Internal Server Error |
| **PIN Invalid**           | Wrong PIN entered                | 403 Forbidden             |
| **TSA Unavailable**       | Network error or TSA down        | 503 Service Unavailable   |
| **Cert Expired/Critical** | Certificate no longer valid      | 403 Forbidden             |

### TSA Behavior

**Current Implementation: TSA is Mandatory**

- No fallback to local timestamps
- If TSA is unavailable, signing operation fails
- Returns 503 Service Unavailable
- Ensures signatures have legal timestamp validity

### Error Handling Examples

**Request Authentication Failure:**

```
Request lacks X-Request-Signature header
→ 401 Unauthorized: "Invalid request signature"
```

**Certificate Critical:**

```
Certificate expiring in < 10 days
→ 403 Forbidden: "Certificate must be renewed before signing"
```

**TSA Failure:**

```
Timestamp Authority unreachable
→ 503 Service Unavailable: "TSA service unavailable - cannot create signature without timestamp"
```

---

## API Endpoints Reference

### Sign Endpoint

**POST /api/sign**

Required Headers:

- `X-Request-Signature`: HMAC-SHA256 of signed message
- `X-Request-Timestamp`: Current timestamp in milliseconds

Request Body (multipart/form-data):

- `file`: PDF document to sign
- `pin`: USB token PIN
- `driverPath` (optional): Custom PKCS#11 driver path

Response Headers (Success):

- `X-Signed-Date`: ISO timestamp of signature
- `X-Cert-Days-Remaining`: Days until certificate expires
- `X-Cert-Expiry-Date`: Certificate expiration date
- `X-Cert-Warning`: Warning message if expiring soon

Response Body: Signed PDF (application/pdf)

**Errors:**

- 400: Invalid PDF or parameters
- 401: Invalid request signature
- 403: Certificate expired or critical
- 500: USB token error
- 503: TSA unavailable

### Verify Endpoint

**POST /api/verify**

Request Body (multipart/form-data):

- `file`: Signed PDF to verify

Response Body (application/json):

```json
{
  "isValid": true/false,
  "signer": "Certificate subject name",
  "signingTime": "ISO timestamp",
  "tsaInfo": {
    "enabled": true,
    "timestamp": "ISO timestamp",
    "provider": "Quovadis"
  }
}
```

### Certificate Status Endpoint

**POST /api/cert-status**

Request Body (multipart/form-data):

- `pin`: USB token PIN

Response Body (application/json):

```json
{
  "status": "valid|warning|critical|expired",
  "daysRemaining": 30,
  "expiryDate": "2026-05-09T00:00:00Z",
  "signerName": "John Doe",
  "message": "Certificate valid"
}
```

### Auto-Detect Token Endpoint

**GET /api/auto-detect-token**

Response Body (application/json):

```json
{
  "detected": true,
  "driverName": "Hypersecu ePass3000",
  "driverPath": "C:\\Windows\\System32\\eps2003csp11v2.dll",
  "message": "USB token detected"
}
```

Errors:

- 404: No USB token device found
- 500: Driver initialization error

### Supported Drivers Endpoint

**GET /api/supported-drivers**

Response Body (application/json):

```json
{
  "platform": "windows",
  "drivers": [
    {
      "name": "Hypersecu ePass3000",
      "windowsPath": "C:\\Windows\\System32\\eps2003csp11v2.dll",
      "linuxPath": "/usr/lib/libepass2003.so"
    },
    {
      "name": "SafeNet eToken",
      "windowsPath": "C:\\Windows\\System32\\eTPKCS11.dll",
      "linuxPath": "/usr/lib/libeTPKCS11.so"
    }
  ],
  "message": "Supported USB token drivers"
}
```

---

## Summary

**DSC-in-Node** provides a production-ready digital signature solution with:

- ✅ RFC 3161 compliant timestamps (Quovadis TSA)
- ✅ RFC 2630/5652 PKCS#7/CMS signature containers
- ✅ Hardware-based key storage (USB token via PKCS#11)
- ✅ HMAC-SHA256 request authentication
- ✅ Automatic USB token detection
- ✅ Certificate expiration validation
- ✅ Cross-platform deployment (Windows Service, Linux)
- ✅ Stateless architecture for horizontal scaling

The system is designed for security and compliance with minimal operational overhead.

---

**Document Version:** 1.0  
**Last Updated:** April 9, 2026  
**Status:** Reflects Currently Implemented Features Only
