const crypto = require('crypto');
const axios = require('axios');

class TsaService {
  static async requestTimestampToken(dataHash, tsaUrl) {
    if (!tsaUrl) {
      throw new Error('TSA_URL_NOT_CONFIGURED: TSA_URL environment variable must be set');
    }

    try {
      const hashBuffer = Buffer.from(dataHash, 'hex');
      const timeStampReq = this.buildTimeStampRequest(hashBuffer);

      console.log(`[TsaService] Requesting timestamp from ${tsaUrl} for hash ${dataHash.substring(0, 16)}...`);

      const response = await axios.post(tsaUrl, timeStampReq, {
        headers: { 'Content-Type': 'application/octet-stream' },
        timeout: 10000,
        responseType: 'arraybuffer',
      });

      if (response.status !== 200) {
        throw new Error(`TSA returned status ${response.status}: ${response.statusText}`);
      }

      const timeStampToken = Buffer.from(response.data);

      if (timeStampToken.length < 20) {
        throw new Error('TSA returned invalid TimeStampToken (too short)');
      }

      console.log('[TsaService] Timestamp obtained successfully');
      return timeStampToken;
    } catch (error) {
      console.error('[TsaService] Timestamp request failed:', error);
      throw new Error(`Failed to get timestamp from TSA: ${(error && error.message) || String(error)}`);
    }
  }

  static buildTimeStampRequest(hashBuffer) {
    const sha256Oid = Buffer.from([0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]);
    const nullParam = Buffer.from([0x05, 0x00]);
    const algIdLength = sha256Oid.length + nullParam.length;
    const algIdTlv = Buffer.concat([Buffer.from([0x30, algIdLength]), sha256Oid, nullParam]);
    const hashedMessageTlv = Buffer.concat([Buffer.from([0x04, hashBuffer.length]), hashBuffer]);
    const messageImprintLength = algIdTlv.length + hashedMessageTlv.length;
    const messageImprintTlv = Buffer.concat([Buffer.from([0x30, messageImprintLength]), algIdTlv, hashedMessageTlv]);
    const versionTlv = Buffer.from([0x02, 0x01, 0x01]);
    const timeStampReqLength = versionTlv.length + messageImprintTlv.length;
    const timeStampReq = Buffer.concat([Buffer.from([0x30, timeStampReqLength]), versionTlv, messageImprintTlv]);
    return timeStampReq;
  }

  static generateLocalTimestampToken(timestamp = new Date()) {
    console.warn('[TsaService] WARNING: Using locally-generated timestamp (NOT from TSA), not legal-proof');
    const timeStr = timestamp.toISOString();
    const timeBuffer = Buffer.from(timeStr, 'utf-8');
    const tlv = Buffer.concat([Buffer.from([0x04, timeBuffer.length]), timeBuffer]);
    return tlv;
  }
}

module.exports = { TsaService };
