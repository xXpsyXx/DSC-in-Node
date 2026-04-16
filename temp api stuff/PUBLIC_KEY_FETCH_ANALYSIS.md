# Public Key Fetch Analysis - RETMS Frontend

## Executive Summary

The RETMS frontend has a dedicated `DigitalSignatureService` that manages fetching and caching of the public key from `/api/digital-signature/public-key` endpoint. The public key is fetched **periodically** (every 5 minutes) and stored in **memory** (BehaviorSubject).

---

## 1. Public Key Fetch Endpoint

### URL
```
GET /api/digital-signature/public-key
```

### Base URL Configuration
- **Development**: `http://localhost:8080/api/`
- **Production**: `https://retms.idcle.com/api/`

**Files**:
- [src/environment/environment.ts](src/environment/environment.ts#L1-L5)
- [src/environment/environment.prod.ts](src/environment/environment.prod.ts#L1-L5)

---

## 2. Primary Service: DigitalSignatureService

**File**: [src/app/services/digital-signature.service.ts](src/app/services/digital-signature.service.ts)

### Service Overview
- **Scope**: Singleton (provided in 'root')
- **Implements**: OnDestroy
- **Responsibilities**: Public key management, digital signature operations, PDF verification

### Key Properties

```typescript
// Public key management
private publicKeySubject = new BehaviorSubject<string | null>(null);
public publicKey$ = this.publicKeySubject.asObservable();
private publicKeyFetchInterval: Subscription | null = null;
private destroy$ = new Subject<void>();
```

---

## 3. Public Key Fetch Methods

### 3.1 `fetchPublicKey()` - Observable-based fetch
**Line**: [50-56](src/app/services/digital-signature.service.ts#L50-L56)

```typescript
fetchPublicKey(): Observable<{ publicKey: string }> {
    return this._http.get<any>(`${this._apiUrl}digital-signature/public-key`, { withCredentials: true }).pipe(
        catchError((error) => {
            console.error('Failed to fetch public key:', error);
            throw error;
        })
    );
}
```

**Characteristics**:
- Returns an Observable
- Includes credentials (cookies)
- Handles errors with console logging
- Raw HTTP GET request

### 3.2 `getPublicKey()` - Synchronous getter
**Line**: [63-65](src/app/services/digital-signature.service.ts#L63-L65)

```typescript
getPublicKey(): string | null {
    return this.publicKeySubject.value;
}
```

**Characteristics**:
- Synchronous access to cached public key
- Returns current value from BehaviorSubject
- Returns `null` if not yet loaded

---

## 4. Public Key Fetch Lifecycle

### 4.1 Initialization
**Trigger**: Service instantiation (constructor)
**Line**: [36-37](src/app/services/digital-signature.service.ts#L36-L37)

```typescript
constructor(private readonly _http: HttpClient) {
    // Start periodic public key fetching on service initialization
    this.startPeriodicPublicKeyFetch();
}
```

### 4.2 Periodic Fetching - `startPeriodicPublicKeyFetch()`
**Lines**: [71-117](src/app/services/digital-signature.service.ts#L71-L117)

**Default Interval**: 5 minutes (300,000 ms)

```typescript
startPeriodicPublicKeyFetch(intervalMs: number = 5 * 60 * 1000): void {
    // First fetch immediately
    this.fetchPublicKey()
        .pipe(takeUntil(this.destroy$))
        .subscribe({
            next: (response: any) => {
                // Handle ApiResponse wrapper - extract publicKey from data
                const publicKey = response?.data?.publicKey || response?.publicKey;
                if (publicKey) {
                    console.log('[DigitalSignatureService] Public key fetched successfully');
                    this.publicKeySubject.next(publicKey);
                } else {
                    console.warn('[DigitalSignatureService] Public key not found in response', response);
                }
            },
            error: (error) => {
                console.error('[DigitalSignatureService] Initial public key fetch failed:', error);
            }
        });

    // Then set up periodic fetching
    this.publicKeyFetchInterval = interval(intervalMs)
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => {
            this.fetchPublicKey()
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                    next: (response: any) => {
                        // Handle ApiResponse wrapper - extract publicKey from data
                        const publicKey = response?.data?.publicKey || response?.publicKey;
                        if (publicKey) {
                            console.log('[DigitalSignatureService] Public key refreshed');
                            this.publicKeySubject.next(publicKey);
                        } else {
                            console.warn('[DigitalSignatureService] Public key not found in response', response);
                        }
                    },
                    error: (error) => {
                        console.error('[DigitalSignatureService] Periodic public key fetch failed:', error);
                    }
                });
        });
}
```

**Behavior**:
1. **Immediate fetch** on startup
2. **Periodic fetch** every 5 minutes using RxJS `interval()`
3. Response handling supports two formats:
   - `{ data: { publicKey: "..." } }` (wrapped in ApiResponse)
   - `{ publicKey: "..." }` (direct response)
4. Updated via BehaviorSubject: `publicKeySubject.next(publicKey)`
5. Cleanup via `takeUntil(this.destroy$)` on component destroy

### 4.3 Cleanup - `stopPeriodicPublicKeyFetch()`
**Lines**: [118-122](src/app/services/digital-signature.service.ts#L118-L122)

```typescript
stopPeriodicPublicKeyFetch(): void {
    if (this.publicKeyFetchInterval) {
        this.publicKeyFetchInterval.unsubscribe();
        this.publicKeyFetchInterval = null;
    }
}
```

### 4.4 Service Destruction
**Lines**: [39-42](src/app/services/digital-signature.service.ts#L39-L42)

```typescript
ngOnDestroy(): void {
    this.stopPeriodicPublicKeyFetch();
    this.destroy$.next();
    this.destroy$.complete();
}
```

---

## 5. Public Key Storage

### Storage Mechanism: Memory (BehaviorSubject)

| Property | Value | Scope |
|----------|-------|-------|
| **Storage Type** | Memory (RxJS BehaviorSubject) | Session |
| **Recovery** | Lost on page refresh | ❌ Not persisted |
| **Scope** | Service singleton | Entire application |
| **Access Type** | Observable (`publicKey$`) or getter (`getPublicKey()`) | Async or Sync |
| **Persistence** | **NONE** - memory only | No localStorage/sessionStorage |

### Access Methods

1. **Observable (Reactive)**
   ```typescript
   dscService.publicKey$.subscribe(publicKey => {
       // Use publicKey
   });
   ```

2. **Getter (Synchronous)**
   ```typescript
   const publicKey = dscService.getPublicKey();
   ```

---

## 6. Caching Mechanism

### Cache Type: **In-Memory BehaviorSubject**

| Feature | Details |
|---------|---------|
| **Cache Location** | Browser memory (service singleton) |
| **Cache Duration** | Service lifetime (lost on page refresh) |
| **Cache Invalidation** | Every 5 minutes (periodic refetch) |
| **Cache Size** | ~500 bytes (typical public key size) |
| **Pre-population** | Fetched immediately on app load |
| **Fallback** | New fetch on each page load (no persistence) |

### Cache Refresh Policy
- **Refresh Interval**: Every 5 minutes automatically
- **Manual Refresh**: None exposed (always periodic)
- **On-Demand**: Can call `fetchPublicKey()` manually

---

## 7. Components Using DigitalSignatureService

### 7.1 Designated Officer Dashboard
**File**: [src/app/pages/designated-officer-dashboard/designated-officer-dashboard.ts](src/app/pages/designated-officer-dashboard/designated-officer-dashboard.ts#L223)

**Usage**:
- Injects `DigitalSignatureService`
- Uses `checkAgentHealth()` - verify DSC agent is running
- Uses `requestSign()` - get signing JWT
- Uses `downloadPdf()` - fetch document
- Uses `signWithAgent()` - send to local agent
- Uses `submitSigned()` - verify signature
- Uses `blobToBase64()` - conversion utility

**Lines**: [1286-1308](src/app/pages/designated-officer-dashboard/designated-officer-dashboard.ts#L1286-L1308)

**Flow**:
```
1. Check Agent Health
   ↓
2. Request Sign (get JWT + hash)
   ↓
3. Download PDF
   ↓
4. Sign with Agent (USB token)
   ↓
5. Submit Signed PDF for verification
```

### 7.2 Serve Notice Page
**File**: [src/app/pages/serve-notice/serve-notice.ts](src/app/pages/serve-notice/serve-notice.ts#L103)

**Usage**:
- Injects `DigitalSignatureService`
- Uses `downloadPdf()` to fetch complaint PDFs

### 7.3 Verify Document Page
**File**: [src/app/pages/verify-document/verify-document.ts](src/app/pages/verify-document/verify-document.ts#L206)

**Usage**:
- Injects `DigitalSignatureService`
- Uses `verifyDocument()` - verify by document ID
- Uses `verifyPdf()` - verify uploaded PDF
- Does NOT directly use publicKey

**Note**: The `publicKey$` observable is exposed but NOT currently subscribed to in any component. Verification is server-side only.

---

## 8. HTTP Request/Response Configuration

### Request Headers
```typescript
{ 
    withCredentials: true  // Includes cookies in request
}
```

### Response Handling

**Location**: [src/app/interceptors/response.interceptor.ts](src/app/interceptors/response.interceptor.ts)

The response interceptor automatically unwraps the `data` property from the API response:

```typescript
// If response is wrapped in ApiResponse
{ 
    success: true, 
    data: { publicKey: "-----BEGIN PUBLIC KEY..." }, 
    message: "..." 
}

// Gets unwrapped to:
{ 
    publicKey: "-----BEGIN PUBLIC KEY..." 
}
```

The service handles both wrapped and unwrapped formats:
```typescript
const publicKey = response?.data?.publicKey || response?.publicKey;
```

---

## 9. API Response Format

### Success Response (Wrapped)
```json
{
    "success": true,
    "statusCode": 200,
    "message": "Public key retrieved successfully",
    "data": {
        "kid": "key-id-2024",
        "alg": "RS256",
        "publicKey": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBg...\n-----END PUBLIC KEY-----"
    },
    "timestamp": "2024-04-15T10:30:45.123Z"
}
```

### Success Response (Interceptor Unwrapped)
```json
{
    "kid": "key-id-2024",
    "alg": "RS256",
    "publicKey": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBg...\n-----END PUBLIC KEY-----"
}
```

---

## 10. Usage Summary Table

| Aspect | Details |
|--------|---------|
| **Endpoint** | `GET /api/digital-signature/public-key` |
| **Fetch Method** | Periodic (5-minute intervals) + Immediate on startup |
| **Total Fetches** | **288+ per day** (1 initial + 288 every 5 min) |
| **Storage** | Memory only (BehaviorSubject) |
| **Persistence** | None (lost on page refresh) |
| **Access Method** | Observable (`publicKey$`) or Getter (`getPublicKey()`) |
| **Components Using** | Designated Officer Dashboard, Serve Notice, Verify Document |
| **Public Key Usage** | Server-side verification only (exposed but unused client-side) |

---

## 11. Public Key Observable

### Property Definition
**Line**: [31](src/app/services/digital-signature.service.ts#L31)

```typescript
public publicKey$ = this.publicKeySubject.asObservable();
```

### Observable Pattern
- **Type**: RxJS Observable
- **Emits**: `string | null`
- **Subscribers**: Unknown (no direct subscriptions found in codebase)
- **Lifetime**: Service lifetime

### Current Usage in Components
**Status**: Exposed but **NOT USED** ❌

The `publicKey$` observable is defined but no components currently subscribe to it. All verification happens server-side.

---

## 12. Security Implications

### Storage Security
- ✅ **No localStorage** - Prevents persistent XSS attacks
- ✅ **Memory only** - Cleared on page reload/close
- ⚠️ **Not persisted** - Requires refetch on each page load
- ✅ **withCredentials: true** - Uses secure cookies

### Fetch Security
- ✅ **HTTPS** in production
- ✅ **Cookie-based auth** (withCredentials)
- ✅ **No hardcoded secrets**
- ⚠️ **Periodic refresh** (every 5 minutes)

---

## 13. File References

### Core Files
1. **Service**: [src/app/services/digital-signature.service.ts](src/app/services/digital-signature.service.ts)
2. **Environment (Dev)**: [src/environment/environment.ts](src/environment/environment.ts)
3. **Environment (Prod)**: [src/environment/environment.prod.ts](src/environment/environment.prod.ts)

### Components Using Service
1. [src/app/pages/designated-officer-dashboard/designated-officer-dashboard.ts](src/app/pages/designated-officer-dashboard/designated-officer-dashboard.ts)
2. [src/app/pages/serve-notice/serve-notice.ts](src/app/pages/serve-notice/serve-notice.ts)
3. [src/app/pages/verify-document/verify-document.ts](src/app/pages/verify-document/verify-document.ts)

### Interceptors
1. **HTTP**: [src/app/interceptors/http.interceptor.ts](src/app/interceptors/http.interceptor.ts)
2. **Response**: [src/app/interceptors/response.interceptor.ts](src/app/interceptors/response.interceptor.ts)

---

## 14. Summary

| Question | Answer |
|----------|--------|
| **When is public key fetched?** | Immediately on app load + every 5 minutes periodically |
| **How many times?** | 288+ times per day (minimum) |
| **Where is it stored?** | Memory only (BehaviorSubject) |
| **Is it persisted?** | No - lost on page refresh |
| **Who uses it?** | Service methods (requestSign, submitSigned, etc.) |
| **Caching strategy?** | In-memory with 5-minute refresh |
| **Client-side verification?** | No - server-side only |
| **Observable exposed?** | Yes (`publicKey$`) but unused |

