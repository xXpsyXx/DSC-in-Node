# DSC-in-Node Chat Memory - COMPREHENSIVE PROJECT REFERENCE

**Last Updated:** April 7, 2026  
**Status:** Certificate Confirmation Flow Complete + Pre-Sign Validation + Server Authentication

---

## CURRENT ARCHITECTURE

- **Backend Helper:** Express.js service under backend/src (Port 45763)
- **Frontend:** Angular standalone components under frontend/src (Port 4200)
- **Active Helper Routes:**
  - POST /api/sign (Sign PDF with certificate validation)
  - POST /api/verify (Verify embedded signature)
  - POST /api/cert-status (Check certificate expiration - diagnostic)

---

## PORT & CONFIGURATION

### Backend .env

```
PORT=45763
PKCS11_LIBRARY_PATH_WINDOWS=C:\Windows\System32\eps2003csp11v2.dll
SIGNING_SECRET=your-secret-key-here  # HMAC authentication
```

### Frontend API Base URL

- Configured in `frontend/src/app/services/dsc.service.ts`
- URL: `http://localhost:45763/api`

---

## BACKEND SERVICES (Express.js)

### sign.service.ts - USB Token & Certificate Handling

**Key Methods:**

```typescript
constructor(pin: string)
  // Load USB token via PKCS#11, validate PIN, extract certificate

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
  • Parse FormData (file, pin)
  • Create SignerService (load cert from token)
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
signPdf(file: File, pin: string): Observable<SignPdfResult>
  // Returns: { blob, signedDate, certWarning? }
  // Extracts warning headers from response

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
```

**Key Methods:**

```typescript
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
  // Call dscService.signPdf(file, pin)
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

## FUNCTIONAL CHANGES COMPLETED (April 7, 2026)

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

---

## CURRENT FEATURES

✅ USB Token Integration (PKCS#11)
✅ Certificate Expiration Checking (4 levels)
✅ Pre-Sign Certificate Validation
✅ Certificate Confirmation Dialog
✅ HMAC Server Authentication
✅ Base64 Certificate Embedding
✅ Manual Certificate Status Endpoint
✅ Timing-Safe HMAC Verification
✅ PDF Signature Block Embedding
✅ Error Categorization
✅ Secrets Protection
✅ Fresh Installer Bundle

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

**Expired Certificate:**

- Popup: "Certificate has expired and cannot be used."
- Result: Back button only, SIGNING BLOCKED

---

## OPEN ITEMS

- Terminal exit code 1 still shows, but latest code compiles without errors
- Consider Nest.js gateway integration for production
- Monitor certificate renewal workflow in live environment
