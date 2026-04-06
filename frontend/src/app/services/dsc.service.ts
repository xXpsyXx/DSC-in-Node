import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

export interface VerifyResponse {
  isValid: boolean;
  fileName: string;
  hash: string;
  signaturePreview: string;
}

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
  };
  message: string;
}

export interface SignPdfResult {
  blob: Blob;
  hash: string;
  signature: string;
  signedDate: string;
}

@Injectable({
  providedIn: 'root',
})
export class DscService {
  private apiUrl = 'http://localhost:5000/api';

  constructor(private http: HttpClient) {}

  signPdf(file: File, pin: string): Observable<SignPdfResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('pin', pin);
    return this.http
      .post(`${this.apiUrl}/sign-pdf`, formData, {
        responseType: 'blob' as const,
        observe: 'response' as const,
      })
      .pipe(
        map((response) => ({
          blob: response.body ?? new Blob(),
          hash: response.headers.get('X-File-Hash') ?? '',
          signature: response.headers.get('X-File-Signature') ?? '',
          signedDate: response.headers.get('X-Signed-Date') ?? '',
        })),
      );
  }

  verifyPdf(file: File, signature?: string): Observable<VerifyResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (signature) {
      formData.append('signature', signature);
    }
    return this.http.post<VerifyResponse>(`${this.apiUrl}/verify-pdf`, formData);
  }

  verifyEmbeddedSignature(
    file: File,
    certificate?: string,
  ): Observable<VerifyEmbeddedSignatureResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (certificate) {
      formData.append('certificate', certificate);
    }
    return this.http.post<VerifyEmbeddedSignatureResponse>(
      `${this.apiUrl}/verify-embedded-signature`,
      formData,
    );
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
}
