import crypto from 'crypto';

export class HashService {
  static hashBuffer(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  static computeServerHmac(
    secret: string,
    certificatePem: string,
    pdfHash: string,
  ): string {
    const data = `${certificatePem}:${pdfHash}`;
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  static verifyServerHmac(
    secret: string,
    certificatePem: string,
    pdfHash: string,
    providedHmac: string,
  ): boolean {
    const computedHmac = this.computeServerHmac(
      secret,
      certificatePem,
      pdfHash,
    );
    return crypto.timingSafeEqual(
      Buffer.from(computedHmac),
      Buffer.from(providedHmac),
    );
  }
}
