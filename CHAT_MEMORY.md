# DSC-in-Node Chat Memory - PROJECT STATUS

**Last Updated:** April 8, 2026
**Current Status:** ⚠️ Phase 2 Partially Rolled Back

- ✅ Phase 1: Feasibility Assessment Complete
- 🔄 Phase 2: Implementation Packages Installed (5 npm packages) - Code Implementations Reverted
- ⏳ Phase 2 Code: Ready to Implement when needed

---

## 📋 LATEST SESSION UPDATE (April 8, 2026)

### What Happened

User implemented all 5 production features from scratch:

1. Installed 5 npm packages (express-rate-limit, winston, jsonwebtoken, @types/jsonwebtoken, etc.)
2. Created 5 new service/middleware files with complete implementations
3. Updated existing files (sign.controller.ts, sign.route.ts, frontend services)
4. Both backend and frontend compiled successfully with 0 errors

### Then User Reverted

All newly written implementation files were undone/emptied:

- ❌ `auth.middleware.ts` - emptied (was: JWT token generation & verification)
- ❌ `rate-limit.middleware.ts` - emptied (was: 4-tier rate limiting)
- ❌ `pkcs7-signer.service.ts` - emptied (was: PKCS#7 CMS signatures)
- ❌ `audit.service.ts` - emptied (was: Hash-chained audit logging)
- ❌ `tsa.service.ts` - never created (would be: RFC 3161 timestamps)
- ❌ `PRODUCTION_UPGRADE.md` - reverted (was: complete feature documentation)

### Current Result

- ✅ npm packages still installed and ready
- ✅ Original services/routes/controllers unaffected
- ✅ TypeScript compilation will succeed (no code now)
- ❌ Production features NOT active (code removed)
- ❌ Environment variables NOT configured (no JWT_SECRET, TSA_URL, etc.)
- ❌ Middleware NOT hooked into routes

---

## 🏗️ CURRENT ARCHITECTURE

### Active Backend Services (✅ Implemented & Working)

- **Backend Helper:** Express.js on Port 45763
- **Frontend:** Angular standalone components on Port 4200

### Active Routes (Working)

- POST /api/sign → Sign PDF with USB token
- POST /api/verify → Verify embedded signatures
- POST /api/cert-status → Check certificate expiration
- GET /api/supported-drivers → List USB token drivers
- GET /api/auto-detect-token → Auto-detect connected token

### Originally Implemented Services (✅ Deployed)

- `sign.service.ts` - USB token + certificate handling
- `hash.service.ts` - SHA256 hashing + HMAC-SHA256
- `verify.service.ts` - Signature verification
- `pdf-signer.service.ts` - PDF annotation + signature embedding

---

## 📦 PHASE 2 STATUS: Production Features (Packages Installed, Code Reverted)

### Installed but Not Implemented

The following npm packages are installed in package.json but code implementations are NOT currently active:

```json
{
  "express-rate-limit": "^8.3.2", // Rate limiting (NOT ACTIVE)
  "jsonwebtoken": "^9.0.3", // JWT auth (NOT ACTIVE)
  "winston": "^3.19.0", // Audit logging (NOT ACTIVE)
  "@types/jsonwebtoken": "^9.0.10" // TypeScript types (NOT ACTIVE)
}
```

### Planned But Reverted Features (Ready for Re-Implementation)

| Feature                  | File                               | Status        | Details                                                             |
| ------------------------ | ---------------------------------- | ------------- | ------------------------------------------------------------------- |
| **PKCS#7/PAdES Signing** | `pkcs7-signer.service.ts` (empty)  | 🔴 Not Active | RFC 2630 CMS signatures for Adobe Reader compatibility              |
| **JWT Authentication**   | `auth.middleware.ts` (empty)       | 🔴 Not Active | HS256 24-hour tokens with Bearer auth                               |
| **Rate Limiting**        | `rate-limit.middleware.ts` (empty) | 🔴 Not Active | 4-tier: API(100/15min), PIN(5/15min), Cert(10/5min), Verify(50/1hr) |
| **Audit Logging**        | `audit.service.ts` (empty)         | 🔴 Not Active | Hash-chained append-only compliance logging (tamper detection)      |
| **TSA Integration**      | `tsa.service.ts` (never created)   | 🔴 Not Active | RFC 3161 timestamp authority (Sectigo by default)                   |

### Missing Configuration (Not in .env)

```
# NOT CONFIGURED - Would be needed for Phase 2
JWT_SECRET=...
JWT_EXPIRY=24h
TSA_URL=https://timestamp.sectigo.com/rfc3161
```

### Routes NOT Using New Middleware

- ✅ Routes defined but ❌ NOT protected by authentication
- ✅ Routes defined but ❌ NOT protected by rate limiting
- ✅ Services called but ❌ NOT logging to audit trail

---

## 🔧 RE-IMPLEMENTATION CHECKLIST (When Ready)

To re-enable all 5 production features, follow this order:

### Step 1: Update .env Configuration

```bash
# Add to backend/.env
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRY=24h
TSA_URL=https://timestamp.sectigo.com/rfc3161
```

### Step 2: Implement Middleware Files

**2A. auth.middleware.ts** (JWT token generation & verification)

- Import: `import jwt from 'jsonwebtoken'`
- Export: `generateToken()`, `authMiddleware()`, `tokenHandler()`
- Route endpoint: `POST /api/auth/token` (generates JWT)
- Middleware: Validates Bearer token on all protected routes

**2B. rate-limit.middleware.ts** (4-tier rate limiting)

- Import: `import rateLimit from 'express-rate-limit'`
- Export: 4 limiters: `apiLimiter`, `signPinLimiter`, `certStatusLimiter`, `verifyLimiter`
- Config: Uses user.sub if authenticated, falls back to IP
- Response: 429 status with remainingAttempts

### Step 3: Implement Service Files

**3A. pkcs7-signer.service.ts** (RFC 2630 PKCS#7 CMS)

- Import: `import forge from 'node-forge'`
- Export: `Pkcs7SignerService.createPkcs7Signature()`
- Purpose: Creates Adobe Reader-compatible signatures
- Returns: Hex-encoded DER bytes for PDF /Sig dictionary

**3B. audit.service.ts** (Hash-chained compliance logging)

- Import: `import winston from 'winston'`
- Export: `AuditLogger` singleton with methods: `logSign()`, `logVerify()`, `logCertStatus()`, `logRateLimit()`
- Feature: Each entry includes SHA256(previous + current) for tamper detection
- Storage: 10MB file rotation, 10 files retained

**3C. tsa.service.ts** (RFC 3161 Timestamp Authority)

- Import: HTTPS client for TSA endpoint
- Export: `TsaService.getTimestamp()`
- Default: Sectigo timestamp authority
- Timeout: 5 seconds with fallback to system time

### Step 4: Wire Up Routes & Middleware

**4A. In sign.route.ts:**

```typescript
import { authMiddleware } from "../middleware/auth.middleware";
import {
  signPinLimiter,
  verifyLimiter,
  certStatusLimiter,
} from "../middleware/rate-limit.middleware";

router.post("/sign", authMiddleware, signPinLimiter, signHandler);
router.post("/verify", authMiddleware, verifyLimiter, verifyHandler);
router.post(
  "/cert-status",
  authMiddleware,
  certStatusLimiter,
  certStatusHandler,
);
// Plus token endpoint:
router.post("/auth/token", tokenHandler);
```

**4B. In sign.controller.ts:**

- Import: `auditLogger`, `PdfSignerService`, `TsaService`
- Call: `auditLogger.logSign()` on success/failure
- Call: `tsaService.getTimestamp()` for TSA timestamp
- Call: `PdfSignerService.createPkcs7Signature()` for PKCS#7 signing
- Update: Response headers with X-TSA-Timestamp, X-TSA-Authority

**4C. In frontend (dsc.service.ts):**

- Add: `getOrGenerateToken(userId)` method
- Add: `TokenResponse` interface
- Update: All API calls to include `Authorization: Bearer <token>` header
- Storage: localStorage with expiry timestamp

### Step 5: Testing

```bash
# Backend should compile with 0 errors
cd backend && npm run dev

# Frontend should compile with 0 errors
cd frontend && npm run build

# Test JWT token generation
curl -X POST http://localhost:45763/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId":"user123","email":"user@example.com"}'

# Test rate limiting (should fail after 5 attempts)
# Test audit logging (check logs/audit.log)
# Test PKCS#7 signature (verify in Adobe Reader)
```

---

## PORT & CONFIGURATION

### Backend .env (Current State - Only Original Config)

```
PKCS11_LIBRARY_PATH_WINDOWS=C:\\Windows\\System32\\eps2003csp11v2.dll
PORT=45763

# Secret key for signing verification
SIGNING_SECRET=your-secure-secret-key-change-this-in-production

# Auto-detection enabled: scans drivers in order
# Optional: Force driver with PKCS11_LIBRARY_PATH

# MISSING (Phase 2 needs these):
# JWT_SECRET=your-secret-key
# JWT_EXPIRY=24h
# TSA_URL=https://timestamp.sectigo.com/rfc3161
```

### Frontend API Base URL

- Configured in: `frontend/src/app/services/dsc.service.ts`
- URL: `http://localhost:45763/api`

---

## BACKEND SERVICES (Express.js)

### sign.service.ts - USB Token & Certificate Handling

**Key Methods:**

```typescript
constructor(pin: string, customDriverPath?: string)
  // Load USB token via PKCS#11, validate PIN, extract certificate
  // Optional customDriverPath for non-standard driver locations

static getSupportedDrivers(): Array<{name, path, enabled}>
  // List all supported USB token drivers
  // Includes: Hypersecu ePass3000, SafeNet eToken, Thales Luna, YubiKey 5, etc.
  // Returns platform-specific paths (Windows .dll / Linux .so)

static autoDetectDriver(): {driverPath, driverName} | null
  // NEW: Auto-detect connected USB token
  // Scans through supported drivers, returns first one that works
  // Returns null if no device found

getSignerName(): string
  // Return certificate subject name

getCertificateDer(): Buffer | null
  // Return certificate in DER format

getCertificatePem(): string | null
  // Return certificate in PEM format (for embedding)

getCertificateExpirationStatus(): {
  status: 'expired' | 'critical' | 'warning' | 'valid';
  daysRemaining: number;
  expiryDate: Date;
  message: string;
}
  // Status Logic:
  // - expired: daysRemaining < 0
  // - critical: 0 <= daysRemaining < 15 (BLOCKS SIGNING)
  // - warning: 15 <= daysRemaining < 30
  // - valid: daysRemaining >= 30

sign(digest: Buffer): Buffer
  // Sign PDF hash with USB token private key (RSA-SHA256)
```

### hash.service.ts - Hash & HMAC Computation

**Key Methods:**

```typescript
computePdfHash(pdfBuffer: Buffer): Buffer
  // Compute SHA256 hash of PDF bytes

computeServerHmac(secret: string, certificatePem: string, pdfHash: string): string
  // Compute HMAC-SHA256(secret, certificatePem + ':' + pdfHash)
  // Used for server authentication

verifyServerHmac(secret: string, certificatePem: string, pdfHash: string, providedHmac: string): boolean
  // Verify HMAC with timing-safe comparison (prevents timing attacks)
```

### verify.service.ts - Signature Verification (with/without token)

**Key Methods:**

```typescript
loadPublicKeyFromPem(certificatePem: string): string
  // Parse public key from certificate PEM

static verifyWithCertificate(signature: Buffer, digest: Buffer, certificatePem: string): boolean
  // Verify signature using embedded certificate (NO USB TOKEN NEEDED)
  // Enables cross-system verification
```

### pdf-signer.service.ts - PDF Annotation & Signature Embedding

**Signature Block Interface:**

```typescript
interface DetachedSignatureBlock {
  signature: string; // Hex-encoded signature
  hash: string; // Hex-encoded PDF hash
  certificatePem?: string; // Base64-encoded certificate
  serverHmac?: string; // HMAC for authentication
}
```

**Key Methods:**

```typescript
embedDetachedSignatureBlock(pdfBuffer: Buffer, signatureBlock: DetachedSignatureBlock, signerName?: string): Buffer
  // Embed signature metadata into PDF
  // Adds visual metadata box to last page

extractDetachedSignatureBlock(pdfBuffer: Buffer): DetachedSignatureBlock | null
  // Extract signature metadata from PDF
```

### sign.controller.ts - API Request Handlers

**Endpoints:**

```typescript
signHandler(req: Request, res: Response): Promise<void>
  POST /api/sign
  • Parse FormData (file, pin, driverPath?)
  • Create SignerService (load cert from token with optional custom driver)
  • Check getCertificateExpirationStatus()
  • If critical/expired: Return 403 Forbidden
  • Compute PDF hash → Sign → Compute HMAC → Embed
  • Return signed PDF with headers:
    - X-Cert-Warning: warning message
    - X-Cert-Days-Remaining: number
    - X-Cert-Expiry-Date: ISO date
    - X-Signed-Date: ISO timestamp

verifyHandler(req: Request, res: Response): Promise<void>
  POST /api/verify
  • Extract signature block from PDF
  • Verify HMAC (if SIGNING_SECRET configured)
  • Verify cryptographic signature
  • Return { isValid, verification, signature details }

certStatusHandler(req: Request, res: Response): Promise<void>
  POST /api/cert-status
  • Diagnostic endpoint (requires PIN)
  • Returns: { status, daysRemaining, expiryDate, message, signerName }

autoDetectTokenHandler(req: Request, res: Response): Promise<void>
  GET /api/auto-detect-token
  • NEW: Auto-detect connected USB token device
  • Scans supported drivers: Hypersecu, SafeNet, Thales, YubiKey, etc.
  • Returns: { detected, driverName, driverPath, message }
  • 404 if no device found, 500 on error

getSupportedDriversHandler(req: Request, res: Response): Promise<void>
  GET /api/supported-drivers
  • NEW: List all supported USB token drivers
  • Returns: { platform, drivers[], message }
  • Includes path for Windows/Linux for each driver
```

**Helper Functions:**

```typescript
getHardwareErrorResponse(errorMsg: string): { status: number; body: { code, error } }
  // Normalize USB token/driver errors to actionable HTTP responses
  // Returns TOKEN_NOT_INSERTED (503) or PKCS11_DRIVER_MISSING (500)

isPinErrorMessage(errorMsg: string): boolean
isPkcs11DriverErrorMessage(errorMsg: string): boolean
isUsbTokenMissingErrorMessage(errorMsg: string): boolean
isUsbTokenErrorMessage(errorMsg: string): boolean
```

---

## FRONTEND SERVICES (Angular)

### dsc.service.ts - HTTP API Wrapper

**Key Methods:**

```typescript
signPdf(file: File, pin: string, driverPath?: string): Observable<SignPdfResult>
  // Returns: { blob, signedDate, certWarning? }
  // Extracts warning headers from response
  // NEW: Optional driverPath parameter sent in FormData

autoDetectToken(): Observable<any>
  // NEW: Call GET /api/auto-detect-token
  // Returns: { detected, driverName, driverPath, message }

getSupportedDrivers(): Observable<any>
  // NEW: Call GET /api/supported-drivers
  // Returns: { platform, drivers[], message }

verifyEmbeddedSignature(file: File): Observable<VerifyEmbeddedSignatureResponse>
  // Returns: { isValid, verification, signature details, message }

checkCertificateStatus(pin: string): Observable<{
  status: string;
  daysRemaining: number;
  expiryDate: string;
  message: string;
  signerName: string;
}>
  // Diagnostic endpoint call

downloadPdf(signedPdfBlob: Blob, fileName: string): void
  // Download blob with automatic filename

async getApiErrorInfo(error: unknown): Promise<ApiErrorInfo>
  // Parse API error payloads (handles Blob responses)

formatApiErrorMessage(apiError: ApiErrorInfo): string
  // Format error for UI display
```

---

## FRONTEND COMPONENTS (Angular)

### pdf-signer.component.ts - Main PDF Signing UI

**Signals (State Management):**

```typescript
selectedFile = signal<File | null>(null);
userPin = signal<string>("");
tempPin = signal<string>(""); // Temporary PIN for confirmation
isLoading = signal(false);
showPinInput = signal(false);
showWrongPinAlert = signal(false);
showCertConfirmation = signal(false); // NEW - Cert confirmation modal
signingResult = signal<SigningResult | null>(null);
errorMessage = signal<string>("");
certWarning = signal<{ message; daysRemaining; expiryDate } | null>(null);
showCertWarning = signal(false);
certStatusInfo = signal<{
  status: string;
  daysRemaining: number;
  expiryDate: string;
  message: string;
  signerName: string;
} | null>(null);
showCertStatusModal = signal(false);

// NEW: USB Token Auto-Detection (April 9, 2026)
detectedDevice = signal<string>(""); // Device name (e.g., 'Hypersecu ePass3000')
detectedDevicePath = signal<string>(""); // Driver path (e.g., 'C:\\Windows\\System32\\eps2003csp11v2.dll')
isDetectingDevice = signal(false);
deviceDetectionError = signal<string>("");
```

**Key Methods:**

```typescript
ngAfterViewInit(): void
  // NEW: Auto-detect USB token device on component init
  // Call autoDetectDevice() to populate detectedDevice signal

private autoDetectDevice(): void
  // NEW: Calls dscService.autoDetectToken() to detect connected USB
  // Stores detection result in detectedDevice/detectedDevicePath signals
  // Sets deviceDetectionError if detection fails

onFileSelected(event: Event): void
  // Validate PDF type, set selectedFile signal

onSignClick(): void
  // Show PIN input modal

onPinSubmit(): void
  // MAIN FLOW (NEW):
  // 1. Validate PIN input
  // 2. Call checkCertificateStatus(pin)
  // 3. Store PIN in tempPin signal
  // 4. Show certification confirmation modal
  // 5. DO NOT sign yet - wait for user confirmation

onCertConfirmYes(): void
  // Check if status='expired' or 'critical' → Reject & show error
  // Otherwise → Call performSigning(file, tempPin)

onCertConfirmNo(): void
  // Cancel signing, clear tempPin, reset UI

private performSigning(file: File, pin: string): void
  // Call dscService.signPdf(file, pin, detectedDevicePath())
  // Passes auto-detected driver path for better compatibility
  // On success: Show download button
  // On error: Call handleSignError()

downloadSignedPdf(): void
  // Download signed PDF blob

private async handleSignError(error: unknown): void
  // Categorize errors: PIN error, cert error, hardware error
  // Show appropriate error message

getStatusClassName(): string
  // Return CSS class: 'status-valid', 'status-warning', etc.
```

### pdf-signer.component.html - UI Template

**Sections:**

1. **File Upload:** Drag-drop or click to select PDF
2. **Sign Button:** Triggers PIN modal
3. **PIN Modal:** Password input for USB token
4. **Certificate Confirmation Modal (NEW):**
   - Uses `[ngSwitch]="certStatusInfo()?.status"` for dynamic content
   - Valid (>30d): "Do you want to sign in?" → Yes/No buttons
   - Warning (15-29d): "Expiring in X days. Renew soon." → Continue/Back
   - Critical (<15d): "Renew IMMEDIATELY!" → Back only (BLOCKS signing)
   - Expired: "Cannot be used." → Back only (BLOCKS signing)
5. **Wrong PIN Alert:** Shows error if PIN incorrect
6. **Results Section:** Download button after successful signing
7. **Certificate Warning Modal:** Shows after signing if expiring soon

### pdf-signer.component.css - Styling

**New Styles:**

```css
.cert-confirmation-buttons
  // Flex layout for dynamic button sizing

.cert-confirmation-buttons .confirm-btn
  // Green button for "Yes/Continue Signing"

.cert-confirmation-buttons .cancel-btn
  // Red button for "No/Go Back"

.cert-confirmation
  // Modal styling for certificate confirmation dialog
```

---

## CERTIFICATE VALIDATION FLOW (NEW - April 7, 2026)

**User Journey:**

```
1. User selects PDF file
2. User clicks "🔐 Sign PDF"
3. PIN input modal appears
4. User enters PIN
5. System calls checkCertificateStatus(pin)
   ↓
6. Certificate status determined:
   • Valid (>30 days) → Show "Do you want to sign in?"
   • Warning (15-29 days) → Show "Expiring in X days"
   • Critical (<15 days) → Show "Renew IMMEDIATELY!"
   • Expired → Show "Cannot be used"
   ↓
7. User clicks Yes/Continue/Back
   ↓
   If YES/CONTINUE:
   • performSigning() is called
   • PDF is signed with USB token
   • HMAC authentication computed
   • Signature embedded in PDF
   • Download button appears
   ↓
   If BACK/NO:
   • Signing cancelled
   • PIN cleared from memory
   • Modal closes
```

**Business Logic:**

| Certificate Status | Days Remaining | Display              | Buttons       | Can Sign? | Backend Block? |
| ------------------ | -------------- | -------------------- | ------------- | --------- | -------------- |
| Valid              | ≥30            | "Certificate valid"  | Yes/No        | ✅ YES    | No             |
| Warning            | 15-29          | "Expiring in X days" | Continue/Back | ✅ YES    | No             |
| Critical           | 0-14           | "Renew IMMEDIATELY!" | Back only     | ❌ NO     | 403 Forbidden  |
| Expired            | <0             | "Cannot be used"     | Back only     | ❌ NO     | 403 Forbidden  |

---

## SECURITY FEATURES

### 1. Pre-Sign Certificate Validation

- Certificate checked BEFORE signing attempt
- Critical/Expired status blocks signing at frontend AND backend
- All statuses show confirmation dialog with context

### 2. HMAC Server Authentication

- Secret: SIGNING_SECRET stored in .env
- Computation: HMAC-SHA256(secret, certificatePem + ':' + pdfHash)
- Verification: Timing-safe comparison (prevents timing attacks)
- Purpose: Proves PDF was signed by this specific system

### 3. Certificate Embedding

- Format: Base64-encoded PEM in signature block
- Benefit: Enables verification without USB token
- Portability: Any system can verify using embedded cert
- Security: Certificate is visible (transparency by design)

### 4. PIN Management

- Temporary storage: tempPin signal stores PIN during confirmation
- Cleanup: PIN cleared immediately after signing or cancellation
- Never persisted: No PIN saved to LocalStorage/SessionStorage
- Security: Only in-memory during signing operation

---

## ERROR HANDLING

**Backend Error Responses:**

| Error Type           | Status Code | Code                     | Message                             |
| -------------------- | ----------- | ------------------------ | ----------------------------------- |
| Wrong PIN            | 401         | CKR_PIN_INCORRECT        | "The PIN you entered is incorrect"  |
| USB Token Missing    | 503         | TOKEN_NOT_INSERTED       | "USB token not detected"            |
| Driver Missing       | 500         | PKCS11_DRIVER_MISSING    | "PKCS#11 library not configured"    |
| Certificate Critical | 403         | N/A                      | "Certificate Expiring Soon"         |
| Certificate Expired  | 403         | N/A                      | "Certificate Expired"               |
| Invalid Signature    | 400         | HMAC_VERIFICATION_FAILED | "PDF was not signed by this system" |

**Frontend Error Handling:**

```typescript
// File: pdf-signer.component.ts - handleSignError()
// Categorizes errors:
- 403 → Certificate expiration error (shown in modal)
- 401 → PIN error (retry prompt)
- 503/500 → Hardware error (USB token/driver)
- Others → Generic error message
```

---

## API RESPONSE HEADERS

**Sign Endpoint Response (Success):**

```
X-Cert-Warning: "Certificate expires in 20 days"
X-Cert-Days-Remaining: "20"
X-Cert-Expiry-Date: "2026-05-07T00:00:00Z"
X-Signed-Date: "2026-04-07T12:34:56Z"
Body: [PDF blob]
```

**Cert Status Endpoint Response:**

```json
{
  "status": "warning",
  "daysRemaining": 20,
  "expiryDate": "2026-05-07T00:00:00Z",
  "message": "Certificate expires in 20 days",
  "signerName": "John Doe",
  "timestamp": "2026-04-07T12:34:56Z"
}
```

---

## REUSABLE PATTERNS FOR OTHER PROJECTS

### Pattern 1: USB Token Certificate Loading

```typescript
// Backend
const signer = new SignerService(userPin);
const cert = signer.getCertificatePem();
const status = signer.getCertificateExpirationStatus();

// Frontend
this.dscService.checkCertificateStatus(pin).subscribe((status) => {
  if (status.status === "critical") {
    // Block action
  }
});
```

### Pattern 2: Pre-Action Confirmation Dialog

```typescript
// Component
tempData = signal<any>(null);
showConfirmation = signal(false);

onAction() {
  // Fetch data → Store in tempData → Show confirmation
  this.checkStatus().subscribe(data => {
    this.tempData.set(data);
    this.showConfirmation.set(true);
  });
}

onConfirmYes() {
  // Use tempData for actual operation
  this.performAction(this.tempData());
  this.tempData.set(null);
}
```

### Pattern 3: Multi-Status UI with ngSwitch

```html
<div [ngSwitch]="data()?.status">
  <div *ngSwitchCase="'type1'">UI for type1</div>
  <div *ngSwitchCase="'type2'">UI for type2</div>
  <div *ngSwitchDefault>Default UI</div>
</div>
```

### Pattern 4: Base64 Certificate Embedding

```typescript
// PEM → Base64
const base64Cert = Buffer.from(certPem).toString("base64");

// Later retrieval
const certPem = Buffer.from(base64Cert, "base64").toString("utf-8");
```

### Pattern 5: HMAC-SHA256 Verification

```typescript
import crypto from "crypto";

// Compute
const hmac = crypto.createHmac("sha256", secret).update(message).digest("hex");

// Verify (timing-safe)
const isValid = crypto.timingSafeEqual(
  Buffer.from(provided),
  Buffer.from(computed),
);
```

---

## FILE LOCATIONS

**Backend:**

- `backend/src/services/sign.service.ts` - USB token & cert handling
- `backend/src/services/hash.service.ts` - Hash & HMAC computation
- `backend/src/services/verify.service.ts` - Signature verification
- `backend/src/services/pdf-signer.service.ts` - PDF annotation
- `backend/src/controllers/sign.controller.ts` - API endpoints
- `backend/src/routes/sign.route.ts` - Route definitions
- `backend/.env` - Configuration secrets

**Frontend:**

- `frontend/src/app/services/dsc.service.ts` - HTTP wrapper
- `frontend/src/app/components/pdf-signer.component.ts` - Main component
- `frontend/src/app/components/pdf-signer.component.html` - UI template
- `frontend/src/app/components/pdf-signer.component.css` - Styling

**Installer:**

- `backend/installer/output/DSCBackendSetup.exe` - Latest executable

---

## FUNCTIONAL CHANGES COMPLETED (April 8, 2026)

✅ Removed immediate auto-verification after signing
✅ UI shows download only after signing
✅ Verify remains on dedicated page
✅ Explicit error categorization (PIN vs hardware vs certificate)
✅ Clean two-route backend (/sign, /verify, /cert-status)
✅ Certificate expiration checking (4 status levels)
✅ Pre-sign certificate validation (blocks critical/expired)
✅ Certificate confirmation dialog (context-aware messages)
✅ HMAC server authentication (prevents external signatures)
✅ Base64 certificate embedding (portable verification)
✅ Timing-safe HMAC verification (security)
✅ PDF signature block embedding with visual metadata
✅ Error handling for PIN/hardware/certificate
✅ .gitignore protection for secrets
✅ Port synchronized everywhere (45763)
✅ Fresh installer built with current code
✅ **Visual Signature Box Design** (bottom-left, green checkmark, watermark effect)
✅ **SVG Checkmark Implementation** (via sharp library, anti-distortion)
✅ **Checkmark Positioning** (inside box left side, 45x45px)
✅ **Layer Ordering** (borders → checkmark → text, proper watermark effect)

---

## VISUAL SIGNATURE BOX DESIGN (April 8, 2026)

### SVG Checkmark Implementation

**File**: `backend/src/controllers/sign.controller.ts`  
**Library**: sharp ^0.33.1 (SVG → PNG conversion)

**SVG Code** (embedded in `svgToPngBuffer()` function):

```xml
<svg viewBox="0 0 100 100" width="100" height="100" xmlns="http://www.w3.org/2000/svg">
  <polygon points="23,53 43,73 83,23 93,31 45,91 15,61" fill="black" />
  <polygon points="20,50 40,70 80,20 90,28 42,88 12,58" fill="#008000" stroke="black" stroke-width="2" stroke-linejoin="miter" />
</svg>
```

**Conversion Process:**

- SVG dimensions: 100x100 (doubled from 50x50 for sharper quality)
- Converted to PNG using sharp library
- Prevents distortion on different PDF viewers
- Creates clean, professional checkmark appearance

### Position on PDF

- **Location**: Bottom-left corner of last page
- **Margins**: 20px from left edge, 20px from bottom edge
- **Box Dimensions**: Dynamic based on text content
  - Width: max(headerWidth, dateWidth) + 16px padding
  - Height: 3 lines × 12px + 8px + 16px padding

### Signature Box Content & Layout

```
┌──────────────────────────────────┐
│ ✓ Signature valid                │
│ Digitally Signed by              │
│ [SIGNER_NAME]                    │
│ Date: MM/DD/YYYY, HH:MM:SS am/pm │
└──────────────────────────────────┘
```

**Text Styling:**

- Header lines (3): 9px Helvetica bold
- Date line: 7.5px Helvetica (smaller to fit within borders)
- Text color: Dark gray rgb(0.2, 0.2, 0.2)
- Text padding: 8px from box edges

### Drawing Layers (Rendering Order)

**Critical**: Order affects visual appearance!

1. **Dashed Border** (drawn first)
   - Thickness: 1.5px
   - Pattern: 4px dash, 3px gap
   - Color: Dark gray rgb(0.2, 0.2, 0.2)

2. **SVG Checkmark Image** (drawn second - BEHIND text)
   - Size: 45x45px
   - Position: `boxX + 12, boxY + boxHeight/2 - 22.5`
   - Effect: Watermark (appears behind text)

3. **Text Content** (drawn last - ON TOP)
   - Header lines
   - Date line
   - All text visible and readable

**Why This Order?**

- Checkmark rendered first in code → appears on lower PDF layer
- Text rendered last in code → appears on top layer
- Creates professional watermark effect

### Checkmark Positioning Details

- **Horizontal**: `boxX + 12` (12px from left edge, inside box with offset)
- **Vertical**: `boxY + boxHeight/2 - 22.5` (vertically centered in box)
- **Previous Position**: `boxX + 5` (was too close to left edge)
- **Adjustment**: Moved 7px right for better visual balance

### Quality Improvements Made (April 8)

✅ **Increased SVG Dimensions**: 50x50 → 100x100 for sharper PNG output  
✅ **Position Refinement**: Bottom-left corner (was top-left initially)  
✅ **Checkmark Repositioning**: Left side inside box (was right edge)  
✅ **Layer Ordering**: Checkmark behind text (watermark effect, was on top)  
✅ **Horizontal Offset**: +7px right for better alignment within box  
✅ **No Distortion**: Sharp library ensures clean checkmark rendering

### Technical Implementation

**Function**: `svgToPngBuffer()` (async)

```typescript
const svgToPngBuffer = async (): Promise<Buffer> => {
  const svgCode = `<svg viewBox="0 0 100 100" width="100" height="100" ...>...`;
  const pngBuffer = await sharp(Buffer.from(svgCode)).png().toBuffer();
  return pngBuffer;
};
```

**Embedding in PDF:**

```typescript
const checkmarkPngBuffer = await svgToPngBuffer();
const checkmarkImage = await pdfDoc.embedPng(checkmarkPngBuffer);
targetPage.drawImage(checkmarkImage, {
  x: boxX + 12,
  y: boxY + boxHeight / 2 - checkmarkSize / 2,
  width: 45,
  height: 45,
});
```

**Error Handling:**

```typescript
try {
  // ... checkmark embedding
} catch (imgError) {
  console.warn("[signHandler] Failed to embed checkmark image:", imgError);
  // PDF signs successfully even if checkmark fails
}
```

---

## 📊 PROJECT STATUS SUMMARY (As of April 8, 2026)

### ✅ Completed & Active

- **USB Token Integration:** Full PKCS#11 support (5+ device types)
- **Certificate Management:** Expiration checking, PEM/DER conversion
- **Hash Computation:** SHA256 for PDFs, HMAC-SHA256 for server auth
- **Signature Embedding:** Metadata blocks in PDFs with checkmark watermark
- **PDF Library:** pdf-lib for manipulation, sharp for checkmark rendering
- **Auto-Detection:** Scans USB token drivers automatically
- **Error Handling:** Normalized hardware errors to actionable HTTP responses

### 🔴 NOT Active (Features Ready But Code Removed)

- **PKCS#7/PAdES Signing:** Code cleared, packages installed
- **JWT Authentication:** Code cleared, packages installed
- **Rate Limiting:** Code cleared, packages installed
- **Audit Logging:** Code cleared, packages installed
- **TSA Integration:** Never started, packages missing

### 🔄 Can Be Re-Implemented

- All 5 production features have clear specifications
- npm packages already installed and ready
- Step-by-step re-implementation guide provided above
- No breaking changes to existing services

### 💾 Files Ready for Implementation

```
backend/src/middleware/
  ├─ auth.middleware.ts (empty - add JWT handling)
  ├─ rate-limit.middleware.ts (empty - add 4-tier limiting)

backend/src/services/
  ├─ pkcs7-signer.service.ts (empty - add PKCS#7 CMS)
  ├─ audit.service.ts (empty - add audit logging)
  ├─ tsa.service.ts (not created - add timestamp authority)

frontend/src/app/
  ├─ services/dsc.service.ts (needs JWT token management)
  ├─ components/pdf-signer.component.ts (needs token acquisition)
```

### 📈 Next Steps

1. Uncomment code from git history or re-implement using checklist
2. Update .env with JWT_SECRET, JWT_EXPIRY, TSA_URL
3. Wire up middleware in sign.route.ts
4. Test compilation: `npm run dev` and `npm run build`
5. Integration testing with full flow

### Signature Box in Context

**Full PDF page:**

```
Page (e.g., A4: 595x842 points)

[Document Content]
[Document Content]
[Document Content]

┌────────────────────────┐
│ ✓ Signature valid      │  ← Bottom-left corner
│ Digitally Signed by    │     (margin: 20px)
│ John Doe               │
│ Date: 08/04/2026, ...  │
└────────────────────────┘
```

### Compatibility & Standards

- **PDF Standard**: Compatible with Adobe Reader and all standard PDF viewers
- **Encoding**: PNG image (universal compatibility)
- **Platform**: Windows/Linux/macOS (sharp library supports all)
- **Metadata**: Stored in PDF properties + embedded as visual signature box
- **Verification**: Works without re-rendering (signature visible on any viewer)

---

## API ROUTES (April 9, 2026)

**Sign & Verify Routes:**

```typescript
POST / api / sign;
// Sign PDF with certificate validation
// FormData: file, pin, driverPath? (optional custom driver)
// Returns: Signed PDF blob + headers with cert expiry info

POST / api / verify;
// Verify PDF signature
// FormData: file (signed PDF)
// Returns: { isValid, verification, signature details }

POST / api / cert - status;
// Check certificate expiration (diagnostic)
// FormData: pin
// Returns: { status, daysRemaining, expiryDate, message, signerName }
```

**Discovery & Auto-Detection Routes (NEW):**

```typescript
GET / api / auto - detect - token;
// NEW: Auto-detect connected USB token device
// No parameters required
// Returns: { detected, driverName, driverPath, message }
// Scans supported drivers and returns first working one

GET / api / supported - drivers;
// NEW: List all supported USB token drivers
// No parameters required
// Returns: { platform, drivers[], message }
// Includes Windows & Linux driver paths for each type
```

---

## CURRENT FEATURES

✅ USB Token Integration (PKCS#11)
✅ Certificate Expiration Checking (4 levels)
✅ Pre-Sign Certificate Validation (blocks critical/expired)
✅ Certificate Confirmation Dialog (context-aware)
✅ HMAC Server Authentication (prevents external signatures)
✅ Base64 Certificate Embedding (enables portable verification)
✅ Manual Certificate Status Endpoint (/api/cert-status)
✅ Timing-Safe HMAC Verification (prevents timing attacks)
✅ PDF Signature Block Embedding (metadata + visual signature)
✅ Error Categorization (PIN vs hardware vs certificate)
✅ Secrets Protection (.gitignore)
✅ Fresh Installer Bundle
✅ **Visual Signature Box** (dashed border, positioned bottom-left)
✅ **SVG Checkmark** (green, rendered with sharp library for quality)
✅ **Watermark Effect** (checkmark behind text for professional appearance)
✅ **Smart Layer Ordering** (borders → checkmark → text)
✅ **USB Token Auto-Detection** (NEW - April 9, 2026)

- GET /api/auto-detect-token endpoint
- Scans Hypersecu, SafeNet, Thales, YubiKey drivers automatically
- Returns detected device name and driver path
  ✅ **Supported Drivers List** (NEW - April 9, 2026)
- GET /api/supported-drivers endpoint
- Shows all supported USB token drivers for platform
- Includes Windows and Linux paths
  ✅ **Optional Custom Driver Path** (NEW - April 9, 2026)
- Can pass driverPath to /api/sign endpoint
- Allows override of auto-detected driver
- SignerService accepts customDriverPath parameter

---

## USB TOKEN AUTO-DETECTION FLOW (NEW - April 9, 2026)

**User Experience - Automatic Detection:**

```
1. User opens PDF Signer page
2. Component loads (ngAfterViewInit)
3. autoDetectDevice() called automatically
4. dscService.autoDetectToken() → GET /api/auto-detect-token
5. Backend scans drivers in order:
   - Hypersecu ePass3000 (eps2003csp11v2.dll) ← Enabled by default
   - SafeNet eToken (eTPKCS11.dll)
   - Thales Luna (lunacsp.dll)
   - YubiKey 5 (libykcs11.dll)
6. Returns first driver that successfully initializes PKCS#11
7. Frontend displays: "✅ Detected: Hypersecu ePass3000"
8. detectedDevice signal = device name
   detectedDevicePath signal = full DLL path
9. User selects PDF and enters PIN
10. performSigning() automatically passes detectedDevicePath()
    to backend — improves compatibility without user intervention
```

**Supported USB Token Drivers:**

| Driver              | Windows DLL                               | Linux SO                 | Default     |
| ------------------- | ----------------------------------------- | ------------------------ | ----------- |
| Hypersecu ePass3000 | C:\\Windows\\System32\\eps2003csp11v2.dll | /usr/lib/libepass2003.so | ✅ Enabled  |
| SafeNet eToken      | C:\\Windows\\System32\\eTPKCS11.dll       | /usr/lib/libeTPKCS11.so  | ⬜ Optional |
| Thales Luna USB     | C:\\Windows\\System32\\lunacsp.dll        | /usr/lib/liblunacsp.so   | ⬜ Optional |
| YubiKey 5           | C:\\Windows\\System32\\libykcs11.dll      | /usr/lib/libykcs11.so    | ⬜ Optional |

**Auto-Detection API Response Examples:**

Success (Device Found):

```json
{
  "detected": true,
  "driverName": "Hypersecu ePass3000",
  "driverPath": "C:\\Windows\\System32\\eps2003csp11v2.dll",
  "message": "USB token detected: Hypersecu ePass3000"
}
```

No Device (404):

```json
{
  "detected": false,
  "message": "No USB token device detected. Please insert your USB token and try again."
}
```

---

## IMPORTANT INTEGRATION NOTES

- Recommended production flow: Angular → NestJS → Helper (not direct)
- NestJS should proxy multipart requests to helper and return signed PDF
- Currently direct Angular → Helper connection works for testing
- If Nest integration needed: Create proxy endpoints and repoint frontend URL

---

## TESTING SCENARIOS

**Valid Certificate (>30 days):**

- Popup: "Certificate valid - expires in X days. Do you want to sign in?"
- Result: Yes/No buttons, Can proceed with signing

**Warning Certificate (15-29 days):**

- Popup: "Certificate expiring in X days. Please renew."
- Result: Continue/Back buttons, Can proceed with warning

**Critical Certificate (<15 days):**

- Popup: "Certificate expires in X days. Renew IMMEDIATELY!"
- Result: Back button only, SIGNING BLOCKED

---

## OPEN ITEMS

- Terminal exit code 1 still shows, but latest code compiles without errors
- Consider Nest.js gateway integration for production
- Monitor certificate renewal workflow in live environment
- Extend auto-detection to support additional token types (SafeNet, Thales, YubiKey)
