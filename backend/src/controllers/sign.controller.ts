import type { Request, Response } from 'express';
import { SignerService } from '../services/sign.service.ts';
import { HashService } from '../services/hash.service.ts';
import type {
  SignRequest,
  SignResponse,
  VerifyRequest,
  VerifyResponse,
} from '../types/sign.type.ts';
import { VerifyService } from '../services/verify.service.ts';
import { PdfSignerService } from '../services/pdf-signer.service.ts';
import { IncomingForm } from 'formidable';
import fs from 'fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

let verifyService: VerifyService | null = null;

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

const isUsbTokenErrorMessage = (errorMsg: string): boolean => {
  return /(USB token|PKCS#11|No token|CKR_TOKEN_NOT_PRESENT|CKR_DEVICE_REMOVED|CKR_SLOT_ID_INVALID|library not configured|token slot|certificate unavailable|No signing key)/i.test(
    errorMsg,
  );
};

// In-memory storage for signed PDFs (hash -> signature mapping)
// In production, use database or file system
const signatureStore = new Map<
  string,
  {
    signature: string;
    pkcs7Signature?: string;
    certificate?: string;
    timestamp: number;
  }
>();

// Clean up old entries every hour (older than 24 hours)
setInterval(
  () => {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    for (const [hash, data] of signatureStore.entries()) {
      if (now - data.timestamp > maxAge) {
        signatureStore.delete(hash);
        console.log(`[SignatureStore] Deleted old signature for hash: ${hash}`);
      }
    }
  },
  60 * 60 * 1000,
); // Run every hour

export const signHandler = (req: Request, res: Response) => {
  const body = req.body as SignRequest;

  if (!body.hash || !body.pin) {
    return res.status(400).json({ error: 'hash and pin are required' });
  }

  let signer: SignerService | null = null;

  try {
    signer = new SignerService(body.pin);
    const signature = signer.signHash(body.hash);

    const response: SignResponse = { signature };

    res.json(response);
  } catch (error) {
    console.error('[signHandler] Error:', error);
    const errorMsg = (error as any).message || '';
    if (isUsbTokenErrorMessage(errorMsg)) {
      return res.status(503).json({
        error:
          'USB token not detected. Please connect Hypersecu USB token and try again.',
      });
    }
    if (isPinErrorMessage(errorMsg)) {
      return res
        .status(401)
        .json({ error: 'Invalid PIN - Certificate unlock failed' });
    }
    res.status(500).json({ error: 'Failed to sign hash or invalid PIN' });
  } finally {
    signer?.close();
  }
};

export const signPdfHandler = async (req: Request, res: Response) => {
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
      `[signPdfHandler] Processing file: ${uploadedFile.originalFilename}`,
    );

    // Read file buffer
    const fileBuffer = fs.readFileSync(uploadedFile.filepath);
    tempFilePath = uploadedFile.filepath;

    // Load signer first so we can stamp certificate holder name in the PDF
    try {
      signer = new SignerService(pin);
    } catch (signError) {
      const errorMsg = (signError as any).message || '';
      console.error('[signPdfHandler] Signing error:', errorMsg);
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
        borderColor: rgb(0.65, 0.65, 0.65),
        borderWidth: 0.8,
      });

      stampLines.forEach((line, index) => {
        const textY =
          boxY + boxHeight - padding - fontSize - index * lineHeight;
        targetPage.drawText(line, {
          x: boxX + padding,
          y: textY,
          size: fontSize,
          font: stampFont,
          color: rgb(0.1, 0.1, 0.1),
        });
      });
    }

    // Save modified PDF to buffer and sign the exact bytes we return
    const signedPdfBytes = await pdfDoc.save();
    const hash = HashService.hashBuffer(Buffer.from(signedPdfBytes));
    console.log(`[signPdfHandler] Signed PDF hash: ${hash}`);

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
    // Encode certificate as base64 to avoid newline issues in headers
    const certificateBase64 = Buffer.from(certificatePem).toString('base64');
    res.setHeader('X-Signer-Certificate', certificateBase64); // Certificate (base64 encoded)
    res.setHeader('X-Signed-Date', new Date().toISOString());

    // Store signature on server for verification later (using hash as key)
    signatureStore.set(hash, {
      signature: rsaSignatureBase64,
      pkcs7Signature: pkcs7Signature,
      certificate: certificatePem,
      timestamp: Date.now(),
    });
    console.log(
      `[signPdfHandler] Stored signature for hash: ${hash.substring(0, 32)}...`,
    );

    console.log(`[signPdfHandler] Sending signed PDF: ${signedFileName}`);
    res.send(Buffer.from(signedPdfBytes));
  } catch (error) {
    console.error('[signPdfHandler] Error:', error);
    const errorMsg = (error as any).message || '';

    if (isUsbTokenErrorMessage(errorMsg)) {
      return res.status(503).json({
        error:
          'USB token not detected. Please connect Hypersecu USB token and try again.',
      });
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
        console.error('[signPdfHandler] Failed to clean up temp file:', e);
      }
    }
  }
};

export const verifyHandler = (req: Request, res: Response) => {
  const body = req.body as VerifyRequest;

  if (!body || !body.hash || !body.signature) {
    return res.status(400).json({ error: 'hash and signature are required' });
  }

  try {
    const verifier = getVerifyService();
    const isValid = verifier.verify(body.hash, body.signature);

    res.json({ isValid });
  } catch (error) {
    console.error('[verifyHandler] Error:', error);
    const errorMsg = (error as any).message || '';
    if (isUsbTokenErrorMessage(errorMsg)) {
      return res.status(503).json({
        error:
          'USB token not detected. Please connect Hypersecu USB token and try again.',
      });
    }
    res.status(500).json({ error: 'Failed to verify signature' });
  }
};

export const verifyPdfHandler = async (req: Request, res: Response) => {
  const form = new IncomingForm({
    maxFileSize: 50 * 1024 * 1024, // 50MB
  });

  let tempFilePath: string | null = null;

  try {
    const [fields, files] = await form.parse(req);

    const uploadedFile = files.file?.[0];
    const signatureField = fields.signature?.[0]; // Optional: can override stored signature

    if (!uploadedFile) {
      return res.status(400).json({ error: 'file is required' });
    }

    console.log(
      `[verifyPdfHandler] Verifying file: ${uploadedFile.originalFilename}`,
    );

    // Read file buffer
    const fileBuffer = fs.readFileSync(uploadedFile.filepath);
    tempFilePath = uploadedFile.filepath;

    // Compute hash of the uploaded PDF
    const hash = HashService.hashBuffer(fileBuffer);

    console.log(
      `[verifyPdfHandler] Computed hash: ${hash.substring(0, 32)}...`,
    );

    // Try to get signature from stored data using hash
    let signature = signatureField; // Use provided signature if given
    if (signature) {
      signature = signature.replace(/\r?\n/g, '');
    }

    if (!signature) {
      const stored = signatureStore.get(hash);
      if (stored) {
        signature = stored.signature;
        console.log(
          `[verifyPdfHandler] Retrieved signature from server storage`,
        );
      } else {
        return res.status(400).json({
          error: 'signature not found',
          hash: hash,
          message:
            'PDF signature not found in server storage. Sign the PDF with /sign-pdf first, then verify immediately.',
        });
      }
    }

    console.log(`[verifyPdfHandler] Signature length: ${signature.length}`);

    // Verify the signature
    const verifier = getVerifyService();
    const isValid = verifier.verify(hash, signature);

    res.json({
      isValid,
      fileName: uploadedFile.originalFilename,
      hash,
      signaturePreview: signature.substring(0, 100),
    });
  } catch (error) {
    console.error('[verifyPdfHandler] Error:', error);
    const errorMsg = (error as any).message || '';
    if (isUsbTokenErrorMessage(errorMsg)) {
      return res.status(503).json({
        error:
          'USB token not detected. Please connect Hypersecu USB token and try again.',
      });
    }
    res.status(500).json({ error: 'Failed to verify PDF: ' + errorMsg });
  } finally {
    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {
        console.error('[verifyPdfHandler] Failed to clean up temp file:', e);
      }
    }
  }
};

export const verifyEmbeddedSignatureHandler = async (
  req: Request,
  res: Response,
) => {
  const form = new IncomingForm({
    maxFileSize: 50 * 1024 * 1024, // 50MB
  });

  let tempFilePath: string | null = null;

  try {
    const [fields, files] = await form.parse(req);

    const uploadedFile = files.file?.[0];
    const certificateBase64Field = fields.certificate?.[0]; // Optional: certificate as base64

    if (!uploadedFile) {
      return res.status(400).json({ error: 'file is required' });
    }

    console.log(
      `[verifyEmbeddedSignatureHandler] Verifying file: ${uploadedFile.originalFilename}`,
    );

    // Read file buffer
    const fileBuffer = fs.readFileSync(uploadedFile.filepath);
    tempFilePath = uploadedFile.filepath;

    // Extract signature information from the PDF
    const pdfText = fileBuffer.toString('binary');

    // Look for /Sig object in PDF
    const sigObjMatch = pdfText.match(/\/Sig\s+(\d+)\s+0\s+R/);
    if (!sigObjMatch || !sigObjMatch[1]) {
      return res.status(400).json({
        error: 'No signature found in PDF',
        fileName: uploadedFile.originalFilename,
        message:
          'This PDF does not contain an embedded digital signature. Sign the PDF first using /sign-pdf endpoint.',
      });
    }

    const sigObjNum = parseInt(sigObjMatch[1]);
    console.log(
      `[verifyEmbeddedSignatureHandler] Found signature object ${sigObjNum}`,
    );

    // Try to extract signature contents from /Sig object
    const sigObjectRegex = new RegExp(
      `${sigObjNum}\\s+0\\s+obj\\s*<<([^>]*)>>`,
      's',
    );
    const sigObjectMatch = pdfText.match(sigObjectRegex);

    let signatureHex = '';
    let signerName = 'Unknown';
    let signReason = '';
    let signDate = '';

    if (sigObjectMatch && sigObjectMatch[1]) {
      const sigObjContent = sigObjectMatch[1];

      // Extract signature contents
      const contentsMatch = sigObjContent.match(
        /\/Contents\s*<([0-9a-fA-F]+)>/,
      );
      if (contentsMatch && contentsMatch[1]) {
        signatureHex = contentsMatch[1];
        console.log(
          `[verifyEmbeddedSignatureHandler] Extracted signature: ${signatureHex.substring(0, 64)}...`,
        );
      }

      // Extract signer name
      const nameMatch = sigObjContent.match(/\/Name\s*<([0-9a-fA-F]+)>/);
      if (nameMatch && nameMatch[1]) {
        signerName = Buffer.from(nameMatch[1], 'hex').toString('utf8');
      }

      // Extract reason
      const reasonMatch = sigObjContent.match(/\/Reason\s*<([0-9a-fA-F]+)>/);
      if (reasonMatch && reasonMatch[1]) {
        signReason = Buffer.from(reasonMatch[1], 'hex').toString('utf8');
      }

      // Extract date
      const dateMatch = sigObjContent.match(/\/M\s*\(([^)]+)\)/);
      if (dateMatch && dateMatch[1]) {
        signDate = dateMatch[1];
      }
    }

    // Compute hash of the PDF content (without signature)
    const hash = HashService.hashBuffer(fileBuffer);
    console.log(
      `[verifyEmbeddedSignatureHandler] PDF hash: ${hash.substring(0, 32)}...`,
    );

    // Check if we have certificate from request
    let certificate = certificateBase64Field
      ? Buffer.from(certificateBase64Field, 'base64').toString('utf8')
      : null;

    // Try to get certificate from signature store using hash
    let isValid = false;
    let verificationMsg = '';

    if (!certificate) {
      // Try to find from stored signatures
      const stored = signatureStore.get(hash);
      if (stored && stored.certificate) {
        certificate = stored.certificate;
        console.log(
          `[verifyEmbeddedSignatureHandler] Using certificate from server storage`,
        );
      }
    }

    // If we have signature and certificate, try to verify
    if (signatureHex && certificate) {
      try {
        const verifier = getVerifyService();
        const signatureBase64 = Buffer.from(signatureHex, 'hex').toString(
          'base64',
        );
        isValid = verifier.verify(hash, signatureBase64);
        verificationMsg = isValid
          ? 'Signature verified successfully'
          : 'Signature verification failed - signature does not match document';
        console.log(
          `[verifyEmbeddedSignatureHandler] Verification: ${isValid}`,
        );
      } catch (verifyError) {
        console.error(
          '[verifyEmbeddedSignatureHandler] Verification error:',
          verifyError,
        );
        isValid = false;
        verificationMsg = `Verification error: ${(verifyError as Error).message}`;
      }
    } else {
      verificationMsg = certificate
        ? 'Signature found but cannot extract contents'
        : 'Certificate required for verification. Provide certificate as base64 in request.';
    }

    res.json({
      isValid,
      fileName: uploadedFile.originalFilename,
      hash,
      signature: {
        name: signerName,
        reason: signReason,
        date: signDate,
        contentLength: signatureHex.length / 2,
      },
      verification: {
        status: isValid ? 'valid' : 'invalid',
        message: verificationMsg,
      },
      message: isValid
        ? 'PDF signature is valid and document has not been modified'
        : 'PDF signature verification failed or document has been modified',
    });
  } catch (error) {
    console.error('[verifyEmbeddedSignatureHandler] Error:', error);
    const errorMsg = (error as any).message || '';
    res.status(500).json({ error: 'Failed to verify signature: ' + errorMsg });
  } finally {
    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {
        console.error(
          '[verifyEmbeddedSignatureHandler] Failed to clean up temp file:',
          e,
        );
      }
    }
  }
};
