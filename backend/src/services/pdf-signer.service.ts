import forge from 'node-forge';

/**
 * Service for creating PKCS#7 signatures for PDFs
 * using certificates from Hypersecu USB tokens
 */
export class PdfSignerService {
  /**
   * Create a PKCS#7 SignedData structure with the signature from USB token
   * Returns the signature as hex string suitable for embedding in PDF
   */
  static createPkcs7Signature(
    pdfBytes: Buffer,
    rsaSignatureBase64: string,
    certificatePem: string,
    certificateDer: Buffer,
  ): string {
    try {
      // Decode the RSA signature from the USB token (raw signature bytes, not DER)
      const rsaSignatureBytes = Buffer.from(rsaSignatureBase64, 'base64');

      // Parse certificate
      const cert = forge.pki.certificateFromPem(certificatePem);

      // Create PKCS#7 SignedData structure
      const p7 = forge.pkcs7.createSignedData();

      // Set the content to sign (detached signature) - convert Buffer to binary string
      const pdfBinaryString = pdfBytes.toString('binary');
      p7.content = forge.util.createBuffer(pdfBinaryString);

      // Add the certificate
      p7.addCertificate(cert);

      // Get the ASN.1 structure and convert to DER encoding
      const p7Asn1 = p7.toAsn1();
      const p7Der = forge.asn1.toDer(p7Asn1);

      // Convert signature to hex format
      const signatureHex = rsaSignatureBytes.toString('hex');

      return signatureHex;
    } catch (error) {
      console.error(
        '[PdfSignerService] Error creating PKCS#7 signature:',
        error,
      );
      throw new Error(
        `Failed to create PKCS#7 signature: ${(error as Error).message}`,
      );
    }
  }
}
