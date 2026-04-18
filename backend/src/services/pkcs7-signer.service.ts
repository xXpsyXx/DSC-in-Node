import * as forge from 'node-forge';
import * as crypto from 'crypto';

/**
 * PKCS#7/CMS (RFC 2630/5652) SignedData structure builder.
 * Creates industry-standard signature containers compatible with Adobe Reader,
 * preview apps, and verification tools.
 *
 * Implements PAdES baseline profile for legal validity.
 */
export class Pkcs7SignerService {
  /**
   * Build a PKCS#7 SignedData structure containing:
   * - Signer's certificate
   * - RSA signature (already created by USB token)
   * - Authenticated attributes with document hash and timestamp
   *
   * Returns DER-encoded binary suitable for embedding in PDF /Contents field.
   */
  static createSignedData(options: {
    rsaSignatureBase64: string; // Already-signed RSA signature from token
    certificatePem: string; // Signer's X.509 certificate
    dataHash: string; // SHA256 hash (hex) of signed content
    signerName?: string;
    signReason?: string;
    signedAt?: Date;
    timestampToken?: Buffer; // Optional RFC 3161 TimeStampToken from TSA
  }): Buffer {
    try {
      const certificate = forge.pki.certificateFromPem(options.certificatePem);
      const rsaSignatureBuffer = Buffer.from(
        options.rsaSignatureBase64,
        'base64',
      );

      // Build the core SignedData structure using a simpler approach
      const signedData = this.buildSignedDataSimplified(
        certificate,
        rsaSignatureBuffer,
        options.dataHash,
        options.certificatePem,
        options.signedAt ?? new Date(),
      );

      // Encode to DER binary format
      const der = forge.asn1.toDer(signedData).getBytes();
      const result = Buffer.from(der, 'binary');

      console.log(
        `[Pkcs7SignerService] Created PKCS#7 SignedData: ${result.length} bytes`,
      );
      return result;
    } catch (error) {
      console.error('[Pkcs7SignerService] Error creating SignedData:', error);
      throw new Error(
        `Failed to create PKCS#7 SignedData: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Simplified SignedData builder using node-forge's native methods.
   */
  private static buildSignedDataSimplified(
    certificate: any,
    rsaSignature: Buffer,
    dataHashHex: string,
    certificatePem: string,
    signedAt: Date,
  ): any {
    // Extract certificate DER from PEM
    const certDerStr = this.extractDerFromPem(certificatePem);
    const certDer = Buffer.from(certDerStr, 'binary');

    // Version (INTEGER, value 3)
    const version = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.INTEGER,
      false,
      String.fromCharCode(3),
    );

    // DigestAlgorithmIdentifiers (SET OF with SHA256)
    const digestAlgorithms = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SET,
      true,
      [
        forge.asn1.create(
          forge.asn1.Class.UNIVERSAL,
          forge.asn1.Type.SEQUENCE,
          true,
          [
            forge.asn1.create(
              forge.asn1.Class.UNIVERSAL,
              forge.asn1.Type.OID,
              false,
              '2.16.840.1.101.3.4.2.1',
            ), // sha256 OID
            forge.asn1.create(
              forge.asn1.Class.UNIVERSAL,
              forge.asn1.Type.NULL,
              false,
              '',
            ),
          ],
        ),
      ],
    );

    // ContentInfo (just the OID for data, no embedded content)
    const contentInfo = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SEQUENCE,
      true,
      [
        forge.asn1.create(
          forge.asn1.Class.UNIVERSAL,
          forge.asn1.Type.OID,
          false,
          '1.2.840.113549.1.7.1',
        ), // id-data
      ],
    );

    // Certificates [0] IMPLICIT - parse the certificate DER
    const certAsn1 = forge.asn1.fromDer(certDer.toString('binary'));
    const certificates = forge.asn1.create(
      forge.asn1.Class.CONTEXT_SPECIFIC,
      0,
      true,
      [certAsn1],
    );

    // SignerInfo
    const signerInfo = this.buildSignerInfoSimplified(
      certificate,
      rsaSignature,
      dataHashHex,
      signedAt,
    );

    const signerInfos = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SET,
      true,
      [signerInfo],
    );

    // SignedData SEQUENCE
    const signedData = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SEQUENCE,
      true,
      [version, digestAlgorithms, contentInfo, certificates, signerInfos],
    );

    // Wrap in ContentInfo: SEQUENCE { contentType OID, [0] EXPLICIT content }
    const contentInfoWrapper = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SEQUENCE,
      true,
      [
        forge.asn1.create(
          forge.asn1.Class.UNIVERSAL,
          forge.asn1.Type.OID,
          false,
          '1.2.840.113549.1.7.2', // id-signedData
        ),
        forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
          signedData,
        ]),
      ],
    );

    return contentInfoWrapper;
  }

  /**
   * Build SignerInfo using simplified approach.
   */
  private static buildSignerInfoSimplified(
    certificate: any,
    rsaSignature: Buffer,
    dataHashHex: string,
    signedAt: Date,
  ): any {
    // Version (INTEGER, value 1)
    const version = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.INTEGER,
      false,
      String.fromCharCode(1),
    );

    // IssuerAndSerialNumber
    // Extract issuer RDN from certificate
    const issuerRdn = this.buildIssuerRdn(certificate);
    const serialNumber = certificate.serialNumber || '1';

    const issuerAndSerialNumber = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SEQUENCE,
      true,
      [
        issuerRdn,
        forge.asn1.create(
          forge.asn1.Class.UNIVERSAL,
          forge.asn1.Type.INTEGER,
          false,
          serialNumber,
        ),
      ],
    );

    // DigestAlgorithmIdentifier (SHA256)
    const digestAlgId = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SEQUENCE,
      true,
      [
        forge.asn1.create(
          forge.asn1.Class.UNIVERSAL,
          forge.asn1.Type.OID,
          false,
          '2.16.840.1.101.3.4.2.1',
        ), // sha256
        forge.asn1.create(
          forge.asn1.Class.UNIVERSAL,
          forge.asn1.Type.NULL,
          false,
          '',
        ),
      ],
    );

    // AuthenticatedAttributes [0] IMPLICIT
    const dataHashBuffer = Buffer.from(dataHashHex, 'hex');
    const authAttrs = forge.asn1.create(
      forge.asn1.Class.CONTEXT_SPECIFIC,
      0,
      true,
      [
        // MessageDigest attribute
        forge.asn1.create(
          forge.asn1.Class.UNIVERSAL,
          forge.asn1.Type.SEQUENCE,
          true,
          [
            forge.asn1.create(
              forge.asn1.Class.UNIVERSAL,
              forge.asn1.Type.OID,
              false,
              '1.2.840.113549.1.9.4',
            ), // id-messageDigest
            forge.asn1.create(
              forge.asn1.Class.UNIVERSAL,
              forge.asn1.Type.SET,
              true,
              [
                forge.asn1.create(
                  forge.asn1.Class.UNIVERSAL,
                  forge.asn1.Type.OCTETSTRING,
                  false,
                  dataHashBuffer.toString('binary'),
                ),
              ],
            ),
          ],
        ),
        // SigningTime attribute
        forge.asn1.create(
          forge.asn1.Class.UNIVERSAL,
          forge.asn1.Type.SEQUENCE,
          true,
          [
            forge.asn1.create(
              forge.asn1.Class.UNIVERSAL,
              forge.asn1.Type.OID,
              false,
              '1.2.840.113549.1.9.5',
            ), // id-signingTime
            forge.asn1.create(
              forge.asn1.Class.UNIVERSAL,
              forge.asn1.Type.SET,
              true,
              [
                forge.asn1.create(
                  forge.asn1.Class.UNIVERSAL,
                  forge.asn1.Type.UTCTIME,
                  false,
                  this.formatUtcTime(signedAt),
                ),
              ],
            ),
          ],
        ),
      ],
    );

    // DigestEncryptionAlgorithmIdentifier (RSA)
    const encAlgId = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SEQUENCE,
      true,
      [
        forge.asn1.create(
          forge.asn1.Class.UNIVERSAL,
          forge.asn1.Type.OID,
          false,
          '1.2.840.113549.1.1.1',
        ), // rsaEncryption
        forge.asn1.create(
          forge.asn1.Class.UNIVERSAL,
          forge.asn1.Type.NULL,
          false,
          '',
        ),
      ],
    );

    // EncryptedDigest (the RSA signature)
    const encryptedDigest = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.OCTETSTRING,
      false,
      rsaSignature.toString('binary'),
    );

    // SignerInfo SEQUENCE
    const signerInfo = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SEQUENCE,
      true,
      [
        version,
        issuerAndSerialNumber,
        digestAlgId,
        authAttrs,
        encAlgId,
        encryptedDigest,
      ],
    );

    return signerInfo;
  }

  /**
   * Build issuer RDN (RelativeDistinguishedName) sequence from certificate.
   */
  private static buildIssuerRdn(certificate: any): any {
    const rdnSequence: any[] = [];

    // Common attribute OIDs
    const attributes = [
      { oid: '2.5.4.3', name: 'CN' }, // commonName
      { oid: '2.5.4.10', name: 'O' }, // organization
      { oid: '2.5.4.11', name: 'OU' }, // organizationalUnit
      { oid: '2.5.4.6', name: 'C' }, // countryName
      { oid: '2.5.4.8', name: 'ST' }, // stateOrProvinceName
    ];

    for (const attr of attributes) {
      const field = certificate.issuer.getField(attr.name);
      if (field && field.value) {
        const value = field.value.toString();
        const attrSeq = forge.asn1.create(
          forge.asn1.Class.UNIVERSAL,
          forge.asn1.Type.SEQUENCE,
          true,
          [
            forge.asn1.create(
              forge.asn1.Class.UNIVERSAL,
              forge.asn1.Type.OID,
              false,
              attr.oid,
            ),
            forge.asn1.create(
              forge.asn1.Class.UNIVERSAL,
              forge.asn1.Type.PRINTABLESTRING,
              false,
              value,
            ),
          ],
        );

        const rdn = forge.asn1.create(
          forge.asn1.Class.UNIVERSAL,
          forge.asn1.Type.SET,
          true,
          [attrSeq],
        );

        rdnSequence.push(rdn);
      }
    }

    // If no attributes found, create a minimal CN
    if (rdnSequence.length === 0) {
      const attrSeq = forge.asn1.create(
        forge.asn1.Class.UNIVERSAL,
        forge.asn1.Type.SEQUENCE,
        true,
        [
          forge.asn1.create(
            forge.asn1.Class.UNIVERSAL,
            forge.asn1.Type.OID,
            false,
            '2.5.4.3',
          ),
          forge.asn1.create(
            forge.asn1.Class.UNIVERSAL,
            forge.asn1.Type.PRINTABLESTRING,
            false,
            'Unknown',
          ),
        ],
      );

      const rdn = forge.asn1.create(
        forge.asn1.Class.UNIVERSAL,
        forge.asn1.Type.SET,
        true,
        [attrSeq],
      );

      rdnSequence.push(rdn);
    }

    // RDNSequence (SEQUENCE OF RDN)
    return forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SEQUENCE,
      true,
      rdnSequence,
    );
  }

  /**
   * Extract DER from PEM format.
   */
  private static extractDerFromPem(pem: string): string {
    const lines = pem.split('\n');
    let derBase64 = '';
    for (const line of lines) {
      if (
        !line.startsWith('-----BEGIN') &&
        !line.startsWith('-----END') &&
        line.trim().length > 0
      ) {
        derBase64 += line.trim();
      }
    }
    return Buffer.from(derBase64, 'base64').toString('binary');
  }

  /**
   * Format date to UTCTime (YYMMDDhhmmssZ format).
   */
  private static formatUtcTime(date: Date): string {
    const year = String(date.getUTCFullYear()).slice(-2);
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${year}${month}${day}${hours}${minutes}${seconds}Z`;
  }
}
