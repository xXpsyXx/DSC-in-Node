const { SignerService } = require('../services/sign.service.js');
const { HashService } = require('../services/hash.service.js');
const { VerifyService } = require('../services/verify.service.js');
const { PdfSignerService } = require('../services/pdf-signer.service.js');
const { Pkcs7SignerService } = require('../services/pkcs7-signer.service.js');
const { TsaService } = require('../services/tsa.service.js');
const { IncomingForm } = require('formidable');
const fs = require('fs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const sharp = require('sharp');
const {
  isPinErrorMessage,
  isPkcs11DriverErrorMessage,
  isUsbTokenMissingErrorMessage,
  isUsbTokenErrorMessage,
  getHardwareErrorResponse,
} = require('../utils/error-handlers.js');
const { appendLog, setLastAction } = require('../utils/status.store.js');

let verifyService = null;

const getVerifyService = () => {
  if (!verifyService) verifyService = new VerifyService();
  return verifyService;
};

const svgToPngBuffer = async () => {
  const svgCode = `<svg viewBox="0 0 100 100" width="100" height="100" xmlns="http://www.w3.org/2000/svg">
  <polygon points="23,53 43,73 83,23 93,31 45,91 15,61" fill="black" />
  <polygon points="20,50 40,70 80,20 90,28 42,88 12,58" fill="#008000" stroke="black" stroke-width="2" stroke-linejoin="miter" />
</svg>`;
  try {
    const pngBuffer = await sharp(Buffer.from(svgCode)).png().toBuffer();
    return pngBuffer;
  } catch (error) {
    console.error('[svgToPngBuffer] Error converting SVG to PNG:', error);
    throw new Error(`Failed to convert SVG to PNG: ${(error && error.message) || String(error)}`);
  }
};

exports.getCertDetailsHandler = async (req, res) => {
  try {
    console.log('[getCertDetailsHandler] incoming request headers:', req.headers || {});
    console.log('[getCertDetailsHandler] incoming content-type:', req.headers && (req.headers['content-type'] || req.headers['Content-Type']));
    if (req.body) {
      try {
        console.log('[getCertDetailsHandler] req.body present:', typeof req.body === 'object' ? JSON.stringify(req.body) : String(req.body));
      } catch (e) {
        console.warn('[getCertDetailsHandler] Could not stringify req.body', e);
      }
    }
    let pin;
    if (req.body && req.body.pin) {
      pin = req.body.pin;
    } else {
      const form = new IncomingForm();
      try {
        const parsed = await form.parse(req);
        // Support promise-return style: parse may return [fields, files] or an object
        let fields = null;
        if (Array.isArray(parsed)) {
          fields = parsed[0];
        } else if (parsed && typeof parsed === 'object') {
          // Some versions return { fields, files }
          fields = parsed.fields || parsed[0] || parsed;
        }
        if (fields) {
          // fields.pin may be an array (formidable) or a direct value
          pin = Array.isArray(fields.pin) ? fields.pin[0] : fields.pin;
        }
      } catch (formErr) {
        console.error('[getCertDetailsHandler] formidable.parse error:', formErr && formErr.stack ? formErr.stack : formErr);
        appendLog('error', `form parse error: ${(formErr && formErr.message) || String(formErr)}`);
        return res.status(400).json({ error: 'Invalid form data or parse error' });
      }
    }

    if (!pin) return res.status(400).json({ error: 'pin is required' });

    console.log('[getCertDetailsHandler] Retrieving certificate details');

    let signer = null;
    try {
      signer = loadSigner(pin);
    } catch (signError) {
      const errorMsg = (signError && signError.message) || '';
      console.error('[getCertDetailsHandler] Error loading signer:', errorMsg);
      if (isPinErrorMessage(errorMsg)) {
        appendLog('error', 'Invalid PIN - Cannot unlock certificate.');
        return res.status(401).json({ error: 'Invalid PIN - Cannot unlock certificate.' });
      }
      appendLog('error', `Error loading signer: ${errorMsg}`);
      const hardwareError = getHardwareErrorResponse(errorMsg);
      if (hardwareError) return res.status(hardwareError.status).json(hardwareError.body);
      throw signError;
    }

    const tokenInfo = signer.getTokenInfo();
    const certDetails = signer.getCertificateDetails();
    const certStatus = checkCertificateStatus(signer);
    const signerName = signer.getSignerName();

    const ownerName = certDetails.ownerName || signerName || 'Unknown';
    appendLog('success', `Unlocked certificate: ${ownerName}`);

    signer.close();

    res.json({
      ownerName: ownerName,
      tokenName: tokenInfo.label || tokenInfo.model || 'Unknown',
      pendriveCompany: tokenInfo.manufacturerId || tokenInfo.model || tokenInfo.serialNumber || null,
      certSerialNumber: certDetails.serialNumber,
      certExpiryDate: certStatus.expiryDate,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[getCertDetailsHandler] Error:', error);
    appendLog('error', `Unexpected error retrieving certificate details: ${(error && error.message) || String(error)}`);
    const errorMsg = (error && error.message) || '';
    const hardwareError = getHardwareErrorResponse(errorMsg);
    if (hardwareError) return res.status(hardwareError.status).json(hardwareError.body);
    if (isPinErrorMessage(errorMsg)) {
      return res.status(401).json({ error: 'Invalid PIN - Cannot unlock certificate.' });
    }
    res.status(500).json({ error: 'Failed to get certificate details: ' + errorMsg });
  }
};

const loadPdfDocument = async (fileBuffer) => {
  return await PDFDocument.load(fileBuffer);
};

const setPdfMetadata = (pdfDoc, signerName) => {
  pdfDoc.setTitle('Digitally Signed Document');
  pdfDoc.setAuthor(`Signed by ${signerName}`);
  pdfDoc.setSubject('Digital Signature Attached');
  pdfDoc.setKeywords(['signed', 'digital-signature', signerName]);
};

const getLastPdfPage = (pdfDoc) => {
  const pages = pdfDoc.getPages();
  return pages[pages.length - 1] || null;
};

const drawDashedBorder = (page, x, y, width, height) => {
  const dashLength = 4;
  const gapLength = 3;
  let posX = x;
  while (posX < x + width) {
    const endX = Math.min(posX + dashLength, x + width);
    page.drawLine({ start: { x: posX, y: y + height }, end: { x: endX, y: y + height }, thickness: 1.5, color: rgb(0.2, 0.2, 0.2) });
    posX += dashLength + gapLength;
  }
  let posY = y + height;
  while (posY > y) {
    const endY = Math.max(posY - dashLength, y);
    page.drawLine({ start: { x: x + width, y: posY }, end: { x: x + width, y: endY }, thickness: 1.5, color: rgb(0.2, 0.2, 0.2) });
    posY -= dashLength + gapLength;
  }
  posX = x + width;
  while (posX > x) {
    const endX = Math.max(posX - dashLength, x);
    page.drawLine({ start: { x: posX, y: y }, end: { x: endX, y: y }, thickness: 1.5, color: rgb(0.2, 0.2, 0.2) });
    posX -= dashLength + gapLength;
  }
  posY = y;
  while (posY < y + height) {
    const endY = Math.min(posY + dashLength, y + height);
    page.drawLine({ start: { x: x, y: posY }, end: { x: x, y: endY }, thickness: 1.5, color: rgb(0.2, 0.2, 0.2) });
    posY += dashLength + gapLength;
  }
};

const embedCheckmarkImage = async (pdfDoc, page, boxX, boxY, boxHeight) => {
  try {
    const checkmarkPngBuffer = await svgToPngBuffer();
    const checkmarkImage = await pdfDoc.embedPng(checkmarkPngBuffer);
    const checkmarkSize = 45;
    const checkmarkX = boxX + 12;
    const checkmarkY = boxY + boxHeight / 2 - checkmarkSize / 2;
    page.drawImage(checkmarkImage, { x: checkmarkX, y: checkmarkY, width: checkmarkSize, height: checkmarkSize });
  } catch (imgError) {
    console.warn('[embedCheckmarkImage] Failed to embed checkmark image:', imgError);
  }
};

const drawHeaderLines = (page, font, headerLines, boxX, boxY, boxHeight, fontSize) => {
  const padding = 8;
  const lineHeight = 12;
  headerLines.forEach((line, index) => {
    const textY = boxY + boxHeight - padding - fontSize - index * lineHeight;
    page.drawText(line, { x: boxX + padding, y: textY, size: fontSize, font, color: rgb(0.2, 0.2, 0.2) });
  });
};

const drawDateText = (page, font, dateText, boxX, boxY, dateSize) => {
  const padding = 8;
  page.drawText(dateText, { x: boxX + padding, y: boxY + padding + 1, size: dateSize, font, color: rgb(0.2, 0.2, 0.2) });
};

const addSignatureStampToPage = async (pdfDoc, page, signerName, signedAt) => {
  const headerLines = ['Signature valid', 'Digitally Signed by', `${signerName}`];
  const dateText = `Date: ${signedAt.toLocaleString('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}`;
  const stampFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = 9;
  const dateSize = 7.5;
  const lineHeight = 12;
  const padding = 8;
  const margin = 20;
  const maxHeaderWidth = Math.max(...headerLines.map((line) => stampFont.widthOfTextAtSize(line, fontSize)));
  const dateWidth = stampFont.widthOfTextAtSize(dateText, dateSize);
  const maxTextWidth = Math.max(maxHeaderWidth, dateWidth);
  const boxWidth = maxTextWidth + padding * 2;
  const boxHeight = headerLines.length * lineHeight + 8 + padding * 2;
  const { width } = page.getSize();
  const boxX = width - boxWidth - margin;
  const boxY = margin;
  drawDashedBorder(page, boxX, boxY, boxWidth, boxHeight);
  await embedCheckmarkImage(pdfDoc, page, boxX, boxY, boxHeight);
  drawHeaderLines(page, stampFont, headerLines, boxX, boxY, boxHeight, fontSize);
  drawDateText(page, stampFont, dateText, boxX, boxY, dateSize);
};

const addSignatureMetadataToPdf = async (pdfDoc, signerName, signedAt) => {
  const targetPage = getLastPdfPage(pdfDoc);
  if (targetPage) await addSignatureStampToPage(pdfDoc, targetPage, signerName, signedAt);
};

const savePdfToBuffer = async (pdfDoc) => {
  const pdfUint8Array = await pdfDoc.save();
  return Buffer.from(pdfUint8Array);
};

const validatePdfStructure = (pdfBytes) => {
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

const loadSigner = (pin, driverPath) => {
  return new SignerService(pin, driverPath);
};

const checkCertificateStatus = (signer) => {
  return signer.getCertificateExpirationStatus();
};

const validateCertificateStatus = (certStatus, signer) => {
  if (certStatus.status === 'expired') {
    signer.close();
    return { status: 403, body: { error: 'Certificate Expired', message: certStatus.message, daysRemaining: certStatus.daysRemaining, expiryDate: certStatus.expiryDate } };
  }
  if (certStatus.status === 'critical') {
    signer.close();
    return { status: 403, body: { error: 'Certificate Expiring Soon', message: certStatus.message, daysRemaining: certStatus.daysRemaining, expiryDate: certStatus.expiryDate, warning: 'Certificate expires in less than 15 days. Signing is blocked.' } };
  }
  return null;
};

const extractCertificateWarning = (certStatus) => {
  if (certStatus.status === 'warning') {
    return { message: certStatus.message, daysRemaining: certStatus.daysRemaining, expiryDate: certStatus.expiryDate };
  }
  return null;
};

const signPdfHash = (signer, hash) => {
  return signer.signHash(hash);
};

const getCertificateFromSigner = (signer) => {
  return { pem: signer.getCertificatePem(), der: signer.getCertificateDer() };
};

const requestTsaTimestamp = async (hash) => {
  console.log('[signHandler] Requesting timestamp from TSA...');
  try {
    const tsaUrl = process.env.TSA_URL;
    if (!tsaUrl) {
      console.error('[signHandler] TSA_URL not configured - timestamp authority is required');
      throw new Error('TSA_URL_NOT_CONFIGURED: TSA_URL environment variable is not set');
    }
    const timestampToken = await TsaService.requestTimestampToken(hash, tsaUrl);
    console.log('[signHandler] Timestamp obtained successfully');
    return timestampToken;
  } catch (tsaError) {
    console.error('[signHandler] TSA FAILED - signature cannot proceed without timestamp:', tsaError);
    throw new Error(`Timestamp Authority (TSA) failed - PDFs must include cryptographic timestamps for legal validity. ${(tsaError && tsaError.message) || String(tsaError)}`);
  }
};

const createPkcs7Signature = (options) => {
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

const computeServerHmac = (certificatePem, hash) => {
  const signingSecret = process.env.SIGNING_SECRET;
  if (!signingSecret) {
    console.warn('[signHandler] SIGNING_SECRET not configured - server HMAC will not be embedded');
    return undefined;
  }
  const hmac = HashService.computeServerHmac(signingSecret, certificatePem, hash);
  console.log(`[signHandler] Server HMAC computed: ${hmac}`);
  return hmac;
};

const embedSignatureInPdf = (pdfBytes, options) => {
  console.log('[signHandler] Embedding PKCS#7/CMS signature in PDF...');
  const embedOptions = { signatureHex: options.signatureHex, hashHex: options.hashHex, signerName: options.signerName };
  if (options.certificatePem !== undefined) embedOptions.certificatePem = options.certificatePem;
  if (options.serverHmac !== undefined) embedOptions.serverHmac = options.serverHmac;
  return PdfSignerService.embedDetachedSignatureBlock(pdfBytes, embedOptions);
};

const setSignedPdfResponseHeaders = (res, data) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${data.signedFileName}"`);
  res.setHeader('X-File-Hash', data.hash);
  res.setHeader('X-File-Signature', data.rsaSignatureBase64);
  res.setHeader('X-PKCS7-Signature', data.pkcs7Hex);
  res.setHeader('X-PKCS7-Format', 'CMS');
  res.setHeader('X-Signature-Embedded', 'true');
  if (data.certificatePem) {
    const certificateBase64 = Buffer.from(data.certificatePem).toString('base64');
    res.setHeader('X-Signer-Certificate', certificateBase64);
  }
  res.setHeader('X-Signed-Date', new Date().toISOString());
  res.setHeader('X-Signature-Format', 'PAdES');
  res.setHeader('X-TSA-Enabled', 'true');
  if (data.timestampToken) res.setHeader('X-TSA-Token-Size', data.timestampToken.length.toString());
  if (data.certWarning) {
    res.setHeader('X-Cert-Warning', data.certWarning.message);
    res.setHeader('X-Cert-Days-Remaining', data.certWarning.daysRemaining.toString());
    res.setHeader('X-Cert-Expiry-Date', data.certWarning.expiryDate.toISOString());
  }
};

const getSignedFileName = (originalFilename) => {
  const name = originalFilename || 'document.pdf';
  return name.replace('.pdf', '_signed.pdf');
};

exports.signHandler = async (req, res) => {
  const form = new IncomingForm({ maxFileSize: 50 * 1024 * 1024 });
  let tempFilePath = null;
  let signer = null;
  try {
    const [fields, files] = await form.parse(req);
    const uploadedFile = files.file?.[0];
    const pin = fields.pin?.[0];
    const driverPath = fields.driverPath?.[0];
    if (!uploadedFile) return res.status(400).json({ error: 'file is required' });
    if (!pin) return res.status(400).json({ error: 'pin is required' });
    console.log(`[signHandler] Processing file: ${uploadedFile.originalFilename}`);
    appendLog('info', `Processing file: ${uploadedFile.originalFilename}`);
    if (driverPath) console.log(`[signHandler] Using custom driver: ${driverPath}`);
    const fileBuffer = fs.readFileSync(uploadedFile.filepath);
    tempFilePath = uploadedFile.filepath;
    try {
      signer = loadSigner(pin, driverPath);
    } catch (signError) {
      const errorMsg = (signError && signError.message) || '';
      console.error('[signHandler] Signing error:', errorMsg);
      if (isPinErrorMessage(errorMsg)) {
        return res.status(401).json({ error: 'Invalid PIN - Cannot unlock certificate. Please check your PIN and try again.' });
      }
      throw signError;
    }
    const certStatus = checkCertificateStatus(signer);
    console.log(`[signHandler] Certificate status: ${certStatus.status} (${certStatus.daysRemaining} days remaining)`);
    appendLog('info', `Certificate status: ${certStatus.status} (${certStatus.daysRemaining} days)`);
    const certError = validateCertificateStatus(certStatus, signer);
    if (certError) return res.status(certError.status).json(certError.body);
    const certWarning = extractCertificateWarning(certStatus);
    const signerName = signer.getSignerName();
    const signedAt = new Date();
    try {
      const expectedSerial = req.signPayload?.certSerial || req.signPayload?.cert_serial || req.signPayload?.expectedCertSerial;
      if (expectedSerial) {
        const certDetails = signer.getCertificateDetails();
        const actualSerial = certDetails.serialNumber || null;
        const normalize = (s) => (s || '').replace(/^0+/, '').toLowerCase();
        if (!actualSerial || normalize(actualSerial) !== normalize(expectedSerial)) {
          appendLog('error', `Certificate serial mismatch (expected=${expectedSerial}, actual=${actualSerial})`);
          signer.close();
          return res.status(403).json({ error: 'Certificate serial mismatch - the inserted certificate is not linked to the signing user', code: 'CERT_NOT_LINKED', userMessage: "This certificate doesn't belong to your account. If this is your certificate, please register it in the web app (Digital Signature → My Certificates) and try again." });
        }
      }
    } catch (e) {
      console.warn('[signHandler] cert serial check error:', e);
    }
    const pdfDoc = await loadPdfDocument(fileBuffer);
    setPdfMetadata(pdfDoc, signerName);
    await addSignatureMetadataToPdf(pdfDoc, signerName, signedAt);
    let signedPdfBytes = await savePdfToBuffer(pdfDoc);
    validatePdfStructure(signedPdfBytes);
    console.log(`[signHandler] PDF saved: ${signedPdfBytes.length} bytes`);
    appendLog('info', `PDF saved: ${signedPdfBytes.length} bytes`);
    const hash = HashService.hashBuffer(signedPdfBytes);
    console.log(`[signHandler] Signed PDF hash: ${hash}`);
    appendLog('info', `Signed PDF hash: ${hash}`);
    const rsaSignatureBase64 = signPdfHash(signer, hash);
    const certificate = getCertificateFromSigner(signer);
    if (!certificate.pem || !certificate.der) throw new Error('Certificate not found in USB token');
    const timestampToken = await requestTsaTimestamp(hash);
    const pkcs7Buffer = createPkcs7Signature({ rsaSignatureBase64, certificatePem: certificate.pem, hash, signerName, timestampToken });
    const pkcs7Hex = pkcs7Buffer.toString('hex');
    const serverHmac = computeServerHmac(certificate.pem, hash);
    const embedOptions = { signatureHex: pkcs7Hex, hashHex: hash, signerName };
    if (certificate.pem) embedOptions.certificatePem = certificate.pem;
    if (serverHmac) embedOptions.serverHmac = serverHmac;
    const finalSignedPdfBuffer = embedSignatureInPdf(signedPdfBytes, embedOptions);
    const signedFileName = getSignedFileName(uploadedFile.originalFilename || 'document.pdf');
    const responseHeaders = { hash, rsaSignatureBase64, pkcs7Hex, timestampToken, certWarning, signedFileName };
    if (certificate.pem) responseHeaders.certificatePem = certificate.pem;
    setSignedPdfResponseHeaders(res, responseHeaders);
    console.log(`[signHandler] Sending PDF with PKCS#7/CMS signature and TSA timestamp: ${signedFileName}`);
    appendLog('success', 'Signed PDF successfully.');
    setLastAction('Signed PDF successfully.');
    res.send(finalSignedPdfBuffer);
  } catch (error) {
    console.error('[signHandler] Error:', error);
    const errorMsg = (error && error.message) || '';
    appendLog('error', `Failed to sign file: ${errorMsg}`);
    const hardwareError = getHardwareErrorResponse(errorMsg);
    if (hardwareError) return res.status(hardwareError.status).json(hardwareError.body);
    if (isPinErrorMessage(errorMsg)) {
      return res.status(401).json({ error: 'Invalid PIN - Cannot unlock certificate. Please check your PIN and try again.' });
    }
    if (typeof errorMsg === 'string' && errorMsg.includes('TSA_URL_NOT_CONFIGURED')) {
      appendLog('error', 'TSA_URL not configured - cannot proceed with signing');
      return res.status(503).json({ error: 'Timestamp Authority not configured (TSA_URL missing). Cannot create legally-valid signatures.' });
    }
    res.status(500).json({ error: 'Failed to sign file: ' + errorMsg });
  } finally {
    signer?.close?.();
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch (e) { console.error('[signHandler] Failed to clean up temp file:', e); }
    }
  }
};

exports.verifyHandler = async (req, res) => {
  const form = new IncomingForm({ maxFileSize: 50 * 1024 * 1024 });
  let tempFilePath = null;
  try {
    const [, files] = await form.parse(req);
    const uploadedFile = files.file?.[0];
    if (!uploadedFile) return res.status(400).json({ error: 'file is required' });
    console.log(`[verifyHandler] Verifying file: ${uploadedFile.originalFilename}`);
    appendLog('info', `Verifying file: ${uploadedFile.originalFilename}`);
    const fileBuffer = fs.readFileSync(uploadedFile.filepath);
    tempFilePath = uploadedFile.filepath;
    const detachedBlock = PdfSignerService.extractDetachedSignatureBlock(fileBuffer);
    if (!detachedBlock) {
      return res.status(400).json({ error: 'No signature found in PDF', fileName: uploadedFile.originalFilename, message: 'This PDF does not contain the current embedded signature block. Please sign the PDF using /sign endpoint and verify again.' });
    }
    let signatureHex = detachedBlock.signatureHex;
    const signerName = detachedBlock.signerName || 'Unknown';
    const signReason = detachedBlock.signReason || '';
    const signDate = detachedBlock.signDate || '';
    const unsignedPdfBuffer = PdfSignerService.removeDetachedSignatureBlock(fileBuffer, detachedBlock.blockStart, detachedBlock.blockEndExclusive);
    const recomputedHash = HashService.hashBuffer(unsignedPdfBuffer);
    const hashForVerification = detachedBlock.hashHex || recomputedHash;
    const hashMismatch = Boolean(detachedBlock.hashHex && detachedBlock.hashHex.toLowerCase() !== recomputedHash.toLowerCase());
    console.log('[verifyHandler] Found embedded detached signature block');
    if (signatureHex.length % 2 !== 0) signatureHex = signatureHex.slice(0, -1);
    let cryptographicallyValid = false;
    let isValid = false;
    let verificationMsg = '';
    let hmacValid = false;
    try {
      const signatureBase64 = Buffer.from(signatureHex, 'hex').toString('base64');
      if (detachedBlock.certificatePem) {
        console.log('[verifyHandler] Using embedded certificate for verification');
        cryptographicallyValid = VerifyService.verifyWithCertificate(hashForVerification, signatureBase64, detachedBlock.certificatePem);
      } else {
        console.log('[verifyHandler] No embedded certificate, using USB token for verification');
        const verifier = getVerifyService();
        cryptographicallyValid = verifier.verify(hashForVerification, signatureBase64);
      }
      const signingSecret = process.env.SIGNING_SECRET;
      if (signingSecret) {
        if (!detachedBlock.serverHmac) {
          hmacValid = false;
          console.warn('[verifyHandler] SIGNING_SECRET is configured but PDF has no HMAC - likely external signature');
        } else if (!detachedBlock.certificatePem) {
          hmacValid = false;
          console.warn('[verifyHandler] HMAC present but certificate missing in PDF');
        } else {
          try {
            hmacValid = HashService.verifyServerHmac(signingSecret, detachedBlock.certificatePem, hashForVerification, detachedBlock.serverHmac);
            console.log(`[verifyHandler] Server HMAC verification: ${hmacValid}`);
          } catch (hmacError) {
            console.warn('[verifyHandler] HMAC verification error:', hmacError);
            hmacValid = false;
          }
        }
      } else {
        hmacValid = true;
        console.warn('[verifyHandler] SIGNING_SECRET not configured - HMAC verification skipped (not recommended for production)');
      }
      isValid = cryptographicallyValid && !hashMismatch && hmacValid;
      if (isValid) verificationMsg = 'Signature verified successfully';
      else if (hashMismatch) verificationMsg = 'Signature is present but document content differs from the signed hash';
      else if (!hmacValid) {
        if (!detachedBlock.serverHmac) verificationMsg = 'Signature verification failed - no server HMAC found (PDF was not signed by this system)';
        else verificationMsg = 'Signature verification failed - HMAC mismatch (PDF was not signed by this system or secret key has changed)';
      } else verificationMsg = 'Signature verification failed - signature does not match document';
      console.log(`[verifyHandler] Verification: ${isValid} (crypto=${cryptographicallyValid}, hashMismatch=${hashMismatch}, hmac=${hmacValid})`);
      appendLog(isValid ? 'success' : 'error', `Verification result: ${isValid ? 'valid' : 'invalid'} - ${verificationMsg}`);
    } catch (verifyError) {
      console.error('[verifyHandler] Verification error:', verifyError);
      isValid = false;
      verificationMsg = `Verification error: ${(verifyError && verifyError.message) || String(verifyError)}`;
    }
    res.json({ isValid, fileName: uploadedFile.originalFilename, hash: hashForVerification, signature: { name: signerName, reason: signReason, date: signDate, contentLength: Math.floor(signatureHex.length / 2), embedded: true }, verification: { status: isValid ? 'valid' : 'invalid', message: verificationMsg, cryptographicallyValid, hashMismatch }, message: isValid ? 'PDF signature is valid and document has not been modified' : 'PDF signature verification failed or document has been modified' });
  } catch (error) {
    console.error('[verifyHandler] Error:', error);
    const errorMsg = (error && error.message) || '';
    appendLog('error', `Verification failed: ${errorMsg}`);
    const hardwareError = getHardwareErrorResponse(errorMsg);
    if (hardwareError) return res.status(hardwareError.status).json(hardwareError.body);
    res.status(500).json({ error: 'Failed to verify signature: ' + errorMsg });
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch (e) { console.error('[verifyHandler] Failed to clean up temp file:', e); }
    }
  }
};

exports.certStatusHandler = async (req, res) => {
  const form = new IncomingForm();
  try {
    const [fields] = await form.parse(req);
    const pin = fields.pin?.[0];
    if (!pin) return res.status(400).json({ error: 'pin is required' });
    console.log('[certStatusHandler] Checking certificate status');
    let signer = null;
    try {
      signer = loadSigner(pin);
    } catch (signError) {
      const errorMsg = (signError && signError.message) || '';
      console.error('[certStatusHandler] Error loading signer:', errorMsg);
      if (isPinErrorMessage(errorMsg)) return res.status(401).json({ error: 'Invalid PIN - Cannot unlock certificate.' });
      const hardwareError = getHardwareErrorResponse(errorMsg);
      if (hardwareError) return res.status(hardwareError.status).json(hardwareError.body);
      throw signError;
    }
    const certStatus = checkCertificateStatus(signer);
    const signerName = signer.getSignerName();
    console.log(`[certStatusHandler] Certificate status: ${certStatus.status} (${certStatus.daysRemaining} days remaining)`);
    signer.close();
    res.json({ status: certStatus.status, daysRemaining: certStatus.daysRemaining, expiryDate: certStatus.expiryDate, message: certStatus.message, signerName: signerName, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[certStatusHandler] Error:', error);
    const errorMsg = (error && error.message) || '';
    const hardwareError = getHardwareErrorResponse(errorMsg);
    if (hardwareError) return res.status(hardwareError.status).json(hardwareError.body);
    res.status(500).json({ error: 'Failed to check certificate: ' + errorMsg });
  }
};

exports.getSupportedDriversHandler = async (_req, res) => {
  try {
    const drivers = SignerService.getSupportedDrivers();
    res.json({ platform: process.platform, drivers, message: 'Supported USB token drivers for digital signing' });
  } catch (error) {
    console.error('[getSupportedDriversHandler] Error:', error);
    res.status(500).json({ error: 'Failed to retrieve supported drivers' });
  }
};

exports.autoDetectTokenHandler = async (req, res) => {
  try {
    console.log('[autoDetectTokenHandler] Starting USB token auto-detection...');
    const detectedDevice = SignerService.autoDetectDriver();
    if (!detectedDevice) {
      console.warn('[autoDetectTokenHandler] No USB token device detected');
      appendLog('error', 'No USB token detected');
      return res.status(404).json({ detected: false, message: 'No USB token device detected. Please insert your USB token and try again.' });
    }
    console.log(`[autoDetectTokenHandler] Device detected: ${detectedDevice.driverName}`);
    appendLog('info', `USB token detected: ${detectedDevice.driverName}`);
    res.json({ detected: true, driverName: detectedDevice.driverName, driverPath: detectedDevice.driverPath, message: `USB token detected: ${detectedDevice.driverName}` });
  } catch (error) {
    console.error('[autoDetectTokenHandler] Error:', error);
    appendLog('error', `Auto-detect failed: ${(error && error.message) || String(error)}`);
    res.status(500).json({ detected: false, error: 'Failed to auto-detect USB token' });
  }
};