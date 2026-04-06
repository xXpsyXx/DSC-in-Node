import { Component, signal, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DscService, type VerifyResponse } from '../services/dsc.service';

interface SigningResult {
  fileName: string;
  blob: Blob;
  signedAt: string;
  hash: string;
  signature: string;
}

@Component({
  selector: 'app-pdf-signer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pdf-signer.component.html',
  styleUrl: './pdf-signer.component.css',
})
export class PdfSignerComponent implements AfterViewInit {
  @ViewChild('pinInputField') pinInputField!: ElementRef<HTMLInputElement>;

  selectedFile = signal<File | null>(null);
  userPin = signal<string>('');
  isLoading = signal(false);
  showPinInput = signal(false);
  showWrongPinAlert = signal(false);
  signingResult = signal<SigningResult | null>(null);
  verifyResult = signal<VerifyResponse | null>(null);
  errorMessage = signal<string>('');

  constructor(private dscService: DscService) {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      if (file.type === 'application/pdf') {
        this.selectedFile.set(file);
        this.errorMessage.set('');
        this.signingResult.set(null);
        this.verifyResult.set(null);
      } else {
        this.errorMessage.set('Please select a PDF file');
        this.selectedFile.set(null);
      }
    }
  }

  onSignClick(): void {
    const file = this.selectedFile();
    if (!file) {
      this.errorMessage.set('Please select a PDF file first');
      return;
    }

    // Show PIN input dialog
    this.showPinInput.set(true);
    this.showWrongPinAlert.set(false);
    this.errorMessage.set('');
    // Focus PIN input after modal opens
    setTimeout(() => this.focusPinInput(), 100);
  }

  ngAfterViewInit(): void {
    // Component initialized
  }

  private focusPinInput(): void {
    if (this.pinInputField) {
      this.pinInputField.nativeElement.focus();
    }
  }

  onPinSubmit(): void {
    const file = this.selectedFile();
    const pin = this.userPin();

    if (!file) {
      this.errorMessage.set('No file selected');
      return;
    }

    if (!pin || pin.trim().length === 0) {
      this.errorMessage.set('Please enter your PIN');
      return;
    }

    this.isLoading.set(true);
    this.showPinInput.set(false);
    this.errorMessage.set('');

    this.dscService.signPdf(file, pin).subscribe({
      next: (result) => {
        const signedFileName = file.name.replace('.pdf', '_signed.pdf');
        this.signingResult.set({
          fileName: signedFileName,
          blob: result.blob,
          signedAt: result.signedDate || new Date().toISOString(),
          hash: result.hash,
          signature: result.signature,
        });
        this.userPin.set(''); // Clear PIN from memory
        this.isLoading.set(false);

        // Auto-verify after signing
        this.verifySignedPdf(result.blob, signedFileName, result.signature);
      },
      error: (error) => {
        const errorMsg = error.error?.error || error.message || 'Unknown error';
        const statusCode = error.status;

        // Check if it's a PIN error (401 status or PIN-related message)
        const isPinError =
          statusCode === 401 ||
          errorMsg.toLowerCase().includes('pin') ||
          errorMsg.toLowerCase().includes('certificate unlock');

        this.isLoading.set(false);

        if (isPinError) {
          // Show wrong PIN popup
          this.showWrongPinAlert.set(true);
          // Clear PIN input
          this.userPin.set('');
          // Re-show PIN input modal and focus
          setTimeout(() => {
            this.showPinInput.set(true);
            this.focusPinInput();
          }, 500);
        } else {
          // Show general error
          this.errorMessage.set('Error signing PDF: ' + errorMsg);
          this.showPinInput.set(false);
        }
      },
    });
  }

  onPinCancel(): void {
    this.showPinInput.set(false);
    this.userPin.set('');
    this.errorMessage.set('');
    this.showWrongPinAlert.set(false);
  }

  closeWrongPinAlert(): void {
    this.showWrongPinAlert.set(false);
    this.userPin.set('');
    this.showPinInput.set(true);
    setTimeout(() => this.focusPinInput(), 100);
  }

  verifySignedPdf(pdfBlob: Blob, fileName: string, signature?: string): void {
    const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

    this.dscService.verifyPdf(pdfFile, signature).subscribe({
      next: (result) => {
        this.verifyResult.set(result);
        console.log('Verification result:', result);
      },
      error: (error) => {
        const errorMsg = error.error?.error || error.message || 'Unknown error';
        console.error('Verification error:', errorMsg);
        this.verifyResult.set({
          isValid: false,
          fileName: fileName,
          hash: '',
          signaturePreview: errorMsg,
        });
      },
    });
  }

  downloadSignedPdf(): void {
    const result = this.signingResult();
    if (result) {
      this.dscService.downloadPdf(result.blob, result.fileName);
    }
  }

  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      alert('Copied to clipboard!');
    });
  }
}
