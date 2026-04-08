import os from 'os';
import forge from 'node-forge';
import * as pkcs11js from 'pkcs11js';

export class SignerService {
  private signerName: string;
  private pkcs11: pkcs11js.PKCS11 | null;
  private pkcs11Session: pkcs11js.Handle | null;
  private pkcs11PrivateKey: pkcs11js.Handle | null;
  private certificateDer: Buffer | null;
  private closed: boolean;
  private customDriverPath?: string; // Optional custom driver path

  constructor(pin: string, customDriverPath?: string) {
    this.signerName = 'Unknown Signer';
    this.pkcs11 = null;
    this.pkcs11Session = null;
    this.pkcs11PrivateKey = null;
    this.certificateDer = null;
    this.closed = false;
    this.customDriverPath = customDriverPath;

    const pkcs11LibraryPath = this.resolvePkcs11LibraryPath();

    if (!pkcs11LibraryPath) {
      throw new Error(
        'USB token library not configured. Set PKCS11_LIBRARY_PATH (or PKCS11_LIBRARY_PATH_WINDOWS).',
      );
    }

    this.initializePkcs11(pkcs11LibraryPath, pin);
  }

  getSignerName(): string {
    return this.signerName;
  }

  getCertificateDer(): Buffer | null {
    return this.certificateDer;
  }

  getCertificatePem(): string | null {
    if (!this.certificateDer) {
      return null;
    }
    const cert = forge.pki.certificateFromAsn1(
      forge.asn1.fromDer(this.certificateDer.toString('binary')),
    );
    return forge.pki.certificateToPem(cert);
  }

  getCertificateExpirationStatus(): {
    status: 'expired' | 'critical' | 'warning' | 'valid';
    daysRemaining: number;
    expiryDate: Date;
    message: string;
  } {
    if (!this.certificateDer) {
      return {
        status: 'valid',
        daysRemaining: 365,
        expiryDate: new Date(),
        message: 'Certificate not available',
      };
    }

    const cert = forge.pki.certificateFromAsn1(
      forge.asn1.fromDer(this.certificateDer.toString('binary')),
    );

    const expiryDate = cert.validity.notAfter;
    const now = new Date();
    const daysRemaining = Math.floor(
      (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysRemaining < 0) {
      return {
        status: 'expired',
        daysRemaining,
        expiryDate,
        message: `Certificate has expired (expired ${Math.abs(daysRemaining)} days ago on ${expiryDate.toDateString()})`,
      };
    } else if (daysRemaining < 15) {
      return {
        status: 'critical',
        daysRemaining,
        expiryDate,
        message: `Certificate expires in ${daysRemaining} days (${expiryDate.toDateString()}) - SIGNING BLOCKED`,
      };
    } else if (daysRemaining < 30) {
      return {
        status: 'warning',
        daysRemaining,
        expiryDate,
        message: `Certificate expires in ${daysRemaining} days (${expiryDate.toDateString()})`,
      };
    }

    return {
      status: 'valid',
      daysRemaining,
      expiryDate,
      message: `Certificate is valid for ${daysRemaining} more days`,
    };
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;

    const pkcs11 = this.pkcs11;
    const session = this.pkcs11Session;

    this.pkcs11Session = null;
    this.pkcs11PrivateKey = null;

    if (pkcs11 && session) {
      try {
        pkcs11.C_Logout(session);
      } catch {
        // Ignore logout errors such as not logged in.
      }
      try {
        pkcs11.C_CloseSession(session);
      } catch {
        // Ignore session close errors.
      }
    }

    if (pkcs11) {
      try {
        pkcs11.C_Finalize();
      } catch {
        // Ignore finalize errors.
      }
    }

    this.pkcs11 = null;
  }

  private initializePkcs11(libraryPath: string, pin: string): void {
    const pkcs11 = new pkcs11js.PKCS11();
    this.pkcs11 = pkcs11;

    try {
      pkcs11.load(libraryPath);
      pkcs11.C_Initialize();

      const slots = pkcs11.C_GetSlotList(true);
      if (!slots.length) {
        throw new Error(
          'No USB token detected. Please connect Hypersecu USB token.',
        );
      }

      const slot = this.selectSlot(slots);
      const session = pkcs11.C_OpenSession(
        slot,
        pkcs11js.CKF_SERIAL_SESSION | pkcs11js.CKF_RW_SESSION,
      );
      this.pkcs11Session = session;

      try {
        pkcs11.C_Login(session, pkcs11js.CKU_USER, pin);
      } catch (error) {
        const message = this.getErrorMessage(error);
        if (!message.includes('CKR_USER_ALREADY_LOGGED_IN')) {
          throw error;
        }
      }

      const privateKey = this.findPrivateKey(session);
      if (!privateKey) {
        throw new Error(
          'No signing key found on USB token. Set PKCS11_KEY_LABEL or PKCS11_KEY_ID_HEX if your token has multiple keys.',
        );
      }

      this.pkcs11PrivateKey = privateKey;
      this.signerName = this.resolveSignerNameFromToken(session, privateKey);
    } catch (error) {
      this.close();
      throw new Error(
        `PKCS#11 initialization failed: ${this.getErrorMessage(error)}`,
      );
    }
  }

  private resolvePkcs11LibraryPath(): string | null {
    // If custom driver path provided, use it first
    if (this.customDriverPath?.trim()) {
      return this.customDriverPath.trim();
    }

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

  // Static method to list supported drivers
  static getSupportedDrivers(): Array<{
    name: string;
    path: string;
    enabled: boolean;
  }> {
    const platform = os.platform();
    const drivers = [
      {
        name: 'Hypersecu ePass3000',
        path:
          platform === 'win32'
            ? 'C:\\Windows\\System32\\eps2003csp11v2.dll'
            : '/usr/lib/libepass2003.so',
        enabled: true,
      },
      {
        name: 'SafeNet eToken',
        path:
          platform === 'win32'
            ? 'C:\\Windows\\System32\\eTPKCS11.dll'
            : '/usr/lib/libeTPKCS11.so',
        enabled: false,
      },
      {
        name: 'Thales Luna USB',
        path:
          platform === 'win32'
            ? 'C:\\Windows\\System32\\lunacsp.dll'
            : '/usr/lib/liblunacsp.so',
        enabled: false,
      },
      {
        name: 'YubiKey 5',
        path:
          platform === 'win32'
            ? 'C:\\Windows\\System32\\ykcs11.dll'
            : '/usr/lib/libykcs11.so',
        enabled: false,
      },
      {
        name: 'Gemalto IDGo 800',
        path:
          platform === 'win32'
            ? 'C:\\Windows\\System32\\gclib.dll'
            : '/usr/lib/libgclib.so',
        enabled: false,
      },
    ];

    return drivers;
  }

  // NEW: Auto-detect connected USB token and return driver info
  static autoDetectDriver(): {
    driverPath: string;
    driverName: string;
  } | null {
    const drivers = this.getSupportedDrivers();

    for (const driver of drivers) {
      try {
        const pkcs11 = new pkcs11js.PKCS11();
        pkcs11.load(driver.path);
        pkcs11.C_Initialize();

        const slots = pkcs11.C_GetSlotList(true);

        // If we can get slots, this driver works
        pkcs11.C_Finalize();

        console.log(
          `[autoDetectDriver] Detected device: ${driver.name} (${driver.path})`,
        );
        return {
          driverPath: driver.path,
          driverName: driver.name,
        };
      } catch (error) {
        // This driver didn't work, try next one
        console.log(`[autoDetectDriver] Driver not available: ${driver.name}`);
      }
    }

    // No driver found
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

  private requirePkcs11(): pkcs11js.PKCS11 {
    if (!this.pkcs11) {
      throw new Error('PKCS#11 is not initialized');
    }
    return this.pkcs11;
  }

  private findSingleObject(
    session: pkcs11js.Handle,
    template: pkcs11js.Template,
  ): pkcs11js.Handle | null {
    const pkcs11 = this.requirePkcs11();
    pkcs11.C_FindObjectsInit(session, template);
    try {
      const found = pkcs11.C_FindObjects(session, 1);
      return found[0] || null;
    } finally {
      pkcs11.C_FindObjectsFinal(session);
    }
  }

  private getAttributeValue(
    session: pkcs11js.Handle,
    objectHandle: pkcs11js.Handle,
    attributeType: number,
  ): Buffer | null {
    const pkcs11 = this.requirePkcs11();
    const attrs = pkcs11.C_GetAttributeValue(session, objectHandle, [
      { type: attributeType },
    ]);
    const matched = attrs.find((attr) => attr.type === attributeType);
    if (!matched) {
      return null;
    }
    return matched.value;
  }

  private findPrivateKey(session: pkcs11js.Handle): pkcs11js.Handle | null {
    const keyLabel = process.env.PKCS11_KEY_LABEL?.trim();
    const keyIdHex = process.env.PKCS11_KEY_ID_HEX?.trim();

    const template: pkcs11js.Template = [
      { type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_PRIVATE_KEY },
    ];

    if (keyLabel) {
      template.push({ type: pkcs11js.CKA_LABEL, value: keyLabel });
    }
    if (keyIdHex) {
      template.push({
        type: pkcs11js.CKA_ID,
        value: Buffer.from(keyIdHex, 'hex'),
      });
    }

    let handle = this.findSingleObject(session, template);
    if (!handle && (keyLabel || keyIdHex)) {
      handle = this.findSingleObject(session, [
        { type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_PRIVATE_KEY },
      ]);
    }

    return handle;
  }

  private resolveSignerNameFromToken(
    session: pkcs11js.Handle,
    privateKey: pkcs11js.Handle,
  ): string {
    const keyId = this.getAttributeValue(session, privateKey, pkcs11js.CKA_ID);

    const certificateTemplate: pkcs11js.Template = [
      { type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_CERTIFICATE },
    ];
    if (keyId) {
      certificateTemplate.push({ type: pkcs11js.CKA_ID, value: keyId });
    }

    let certHandle = this.findSingleObject(session, certificateTemplate);
    if (!certHandle) {
      certHandle = this.findSingleObject(session, [
        { type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_CERTIFICATE },
      ]);
    }

    if (!certHandle) {
      return 'Hypersecu Token User';
    }

    const certDer = this.getAttributeValue(
      session,
      certHandle,
      pkcs11js.CKA_VALUE,
    );
    const certLabel = this.getAttributeValue(
      session,
      certHandle,
      pkcs11js.CKA_LABEL,
    )
      ?.toString('utf8')
      .trim();

    if (!certDer) {
      return certLabel || 'Hypersecu Token User';
    }

    // Store certificate for later use in PDF signing
    this.certificateDer = certDer;

    try {
      const certAsn1 = forge.asn1.fromDer(certDer.toString('binary'));
      const cert = forge.pki.certificateFromAsn1(certAsn1);
      const commonName = cert.subject.getField('CN')?.value;
      if (commonName) {
        return commonName;
      }

      const subjectDn = cert.subject.attributes
        .map((attr) => `${attr.shortName || attr.name}=${attr.value}`)
        .join(', ');

      return subjectDn || certLabel || 'Hypersecu Token User';
    } catch {
      return certLabel || 'Hypersecu Token User';
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  /**
   * Sign a hash string (hex format)
   * Used for pre-computed hashes
   */
  signHash(hashHex: string): string {
    const session = this.pkcs11Session;
    const privateKey = this.pkcs11PrivateKey;
    const pkcs11 = this.requirePkcs11();

    if (!session || !privateKey) {
      throw new Error('PKCS#11 session is not ready for signing');
    }

    const hashBytes = Buffer.from(hashHex, 'hex');

    pkcs11.C_SignInit(
      session,
      { mechanism: pkcs11js.CKM_SHA256_RSA_PKCS },
      privateKey,
    );

    const signature = pkcs11.C_Sign(session, hashBytes, Buffer.alloc(4096));
    return signature.toString('base64');
  }
}
