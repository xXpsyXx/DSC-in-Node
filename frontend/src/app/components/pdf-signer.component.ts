import { Component, signal, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DscService } from '../services/dsc.service';

interface SigningResult {
  fileName: string;
  blob: Blob;
  signedAt: string;
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
  tempPin = signal<string>(''); // Store PIN temporarily for confirmation
  isLoading = signal(false);
  showPinInput = signal(false);
  showWrongPinAlert = signal(false);
  showCertConfirmation = signal(false); // New confirmation dialog
  signingResult = signal<SigningResult | null>(null);
  errorMessage = signal<string>('');
  certWarning = signal<{
    message: string;
    daysRemaining: number;
    expiryDate: string;
  } | null>(null);
  showCertWarning = signal(false);
  certStatusInfo = signal<{
    status: string;
    daysRemaining: number;
    expiryDate: string;
    message: string;
    signerName: string;
  } | null>(null);
  showCertStatusModal = signal(false);

  // NEW: Auto-detection signals
  detectedDevice = signal<string>(''); // Device name
  detectedDevicePath = signal<string>(''); // Driver path
  isDetectingDevice = signal(false);
  deviceDetectionError = signal<string>('');

  constructor(private dscService: DscService) {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      if (file.type === 'application/pdf') {
        this.selectedFile.set(file);
        this.errorMessage.set('');
        this.signingResult.set(null);
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
    // Auto-detect USB token device
    this.autoDetectDevice();
  }

  // NEW: Auto-detect connected USB token
  private autoDetectDevice(): void {
    this.isDetectingDevice.set(true);
    this.deviceDetectionError.set('');

    this.dscService.autoDetectToken().subscribe({
      next: (response: any) => {
        if (response.detected) {
          this.detectedDevice.set(response.driverName);
          this.detectedDevicePath.set(response.driverPath);
          console.log(`✅ Detected: ${response.driverName}`);
        } else {
          this.deviceDetectionError.set(response.message);
          console.warn('⚠️ No device detected');
        }
        this.isDetectingDevice.set(false);
      },
      error: (error) => {
        this.deviceDetectionError.set('Could not auto-detect USB token device');
        console.error('Auto-detection error:', error);
        this.isDetectingDevice.set(false);
      },
    });
  }

  private focusPinInput(): void {
    if (this.pinInputField) {
      this.pinInputField.nativeElement.focus();
    }
  }

  onPinSubmit(): void {
    const file = this.selectedFile();
    const pin = this.userPin();

    if (!pin || pin.trim().length === 0) {
      this.errorMessage.set('Please enter your PIN');
      return;
    }

    if (!file) {
      this.errorMessage.set('No file selected');
      return;
    }

    this.isLoading.set(true);
    this.showPinInput.set(false);
    this.errorMessage.set('');
    this.tempPin.set(pin); // Store PIN temporarily

    // First, check certificate validity before signing
    this.dscService.checkCertificateStatus(pin).subscribe({
      next: (result) => {
        // Store certificate info for confirmation dialog
        this.certStatusInfo.set({
          status: result.status,
          daysRemaining: result.daysRemaining,
          expiryDate: result.expiryDate,
          message: result.message,
          signerName: result.signerName,
        });

        // Show confirmation dialog for all cases
        this.showCertConfirmation.set(true);
        this.isLoading.set(false);
      },
      error: () => {
        // If cert check fails, show error and allow retry
        this.errorMessage.set('Failed to check certificate status. Please try again.');
        this.showPinInput.set(true);
        this.isLoading.set(false);
        this.tempPin.set('');
      },
    });
  }

  onCertConfirmYes(): void {
    const file = this.selectedFile();
    const pin = this.tempPin();
    const certStatus = this.certStatusInfo();

    if (!certStatus) {
      this.errorMessage.set('Certificate information missing');
      return;
    }

    // Only allow signing if certificate is valid or has more than 15 days remaining
    if (certStatus.status === 'expired' || certStatus.status === 'critical') {
      this.errorMessage.set('Cannot sign with expired or critical certificate');
      this.showCertConfirmation.set(false);
      this.tempPin.set('');
      this.userPin.set('');
      return;
    }

    // Proceed with signing
    this.showCertConfirmation.set(false);
    if (file && pin) {
      this.performSigning(file, pin);
    }
    this.tempPin.set('');
  }

  onCertConfirmNo(): void {
    // Cancel signing
    this.showCertConfirmation.set(false);
    this.showPinInput.set(false);
    this.tempPin.set('');
    this.userPin.set('');
    this.errorMessage.set('');
  }

  private performSigning(file: File, pin: string): void {
    this.isLoading.set(true);
    const driverPath = this.detectedDevicePath() ? this.detectedDevicePath() : undefined;
    this.dscService.signPdf(file, pin, driverPath).subscribe({
      next: (result) => {
        const signedFileName = file.name.replace('.pdf', '_signed.pdf');
        this.signingResult.set({
          fileName: signedFileName,
          blob: result.blob,
          signedAt: result.signedDate || new Date().toISOString(),
        });
        this.userPin.set(''); // Clear PIN from memory
        this.isLoading.set(false);

        // Show certificate warning if present
        if (result.certWarning) {
          this.certWarning.set(result.certWarning);
          this.showCertWarning.set(true);
        }
      },
      error: (error) => {
        void this.handleSignError(error);
      },
    });
  }

  private async handleSignError(error: unknown): Promise<void> {
    const apiError = await this.dscService.getApiErrorInfo(error);
    const errorMsg = this.dscService.formatApiErrorMessage(apiError);
    const statusCode = apiError.status;

    this.isLoading.set(false);

    // Check if it's a certificate expiration error (403 status)
    if (statusCode === 403) {
      const errorBody = (error as any)?.error;
      let certMessage = errorMsg;

      // Extract certificate-specific errors
      if (errorBody?.error === 'Certificate Expired') {
        certMessage = `Certificate Expired: ${errorBody.message || ''}`;
      } else if (errorBody?.error === 'Certificate Expiring Soon') {
        certMessage = `Certificate Expiring Soon: ${errorBody.message || ''}\n\nSigning has been blocked. Please renew your certificate.`;
      }

      this.errorMessage.set(certMessage);
      this.showPinInput.set(false);
      return;
    }

    // Check if it's a PIN error (401 status or PIN-related message)
    const isPinError =
      statusCode === 401 ||
      errorMsg.toLowerCase().includes('pin') ||
      errorMsg.toLowerCase().includes('certificate unlock');

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
      // Show backend-aware error
      this.errorMessage.set(errorMsg);
      this.showPinInput.set(false);
    }
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

  closeCertWarning(): void {
    this.showCertWarning.set(false);
    this.certWarning.set(null);
  }

  closeCertStatusModal(): void {
    this.showCertStatusModal.set(false);
    this.certStatusInfo.set(null);
  }

  getStatusClassName(): string {
    const status = this.certStatusInfo()?.status;
    return status ? `status-${status}` : '';
  }

  downloadSignedPdf(): void {
    const result = this.signingResult();
    if (result) {
      this.dscService.downloadPdf(result.blob, result.fileName);
    }
  }
}
