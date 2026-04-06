import forge from "node-forge";
import fs from "fs";
import path from "path";

export class VerifyService {
  private publicKey: forge.pki.PublicKey;

  constructor() {
    const pfxPath = path.resolve(process.cwd(), "../certificate.pfx");
    const pfxBuffer = fs.readFileSync(pfxPath);

    const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString("binary"));

    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, "12345678");

    const certificateBagOid = forge.pki.oids.certificateBag as string;
    const bags = p12.getBags({
      bagType: certificateBagOid,
    });

    const baggedCerts = bags[certificateBagOid];
    const cert = baggedCerts[0].cert;

    this.publicKey = cert.publicKey;
  }

  verify(hashHex: string, signatureBase64: string): boolean {
    try {
      // Convert hex hash to binary bytes
      const hashBytes = forge.util.hexToBytes(hashHex);

      // Recreate the message digest with the hash
      const md = forge.md.sha256.create();
      md.update(hashBytes, "binary");

      const signature = forge.util.decode64(signatureBase64);

      return this.publicKey.verify(md.digest().bytes(), signature);
    } catch (error) {
      console.error("[VerifyService] Error:", error);
      return false;
    }
  }
}
