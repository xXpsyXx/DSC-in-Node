# Request Signing Guide

## Overview

The `/sign` endpoint is now **protected** — only authorized frontend applications can use it. This prevents unauthorized access to your USB token signing capabilities.

## How It Works

1. **Frontend signs the request** with a shared secret
2. **Frontend sends signed headers** with the request
3. **Backend verifies the signature** before processing
4. **Request must include a fresh timestamp** (within 5 minutes)

## Frontend Implementation

### Step 1: Install Dependencies

```bash
npm install crypto
```

### Step 2: Create a Request Signer Service

**Angular Service Example:**

```typescript
// src/app/services/request-signer.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import * as crypto from 'crypto';

@Injectable({ providedIn: 'root' })
export class RequestSignerService {
  // Must match REQUEST_SIGNER_SECRET on backend
  private readonly SECRET =
    'your-request-signer-secret-change-this-in-production';

  constructor(private http: HttpClient) {}

  /**
   * Sign a request with current timestamp
   * Returns: { signature: string, timestamp: number }
   */
  signRequest(
    method: string,
    path: string,
  ): { signature: string; timestamp: number } {
    const timestamp = Date.now();
    const signedMessage = `${method}\n${path}\n${timestamp}`;

    // HMAC-SHA256
    const signature = crypto
      .createHmac('sha256', this.SECRET)
      .update(signedMessage)
      .digest('hex');

    return { signature, timestamp };
  }

  /**
   * Sign a PDF and upload to backend
   */
  async signPdf(pdfFile: File, pin: string): Promise<Blob> {
    const { signature, timestamp } = this.signRequest('POST', '/sign');

    const formData = new FormData();
    formData.append('file', pdfFile);
    formData.append('pin', pin);

    const response = await this.http
      .post('/sign', formData, {
        headers: new HttpHeaders({
          'X-Request-Signature': signature,
          'X-Request-Timestamp': timestamp.toString(),
        }),
        responseType: 'blob',
      })
      .toPromise();

    if (!response) throw new Error('No response from server');
    return response;
  }
}
```

### Step 3: Use in Component

```typescript
// src/app/components/pdf-signer.component.ts
import { Component } from '@angular/core';
import { RequestSignerService } from '../services/request-signer.service';

@Component({
  selector: 'app-pdf-signer',
  templateUrl: './pdf-signer.component.html',
})
export class PdfSignerComponent {
  constructor(private signer: RequestSignerService) {}

  async onSignPdf(file: File, pin: string) {
    try {
      const signedPdf = await this.signer.signPdf(file, pin);
      // Download the signed PDF
      const url = URL.createObjectURL(signedPdf);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'signed.pdf';
      a.click();
    } catch (error) {
      console.error('Signing failed:', error);
    }
  }
}
```

## Backend Configuration

### Set Environment Variables

```bash
# .env
REQUEST_SIGNER_SECRET=your-shared-secret-key
REQUEST_SIGNER_TOLERANCE=300000  # 5 minutes in milliseconds
```

> **IMPORTANT**: Both frontend and backend must use the **same `REQUEST_SIGNER_SECRET`**!

### Generate Secure Secrets

```bash
# Generate a random hex string for production
openssl rand -hex 32
```

### Example Output

```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

Copy this to both `.env` files (backend and frontend shared config).

## Testing

### Manual Test with cURL

```bash
# Generate signature for testing
TIMESTAMP=$(date +%s)000
METHOD="POST"
PATH="/sign"
SECRET="your-request-signer-secret-change-this-in-production"
MESSAGE="${METHOD}\n${PATH}\n${TIMESTAMP}"
SIGNATURE=$(echo -n "${MESSAGE}" | openssl dgst -sha256 -mac HMAC -macopt key:${SECRET} | sed 's/^(stdin)= //')

# Make request
curl -X POST http://localhost:45763/sign \
  -H "X-Request-Signature: ${SIGNATURE}" \
  -H "X-Request-Timestamp: ${TIMESTAMP}" \
  -F "file=@document.pdf" \
  -F "pin=1234"
```

## Error Responses

### Missing Signature Header

```json
{
  "error": "Unauthorized",
  "message": "Missing X-Request-Signature or X-Request-Timestamp header..."
}
```

### Invalid Signature

```json
{
  "error": "Unauthorized",
  "message": "Invalid request signature. Request must be signed by authorized frontend."
}
```

### Timestamp Outside Tolerance

```json
{
  "error": "Unauthorized",
  "message": "Request timestamp too old (305s). Re-sign with current timestamp."
}
```

## Security Notes

1. **Keep SECRET Safe**: Store `REQUEST_SIGNER_SECRET` in environment variables, never in code or git
2. **Use HTTPS**: Always use HTTPS in production to prevent man-in-the-middle attacks
3. **Timestamp Tolerance**: Default 5 minutes (300000ms) — adjust if needed for clock skew
4. **Rotation**: Periodically rotate `REQUEST_SIGNER_SECRET` for enhanced security

## Disabling Request Signing (Development Only)

If `REQUEST_SIGNER_SECRET` is not set or contains `"change-this"`, the signing requirement is skipped with a warning:

```
⚠️ REQUEST_SIGNER_SECRET not configured - /sign endpoint is UNPROTECTED
```

**Never disable in production!**

## Example: Node.js Script

```javascript
// test-sign.js
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');

const SECRET = 'your-request-signer-secret-change-this-in-production';

function signRequest(method, path) {
  const timestamp = Date.now();
  const signedMessage = `${method}\n${path}\n${timestamp}`;
  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(signedMessage)
    .digest('hex');
  return { signature, timestamp };
}

async function signPdf(pdfPath, pin) {
  const { signature, timestamp } = signRequest('POST', '/sign');

  const formData = new FormData();
  formData.append('file', fs.createReadStream(pdfPath));
  formData.append('pin', pin);

  const response = await axios.post('http://localhost:45763/sign', formData, {
    headers: {
      'X-Request-Signature': signature,
      'X-Request-Timestamp': timestamp.toString(),
      ...formData.getHeaders(),
    },
    responseType: 'arraybuffer',
  });

  fs.writeFileSync('signed.pdf', response.data);
  console.log('✓ PDF signed and saved to signed.pdf');
}

signPdf('document.pdf', '1234').catch(console.error);
```

## Troubleshooting

### "Unauthorized - Invalid request signature"

- Check that `REQUEST_SIGNER_SECRET` matches on frontend and backend
- Ensure secrets are not accidentally trimmed or modified
- Verify timestamp is current (not old/cached)

### "Request timestamp too old"

- Clock might be out of sync between frontend and backend
- Try increasing `REQUEST_SIGNER_TOLERANCE`
- Verify system time is correct on both machines
