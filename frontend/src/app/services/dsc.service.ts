import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, map, of } from 'rxjs';

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
  // Request signing is disabled by default. Configure TSA and server-side HMAC if needed.

  constructor(private http: HttpClient) {}

  signPdf(file: File, pin: string, driverPath?: string): Observable<SignPdfResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('pin', pin);
    if (driverPath) {
      formData.append('driverPath', driverPath);
    }

    return this.http
      .post(`${this.apiUrl}/sign`, formData, {
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

  // Get backend agent configuration (port, pkcs11 paths, etc.)
  getAgentConfig(): Observable<any> {
    return this.http.get(`${this.apiUrl}/admin/config`);
  }

  // Get agent runtime status (logs, lastAction, masked driverPath)
  getAgentStatus(): Observable<any> {
    return this.http.get(`${this.apiUrl}/admin/status`);
  }

  // Update the PKCS#11 driver path on the backend. applyTo: 'platform'|'generic'|'both'
  updateDriverPath(driverPath: string, applyTo: string | undefined = 'platform'): Observable<any> {
    return this.http.post(`${this.apiUrl}/admin/driver-path`, { driverPath, applyTo });
  }

  // POST a log entry to the backend admin logs (type: 'info'|'error'|'success'|'warning')
  postLog(type: 'info' | 'error' | 'success' | 'warning', text: string): Observable<any> {
    // Disabled client-side persistent logging to avoid frontend modifying server logs.
    // Backend logs should be written only by the server or explicit admin actions.
    // Return a harmless observable so callers remain functional.
    return of({ success: true, skipped: true });
  }

  // Fetch persisted backend logs (sanitized JSON)
  getBackendLogs(): Observable<any> {
    return this.http.get(`${this.apiUrl}/admin/logs`);
  }

  // Health check against backend root /health
  healthCheck(): Observable<any> {
    // apiUrl is like http://host:port/api -> remove trailing /api
    const base = this.apiUrl.replace(/\/api$/i, '').replace(/\/api$/i, '');
    const host = base.endsWith('/') ? base.slice(0, -1) : base;
    return this.http.get(`${host}/health`, { responseType: 'text' as const });
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

  /**
   * Retrieve certificate details by posting PIN to backend /get-cert-details
   */
  getCertDetails(pin: string): Observable<any> {
    const formData = new FormData();
    formData.append('pin', pin);
    return this.http.post(`${this.apiUrl}/get-cert-details`, formData).pipe(
      map((r: any) => {
        // normalize error-in-200 responses
        const body = r?.data ?? r;
        if (body && (body.error || body.success === false || body.message)) {
          const errMsg = (body.error || body.message || JSON.stringify(body)) as string;
          throw new Error(errMsg);
        }
        return r;
      }),
    );
  }
}
