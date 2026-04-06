import forge from 'node-forge';
import fs from 'fs';
import path from 'path';

export class SignerService {
  private privateKey: forge.pki.PrivateKey;

  constructor() {
    const pfxPath = path.resolve(process.cwd(), 'cert/certificate.pfx');
    const pfxBuffer = fs.readFileSync(pfxPath);

    const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));

    const p12 = forge.pkcs12.pkcs12FromAsn1(
      p12Asn1,
      false,
      '12345678'
    );

    const bags = p12.getBags({
      bagType: forge.pki.oids.pkcs8ShroudedKeyBag,
    });

    this.privateKey =
      bags[forge.pki.oids.pkcs8ShroudedKeyBag][0].key;
  }

  sign(data: string): string {
    const md = forge.md.sha256.create(); 
    md.update(data, 'utf8');

    const signature = this.privateKey.sign(md);

    return forge.util.encode64(signature);
  }
}