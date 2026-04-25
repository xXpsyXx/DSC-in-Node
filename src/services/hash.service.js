const crypto = require('crypto');

class HashService {
  static hashBuffer(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  static computeServerHmac(secret, certificatePem, pdfHash) {
    const data = `${certificatePem}:${pdfHash}`;
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  static verifyServerHmac(secret, certificatePem, pdfHash, providedHmac) {
    const computedHmac = this.computeServerHmac(secret, certificatePem, pdfHash);
    return crypto.timingSafeEqual(Buffer.from(computedHmac), Buffer.from(providedHmac));
  }
}

exports.HashService = HashService;
