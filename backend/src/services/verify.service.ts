import forge from 'node-forge';
import os from 'os';
import * as pkcs11js from 'pkcs11js';

export class VerifyService {
  private publicKey: forge.pki.PublicKey;

  constructor() {
    const fromPkcs11 = this.loadPublicKeyFromPkcs11();
    if (!fromPkcs11) {
      throw new Error(
        'USB token not detected or certificate unavailable. Please connect Hypersecu USB token.',
      );
    }

    this.publicKey = fromPkcs11;
  }

  private loadPublicKeyFromPkcs11(): forge.pki.PublicKey | null {
    const libraryPath = this.resolvePkcs11LibraryPath();
    if (!libraryPath) {
      return null;
    }

    const pkcs11 = new pkcs11js.PKCS11();
    let session: pkcs11js.Handle | null = null;

    try {
      pkcs11.load(libraryPath);
      pkcs11.C_Initialize();

      const slots = pkcs11.C_GetSlotList(true);
      if (!slots.length) {
        return null;
      }

      const slot = this.selectSlot(slots);
      session = pkcs11.C_OpenSession(slot, pkcs11js.CKF_SERIAL_SESSION);

      const verifyPin = process.env.PKCS11_VERIFY_PIN || process.env.PKCS11_PIN;
      if (verifyPin) {
        try {
          pkcs11.C_Login(session, pkcs11js.CKU_USER, verifyPin);
        } catch (error) {
          const message = this.getErrorMessage(error);
          if (!message.includes('CKR_USER_ALREADY_LOGGED_IN')) {
            throw error;
          }
        }
      }

      const certObject = this.findCertificateObject(pkcs11, session);
      if (!certObject) {
        return null;
      }

      const certAttrs = pkcs11.C_GetAttributeValue(session, certObject, [
        { type: pkcs11js.CKA_VALUE },
      ]);

      const certDer = certAttrs[0]?.value;
      if (!certDer) {
        return null;
      }

      const certAsn1 = forge.asn1.fromDer(certDer.toString('binary'));
      const cert = forge.pki.certificateFromAsn1(certAsn1);
      return cert.publicKey;
    } catch {
      return null;
    } finally {
      if (session) {
        try {
          pkcs11.C_Logout(session);
        } catch {
          // Ignore logout errors.
        }
        try {
          pkcs11.C_CloseSession(session);
        } catch {
          // Ignore close session errors.
        }
      }

      try {
        pkcs11.C_Finalize();
      } catch {
        // Ignore finalize errors.
      }
    }
  }

  private findCertificateObject(
    pkcs11: pkcs11js.PKCS11,
    session: pkcs11js.Handle,
  ): pkcs11js.Handle | null {
    const certLabel = process.env.PKCS11_CERT_LABEL?.trim();
    const template: pkcs11js.Template = [
      { type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_CERTIFICATE },
    ];

    if (certLabel) {
      template.push({ type: pkcs11js.CKA_LABEL, value: certLabel });
    }

    pkcs11.C_FindObjectsInit(session, template);
    try {
      const found = pkcs11.C_FindObjects(session, 1);
      const first = found[0] || null;
      if (first) {
        return first;
      }

      return null;
    } finally {
      pkcs11.C_FindObjectsFinal(session);
    }
  }

  private resolvePkcs11LibraryPath(): string | null {
    const directPath = process.env.PKCS11_LIBRARY_PATH?.trim();
    if (directPath) {
      return directPath;
    }

    const platform = os.platform();
    if (platform === 'win32') {
      return process.env.PKCS11_LIBRARY_PATH_WINDOWS?.trim() || null;
    }
    if (platform === 'linux') {
      return process.env.PKCS11_LIBRARY_PATH_LINUX?.trim() || null;
    }
    if (platform === 'darwin') {
      return process.env.PKCS11_LIBRARY_PATH_DARWIN?.trim() || null;
    }

    return null;
  }

  private selectSlot(slots: pkcs11js.Handle[]): pkcs11js.Handle {
    const slotIndexRaw = process.env.PKCS11_SLOT_INDEX?.trim();
    if (!slotIndexRaw) {
      const firstSlot = slots[0];
      if (!firstSlot) {
        throw new Error('No token slot available');
      }
      return firstSlot;
    }

    const slotIndex = Number.parseInt(slotIndexRaw, 10);
    if (Number.isNaN(slotIndex) || slotIndex < 0 || slotIndex >= slots.length) {
      throw new Error(
        `Invalid PKCS11_SLOT_INDEX=${slotIndexRaw}. Available slots: 0 to ${Math.max(slots.length - 1, 0)}.`,
      );
    }

    const slot = slots[slotIndex];
    if (!slot) {
      throw new Error(`Token slot at index ${slotIndex} is not available`);
    }
    return slot;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  verify(hashHex: string, signatureBase64: string): boolean {
    try {
      // Convert hex hash to binary bytes
      const hashBytes = forge.util.hexToBytes(hashHex);

      // Recreate the message digest with the hash
      const md = forge.md.sha256.create();
      md.update(hashBytes);

      const signature = forge.util.decode64(signatureBase64);

      return (this.publicKey as any).verify(md.digest().bytes(), signature);
    } catch (error) {
      console.error('[VerifyService] Error:', error);
      return false;
    }
  }
}
