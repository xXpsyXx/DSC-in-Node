import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DscService, type VerifyEmbeddedSignatureResponse } from '../services/dsc.service';

@Component({
  selector: 'app-verify-signature',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './verify-signature.component.html',
  styleUrl: './verify-signature.component.css',
})
export class VerifySignatureComponent {
  selectedFile = signal<File | null>(null);
  isLoading = signal(false);
  verifyResult = signal<VerifyEmbeddedSignatureResponse | null>(null);
  errorMessage = signal<string>('');

  constructor(private dscService: DscService) {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      if (file.type === 'application/pdf') {
        this.selectedFile.set(file);
        this.errorMessage.set('');
        this.verifyResult.set(null);
      } else {
        this.errorMessage.set('Please select a PDF file');
        this.selectedFile.set(null);
      }
    }
  }

  onVerifyClick(): void {
    const file = this.selectedFile();
    if (!file) {
      this.errorMessage.set('Please select a PDF file first');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    this.dscService.verifyEmbeddedSignature(file).subscribe({
      next: (result) => {
        this.verifyResult.set(result);
        this.isLoading.set(false);
        console.log('Signature verification result:', result);
      },
      error: (error) => {
        this.isLoading.set(false);
        const errorMsg =
          error.error?.error || error.error?.message || error.message || 'Verification failed';
        this.errorMessage.set(errorMsg);
        console.error('Verification error:', error);
      },
    });
  }

  clearResults(): void {
    this.verifyResult.set(null);
    this.errorMessage.set('');
    this.selectedFile.set(null);
  }

  resetForm(): void {
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
    this.selectedFile.set(null);
    this.verifyResult.set(null);
    this.errorMessage.set('');
  }
}
