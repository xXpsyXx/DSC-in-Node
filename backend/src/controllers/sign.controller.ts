import type { Request, Response } from 'express';
import { SignerService } from '../services/sign.service.ts';
import { HashService } from '../services/hash.service.ts';
import { VerifyService } from '../services/verify.service.ts';
import { PdfSignerService } from '../services/pdf-signer.service.ts';
import { IncomingForm } from 'formidable';
import fs from 'fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import sharp from 'sharp';

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

// Convert SVG to PNG buffer using sharp
const svgToPngBuffer = async (): Promise<Buffer> => {
  const svgCode = `<svg viewBox="0 0 100 100" width="100" height="100" xmlns="http://www.w3.org/2000/svg">
  <polygon points="23,53 43,73 83,23 93,31 45,91 15,61" fill="black" />
  <polygon points="20,50 40,70 80,20 90,28 42,88 12,58" fill="#008000" stroke="black" stroke-width="2" stroke-linejoin="miter" />
</svg>`;

  try {
    const pngBuffer = await sharp(Buffer.from(svgCode)).png().toBuffer();
    return pngBuffer;
  } catch (error) {
    console.error('[svgToPngBuffer] Error converting SVG to PNG:', error);
    throw new Error(
      `Failed to convert SVG to PNG: ${(error as Error).message}`,
    );
  }
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
    const driverPath = fields.driverPath?.[0]; // NEW: Optional custom driver path

    if (!uploadedFile) {
      return res.status(400).json({ error: 'file is required' });
    }

    if (!pin) {
      return res.status(400).json({ error: 'pin is required' });
    }

    console.log(
      `[signHandler] Processing file: ${uploadedFile.originalFilename}`,
    );
    if (driverPath) {
      console.log(`[signHandler] Using custom driver: ${driverPath}`);
    }

    // Read file buffer
    const fileBuffer = fs.readFileSync(uploadedFile.filepath);
    tempFilePath = uploadedFile.filepath;

    // Load signer first so we can stamp certificate holder name in the PDF
    try {
      signer = new SignerService(pin, driverPath); // Pass optional driver path
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

    // Check certificate expiration
    const certStatus = signer.getCertificateExpirationStatus();
    console.log(
      `[signHandler] Certificate status: ${certStatus.status} (${certStatus.daysRemaining} days remaining)`,
    );

    if (certStatus.status === 'expired') {
      signer.close();
      return res.status(403).json({
        error: 'Certificate Expired',
        message: certStatus.message,
        daysRemaining: certStatus.daysRemaining,
        expiryDate: certStatus.expiryDate,
      });
    }

    if (certStatus.status === 'critical') {
      signer.close();
      return res.status(403).json({
        error: 'Certificate Expiring Soon',
        message: certStatus.message,
        daysRemaining: certStatus.daysRemaining,
        expiryDate: certStatus.expiryDate,
        warning:
          'Certificate expires in less than 15 days. Signing is blocked.',
      });
    }

    let certWarning: {
      message: string;
      daysRemaining: number;
      expiryDate: Date;
    } | null = null;
    if (certStatus.status === 'warning') {
      certWarning = {
        message: certStatus.message,
        daysRemaining: certStatus.daysRemaining,
        expiryDate: certStatus.expiryDate,
      };
      console.warn(`[signHandler] Certificate warning: ${certStatus.message}`);
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
      // Draw signature metadata stamp box with dashed border
      const headerLines = [
        'Signature valid',
        'Digitally Signed by',
        `${signerName}`,
      ];
      const dateText = `Date: ${signedAt.toLocaleString('en-IN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      })}`;

      const stampFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontSize = 9;
      const dateSize = 7.5; // Smaller font for date to prevent overflow
      const lineHeight = 12;
      const padding = 8;
      const margin = 20;

      const maxHeaderWidth = Math.max(
        ...headerLines.map((line) =>
          stampFont.widthOfTextAtSize(line, fontSize),
        ),
      );
      const dateWidth = stampFont.widthOfTextAtSize(dateText, dateSize);
      const maxTextWidth = Math.max(maxHeaderWidth, dateWidth);

      const boxWidth = maxTextWidth + padding * 2; // No extra space needed, checkmark overlaps
      const boxHeight = headerLines.length * lineHeight + 8 + padding * 2; // Reduced height for single-line date
      const { width, height } = targetPage.getSize();
      const boxX = margin; // Left border
      const boxY = margin; // Bottom of the page

      // Draw borders and text first

      // Draw dashed border rectangle
      const dashLength = 4;
      const gapLength = 3;

      // Top border (left to right)
      let posX = boxX;
      while (posX < boxX + boxWidth) {
        const endX = Math.min(posX + dashLength, boxX + boxWidth);
        targetPage.drawLine({
          start: { x: posX, y: boxY + boxHeight },
          end: { x: endX, y: boxY + boxHeight },
          thickness: 1.5,
          color: rgb(0.2, 0.2, 0.2),
        });
        posX += dashLength + gapLength;
      }

      // Right border (top to bottom) - Fixed alignment
      let posY = boxY + boxHeight;
      while (posY > boxY) {
        const endY = Math.max(posY - dashLength, boxY);
        targetPage.drawLine({
          start: { x: boxX + boxWidth, y: posY },
          end: { x: boxX + boxWidth, y: endY },
          thickness: 1.5,
          color: rgb(0.2, 0.2, 0.2),
        });
        posY -= dashLength + gapLength;
      }

      // Bottom border (right to left)
      posX = boxX + boxWidth;
      while (posX > boxX) {
        const endX = Math.max(posX - dashLength, boxX);
        targetPage.drawLine({
          start: { x: posX, y: boxY },
          end: { x: endX, y: boxY },
          thickness: 1.5,
          color: rgb(0.2, 0.2, 0.2),
        });
        posX -= dashLength + gapLength;
      }

      // Left border (bottom to top)
      posY = boxY;
      while (posY < boxY + boxHeight) {
        const endY = Math.min(posY + dashLength, boxY + boxHeight);
        targetPage.drawLine({
          start: { x: boxX, y: posY },
          end: { x: boxX, y: endY },
          thickness: 1.5,
          color: rgb(0.2, 0.2, 0.2),
        });
        posY += dashLength + gapLength;
      }

      // Draw the SVG checkmark first (behind the text)
      try {
        const checkmarkPngBuffer = await svgToPngBuffer();
        const checkmarkImage = await pdfDoc.embedPng(checkmarkPngBuffer);
        const checkmarkSize = 45; // Larger checkmark to overlay content
        // Position checkmark to the left inside the box
        const checkmarkX = boxX + 12; // Left side inside box, moved right
        const checkmarkY = boxY + boxHeight / 2 - checkmarkSize / 2; // Vertically centered in the box

        targetPage.drawImage(checkmarkImage, {
          x: checkmarkX,
          y: checkmarkY,
          width: checkmarkSize,
          height: checkmarkSize,
        });
      } catch (imgError) {
        console.warn(
          '[signHandler] Failed to embed checkmark image:',
          imgError,
        );
      }

      // Draw header text lines
      headerLines.forEach((line, index) => {
        const textY =
          boxY + boxHeight - padding - fontSize - index * lineHeight;

        targetPage.drawText(line, {
          x: boxX + padding,
          y: textY,
          size: fontSize,
          font: stampFont,
          color: rgb(0.2, 0.2, 0.2),
        });
      });

      // Draw date with smaller font
      const dateY = boxY + padding + 1;
      targetPage.drawText(dateText, {
        x: boxX + padding,
        y: dateY,
        size: dateSize,
        font: stampFont,
        color: rgb(0.2, 0.2, 0.2),
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

    // Add certificate warning header if applicable
    if (certWarning) {
      res.setHeader('X-Cert-Warning', certWarning.message);
      res.setHeader(
        'X-Cert-Days-Remaining',
        certWarning.daysRemaining.toString(),
      );
      res.setHeader('X-Cert-Expiry-Date', certWarning.expiryDate.toISOString());
    }

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

// Diagnostic endpoint to check certificate expiration status
export const certStatusHandler = async (req: Request, res: Response) => {
  const form = new IncomingForm();

  try {
    const [fields] = await form.parse(req);

    const pin = fields.pin?.[0];

    if (!pin) {
      return res.status(400).json({ error: 'pin is required' });
    }

    console.log('[certStatusHandler] Checking certificate status');

    let signer: SignerService | null = null;

    try {
      signer = new SignerService(pin);
    } catch (signError) {
      const errorMsg = (signError as any).message || '';
      console.error('[certStatusHandler] Error loading signer:', errorMsg);

      if (isPinErrorMessage(errorMsg)) {
        return res.status(401).json({
          error: 'Invalid PIN - Cannot unlock certificate.',
        });
      }

      const hardwareError = getHardwareErrorResponse(errorMsg);
      if (hardwareError) {
        return res.status(hardwareError.status).json(hardwareError.body);
      }

      throw signError;
    }

    // Check certificate expiration
    const certStatus = signer.getCertificateExpirationStatus();
    const signerName = signer.getSignerName();

    console.log(
      `[certStatusHandler] Certificate status: ${certStatus.status} (${certStatus.daysRemaining} days remaining)`,
    );

    signer.close();

    res.json({
      status: certStatus.status,
      daysRemaining: certStatus.daysRemaining,
      expiryDate: certStatus.expiryDate,
      message: certStatus.message,
      signerName: signerName,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[certStatusHandler] Error:', error);
    const errorMsg = (error as any).message || '';

    const hardwareError = getHardwareErrorResponse(errorMsg);
    if (hardwareError) {
      return res.status(hardwareError.status).json(hardwareError.body);
    }

    res.status(500).json({ error: 'Failed to check certificate: ' + errorMsg });
  }
};

// NEW: Get list of supported USB token drivers
export const getSupportedDriversHandler = async (
  req: Request,
  res: Response,
) => {
  try {
    const drivers = SignerService.getSupportedDrivers();
    res.json({
      platform: process.platform,
      drivers,
      message: 'Supported USB token drivers for digital signing',
    });
  } catch (error) {
    console.error('[getSupportedDriversHandler] Error:', error);
    res.status(500).json({
      error: 'Failed to retrieve supported drivers',
    });
  }
};

// NEW: Auto-detect connected USB token
export const autoDetectTokenHandler = async (req: Request, res: Response) => {
  try {
    console.log(
      '[autoDetectTokenHandler] Starting USB token auto-detection...',
    );
    const detectedDevice = SignerService.autoDetectDriver();

    if (!detectedDevice) {
      console.warn('[autoDetectTokenHandler] No USB token device detected');
      return res.status(404).json({
        detected: false,
        message:
          'No USB token device detected. Please insert your USB token and try again.',
      });
    }

    console.log(
      `[autoDetectTokenHandler] Device detected: ${detectedDevice.driverName}`,
    );
    res.json({
      detected: true,
      driverName: detectedDevice.driverName,
      driverPath: detectedDevice.driverPath,
      message: `USB token detected: ${detectedDevice.driverName}`,
    });
  } catch (error) {
    console.error('[autoDetectTokenHandler] Error:', error);
    res.status(500).json({
      detected: false,
      error: 'Failed to auto-detect USB token',
    });
  }
};
