const forge = require('node-forge');
const os = require('os');
const pkcs11js = require('pkcs11js');

class VerifyService {
  constructor(certificatePem) {
    if (certificatePem) {
      this.publicKey = this.loadPublicKeyFromPem(certificatePem);
    } else {
      this.publicKey = this.loadPublicKeyFromPkcs11();
    }
  }

  loadPublicKeyFromPem(certificatePem) {
    try {
      const cert = forge.pki.certificateFromPem(certificatePem);
      return cert.publicKey;
    } catch (error) {
      throw new Error(`Failed to load certificate from PEM: ${(error && error.message) || String(error)}`);
    }
  }

  loadPublicKeyFromPkcs11() {
    const libraryPath = this.resolvePkcs11LibraryPath();
    if (!libraryPath) {
      throw new Error('PKCS#11 library not configured. Set PKCS11_LIBRARY_PATH (or PKCS11_LIBRARY_PATH_WINDOWS).');
    }

    const pkcs11 = new pkcs11js.PKCS11();
    let session = null;

    try {
      pkcs11.load(libraryPath);
      pkcs11.C_Initialize();

      const slots = pkcs11.C_GetSlotList(true);
      if (!slots.length) {
        throw new Error('No USB token detected. Please connect Hypersecu USB token.');
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
        throw new Error('Certificate unavailable on USB token. Ensure certificate is present.');
      }

      const certAttrs = pkcs11.C_GetAttributeValue(session, certObject, [{ type: pkcs11js.CKA_VALUE }]);
      const certDer = certAttrs[0]?.value;
      if (!certDer) {
        throw new Error('Certificate value is missing on USB token.');
      }

      const certAsn1 = forge.asn1.fromDer(certDer.toString('binary'));
      const cert = forge.pki.certificateFromAsn1(certAsn1);
      return cert.publicKey;
    } catch (error) {
      throw new Error(`PKCS#11 verification initialization failed: ${this.getErrorMessage(error)}`);
    } finally {
      if (session) {
        try { pkcs11.C_Logout(session); } catch {}
        try { pkcs11.C_CloseSession(session); } catch {}
      }
      try { pkcs11.C_Finalize(); } catch {}
    }
  }

  findCertificateObject(pkcs11, session) {
    const certLabel = process.env.PKCS11_CERT_LABEL?.trim();
    const template = [{ type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_CERTIFICATE }];
    if (certLabel) template.push({ type: pkcs11js.CKA_LABEL, value: certLabel });

    pkcs11.C_FindObjectsInit(session, template);
    try {
      const found = pkcs11.C_FindObjects(session, 1);
      const first = found[0] || null;
      if (first) return first;
      return null;
    } finally {
      pkcs11.C_FindObjectsFinal(session);
    }
  }

  resolvePkcs11LibraryPath() {
    const directPath = process.env.PKCS11_LIBRARY_PATH?.trim();
    if (directPath) return directPath;
    const platform = os.platform();
    if (platform === 'win32') return process.env.PKCS11_LIBRARY_PATH_WINDOWS?.trim() || null;
    if (platform === 'linux') return process.env.PKCS11_LIBRARY_PATH_LINUX?.trim() || null;
    if (platform === 'darwin') return process.env.PKCS11_LIBRARY_PATH_DARWIN?.trim() || null;
    return null;
  }

  selectSlot(slots) {
    const slotIndexRaw = process.env.PKCS11_SLOT_INDEX?.trim();
    if (!slotIndexRaw) {
      const firstSlot = slots[0];
      if (!firstSlot) throw new Error('No token slot available');
      return firstSlot;
    }
    const slotIndex = Number.parseInt(slotIndexRaw, 10);
    if (Number.isNaN(slotIndex) || slotIndex < 0 || slotIndex >= slots.length) {
      throw new Error(`Invalid PKCS11_SLOT_INDEX=${slotIndexRaw}. Available slots: 0 to ${Math.max(slots.length - 1, 0)}.`);
    }
    const slot = slots[slotIndex];
    if (!slot) throw new Error(`Token slot at index ${slotIndex} is not available`);
    return slot;
  }

  getErrorMessage(error) {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  verify(hashHex, signatureBase64) {
    if (!this.publicKey) {
      console.error('[VerifyService] No public key available for verification');
      return false;
    }
    try {
      const hashBytes = forge.util.hexToBytes(hashHex);
      const md = forge.md.sha256.create();
      md.update(hashBytes);
      const signature = forge.util.decode64(signatureBase64);
      return this.publicKey.verify(md.digest().bytes(), signature);
    } catch (error) {
      console.error('[VerifyService] Error:', error);
      return false;
    }
  }

  static verifyWithCertificate(hashHex, signatureBase64, certificatePem) {
    try {
      const cert = forge.pki.certificateFromPem(certificatePem);
      const publicKey = cert.publicKey;
      const hashBytes = forge.util.hexToBytes(hashHex);
      const md = forge.md.sha256.create();
      md.update(hashBytes);
      const signature = forge.util.decode64(signatureBase64);
      return publicKey.verify(md.digest().bytes(), signature);
    } catch (error) {
      console.error('[VerifyService] Error during verification:', error);
      return false;
    }
  }
}

module.exports = { VerifyService };
