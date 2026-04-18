import * as crypto from 'crypto';
import axios from 'axios';

/**
 * RFC 3161 Timestamp Authority (TSA) integration.
 * Prevents backdating attacks by requesting cryptographically signed timestamps.
 * Uses free public TSA endpoints (Quovadis, Certum, etc).
 */
export class TsaService {
  // Default free public TSA endpoints (add more if needed)
  private static readonly DEFAULT_TSA_URLS = [
    'http://timestamp.quovadis.com/tsa', // Quovadis (free)
    'http://time.certum.pl', // Certum (free)
    'http://tsa.safestamper.com', // Safestamper (free)
  ] as const;

  /**
   * Request a timestamp from TSA for the given data hash.
   * Returns ASN.1 encoded TimeStampToken suitable for embedding in PDF signature.
   * @param dataHash - SHA256 hash (hex string) to timestamp
   * @param tsaUrl - Optional custom TSA URL (uses default if not provided)
   * @returns TimeStampToken as Buffer (DER-encoded)
   */
  static async requestTimestampToken(
    dataHash: string,
    tsaUrl?: string | null,
  ): Promise<Buffer> {
    let url: string;
    if (tsaUrl && tsaUrl.length > 0) {
      url = tsaUrl;
    } else {
      url = this.DEFAULT_TSA_URLS[0]!;
    }

    try {
      // Convert hex hash to buffer
      const hashBuffer = Buffer.from(dataHash, 'hex');

      // Build RFC 3161 TimeStampReq
      const timeStampReq = this.buildTimeStampRequest(hashBuffer);

      console.log(
        `[TsaService] Requesting timestamp from ${url} for hash ${dataHash.substring(0, 16)}...`,
      );

      // Call TSA endpoint
      const response = await axios.post(url, timeStampReq, {
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        timeout: 10000,
        responseType: 'arraybuffer',
      });

      if (response.status !== 200) {
        throw new Error(
          `TSA returned status ${response.status}: ${response.statusText}`,
        );
      }

      const timeStampToken = Buffer.from(response.data);

      // Validate response is valid ASN.1 (basic check)
      if (timeStampToken.length < 20) {
        throw new Error('TSA returned invalid TimeStampToken (too short)');
      }

      console.log(`[TsaService] Timestamp obtained successfully`);
      return timeStampToken;
    } catch (error) {
      console.error('[TsaService] Timestamp request failed:', error);
      throw new Error(
        `Failed to get timestamp from TSA: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Build ASN.1 encoded TimeStampReq (RFC 3161).
   * This is the binary request sent to the TSA.
   */
  private static buildTimeStampRequest(hashBuffer: Buffer): Buffer {
    // TimeStampReq ::= SEQUENCE {
    //   version INTEGER { v1(1) },
    //   messageImprint MessageImprint,
    //   --  OPTIONAL nonce INTEGER,
    //   --  OPTIONAL certReq BOOLEAN DEFAULT FALSE,
    //   --  OPTIONAL extensions [0] IMPLICIT Extensions OPTIONAL }
    //
    // MessageImprint ::= SEQUENCE {
    //   hashAlg AlgorithmIdentifier,
    //   hashedMessage OCTET STRING }
    //
    // AlgorithmIdentifier ::= SEQUENCE {
    //   algorithm OBJECT IDENTIFIER,
    //   parameters ANY DEFINED BY algorithm OPTIONAL }

    // SHA256 OID: 2.16.840.1.101.3.4.2.1
    const sha256Oid = Buffer.from([
      0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01,
    ]);

    // NULL parameter for SHA256
    const nullParam = Buffer.from([0x05, 0x00]);

    // AlgorithmIdentifier for SHA256
    const algIdLength = sha256Oid.length + nullParam.length;
    const algIdTlv = Buffer.concat([
      Buffer.from([0x30, algIdLength]), // SEQUENCE tag + length
      sha256Oid,
      nullParam,
    ]);

    // MessageImprint ::= SEQUENCE { hashAlg, hashedMessage }
    const hashedMessageTlv = Buffer.concat([
      Buffer.from([0x04, hashBuffer.length]), // OCTET STRING tag + length
      hashBuffer,
    ]);

    const messageImprintLength = algIdTlv.length + hashedMessageTlv.length;
    const messageImprintTlv = Buffer.concat([
      Buffer.from([0x30, messageImprintLength]), // SEQUENCE tag + length
      algIdTlv,
      hashedMessageTlv,
    ]);

    // version INTEGER (1)
    const versionTlv = Buffer.from([0x02, 0x01, 0x01]);

    // TimeStampReq ::= SEQUENCE { version, messageImprint }
    const timeStampReqLength = versionTlv.length + messageImprintTlv.length;
    const timeStampReq = Buffer.concat([
      Buffer.from([0x30, timeStampReqLength]), // SEQUENCE tag + length
      versionTlv,
      messageImprintTlv,
    ]);

    return timeStampReq;
  }

  /**
   * Fallback: Generate a local timestamp token (NOT cryptographically signed).
   * Use only if TSA is unavailable and document is for non-legal purposes.
   * For real documents, always use requestTimestampToken().
   */
  static generateLocalTimestampToken(timestamp: Date = new Date()): Buffer {
    // This creates a simple structure that can be embedded but is NOT a real RFC 3161 token
    // Real tokens must come from a TSA
    console.warn(
      '[TsaService] WARNING: Using locally-generated timestamp (NOT from TSA), not legal-proof',
    );

    const timeStr = timestamp.toISOString();
    const timeBuffer = Buffer.from(timeStr, 'utf-8');

    // Create a minimal ASN.1 structure (OCTET STRING with timestamp)
    const tlv = Buffer.concat([
      Buffer.from([0x04, timeBuffer.length]), // OCTET STRING
      timeBuffer,
    ]);

    return tlv;
  }
}
