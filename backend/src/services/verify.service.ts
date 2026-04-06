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

    const bags = p12.getBags({
      bagType: forge.pki.oids.certificateBag,
    });

    const cert = bags[forge.pki.oids.certificateBag][0].cert;

    this.publicKey = cert.publicKey;
  }

  verify(data: string, signatureBase64: string): boolean {
    const md = forge.md.sha256.create();
    md.update(data, "utf8");

    const signature = forge.util.decode64(signatureBase64);

    return this.publicKey.verify(md.digest().bytes(), signature);
  }
}
