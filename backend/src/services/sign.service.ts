import forge from "node-forge";
import fs from "fs";
import path from "path";

export class SignerService {
  private privateKey: forge.pki.PrivateKey;

  constructor() {
    const pfxPath = path.resolve(process.cwd(), "../certificate.pfx");
    const pfxBuffer = fs.readFileSync(pfxPath);

    const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString("binary"));

    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, "12345678");

    const keyBagOid = forge.pki.oids.pkcs8ShroudedKeyBag as string;
    const bags = p12.getBags({
      bagType: keyBagOid,
    });

    const baggedKeys = bags[keyBagOid];
    this.privateKey = baggedKeys[0].key;
  }

  /**
   * Sign a hash string (hex format)
   * Used for pre-computed hashes
   */
  signHash(hashHex: string): string {
    // Convert hex hash to binary bytes
    const hashBytes = forge.util.hexToBytes(hashHex);
    
    // Use RSA-PSS signing with SHA-256
    const md = forge.md.sha256.create();
    md.update(hashBytes, 'binary');
    
    const signature = this.privateKey.sign(md);

    return forge.util.encode64(signature);
  }

  /**
   * Sign a string directly (legacy support)
   * @deprecated Use signHash() instead
   */
  sign(data: string): string {
    const md = forge.md.sha256.create();
    md.update(data, "utf8");

    const signature = this.privateKey.sign(md);

    return forge.util.encode64(signature);
  }
}