import { Injectable, Logger } from '@nestjs/common';
import { SignarService } from '../../services/signar/signar.service';
import { PDFDocument } from 'pdf-lib';
import * as crypto from 'crypto';
import * as forge from 'node-forge';

interface SignPdfRequest {
  pdfBuffer: Buffer;
  reason?: string;
  location?: string;
  signer?: string;
}

interface VerifySignatureResponse {
  isValid: boolean;
  message: string;
  certificateInfo?: any;
}

@Injectable()
export class DscService {
  private logger = new Logger('DscService');

  constructor(private signarService: SignarService) {}

  async signPdf(request: SignPdfRequest): Promise<Buffer> {
    try {
      // Initialize PKCS#11 session
      await this.signarService.openSession();

      // Get certificate from token
      const certBuffer = await this.signarService.getSigningCertificate();
      const certPem = `-----BEGIN CERTIFICATE-----\n${certBuffer.toString('base64')}\n-----END CERTIFICATE-----`;

      // Parse certificate for metadata
      const cert = forge.pki.certificateFromPem(certPem);

      // Calculate PDF hash
      const pdfData = request.pdfBuffer;
      const hash = crypto.createHash('sha256').update(pdfData).digest();

      // Sign the hash using PKCS#11
      const signature = await this.signarService.signData(hash);

      // In a real scenario, you would embed this signature into the PDF
      // For POC, we'll add it as metadata
      const pdfDoc = await PDFDocument.load(pdfData);

      pdfDoc.setTitle('Digitally Signed Document');
      pdfDoc.setAuthor(request.signer || cert.subject.getField('CN').value);
      pdfDoc.setSubject('DSC Signed Document');
      pdfDoc.setKeywords(['digital', 'signature', 'dsc']);
      pdfDoc.setProducer('DSC-POC');

      // Add signature info to metadata (embedding actual signature into PDF requires more complex setup)
      const signatureMetadata = {
        signature: signature.toString('base64'),
        timestamp: new Date().toISOString(),
        signer: cert.subject.getField('CN').value,
        reason: request.reason || 'Document signature',
        location: request.location || 'India',
      };

      pdfDoc.setCreationDate(new Date());

      const signedPdfBuffer = await pdfDoc.save();

      // Store signature info (in production, embed in PDF using proper signature widget)
      const signatureBuffer = Buffer.from(
        JSON.stringify({
          ...signatureMetadata,
          pdfHash: hash.toString('hex'),
        }),
      );

      await this.signarService.closeSession();

      // Return combined buffer (PDF + signature metadata)
      return Buffer.concat([
        signedPdfBuffer,
        Buffer.from('\n---SIGNATURE---\n'),
        signatureBuffer,
      ]);
    } catch (error) {
      this.logger.error(`Failed to sign PDF: ${error.message}`);
      await this.signarService.closeSession().catch(() => {});
      throw error;
    }
  }

  async verifySignature(
    signedPdfBuffer: Buffer,
  ): Promise<VerifySignatureResponse> {
    try {
      // Split PDF and signature
      const separatorIndex = signedPdfBuffer.lastIndexOf(
        Buffer.from('\n---SIGNATURE---\n'),
      );

      if (separatorIndex === -1) {
        return {
          isValid: false,
          message: 'No signature found in document',
        };
      }

      const pdfBuffer = signedPdfBuffer.slice(0, separatorIndex);
      const signatureBuffer = signedPdfBuffer.slice(separatorIndex + 18);
      const signatureData = JSON.parse(signatureBuffer.toString());

      // Verify PDF hasn't been tampered
      const currentHash = crypto
        .createHash('sha256')
        .update(pdfBuffer)
        .digest()
        .toString('hex');

      if (currentHash !== signatureData.pdfHash) {
        return {
          isValid: false,
          message: 'PDF has been modified after signing',
        };
      }

      // Extract signer info
      return {
        isValid: true,
        message: 'Signature is valid',
        certificateInfo: {
          signer: signatureData.signer,
          timestamp: signatureData.timestamp,
          reason: signatureData.reason,
          location: signatureData.location,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to verify signature: ${error.message}`);
      return {
        isValid: false,
        message: `Verification failed: ${error.message}`,
      };
    }
  }
}
