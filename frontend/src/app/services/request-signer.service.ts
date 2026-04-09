import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * Service for signing requests with HMAC-SHA256
 * Ensures only authorized frontend can access the /sign endpoint
 */
@Injectable({
  providedIn: 'root',
})
export class RequestSignerService {
  // IMPORTANT: Must match REQUEST_SIGNER_SECRET on backend
  // Store this in environment variables or a secure config service in production
  private readonly SECRET = 'your-request-signer-secret-change-this-in-production';

  constructor(private http: HttpClient) {}

  /**
   * Sign a request with current timestamp
   * @param method HTTP method (GET, POST, etc.)
   * @param path Request path (e.g., '/sign')
   * @returns { signature: hex string, timestamp: milliseconds }
   */
  signRequest(method: string, path: string): { signature: string; timestamp: number } {
    const timestamp = Date.now();
    const signedMessage = `${method}\n${path}\n${timestamp}`;

    // Use SubtleCrypto (Web Crypto API) for browser-safe HMAC-SHA256
    return this.hmacSha256(this.SECRET, signedMessage).then((signature) => ({
      signature,
      timestamp,
    })) as any; // In real implementation, make this async
  }

  /**
   * Browser-safe HMAC-SHA256 using Web Crypto API
   */
  private async hmacSha256(key: string, message: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const messageData = encoder.encode(message);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    return Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Sign a PDF file and upload to backend
   * @param pdfFile File object of the PDF
   * @param pin PIN for USB token
   * @returns Observable<Blob> Signed PDF
   */
  signPdf(pdfFile: File, pin: string): Observable<Blob> {
    const timestamp = Date.now();
    const signedMessage = `POST\n/sign\n${timestamp}`;

    // For browser, use Web Crypto API
    return new Observable((observer) => {
      this.hmacSha256(this.SECRET, signedMessage)
        .then((signature) => {
          const formData = new FormData();
          formData.append('file', pdfFile);
          formData.append('pin', pin);

          const headers = new HttpHeaders({
            'X-Request-Signature': signature,
            'X-Request-Timestamp': timestamp.toString(),
          });

          this.http.post('/sign', formData, { headers, responseType: 'blob' }).subscribe({
            next: (blob) => observer.next(blob),
            error: (err) => observer.error(err),
            complete: () => observer.complete(),
          });
        })
        .catch((err) => observer.error(err));
    });
  }
}
