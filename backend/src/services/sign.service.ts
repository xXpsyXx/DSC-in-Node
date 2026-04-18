import * as os from 'os';
import * as forge from 'node-forge';
import * as pkcs11js from 'pkcs11js';

/**
 * SignerService - PKCS#11 USB Token Signing Service
 * Manages communication with USB security tokens (Hypersecu ePass3000, etc.) for digital signing.
 * Handles certificate validation, token initialization, and signature generation.
 * @class SignerService
 * @since 1.0.0
 * @author PDFSignatureApp
 */
export class SignerService {
  private signerName: string;
  private pkcs11: pkcs11js.PKCS11 | null;
  private pkcs11Session: pkcs11js.Handle | null;
  private pkcs11Slot: pkcs11js.Handle | null;
  private pkcs11PrivateKey: pkcs11js.Handle | null;
  private certificateDer: Buffer | null;
  private closed: boolean;
  private customDriverPath: string | undefined;

  /**
   * Initialize the Signer Service with PIN and optional custom driver path.
   * Establishes PKCS#11 connection to USB token and validates authentication.
   * @access public
   * @constructor
   * @param {string} pin The PIN code for USB token authentication
   * @param {string | undefined} customDriverPath Optional path to custom PKCS#11 driver DLL/SO
   * @throws {Error} If token not detected or PIN is invalid
   * @since 1.0.0
   */
  constructor(pin: string, customDriverPath?: string) {
    this.signerName = 'Unknown Signer';
    this.pkcs11 = null;
    this.pkcs11Session = null;
    this.pkcs11Slot = null;
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

  /**
   * Get the signer's name from the certificate subject.
   * Extracted from the Common Name (CN) field of the certificate.
   * @access public
   * @returns {string} The signer's name
   * @since 1.0.0
   */
  getSignerName(): string {
    return this.signerName;
  }

  /**
   * Get the DER-encoded certificate from the USB token.
   * Used for signature verification and metadata embedding.
   * @access public
   * @returns {Buffer | null} The certificate in DER format or null if not available
   * @since 1.0.0
   */
  getCertificateDer(): Buffer | null {
    return this.certificateDer;
  }

  /**
   * Get the PEM-encoded certificate from the USB token.
   * Converts DER to PEM (text) format for interoperability.
   * @access public
   * @returns {string | null} The certificate in PEM format or null if not available
   * @since 1.0.0
   */
  getCertificatePem(): string | null {
    if (!this.certificateDer) {
      return null;
    }
    const cert = forge.pki.certificateFromAsn1(
      forge.asn1.fromDer(this.certificateDer.toString('binary')),
    );
    return forge.pki.certificateToPem(cert);
  }

  /**
   * Check certificate expiration status and validity window.
   * Categorizes certificate status as expired, critical (< 10 days), warning (< 30 days), or valid.
   * @access public
   * @returns {object} Certificate status object with status, daysRemaining, expiryDate, and message
   * @returns {string} returns.status One of: 'expired', 'critical', 'warning', 'valid'
   * @returns {number} returns.daysRemaining Days until expiration (negative if expired)
   * @returns {Date} returns.expiryDate The certificate expiration date
   * @returns {string} returns.message Human-readable status message
   * @since 1.0.0
   */
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
    } else if (daysRemaining < 10) {
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

  /**
   * Close PKCS#11 session and clean up resources.
   * Logs out from the token, closes the session, and finalizes the PKCS#11 library.
   * Safe to call multiple times (idempotent).
   * @access public
   * @returns {void}
   * @since 1.0.0
   */
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

  /**
   * Initialize PKCS#11 library connection and authenticate with PIN.
   * Loads the PKCS#11 driver, opens a session, and logs in with the provided PIN.
   * @access private
   * @param {string} libraryPath Path to the PKCS#11 driver library (DLL or SO file)
   * @param {string} pin The PIN code for authentication
   * @returns {void}
   * @throws {Error} If initialization or authentication fails
   * @since 1.0.0
   */
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
      this.pkcs11Slot = slot;
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

  /**
   * Resolve PKCS#11 library path from environment variables or custom path.
   * Checks custom driver path first, then environment variables based on OS platform.
   * @access private
   * @returns {string | null} The resolved library path or null if not configured
   * @since 1.0.0
   */
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

  /**
   * Get list of supported USB token drivers for the current platform.
   * Returns driver names, paths, and enabled status for each driver.
   * @access public static
   * @returns {Array<object>} Array of driver objects with name, path, and enabled properties
   * @since 1.0.0
   */
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

  /**
   * Auto-detect connected USB token and return driver information.
   * Iterates through supported drivers and attempts to initialize each one.
   * Returns the first driver that successfully detects a token.
   * @access public static
   * @returns {object | null} Driver info object with driverPath and driverName, or null if no token detected
   * @returns {string} returns.driverPath Path to the detected driver
   * @returns {string} returns.driverName Name of the detected driver
   * @since 1.0.0
   */
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

  /**
   * Select a token slot from available slots.
   * Uses PKCS11_SLOT_INDEX environment variable if set, otherwise defaults to first slot.
   * @access private
   * @param {pkcs11js.Handle[]} slots Array of available token slots
   * @returns {pkcs11js.Handle} The selected slot handle
   * @throws {Error} If invalid slot index or no slots available
   * @since 1.0.0
   */
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

  /**
   * Get PKCS#11 instance and throw if not initialized.
   * Guard method to ensure PKCS#11 is properly initialized before use.
   * @access private
   * @returns {pkcs11js.PKCS11} The PKCS#11 instance
   * @throws {Error} If PKCS#11 is not initialized
   * @since 1.0.0
   */
  private requirePkcs11(): pkcs11js.PKCS11 {
    if (!this.pkcs11) {
      throw new Error('PKCS#11 is not initialized');
    }
    return this.pkcs11;
  }

  /**
   * Find a single PKCS#11 object matching the given template.
   * Returns the first matching object handle or null if not found.
   * @access private
   * @param {pkcs11js.Handle} session The PKCS#11 session handle
   * @param {pkcs11js.Template} template The search template with attribute criteria
   * @returns {pkcs11js.Handle | null} The object handle or null if not found
   * @since 1.0.0
   */
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

  /**
   * Get attribute value from a PKCS#11 object.
   * Retrieves a specific attribute (like label, ID, value) from a token object.
   * @access private
   * @param {pkcs11js.Handle} session The PKCS#11 session handle
   * @param {pkcs11js.Handle} objectHandle Handle to the target object
   * @param {number} attributeType The CKA attribute type to retrieve
   * @returns {Buffer | null} The attribute value as buffer or null if not found
   * @since 1.0.0
   */
  private getAttributeValue(
    session: pkcs11js.Handle,
    objectHandle: pkcs11js.Handle,
    attributeType: number,
  ): Buffer | null {
    const pkcs11 = this.requirePkcs11();
    const attrs = pkcs11.C_GetAttributeValue(session, objectHandle, [
      { type: attributeType },
    ]);
    const matched = attrs.find(
      (attr: { type: number }) => attr.type === attributeType,
    );
    if (!matched) {
      return null;
    }
    return matched.value;
  }

  /**
   * Find private key on USB token.
   * Searches for the signing key using label or ID from environment variables.
   * Falls back to first private key if specific key not found.
   * @access private
   * @param {pkcs11js.Handle} session The PKCS#11 session handle
   * @returns {pkcs11js.Handle | null} The private key handle or null if not found
   * @since 1.0.0
   */
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

  /**
   * Extract signer name from certificate on USB token.
   * Retrieves the Common Name (CN) field from the certificate.
   * Falls back to certificate label or default name if CN not available.
   * @access private
   * @param {pkcs11js.Handle} session The PKCS#11 session handle
   * @param {pkcs11js.Handle} privateKey Handle to the private key
   * @returns {string} The signer name extracted from certificate
   * @since 1.0.0
   */
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

  /**
   * Extract error message from unknown error type.
   * Handles both Error objects and generic values for consistent error reporting.
   * @access private
   * @param {unknown} error The error object or value
   * @returns {string} The error message as string
   * @since 1.0.0
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  /**
   * Require that a slot was initialized.
   */
  private requireSlot(): pkcs11js.Handle {
    if (!this.pkcs11Slot) {
      throw new Error('PKCS#11 slot is not initialized');
    }
    return this.pkcs11Slot;
  }

  /**
   * Normalize attribute values returned by PKCS#11 (Buffer or string)
   */
  private normalizeAttrValue(value: any): string | undefined {
    if (value === null || value === undefined) return undefined;
    if (Buffer.isBuffer(value)) return value.toString('utf8').trim();
    return String(value).trim();
  }

  /**
   * Read basic token information from the connected slot.
   * Returns label, manufacturerId, model and serialNumber where available.
   */
  public getTokenInfo(): {
    label?: string;
    manufacturerId?: string;
    model?: string;
    serialNumber?: string;
  } {
    const pkcs11 = this.requirePkcs11();
    const slot = this.requireSlot();

    try {
      // C_GetTokenInfo may return an object with Buffer/string fields
      const info: any = pkcs11.C_GetTokenInfo(slot);
      return {
        label:
          this.normalizeAttrValue(info.label) ||
          this.normalizeAttrValue(info.manufacturerID) ||
          this.normalizeAttrValue(info.tokenLabel),
        manufacturerId:
          this.normalizeAttrValue(info.manufacturerID) ||
          this.normalizeAttrValue(info.manufacturerId),
        model: this.normalizeAttrValue(info.model),
        serialNumber: this.normalizeAttrValue(info.serialNumber),
      };
    } catch (error) {
      return {};
    }
  }

  /**
   * Return parsed certificate details (owner common name, serial number and expiry date).
   */
  public getCertificateDetails(): {
    ownerName: string | null;
    serialNumber: string | null;
    expiryDate: Date | null;
  } {
    if (!this.certificateDer) {
      return { ownerName: null, serialNumber: null, expiryDate: null };
    }

    try {
      const certAsn1 = forge.asn1.fromDer(
        this.certificateDer.toString('binary'),
      );
      const cert = forge.pki.certificateFromAsn1(certAsn1);
      const commonName = cert.subject.getField('CN')?.value || null;
      const serialNumber = cert.serialNumber || null;
      const expiryDate = cert.validity?.notAfter
        ? cert.validity.notAfter
        : null;
      return { ownerName: commonName, serialNumber, expiryDate };
    } catch (err) {
      return { ownerName: null, serialNumber: null, expiryDate: null };
    }
  }

  /**
   * Sign a pre-computed hash using the USB token's private key.
   * Performs RSA signing with SHA256 algorithm and returns base64 signature.
   * @access public
   * @param {string} hashHex The SHA256 hash in hexadecimal format
   * @returns {string} The RSA signature in base64 format
   * @throws {Error} If signing operation fails or session not ready
   * @since 1.0.0
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
