import crypto from 'crypto';

export class HashService {
  static hashBuffer(buffer: Buffer): string {
    return crypto
      .createHash('sha256')
      .update(buffer)
      .digest('hex');
  }

  static hashString(data: string): string {
    return crypto
      .createHash('sha256')
      .update(data)
      .digest('utf8');
  }
}