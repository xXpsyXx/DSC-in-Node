import type { Request, Response } from 'express';
import { SignerService } from '../services/sign.service.ts';
import { HashService } from '../services/hash.service.ts';
import { VerifyService } from '../services/verify.service.ts';
import { PdfSignerService } from '../services/pdf-signer.service.ts';
import { IncomingForm } from 'formidable';
import fs from 'fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

let verifyService: VerifyService | null = null;

// Reuse verifier instance to avoid reloading PKCS#11 library on every request.
const getVerifyService = (): VerifyService => {
  if (!verifyService) {
    verifyService = new VerifyService();
  }
  return verifyService;
};

const isPinErrorMessage = (errorMsg: string): boolean => {
  return /(PKCS12|password|MAC|CKR_PIN_INCORRECT|CKR_PIN_INVALID|CKR_PIN_LOCKED|CKR_USER_PIN_NOT_INITIALIZED)/i.test(
    errorMsg,
  );
};

const isPkcs11DriverErrorMessage = (errorMsg: string): boolean => {
  return /(library not configured|PKCS11_LIBRARY_PATH|PKCS11_LIBRARY_PATH_WINDOWS|module could not be found|cannot find module|MODULE_NOT_FOUND|ENOENT|DLL|driver|failed to load|cryptoki)/i.test(
    errorMsg,
  );
};

const isUsbTokenMissingErrorMessage = (errorMsg: string): boolean => {
  return /(USB token not detected|No USB token detected|No token|CKR_TOKEN_NOT_PRESENT|CKR_DEVICE_REMOVED|CKR_SLOT_ID_INVALID|token slot|No token slot available)/i.test(
    errorMsg,
  );
};

const isUsbTokenErrorMessage = (errorMsg: string): boolean => {
  return /(USB token|PKCS#11|No token|CKR_TOKEN_NOT_PRESENT|CKR_DEVICE_REMOVED|CKR_SLOT_ID_INVALID|token slot|certificate unavailable|No signing key)/i.test(
    errorMsg,
  );
};

// Normalize token/driver failures so API returns actionable errors to frontend.
const getHardwareErrorResponse = (
  errorMsg: string,
): { status: number; body: { code: string; error: string } } | null => {
  if (isPkcs11DriverErrorMessage(errorMsg)) {
    return {
      status: 500,
      body: {
        code: 'PKCS11_DRIVER_MISSING',
        error:
          'USB token driver is missing or PKCS#11 library is not configured. Install Hypersecu driver and set PKCS11_LIBRARY_PATH.',
      },
    };
  }

  if (
    isUsbTokenMissingErrorMessage(errorMsg) ||
    isUsbTokenErrorMessage(errorMsg)
  ) {
    return {
      status: 503,
      body: {
        code: 'TOKEN_NOT_INSERTED',
        error:
          'USB token not detected. Please insert Hypersecu USB token and try again.',
      },
    };
  }

  return null;
};

// Sign uploaded PDF and embed a detached signature metadata block.
export const signHandler = async (req: Request, res: Response) => {
  const form = new IncomingForm({
    maxFileSize: 50 * 1024 * 1024, // 50MB
  });

  let tempFilePath: string | null = null;
  let signer: SignerService | null = null;

  try {
    const [fields, files] = await form.parse(req);

    const uploadedFile = files.file?.[0];
    const pin = fields.pin?.[0];

    if (!uploadedFile) {
      return res.status(400).json({ error: 'file is required' });
    }

    if (!pin) {
      return res.status(400).json({ error: 'pin is required' });
    }

    console.log(
      `[signHandler] Processing file: ${uploadedFile.originalFilename}`,
    );

    // Read file buffer
    const fileBuffer = fs.readFileSync(uploadedFile.filepath);
    tempFilePath = uploadedFile.filepath;

    // Load signer first so we can stamp certificate holder name in the PDF
    try {
      signer = new SignerService(pin);
    } catch (signError) {
      const errorMsg = (signError as any).message || '';
      console.error('[signHandler] Signing error:', errorMsg);
      if (isPinErrorMessage(errorMsg)) {
        return res.status(401).json({
          error:
            'Invalid PIN - Cannot unlock certificate. Please check your PIN and try again.',
        });
      }
      throw signError;
    }

    const signerName = signer.getSignerName();
    const signedAt = new Date();

    // Load and modify PDF to add signature metadata
    const pdfDoc = await PDFDocument.load(fileBuffer);

    pdfDoc.setTitle('Digitally Signed Document');
    pdfDoc.setAuthor(`Signed by ${signerName}`);
    pdfDoc.setSubject('Digital Signature Attached');
    pdfDoc.setKeywords(['signed', 'digital-signature', signerName]);

    const pages = pdfDoc.getPages();
    const targetPage = pages[pages.length - 1];
    if (targetPage) {
      // Draw a green checkmark badge on the bottom-left
      const badgeSize = 50;
      const badgeMargin = 20;
      const badgeX = badgeMargin;
      const { height } = targetPage.getSize();
      const badgeY = height - badgeMargin - badgeSize;

      // Draw green circular background
      targetPage.drawEllipse({
        x: badgeX,
        y: badgeY,
        xScale: badgeSize / 2,
        yScale: badgeSize / 2,
        color: rgb(0.2, 0.75, 0.2), // Green
        opacity: 0.9,
      });

      // Draw white checkmark using lines (✓)
      const centerX = badgeX + badgeSize / 2;
      const centerY = badgeY + badgeSize / 2;
      const checkSize = 12;

      // Left part of checkmark (going down-right)
      targetPage.drawLine({
        start: { x: centerX - checkSize / 2, y: centerY + checkSize / 3 },
        end: { x: centerX - checkSize / 6, y: centerY - checkSize / 2.5 },
        thickness: 3,
        color: rgb(1, 1, 1), // White
      });

      // Right part of checkmark (going up-right)
      targetPage.drawLine({
        start: { x: centerX - checkSize / 6, y: centerY - checkSize / 2.5 },
        end: { x: centerX + checkSize / 1.5, y: centerY + checkSize / 4 },
        thickness: 3,
        color: rgb(1, 1, 1), // White
      });

      // Draw signature metadata stamp box
      const stampLines = [
        `Signed by: ${signerName}`,
        `Signed on: ${signedAt.toLocaleString()}`,
      ];
      const stampFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontSize = 9;
      const lineHeight = 12;
      const padding = 6;
      const margin = 20;
      const maxTextWidth = Math.max(
        ...stampLines.map((line) =>
          stampFont.widthOfTextAtSize(line, fontSize),
        ),
      );

      const boxWidth = maxTextWidth + padding * 2;
      const boxHeight = stampLines.length * lineHeight + padding * 2;
      const { width } = targetPage.getSize();
      const boxX = Math.max(margin, width - boxWidth - margin);
      const boxY = margin;

      targetPage.drawRectangle({
        x: boxX,
        y: boxY,
        width: boxWidth,
        height: boxHeight,
        color: rgb(1, 1, 1),
        opacity: 0.8,
        borderColor: rgb(0.0, 0.5, 1.0), // Blue border like Adobe
        borderWidth: 1.5,
      });

      stampLines.forEach((line, index) => {
        const textY =
          boxY + boxHeight - padding - fontSize - index * lineHeight;
        targetPage.drawText(line, {
          x: boxX + padding,
          y: textY,
          size: fontSize,
          font: stampFont,
          color: rgb(0.0, 0.5, 1.0), // Blue text
        });
      });
    }

    // Save modified PDF to buffer and sign the exact bytes we return
    const signedPdfBytes = await pdfDoc.save();
    const hash = HashService.hashBuffer(Buffer.from(signedPdfBytes));
    console.log(`[signHandler] Signed PDF hash: ${hash}`);

    // Sign the hash with USB token (returns base64 RSA signature)
    const rsaSignatureBase64 = signer.signHash(hash);

    // Create PKCS#7 signed data structure for Adobe compatibility
    const certificatePem = signer.getCertificatePem();
    const certificateDer = signer.getCertificateDer();

    if (!certificatePem || !certificateDer) {
      throw new Error('Certificate not found in USB token');
    }

    // Create proper PKCS#7 signature using the PdfSignerService
    const pkcs7Signature = PdfSignerService.createPkcs7Signature(
      Buffer.from(signedPdfBytes),
      rsaSignatureBase64,
      certificatePem,
      certificateDer,
    );

    // Compute server HMAC to prevent external signatures with same token
    const signingSecret = process.env.SIGNING_SECRET;
    let serverHmac: string | undefined;
    if (signingSecret) {
      serverHmac = HashService.computeServerHmac(
        signingSecret,
        certificatePem,
        hash,
      );
      console.log(`[signHandler] Server HMAC computed: ${serverHmac}`);
    } else {
      console.warn(
        '[signHandler] SIGNING_SECRET not configured - server HMAC will not be embedded',
      );
    }

    // Embed detached signature metadata block in the final PDF bytes.
    const embedOptions: {
      signatureHex: string;
      hashHex: string;
      signerName: string;
      reason?: string;
      signedAt?: Date;
      certificatePem?: string;
      serverHmac?: string;
    } = {
      signatureHex: pkcs7Signature,
      hashHex: hash,
      signerName,
      reason: 'Digitally signed with Hypersecu USB token',
      signedAt,
      certificatePem,
    };

    if (serverHmac) {
      embedOptions.serverHmac = serverHmac;
    }

    const finalSignedPdfBuffer = PdfSignerService.embedDetachedSignatureBlock(
      Buffer.from(signedPdfBytes),
      embedOptions,
    );

    // Create signed PDF filename
    const originalName = uploadedFile.originalFilename || 'document.pdf';
    const signedFileName = originalName.replace('.pdf', '_signed.pdf');

    // Send PDF as response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${signedFileName}"`,
    );
    res.setHeader('X-File-Hash', hash);
    res.setHeader('X-File-Signature', rsaSignatureBase64); // RSA signature
    res.setHeader('X-PKCS7-Signature', pkcs7Signature); // PKCS#7 signature for Adobe verification
    res.setHeader('X-Signature-Embedded', 'true');
    // Encode certificate as base64 to avoid newline issues in headers
    const certificateBase64 = Buffer.from(certificatePem).toString('base64');
    res.setHeader('X-Signer-Certificate', certificateBase64); // Certificate (base64 encoded)
    res.setHeader('X-Signed-Date', new Date().toISOString());

    console.log(`[signHandler] Sending signed PDF: ${signedFileName}`);
    res.send(finalSignedPdfBuffer);
  } catch (error) {
    console.error('[signHandler] Error:', error);
    const errorMsg = (error as any).message || '';

    const hardwareError = getHardwareErrorResponse(errorMsg);
    if (hardwareError) {
      return res.status(hardwareError.status).json(hardwareError.body);
    }

    if (isPinErrorMessage(errorMsg)) {
      return res.status(401).json({
        error:
          'Invalid PIN - Cannot unlock certificate. Please check your PIN and try again.',
      });
    }

    res.status(500).json({ error: 'Failed to sign file: ' + errorMsg });
  } finally {
    signer?.close();

    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {
        console.error('[signHandler] Failed to clean up temp file:', e);
      }
    }
  }
};

// Verify embedded detached signature block from uploaded signed PDF.
export const verifyHandler = async (req: Request, res: Response) => {
  const form = new IncomingForm({
    maxFileSize: 50 * 1024 * 1024, // 50MB
  });

  let tempFilePath: string | null = null;

  try {
    const [, files] = await form.parse(req);

    const uploadedFile = files.file?.[0];

    if (!uploadedFile) {
      return res.status(400).json({ error: 'file is required' });
    }

    console.log(
      `[verifyHandler] Verifying file: ${uploadedFile.originalFilename}`,
    );

    // Read file buffer
    const fileBuffer = fs.readFileSync(uploadedFile.filepath);
    tempFilePath = uploadedFile.filepath;
    const detachedBlock =
      PdfSignerService.extractDetachedSignatureBlock(fileBuffer);

    if (!detachedBlock) {
      return res.status(400).json({
        error: 'No signature found in PDF',
        fileName: uploadedFile.originalFilename,
        message:
          'This PDF does not contain the current embedded signature block. Please sign the PDF using /sign endpoint and verify again.',
      });
    }

    let signatureHex = detachedBlock.signatureHex;
    const signerName = detachedBlock.signerName || 'Unknown';
    const signReason = detachedBlock.signReason || '';
    const signDate = detachedBlock.signDate || '';

    const unsignedPdfBuffer = PdfSignerService.removeDetachedSignatureBlock(
      fileBuffer,
      detachedBlock.blockStart,
      detachedBlock.blockEndExclusive,
    );
    const recomputedHash = HashService.hashBuffer(unsignedPdfBuffer);
    const hashForVerification = detachedBlock.hashHex || recomputedHash;
    const hashMismatch = Boolean(
      detachedBlock.hashHex &&
      detachedBlock.hashHex.toLowerCase() !== recomputedHash.toLowerCase(),
    );

    console.log('[verifyHandler] Found embedded detached signature block');

    if (signatureHex.length % 2 !== 0) {
      signatureHex = signatureHex.slice(0, -1);
    }

    let cryptographicallyValid = false;
    let isValid = false;
    let verificationMsg = '';
    let hmacValid = false;

    try {
      const signatureBase64 = Buffer.from(signatureHex, 'hex').toString(
        'base64',
      );

      // If certificate is embedded in the PDF, use it for verification (no token needed)
      if (detachedBlock.certificatePem) {
        console.log(
          '[verifyHandler] Using embedded certificate for verification',
        );
        cryptographicallyValid = VerifyService.verifyWithCertificate(
          hashForVerification,
          signatureBase64,
          detachedBlock.certificatePem,
        );
      } else {
        // Fall back to USB token verification (backward compatibility)
        console.log(
          '[verifyHandler] No embedded certificate, using USB token for verification',
        );
        const verifier = getVerifyService();
        cryptographicallyValid = verifier.verify(
          hashForVerification,
          signatureBase64,
        );
      }

      // Verify server HMAC - mandatory if SIGNING_SECRET is configured
      const signingSecret = process.env.SIGNING_SECRET;

      if (signingSecret) {
        // SIGNING_SECRET is configured - HMAC verification is MANDATORY
        if (!detachedBlock.serverHmac) {
          // PDF doesn't have HMAC - must be external signature
          hmacValid = false;
          console.warn(
            '[verifyHandler] SIGNING_SECRET is configured but PDF has no HMAC - likely external signature',
          );
        } else if (!detachedBlock.certificatePem) {
          // HMAC present but no certificate
          hmacValid = false;
          console.warn(
            '[verifyHandler] HMAC present but certificate missing in PDF',
          );
        } else {
          // Both HMAC and certificate present - verify HMAC
          try {
            hmacValid = HashService.verifyServerHmac(
              signingSecret,
              detachedBlock.certificatePem,
              hashForVerification,
              detachedBlock.serverHmac,
            );
            console.log(
              `[verifyHandler] Server HMAC verification: ${hmacValid}`,
            );
          } catch (hmacError) {
            console.warn('[verifyHandler] HMAC verification error:', hmacError);
            hmacValid = false;
          }
        }
      } else {
        // SIGNING_SECRET not configured - accept any signature (for testing)
        hmacValid = true;
        console.warn(
          '[verifyHandler] SIGNING_SECRET not configured - HMAC verification skipped (not recommended for production)',
        );
      }

      isValid = cryptographicallyValid && !hashMismatch && hmacValid;

      if (isValid) {
        verificationMsg = 'Signature verified successfully';
      } else if (hashMismatch) {
        verificationMsg =
          'Signature is present but document content differs from the signed hash';
      } else if (!hmacValid) {
        if (!detachedBlock.serverHmac) {
          verificationMsg =
            'Signature verification failed - no server HMAC found (PDF was not signed by this system)';
        } else {
          verificationMsg =
            'Signature verification failed - HMAC mismatch (PDF was not signed by this system or secret key has changed)';
        }
      } else {
        verificationMsg =
          'Signature verification failed - signature does not match document';
      }

      console.log(
        `[verifyHandler] Verification: ${isValid} (crypto=${cryptographicallyValid}, hashMismatch=${hashMismatch}, hmac=${hmacValid})`,
      );
    } catch (verifyError) {
      console.error('[verifyHandler] Verification error:', verifyError);
      isValid = false;
      verificationMsg = `Verification error: ${(verifyError as Error).message}`;
    }

    res.json({
      isValid,
      fileName: uploadedFile.originalFilename,
      hash: hashForVerification,
      signature: {
        name: signerName,
        reason: signReason,
        date: signDate,
        contentLength: Math.floor(signatureHex.length / 2),
        embedded: true,
      },
      verification: {
        status: isValid ? 'valid' : 'invalid',
        message: verificationMsg,
        cryptographicallyValid,
        hashMismatch,
      },
      message: isValid
        ? 'PDF signature is valid and document has not been modified'
        : 'PDF signature verification failed or document has been modified',
    });
  } catch (error) {
    console.error('[verifyHandler] Error:', error);
    const errorMsg = (error as any).message || '';

    const hardwareError = getHardwareErrorResponse(errorMsg);
    if (hardwareError) {
      return res.status(hardwareError.status).json(hardwareError.body);
    }

    res.status(500).json({ error: 'Failed to verify signature: ' + errorMsg });
  } finally {
    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {
        console.error('[verifyHandler] Failed to clean up temp file:', e);
      }
    }
  }
};
