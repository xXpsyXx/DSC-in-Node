const forge = require('node-forge');
const crypto = require('crypto');

class Pkcs7SignerService {
  static createSignedData(options) {
    try {
      const certificate = forge.pki.certificateFromPem(options.certificatePem);
      const rsaSignatureBuffer = Buffer.from(options.rsaSignatureBase64, 'base64');

      const signedData = this.buildSignedDataSimplified(
        certificate,
        rsaSignatureBuffer,
        options.dataHash,
        options.certificatePem,
        options.signedAt || new Date(),
      );

      const der = forge.asn1.toDer(signedData).getBytes();
      const result = Buffer.from(der, 'binary');

      console.log(`[Pkcs7SignerService] Created PKCS#7 SignedData: ${result.length} bytes`);
      return result;
    } catch (error) {
      console.error('[Pkcs7SignerService] Error creating SignedData:', error);
      throw new Error(`Failed to create PKCS#7 SignedData: ${(error && error.message) || String(error)}`);
    }
  }

  static buildSignedDataSimplified(certificate, rsaSignature, dataHashHex, certificatePem, signedAt) {
    const certDerStr = this.extractDerFromPem(certificatePem);
    const certDer = Buffer.from(certDerStr, 'binary');

    const version = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false, String.fromCharCode(3));

    const digestAlgorithms = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, [
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, '2.16.840.1.101.3.4.2.1'),
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
      ]),
    ]);

    const contentInfo = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, '1.2.840.113549.1.7.1'),
    ]);

    const certAsn1 = forge.asn1.fromDer(certDer.toString('binary'));
    const certificates = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [certAsn1]);

    const signerInfo = this.buildSignerInfoSimplified(certificate, rsaSignature, dataHashHex, signedAt);

    const signerInfos = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, [signerInfo]);

    const signedData = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [version, digestAlgorithms, contentInfo, certificates, signerInfos]);

    const contentInfoWrapper = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, '1.2.840.113549.1.7.2'),
      forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [signedData]),
    ]);

    return contentInfoWrapper;
  }

  static buildSignerInfoSimplified(certificate, rsaSignature, dataHashHex, signedAt) {
    const version = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false, String.fromCharCode(1));

    const issuerRdn = this.buildIssuerRdn(certificate);
    const serialNumber = certificate.serialNumber || '1';

    const issuerAndSerialNumber = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
      issuerRdn,
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false, serialNumber),
    ]);

    const digestAlgId = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, '2.16.840.1.101.3.4.2.1'),
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
    ]);

    const dataHashBuffer = Buffer.from(dataHashHex, 'hex');
    const authAttrs = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, '1.2.840.113549.1.9.4'),
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, [
          forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false, dataHashBuffer.toString('binary')),
        ]),
      ]),
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, '1.2.840.113549.1.9.5'),
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, [
          forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.UTCTIME, false, this.formatUtcTime(signedAt)),
        ]),
      ]),
    ]);

    const encAlgId = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, '1.2.840.113549.1.1.1'),
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
    ]);

    const encryptedDigest = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false, rsaSignature.toString('binary'));

    const signerInfo = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
      version,
      issuerAndSerialNumber,
      digestAlgId,
      authAttrs,
      encAlgId,
      encryptedDigest,
    ]);

    return signerInfo;
  }

  static buildIssuerRdn(certificate) {
    const rdnSequence = [];
    const attributes = [
      { oid: '2.5.4.3', name: 'CN' },
      { oid: '2.5.4.10', name: 'O' },
      { oid: '2.5.4.11', name: 'OU' },
      { oid: '2.5.4.6', name: 'C' },
      { oid: '2.5.4.8', name: 'ST' },
    ];

    for (const attr of attributes) {
      const field = certificate.issuer.getField(attr.name);
      if (field && field.value) {
        const value = field.value.toString();
        const attrSeq = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
          forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, attr.oid),
          forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.PRINTABLESTRING, false, value),
        ]);

        const rdn = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, [attrSeq]);
        rdnSequence.push(rdn);
      }
    }

    if (rdnSequence.length === 0) {
      const attrSeq = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, '2.5.4.3'),
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.PRINTABLESTRING, false, 'Unknown'),
      ]);

      const rdn = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, [attrSeq]);
      rdnSequence.push(rdn);
    }

    return forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, rdnSequence);
  }

  static extractDerFromPem(pem) {
    const lines = pem.split('\n');
    let derBase64 = '';
    for (const line of lines) {
      if (!line.startsWith('-----BEGIN') && !line.startsWith('-----END') && line.trim().length > 0) {
        derBase64 += line.trim();
      }
    }
    return Buffer.from(derBase64, 'base64').toString('binary');
  }

  static formatUtcTime(date) {
    const year = String(date.getUTCFullYear()).slice(-2);
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${year}${month}${day}${hours}${minutes}${seconds}Z`;
  }
}

module.exports = { Pkcs7SignerService };
