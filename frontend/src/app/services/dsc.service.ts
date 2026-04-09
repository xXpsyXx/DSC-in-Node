import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, map, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';

export interface VerifyEmbeddedSignatureResponse {
  isValid: boolean;
  fileName: string;
  hash: string;
  signature: {
    name: string;
    reason: string;
    date: string;
    contentLength: number;
  };
  verification: {
    status: string;
    message: string;
    cryptographicallyValid?: boolean;
    hashMismatch?: boolean;
  };
  message: string;
}

export interface SignPdfResult {
  blob: Blob;
  signedDate: string;
  certWarning?: {
    message: string;
    daysRemaining: number;
    expiryDate: string;
  };
}

export interface ApiErrorInfo {
  status: number;
  code: string | null;
  message: string;
}

@Injectable({
  providedIn: 'root',
})
export class DscService {
  private apiUrl = 'http://localhost:45763/api';
  // Must match REQUEST_SIGNER_SECRET on backend
  private readonly REQUEST_SIGNER_SECRET = 'your-request-signer-secret-change-this-in-production';

  constructor(private http: HttpClient) {}

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
   * Sign a request with HMAC-SHA256 for backend verification
   */
  private async signRequest(
    method: string,
    path: string,
  ): Promise<{
    signature: string;
    timestamp: number;
  }> {
    const timestamp = Date.now();
    const signedMessage = `${method}\n${path}\n${timestamp}`;
    const signature = await this.hmacSha256(this.REQUEST_SIGNER_SECRET, signedMessage);
    return { signature, timestamp };
  }

  signPdf(file: File, pin: string, driverPath?: string): Observable<SignPdfResult> {
    // Create request signature before making HTTP request
    return from(this.signRequest('POST', '/api/sign')).pipe(
      switchMap(({ signature, timestamp }) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('pin', pin);
        if (driverPath) {
          formData.append('driverPath', driverPath); // Optional driver path
        }

        // Add request signature headers
        const headers = new HttpHeaders({
          'X-Request-Signature': signature,
          'X-Request-Timestamp': timestamp.toString(),
        });

        return this.http
          .post(`${this.apiUrl}/sign`, formData, {
            headers,
            responseType: 'blob' as const,
            observe: 'response' as const,
          })
          .pipe(
            map((response) => {
              const certWarningMessage = response.headers.get('X-Cert-Warning');
              const certDaysRemaining = response.headers.get('X-Cert-Days-Remaining');
              const certExpiryDate = response.headers.get('X-Cert-Expiry-Date');

              const result: SignPdfResult = {
                blob: response.body ?? new Blob(),
                signedDate: response.headers.get('X-Signed-Date') ?? '',
              };

              if (certWarningMessage && certDaysRemaining && certExpiryDate) {
                result.certWarning = {
                  message: certWarningMessage,
                  daysRemaining: parseInt(certDaysRemaining, 10),
                  expiryDate: certExpiryDate,
                };
              }

              return result;
            }),
          );
      }),
    );
  }

  verifyEmbeddedSignature(file: File): Observable<VerifyEmbeddedSignatureResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<VerifyEmbeddedSignatureResponse>(`${this.apiUrl}/verify`, formData);
  }

  downloadPdf(signedPdfBlob: Blob, fileName: string): void {
    const url = window.URL.createObjectURL(signedPdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  // NEW: Get list of supported USB token drivers
  getSupportedDrivers(): Observable<any> {
    return this.http.get(`${this.apiUrl}/supported-drivers`);
  }

  // NEW: Auto-detect connected USB token device
  autoDetectToken(): Observable<any> {
    return this.http.get(`${this.apiUrl}/auto-detect-token`);
  }

  async getApiErrorInfo(error: unknown): Promise<ApiErrorInfo> {
    if (!(error instanceof HttpErrorResponse)) {
      return {
        status: 0,
        code: null,
        message: this.fallbackMessageFromUnknown(error),
      };
    }

    const parsedPayload = await this.readErrorPayload(error.error);
    const code = typeof parsedPayload?.code === 'string' ? parsedPayload.code : null;

    const backendMessage =
      (typeof parsedPayload?.error === 'string' && parsedPayload.error) ||
      (typeof parsedPayload?.message === 'string' && parsedPayload.message) ||
      '';

    return {
      status: error.status,
      code,
      message: backendMessage || this.fallbackMessageFromHttp(error),
    };
  }

  formatApiErrorMessage(apiError: ApiErrorInfo): string {
    if (apiError.code === 'TOKEN_NOT_INSERTED') {
      return 'USB token not detected. Please insert Hypersecu USB token and try again.';
    }

    if (apiError.code === 'PKCS11_DRIVER_MISSING') {
      return 'USB token driver is missing or PKCS#11 library is not configured. Install driver and configure PKCS11_LIBRARY_PATH.';
    }

    if (apiError.code) {
      return `[${apiError.code}] ${apiError.message}`;
    }

    return apiError.message;
  }

  private async readErrorPayload(errorPayload: unknown): Promise<any> {
    if (!errorPayload) {
      return null;
    }

    if (errorPayload instanceof Blob) {
      const text = (await errorPayload.text()).trim();
      if (!text) {
        return null;
      }
      try {
        return JSON.parse(text);
      } catch {
        return { message: text };
      }
    }

    if (typeof errorPayload === 'string') {
      const text = errorPayload.trim();
      if (!text) {
        return null;
      }
      try {
        return JSON.parse(text);
      } catch {
        return { message: text };
      }
    }

    if (typeof errorPayload === 'object') {
      return errorPayload;
    }

    return null;
  }

  private fallbackMessageFromHttp(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'Cannot reach backend service. Please ensure backend is running.';
    }
    return error.message || 'Request failed';
  }

  private fallbackMessageFromUnknown(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    const maybeMessage = (error as any)?.message;
    if (typeof maybeMessage === 'string' && maybeMessage) {
      return maybeMessage;
    }
    return 'Request failed';
  }

  checkCertificateStatus(pin: string): Observable<{
    status: string;
    daysRemaining: number;
    expiryDate: string;
    message: string;
    signerName: string;
    timestamp: string;
  }> {
    const formData = new FormData();
    formData.append('pin', pin);
    return this.http.post(`${this.apiUrl}/cert-status`, formData) as Observable<{
      status: string;
      daysRemaining: number;
      expiryDate: string;
      message: string;
      signerName: string;
      timestamp: string;
    }>;
  }
}
