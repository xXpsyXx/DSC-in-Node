import type { Request, Response } from 'express';
import { SignerService } from '../services/sign.service.ts';
import { HashService } from '../services/hash.service.ts';
import { VerifyService } from '../services/verify.service.ts';
import { PdfSignerService } from '../services/pdf-signer.service.ts';
import { Pkcs7SignerService } from '../services/pkcs7-signer.service.ts';
import { TsaService } from '../services/tsa.service.ts';
import { IncomingForm } from 'formidable';
import * as fs from 'fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFPage } from 'pdf-lib';
import sharp from 'sharp';
import {
  isPinErrorMessage,
  isPkcs11DriverErrorMessage,
  isUsbTokenMissingErrorMessage,
  isUsbTokenErrorMessage,
  getHardwareErrorResponse,
} from '../utils/error-handlers.ts';

let verifyService: VerifyService | null = null;

/**
 * Get or initialize the verify service singleton.
 * Reuses verifier instance to avoid reloading PKCS#11 library on every request.
 * @access private
 * @returns {VerifyService} The verify service instance
 * @since 1.0.0
 */
const getVerifyService = (): VerifyService => {
  if (!verifyService) {
    verifyService = new VerifyService();
  }
  return verifyService;
};

// ============ ERROR MESSAGE DETECTION ============
// Note: Error detection functions are imported from error-handlers.ts module

// ============ SVG/PNG CONVERSION ============

/**
 * Convert SVG checkmark to PNG buffer using sharp library.
 * Generates a green checkmark image for embedding in PDF signature stamps.
 * @access private
 * @returns {Promise<Buffer>} PNG image buffer
 * @throws {Error} If SVG to PNG conversion fails
 * @since 1.0.0
 */
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

// ============ PDF SETUP & METADATA ============

/**
 * Load PDF document from buffer.
 * Initializes PDFDocument for manipulation.
 * @access private
 * @param {Buffer} fileBuffer The PDF file bytes
 * @returns {Promise<PDFDocument>} The loaded PDF document
 * @throws {Error} If PDF loading fails
 * @since 1.0.0
 */
const loadPdfDocument = async (fileBuffer: Buffer): Promise<PDFDocument> => {
  return await PDFDocument.load(fileBuffer);
};

/**
 * Set PDF metadata properties.
 * Updates title, author, subject, and keywords.
 * @access private
 * @param {PDFDocument} pdfDoc The PDF document
 * @param {string} signerName The name of the signer
 * @returns {void}
 * @since 1.0.0
 */
const setPdfMetadata = (pdfDoc: PDFDocument, signerName: string): void => {
  pdfDoc.setTitle('Digitally Signed Document');
  pdfDoc.setAuthor(`Signed by ${signerName}`);
  pdfDoc.setSubject('Digital Signature Attached');
  pdfDoc.setKeywords(['signed', 'digital-signature', signerName]);
};

/**
 * Get the last page of a PDF document.
 * This is typically where signature stamps are added.
 * @access private
 * @param {PDFDocument} pdfDoc The PDF document
 * @returns {PDFPage | null} The last page or null if document has no pages
 * @since 1.0.0
 */
const getLastPdfPage = (pdfDoc: PDFDocument): PDFPage | null => {
  const pages = pdfDoc.getPages();
  return pages[pages.length - 1] || null;
};

// ============ SIGNATURE STAMP DRAWING ============

/**
 * Draw a dashed border rectangle on a PDF page.
 * Used for signature stamp visual container.
 * @access private
 * @param {PDFPage} page The PDF page
 * @param {number} x Top-left X coordinate
 * @param {number} y Top-left Y coordinate
 * @param {number} width Rectangle width
 * @param {number} height Rectangle height
 * @returns {void}
 * @since 1.0.0
 */
const drawDashedBorder = (
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
): void => {
  const dashLength = 4;
  const gapLength = 3;

  // Top border (left to right)
  let posX = x;
  while (posX < x + width) {
    const endX = Math.min(posX + dashLength, x + width);
    page.drawLine({
      start: { x: posX, y: y + height },
      end: { x: endX, y: y + height },
      thickness: 1.5,
      color: rgb(0.2, 0.2, 0.2),
    });
    posX += dashLength + gapLength;
  }

  // Right border (top to bottom)
  let posY = y + height;
  while (posY > y) {
    const endY = Math.max(posY - dashLength, y);
    page.drawLine({
      start: { x: x + width, y: posY },
      end: { x: x + width, y: endY },
      thickness: 1.5,
      color: rgb(0.2, 0.2, 0.2),
    });
    posY -= dashLength + gapLength;
  }

  // Bottom border (right to left)
  posX = x + width;
  while (posX > x) {
    const endX = Math.max(posX - dashLength, x);
    page.drawLine({
      start: { x: posX, y: y },
      end: { x: endX, y: y },
      thickness: 1.5,
      color: rgb(0.2, 0.2, 0.2),
    });
    posX -= dashLength + gapLength;
  }

  // Left border (bottom to top)
  posY = y;
  while (posY < y + height) {
    const endY = Math.min(posY + dashLength, y + height);
    page.drawLine({
      start: { x: x, y: posY },
      end: { x: x, y: endY },
      thickness: 1.5,
      color: rgb(0.2, 0.2, 0.2),
    });
    posY += dashLength + gapLength;
  }
};

/**
 * Embed checkmark image in PDF signature stamp.
 * Overlays a green checkmark icon in the signature box.
 * @access private
 * @param {PDFDocument} pdfDoc The PDF document
 * @param {PDFPage} page The PDF page
 * @param {number} boxX Signature box X coordinate
 * @param {number} boxY Signature box Y coordinate
 * @param {number} boxHeight Signature box height
 * @returns {Promise<void>}
 * @since 1.0.0
 */
const embedCheckmarkImage = async (
  pdfDoc: PDFDocument,
  page: PDFPage,
  boxX: number,
  boxY: number,
  boxHeight: number,
): Promise<void> => {
  try {
    const checkmarkPngBuffer = await svgToPngBuffer();
    const checkmarkImage = await pdfDoc.embedPng(checkmarkPngBuffer);
    const checkmarkSize = 45;
    const checkmarkX = boxX + 12;
    const checkmarkY = boxY + boxHeight / 2 - checkmarkSize / 2;

    page.drawImage(checkmarkImage, {
      x: checkmarkX,
      y: checkmarkY,
      width: checkmarkSize,
      height: checkmarkSize,
    });
  } catch (imgError) {
    console.warn(
      '[embedCheckmarkImage] Failed to embed checkmark image:',
      imgError,
    );
  }
};

/**
 * Draw header text lines in signature stamp.
 * Displays "Signature valid", "Digitally Signed by", and signer name.
 * @access private
 * @param {PDFPage} page The PDF page
 * @param {any} font The PDF font
 * @param {string[]} headerLines Lines of text to draw
 * @param {number} boxX Signature box X coordinate
 * @param {number} boxY Signature box Y coordinate
 * @param {number} boxHeight Signature box height
 * @param {number} fontSize Font size in points
 * @returns {void}
 * @since 1.0.0
 */
const drawHeaderLines = (
  page: PDFPage,
  font: any,
  headerLines: string[],
  boxX: number,
  boxY: number,
  boxHeight: number,
  fontSize: number,
): void => {
  const padding = 8;
  const lineHeight = 12;

  headerLines.forEach((line, index) => {
    const textY = boxY + boxHeight - padding - fontSize - index * lineHeight;
    page.drawText(line, {
      x: boxX + padding,
      y: textY,
      size: fontSize,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
  });
};

/**
 * Draw date text in signature stamp.
 * Uses smaller font to prevent overflow.
 * @access private
 * @param {PDFPage} page The PDF page
 * @param {any} font The PDF font
 * @param {string} dateText The date text to draw
 * @param {number} boxX Signature box X coordinate
 * @param {number} boxY Signature box Y coordinate
 * @param {number} dateSize Date font size
 * @returns {void}
 * @since 1.0.0
 */
const drawDateText = (
  page: PDFPage,
  font: any,
  dateText: string,
  boxX: number,
  boxY: number,
  dateSize: number,
): void => {
  const padding = 8;
  page.drawText(dateText, {
    x: boxX + padding,
    y: boxY + padding + 1,
    size: dateSize,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
};

/**
 * Add signature stamp to the last page of a PDF.
 * Draws a dashed border box with checkmark, signer name, and timestamp.
 * @access private
 * @param {PDFDocument} pdfDoc The PDF document
 * @param {PDFPage} page The PDF page
 * @param {string} signerName The name of the signer
 * @param {Date} signedAt The signature timestamp
 * @returns {Promise<void>}
 * @since 1.0.0
 */
const addSignatureStampToPage = async (
  pdfDoc: PDFDocument,
  page: PDFPage,
  signerName: string,
  signedAt: Date,
): Promise<void> => {
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
  const dateSize = 7.5;
  const lineHeight = 12;
  const padding = 8;
  const margin = 20;

  const maxHeaderWidth = Math.max(
    ...headerLines.map((line) => stampFont.widthOfTextAtSize(line, fontSize)),
  );
  const dateWidth = stampFont.widthOfTextAtSize(dateText, dateSize);
  const maxTextWidth = Math.max(maxHeaderWidth, dateWidth);

  const boxWidth = maxTextWidth + padding * 2;
  const boxHeight = headerLines.length * lineHeight + 8 + padding * 2;
  const { width } = page.getSize();
  const boxX = width - boxWidth - margin;
  const boxY = margin;

  // Draw border
  drawDashedBorder(page, boxX, boxY, boxWidth, boxHeight);

  // Embed checkmark
  await embedCheckmarkImage(pdfDoc, page, boxX, boxY, boxHeight);

  // Draw text
  drawHeaderLines(
    page,
    stampFont,
    headerLines,
    boxX,
    boxY,
    boxHeight,
    fontSize,
  );
  drawDateText(page, stampFont, dateText, boxX, boxY, dateSize);
};

/**
 * Add signature metadata stamp to PDF.
 * Modifies the PDF document by adding signature information to the last page.
 * @access private
 * @param {PDFDocument} pdfDoc The PDF document
 * @param {string} signerName The name of the signer
 * @param {Date} signedAt The signature timestamp
 * @returns {Promise<void>}
 * @since 1.0.0
 */
const addSignatureMetadataToPdf = async (
  pdfDoc: PDFDocument,
  signerName: string,
  signedAt: Date,
): Promise<void> => {
  const targetPage = getLastPdfPage(pdfDoc);
  if (targetPage) {
    await addSignatureStampToPage(pdfDoc, targetPage, signerName, signedAt);
  }
};

// ============ PDF SAVING & VALIDATION ============

/**
 * Save modified PDF document to buffer.
 * Exports the PDF as bytes for signing and sending.
 * @access private
 * @param {PDFDocument} pdfDoc The PDF document
 * @returns {Promise<Buffer>} The PDF as a buffer
 * @throws {Error} If PDF saving fails
 * @since 1.0.0
 */
const savePdfToBuffer = async (pdfDoc: PDFDocument): Promise<Buffer> => {
  const pdfUint8Array = await pdfDoc.save();
  return Buffer.from(pdfUint8Array);
};

/**
 * Validate PDF has correct structure and integrity.
 * Checks for PDF header and EOF marker.
 * @access private
 * @param {Buffer} pdfBytes The PDF buffer to validate
 * @returns {void}
 * @throws {Error} If PDF structure is invalid
 * @since 1.0.0
 */
const validatePdfStructure = (pdfBytes: Buffer): void => {
  const pdfStart = pdfBytes.toString('utf8', 0, 4);
  const pdfText = pdfBytes.toString('binary');
  const pdfHasEof = pdfText.includes('%%EOF');

  if (pdfStart !== '%PDF' || !pdfHasEof) {
    console.error('[validatePdfStructure] Invalid PDF structure detected');
    console.error('[validatePdfStructure] PDF starts with:', pdfStart);
    console.error('[validatePdfStructure] Has %%EOF:', pdfHasEof);
    console.error('[validatePdfStructure] PDF size:', pdfBytes.length);
    throw new Error('Invalid PDF structure after PDFDocument.save()');
  }
};

// ============ SIGNER INITIALIZATION ============

/**
 * Load and initialize signer service from PIN and optional driver path.
 * Creates a connection to the USB token.
 * @access private
 * @param {string} pin The PIN code for the USB token
 * @param {string | undefined} driverPath Optional custom driver path
 * @returns {SignerService} The initialized signer service
 * @throws {Error} If signer initialization fails
 * @since 1.0.0
 */
const loadSigner = (pin: string, driverPath?: string): SignerService => {
  return new SignerService(pin, driverPath);
};

/**
 * Check certificate expiration status.
 * Validates certificate is not expired or expiring soon.
 * @access private
 * @param {SignerService} signer The signer service
 * @returns {any} Certificate status object
 * @since 1.0.0
 */
const checkCertificateStatus = (signer: SignerService): any => {
  return signer.getCertificateExpirationStatus();
};

/**
 * Validate certificate is viable for signing.
 * Returns error response if certificate is expired or critical.
 * @access private
 * @param {any} certStatus Certificate status object
 * @param {SignerService} signer The signer service
 * @returns {any | null} Error response object or null if valid
 * @since 1.0.0
 */
const validateCertificateStatus = (
  certStatus: any,
  signer: SignerService,
): any | null => {
  if (certStatus.status === 'expired') {
    signer.close();
    return {
      status: 403,
      body: {
        error: 'Certificate Expired',
        message: certStatus.message,
        daysRemaining: certStatus.daysRemaining,
        expiryDate: certStatus.expiryDate,
      },
    };
  }

  if (certStatus.status === 'critical') {
    signer.close();
    return {
      status: 403,
      body: {
        error: 'Certificate Expiring Soon',
        message: certStatus.message,
        daysRemaining: certStatus.daysRemaining,
        expiryDate: certStatus.expiryDate,
        warning:
          'Certificate expires in less than 15 days. Signing is blocked.',
      },
    };
  }

  return null;
};

/**
 * Extract certificate warning if present.
 * Returns warning object if certificate is in warning status.
 * @access private
 * @param {any} certStatus Certificate status object
 * @returns {any | null} Warning object or null if no warning
 * @since 1.0.0
 */
const extractCertificateWarning = (certStatus: any): any | null => {
  if (certStatus.status === 'warning') {
    return {
      message: certStatus.message,
      daysRemaining: certStatus.daysRemaining,
      expiryDate: certStatus.expiryDate,
    };
  }
  return null;
};

// ============ SIGNING OPERATIONS ============

/**
 * Sign PDF hash with USB token.
 * Performs RSA signing and returns base64 signature.
 * @access private
 * @param {SignerService} signer The signer service
 * @param {string} hash The SHA256 hash of the PDF
 * @returns {string} The RSA signature as base64
 * @since 1.0.0
 */
const signPdfHash = (signer: SignerService, hash: string): string => {
  return signer.signHash(hash);
};

/**
 * Get certificate from USB token.
 * Retrieves both PEM and DER formats.
 * @access private
 * @param {SignerService} signer The signer service
 * @returns {{pem: string | null, der: Buffer | null}} Certificate in both formats
 * @since 1.0.0
 */
const getCertificateFromSigner = (
  signer: SignerService,
): { pem: string | null; der: Buffer | null } => {
  return {
    pem: signer.getCertificatePem(),
    der: signer.getCertificateDer(),
  };
};

/**
 * Request timestamp from TSA (Timestamp Authority).
 * Gets RFC 3161 compliant timestamp for legal signature validity.
 * @access private
 * @param {string} hash The data hash to timestamp
 * @returns {Promise<Buffer>} The timestamp token from TSA
 * @throws {Error} If TSA request fails
 * @since 1.0.0
 */
const requestTsaTimestamp = async (hash: string): Promise<Buffer> => {
  console.log('[signHandler] Requesting timestamp from TSA...');
  try {
    const tsaUrl = process.env.TSA_URL || 'http://timestamp.quovadis.com/tsa';
    const timestampToken = await TsaService.requestTimestampToken(hash, tsaUrl);
    console.log('[signHandler] Timestamp obtained successfully');
    return timestampToken;
  } catch (tsaError) {
    console.error(
      '[signHandler] TSA FAILED - signature cannot proceed without timestamp:',
      tsaError,
    );
    throw new Error(
      `Timestamp Authority (TSA) failed - PDFs must include cryptographic timestamps for legal validity. ${(tsaError as Error).message}`,
    );
  }
};

/**
 * Create PKCS#7/CMS signature structure.
 * Builds proper RFC 2630/5652 container with timestamp.
 * @access private
 * @param {object} options Signature creation options
 * @returns {Buffer} PKCS#7 signature as buffer
 * @since 1.0.0
 */
const createPkcs7Signature = (options: {
  rsaSignatureBase64: string;
  certificatePem: string;
  hash: string;
  signerName: string;
  timestampToken: Buffer;
}): Buffer => {
  console.log('[signHandler] Creating PKCS#7/CMS signature with timestamp...');
  return Pkcs7SignerService.createSignedData({
    rsaSignatureBase64: options.rsaSignatureBase64,
    certificatePem: options.certificatePem,
    dataHash: options.hash,
    signerName: options.signerName,
    signReason: 'Digitally signed with Hypersecu USB token',
    signedAt: new Date(),
    timestampToken: options.timestampToken,
  });
};

/**
 * Compute server HMAC for signature verification.
 * Prevents external signatures from being used on this system.
 * @access private
 * @param {string} certificatePem The signer certificate
 * @param {string} hash The PDF hash
 * @returns {string | undefined} HMAC hex string or undefined if not configured
 * @since 1.0.0
 */
const computeServerHmac = (
  certificatePem: string,
  hash: string,
): string | undefined => {
  const signingSecret = process.env.SIGNING_SECRET;
  if (!signingSecret) {
    console.warn(
      '[signHandler] SIGNING_SECRET not configured - server HMAC will not be embedded',
    );
    return undefined;
  }

  const hmac = HashService.computeServerHmac(
    signingSecret,
    certificatePem,
    hash,
  );
  console.log(`[signHandler] Server HMAC computed: ${hmac}`);
  return hmac;
};

/**
 * Embed PKCS#7 signature in PDF.
 * Adds detached signature block to the PDF file.
 * @access private
 * @param {Buffer} pdfBytes The PDF bytes
 * @param {object} options Signature embedding options
 * @returns {Buffer} PDF with embedded signature
 * @since 1.0.0
 */
const embedSignatureInPdf = (
  pdfBytes: Buffer,
  options: {
    signatureHex: string;
    hashHex: string;
    signerName: string;
    certificatePem?: string;
    serverHmac?: string;
  },
): Buffer => {
  console.log('[signHandler] Embedding PKCS#7/CMS signature in PDF...');
  const embedOptions: any = {
    signatureHex: options.signatureHex,
    hashHex: options.hashHex,
    signerName: options.signerName,
    reason: 'Digitally signed with Hypersecu USB token',
    signedAt: new Date(),
  };
  if (options.certificatePem !== undefined) {
    embedOptions.certificatePem = options.certificatePem;
  }
  if (options.serverHmac !== undefined) {
    embedOptions.serverHmac = options.serverHmac;
  }
  return PdfSignerService.embedDetachedSignatureBlock(pdfBytes, embedOptions);
};

// ============ RESPONSE HANDLING ============

/**
 * Set response headers for signed PDF.
 * Includes signature, certificate, and metadata headers.
 * @access private
 * @param {Response} res Express response object
 * @param {object} data Signature data
 * @returns {void}
 * @since 1.0.0
 */
const setSignedPdfResponseHeaders = (
  res: Response,
  data: {
    hash: string;
    rsaSignatureBase64: string;
    pkcs7Hex: string;
    certificatePem?: string;
    timestampToken?: Buffer;
    certWarning?: any;
    signedFileName: string;
  },
): void => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${data.signedFileName}"`,
  );
  res.setHeader('X-File-Hash', data.hash);
  res.setHeader('X-File-Signature', data.rsaSignatureBase64);
  res.setHeader('X-PKCS7-Signature', data.pkcs7Hex);
  res.setHeader('X-PKCS7-Format', 'CMS');
  res.setHeader('X-Signature-Embedded', 'true');

  if (data.certificatePem) {
    const certificateBase64 = Buffer.from(data.certificatePem).toString(
      'base64',
    );
    res.setHeader('X-Signer-Certificate', certificateBase64);
  }
  res.setHeader('X-Signed-Date', new Date().toISOString());

  res.setHeader('X-Signature-Format', 'PAdES');
  res.setHeader('X-TSA-Enabled', 'true');
  if (data.timestampToken) {
    res.setHeader('X-TSA-Token-Size', data.timestampToken.length.toString());
  }

  if (data.certWarning) {
    res.setHeader('X-Cert-Warning', data.certWarning.message);
    res.setHeader(
      'X-Cert-Days-Remaining',
      data.certWarning.daysRemaining.toString(),
    );
    res.setHeader(
      'X-Cert-Expiry-Date',
      data.certWarning.expiryDate.toISOString(),
    );
  }
};

/**
 * Get original PDF filename and generate signed version filename.
 * Creates appropriate filename for the signed PDF output.
 * @access private
 * @param {string | undefined} originalFilename The original file name
 * @returns {string} The signed file name
 * @since 1.0.0
 */
const getSignedFileName = (originalFilename: string | undefined): string => {
  const name = originalFilename || 'document.pdf';
  return name.replace('.pdf', '_signed.pdf');
};

// ============ MAIN HANDLERS ============

/**
 * Sign uploaded PDF and create digital signature.
 * Main endpoint for PDF signing with Hypersecu USB token.
 * Handles file upload, certificate validation, signing, and response.
 * @access public
 * @param {Request} req Express request object with PDF file and PIN
 * @param {Response} res Express response object
 * @returns {Promise<void>}
 * @since 1.0.0
 * @author PDFSignatureApp
 */
export const signHandler = async (req: Request, res: Response) => {
  const form = new IncomingForm({ maxFileSize: 50 * 1024 * 1024 });
  let tempFilePath: string | null = null;
  let signer: SignerService | null = null;

  try {
    const [fields, files] = await form.parse(req);
    const uploadedFile = files.file?.[0];
    const pin = fields.pin?.[0];
    const driverPath = fields.driverPath?.[0];

    if (!uploadedFile)
      return res.status(400).json({ error: 'file is required' });
    if (!pin) return res.status(400).json({ error: 'pin is required' });

    console.log(
      `[signHandler] Processing file: ${uploadedFile.originalFilename}`,
    );
    if (driverPath)
      console.log(`[signHandler] Using custom driver: ${driverPath}`);

    const fileBuffer = fs.readFileSync(uploadedFile.filepath);
    tempFilePath = uploadedFile.filepath;

    // Load signer
    try {
      signer = loadSigner(pin, driverPath);
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

    // Check certificate
    const certStatus = checkCertificateStatus(signer);
    console.log(
      `[signHandler] Certificate status: ${certStatus.status} (${certStatus.daysRemaining} days remaining)`,
    );

    const certError = validateCertificateStatus(certStatus, signer);
    if (certError) return res.status(certError.status).json(certError.body);

    const certWarning = extractCertificateWarning(certStatus);
    const signerName = signer.getSignerName();
    const signedAt = new Date();

    // Modify PDF
    const pdfDoc = await loadPdfDocument(fileBuffer);
    setPdfMetadata(pdfDoc, signerName);
    await addSignatureMetadataToPdf(pdfDoc, signerName, signedAt);

    // Save and validate
    let signedPdfBytes = await savePdfToBuffer(pdfDoc);
    validatePdfStructure(signedPdfBytes);
    console.log(`[signHandler] PDF saved: ${signedPdfBytes.length} bytes`);

    // Hash and sign
    const hash = HashService.hashBuffer(signedPdfBytes);
    console.log(`[signHandler] Signed PDF hash: ${hash}`);

    const rsaSignatureBase64 = signPdfHash(signer, hash);
    const certificate = getCertificateFromSigner(signer);

    if (!certificate.pem || !certificate.der) {
      throw new Error('Certificate not found in USB token');
    }

    // Get timestamp
    const timestampToken = await requestTsaTimestamp(hash);

    // Create signatures
    const pkcs7Buffer = createPkcs7Signature({
      rsaSignatureBase64,
      certificatePem: certificate.pem,
      hash,
      signerName,
      timestampToken,
    });

    const pkcs7Hex = pkcs7Buffer.toString('hex');
    const serverHmac = computeServerHmac(certificate.pem, hash);

    // Embed signature
    const embedOptions: {
      signatureHex: string;
      hashHex: string;
      signerName: string;
      certificatePem?: string;
      serverHmac?: string;
    } = {
      signatureHex: pkcs7Hex,
      hashHex: hash,
      signerName,
    };
    if (certificate.pem) embedOptions.certificatePem = certificate.pem;
    if (serverHmac) embedOptions.serverHmac = serverHmac;
    const finalSignedPdfBuffer = embedSignatureInPdf(
      signedPdfBytes,
      embedOptions,
    );

    // Send response
    const signedFileName = getSignedFileName(
      uploadedFile.originalFilename || 'document.pdf',
    );
    const responseHeaders: any = {
      hash,
      rsaSignatureBase64,
      pkcs7Hex,
      timestampToken,
      certWarning,
      signedFileName,
    };
    if (certificate.pem) {
      responseHeaders.certificatePem = certificate.pem;
    }
    setSignedPdfResponseHeaders(res, responseHeaders);

    console.log(
      `[signHandler] Sending PDF with PKCS#7/CMS signature and TSA timestamp: ${signedFileName}`,
    );
    res.send(finalSignedPdfBuffer);
  } catch (error) {
    console.error('[signHandler] Error:', error);
    const errorMsg = (error as any).message || '';

    const hardwareError = getHardwareErrorResponse(errorMsg);
    if (hardwareError)
      return res.status(hardwareError.status).json(hardwareError.body);

    if (isPinErrorMessage(errorMsg)) {
      return res.status(401).json({
        error:
          'Invalid PIN - Cannot unlock certificate. Please check your PIN and try again.',
      });
    }

    res.status(500).json({ error: 'Failed to sign file: ' + errorMsg });
  } finally {
    signer?.close();
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {
        console.error('[signHandler] Failed to clean up temp file:', e);
      }
    }
  }
};

/**
 * Verify PDF signature and document integrity.
 * Validates PKCS#7/CMS signature and checks if document has been modified.
 * @access public
 * @param {Request} req Express request object with signed PDF file
 * @param {Response} res Express response object
 * @returns {Promise<void>}
 * @since 1.0.0
 * @author PDFSignatureApp
 */
export const verifyHandler = async (req: Request, res: Response) => {
  const form = new IncomingForm({
    maxFileSize: 50 * 1024 * 1024,
  });

  let tempFilePath: string | null = null;

  try {
    const [, files] = await form.parse(req);
    const uploadedFile = files.file?.[0];

    if (!uploadedFile)
      return res.status(400).json({ error: 'file is required' });

    console.log(
      `[verifyHandler] Verifying file: ${uploadedFile.originalFilename}`,
    );

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
        console.log(
          '[verifyHandler] No embedded certificate, using USB token for verification',
        );
        const verifier = getVerifyService();
        cryptographicallyValid = verifier.verify(
          hashForVerification,
          signatureBase64,
        );
      }

      const signingSecret = process.env.SIGNING_SECRET;

      if (signingSecret) {
        if (!detachedBlock.serverHmac) {
          hmacValid = false;
          console.warn(
            '[verifyHandler] SIGNING_SECRET is configured but PDF has no HMAC - likely external signature',
          );
        } else if (!detachedBlock.certificatePem) {
          hmacValid = false;
          console.warn(
            '[verifyHandler] HMAC present but certificate missing in PDF',
          );
        } else {
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
    if (hardwareError)
      return res.status(hardwareError.status).json(hardwareError.body);

    res.status(500).json({ error: 'Failed to verify signature: ' + errorMsg });
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {
        console.error('[verifyHandler] Failed to clean up temp file:', e);
      }
    }
  }
};

/**
 * Check certificate expiration status for a given PIN.
 * Diagnostic endpoint to verify certificate validity before signing.
 * @access public
 * @param {Request} req Express request object with PIN
 * @param {Response} res Express response object
 * @returns {Promise<void>}
 * @since 1.0.0
 * @author PDFSignatureApp
 */
export const certStatusHandler = async (req: Request, res: Response) => {
  const form = new IncomingForm();

  try {
    const [fields] = await form.parse(req);
    const pin = fields.pin?.[0];

    if (!pin) return res.status(400).json({ error: 'pin is required' });

    console.log('[certStatusHandler] Checking certificate status');

    let signer: SignerService | null = null;

    try {
      signer = loadSigner(pin);
    } catch (signError) {
      const errorMsg = (signError as any).message || '';
      console.error('[certStatusHandler] Error loading signer:', errorMsg);

      if (isPinErrorMessage(errorMsg)) {
        return res.status(401).json({
          error: 'Invalid PIN - Cannot unlock certificate.',
        });
      }

      const hardwareError = getHardwareErrorResponse(errorMsg);
      if (hardwareError)
        return res.status(hardwareError.status).json(hardwareError.body);

      throw signError;
    }

    const certStatus = checkCertificateStatus(signer);
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
    if (hardwareError)
      return res.status(hardwareError.status).json(hardwareError.body);

    res.status(500).json({ error: 'Failed to check certificate: ' + errorMsg });
  }
};

/**
 * Get list of supported USB token drivers for the current platform.
 * Returns driver names and information.
 * @access public
 * @param {Request} req Express request object
 * @param {Response} res Express response object
 * @returns {Promise<void>}
 * @since 1.0.0
 * @author PDFSignatureApp
 */
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

/**
 * Auto-detect connected USB token and return driver information.
 * Scans for connected USB tokens on the system.
 * @access public
 * @param {Request} req Express request object
 * @param {Response} res Express response object
 * @returns {Promise<void>}
 * @since 1.0.0
 * @author PDFSignatureApp
 */
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
