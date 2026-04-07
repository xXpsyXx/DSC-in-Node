export interface DetachedSignatureBlock {
  signatureHex: string;
  hashHex: string;
  signerName: string;
  signReason: string;
  signDate: string;
  certificatePem?: string;
  serverHmac?: string;
  blockStart: number;
  blockEndExclusive: number;
}

/**
 * Service for building and embedding detached signature metadata in PDFs.
 *
 * Note: This embeds a deterministic signature block consumed by our backend
 * verifier. It is not a full xref-updated PDF incremental signing flow.
 */
export class PdfSignerService {
  /**
   * Convert USB-token RSA signature (base64) into hex form for embedding.
   */
  static createPkcs7Signature(
    _pdfBytes: Buffer,
    rsaSignatureBase64: string,
    _certificatePem: string,
    _certificateDer: Buffer,
  ): string {
    try {
      return Buffer.from(rsaSignatureBase64, 'base64').toString('hex');
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

  static embedDetachedSignatureBlock(
    pdfBytes: Buffer,
    options: {
      signatureHex: string;
      hashHex: string;
      signerName: string;
      reason?: string;
      signedAt?: Date;
      certificatePem?: string;
      serverHmac?: string;
    },
  ): Buffer {
    const signatureHex = options.signatureHex.replace(/[^0-9a-fA-F]/g, '');
    const hashHex = options.hashHex.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
    const signerName = this.escapePdfLiteral(options.signerName || 'Unknown');
    const reason = this.escapePdfLiteral(
      options.reason || 'Digitally signed with Hypersecu USB token',
    );
    const signDate = this.formatPdfDate(options.signedAt || new Date());

    const pdfText = pdfBytes.toString('binary');
    let maxObjectNumber = 0;
    const objectMatches = pdfText.matchAll(/(\d+)\s+0\s+obj/g);
    for (const match of objectMatches) {
      const objectNumberRaw = match[1];
      const objectNumber = Number.parseInt(objectNumberRaw || '0', 10);
      if (!Number.isNaN(objectNumber) && objectNumber > maxObjectNumber) {
        maxObjectNumber = objectNumber;
      }
    }

    const signatureObjectNumber = maxObjectNumber + 1;
    const blockLines = [
      '',
      '%%DSC_SIG_BLOCK_BEGIN',
      `${signatureObjectNumber} 0 obj`,
      '<<',
      '/Type /Sig',
      '/Filter /Adobe.PPKLite',
      '/SubFilter /adbe.pkcs7.detached',
      `/Name (${signerName})`,
      `/Reason (${reason})`,
      `/M (${signDate})`,
      `/DSCHash (${hashHex})`,
      `/Contents <${signatureHex}>`,
    ];

    // Embed certificate in base64 if provided
    if (options.certificatePem) {
      const certBase64 = Buffer.from(options.certificatePem).toString('base64');
      blockLines.push(`/DSCCertificate (${certBase64})`);
    }

    // Embed server HMAC if provided (proves signature came from authorized server)
    if (options.serverHmac) {
      blockLines.push(`/DSCServerHmac (${options.serverHmac})`);
    }

    blockLines.push(
      '>>',
      'endobj',
      `%%DSC_SIG_REF /Sig ${signatureObjectNumber} 0 R`,
      '%%DSC_SIG_BLOCK_END',
      '',
    );

    const signatureBlock = blockLines.join('\n');

    return Buffer.concat([pdfBytes, Buffer.from(signatureBlock, 'utf8')]);
  }

  static extractDetachedSignatureBlock(
    pdfBytes: Buffer,
  ): DetachedSignatureBlock | null {
    const pdfText = pdfBytes.toString('binary');
    const beginMarker = '%%DSC_SIG_BLOCK_BEGIN';
    const endMarker = '%%DSC_SIG_BLOCK_END';

    const beginMarkerIndex = pdfText.indexOf(beginMarker);
    if (beginMarkerIndex === -1) {
      return null;
    }

    let blockStart = beginMarkerIndex;
    if (blockStart > 0 && pdfText[blockStart - 1] === '\n') {
      blockStart -= 1;
    }

    const endMarkerIndex = pdfText.indexOf(endMarker, beginMarkerIndex);
    if (endMarkerIndex === -1) {
      return null;
    }

    let blockEndExclusive = endMarkerIndex + endMarker.length;
    while (
      blockEndExclusive < pdfText.length &&
      (pdfText[blockEndExclusive] === '\n' ||
        pdfText[blockEndExclusive] === '\r')
    ) {
      blockEndExclusive += 1;
    }

    const blockText = pdfText.slice(blockStart, blockEndExclusive);

    const signatureMatch = blockText.match(/\/Contents\s*<([0-9a-fA-F\s]+)>/);
    if (!signatureMatch || !signatureMatch[1]) {
      return null;
    }

    const signatureHex = signatureMatch[1].replace(/\s+/g, '');
    const hashMatch = blockText.match(/\/DSCHash\s*\(([0-9a-fA-F]+)\)/);
    const nameMatch = blockText.match(/\/Name\s*\(([^)]*)\)/);
    const reasonMatch = blockText.match(/\/Reason\s*\(([^)]*)\)/);
    const dateMatch = blockText.match(/\/M\s*\(([^)]*)\)/);
    const certMatch = blockText.match(
      /\/DSCCertificate\s*\(([A-Za-z0-9+/=]+)\)/,
    );
    const hmacMatch = blockText.match(/\/DSCServerHmac\s*\(([A-Fa-f0-9]+)\)/);

    let certificatePem: string | undefined;
    if (certMatch?.[1]) {
      try {
        certificatePem = Buffer.from(certMatch[1], 'base64').toString('utf-8');
      } catch (e) {
        console.warn(
          '[PdfSignerService] Failed to decode embedded certificate:',
          e,
        );
      }
    }

    const result: DetachedSignatureBlock = {
      signatureHex,
      hashHex: (hashMatch?.[1] || '').toLowerCase(),
      signerName: this.decodePdfLiteral(nameMatch?.[1] || 'Unknown'),
      signReason: this.decodePdfLiteral(reasonMatch?.[1] || ''),
      signDate: dateMatch?.[1] || '',
      blockStart,
      blockEndExclusive,
    };

    if (certificatePem) {
      result.certificatePem = certificatePem;
    }

    if (hmacMatch?.[1]) {
      result.serverHmac = hmacMatch[1];
    }

    return result;
  }

  static removeDetachedSignatureBlock(
    pdfBytes: Buffer,
    blockStart: number,
    blockEndExclusive: number,
  ): Buffer {
    return Buffer.concat([
      pdfBytes.subarray(0, blockStart),
      pdfBytes.subarray(blockEndExclusive),
    ]);
  }

  private static formatPdfDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `D:${year}${month}${day}${hours}${minutes}${seconds}Z`;
  }

  private static escapePdfLiteral(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  private static decodePdfLiteral(value: string): string {
    return value
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\')
      .trim();
  }
}
