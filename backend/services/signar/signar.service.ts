import { Injectable, Logger } from '@nestjs/common';
import * as pkcs11 from 'pkcs11js';

export interface PKCSConfig {
  libraryPath: string;
  slotId: number;
  pin: string;
}

@Injectable()
export class SignarService {
  private logger = new Logger('SignarService');
  private pkcs11Module: any;
  private session: any;
  private config: PKCSConfig;

  async initialize(config: PKCSConfig): Promise<void> {
    try {
      this.config = config;
      this.pkcs11Module = new pkcs11.PKCS11();
      this.pkcs11Module.load(config.libraryPath);
      this.logger.log(`PKCS#11 module loaded from: ${config.libraryPath}`);
    } catch (error) {
      this.logger.error(`Failed to initialize PKCS#11: ${error.message}`);
      throw error;
    }
  }

  async openSession(): Promise<void> {
    try {
      this.pkcs11Module.C_Initialize();
      this.session = this.pkcs11Module.C_OpenSession(
        this.config.slotId,
        pkcs11.CKF_SERIAL_SESSION | pkcs11.CKF_RW_SESSION,
      );
      this.pkcs11Module.C_Login(this.session, pkcs11.CKU_USER, this.config.pin);
      this.logger.log('PKCS#11 session opened and logged in');
    } catch (error) {
      this.logger.error(`Failed to open session: ${error.message}`);
      throw error;
    }
  }

  async closeSession(): Promise<void> {
    try {
      if (this.session) {
        this.pkcs11Module.C_Logout(this.session);
        this.pkcs11Module.C_CloseSession(this.session);
        this.pkcs11Module.C_Finalize();
        this.logger.log('PKCS#11 session closed');
      }
    } catch (error) {
      this.logger.error(`Failed to close session: ${error.message}`);
    }
  }

  async getSigningCertificate(): Promise<Buffer> {
    try {
      const fontemplates = [
        { type: pkcs11.CKA_CLASS, value: pkcs11.CKO_CERTIFICATE },
      ];
      const objects = this.pkcs11Module.C_FindObjectsInit(
        this.session,
        fontemplates,
      );
      const certificates = this.pkcs11Module.C_FindObjects(
        this.session,
        objects,
        10,
      );
      this.pkcs11Module.C_FindObjectsFinal(this.session, objects);

      if (certificates.length === 0) {
        throw new Error('No certificates found on token');
      }

      const certObject = certificates[0];
      const certData = this.pkcs11Module.C_GetAttributeValue(
        this.session,
        certObject,
        [{ type: pkcs11.CKA_VALUE }],
      );

      return Buffer.from(certData[0].value);
    } catch (error) {
      this.logger.error(`Failed to get certificate: ${error.message}`);
      throw error;
    }
  }

  async signData(data: Buffer): Promise<Buffer> {
    try {
      const keyTemplate = [
        { type: pkcs11.CKA_CLASS, value: pkcs11.CKO_PRIVATE_KEY },
      ];
      const objects = this.pkcs11Module.C_FindObjectsInit(
        this.session,
        keyTemplate,
      );
      const keys = this.pkcs11Module.C_FindObjects(this.session, objects, 10);
      this.pkcs11Module.C_FindObjectsFinal(this.session, objects);

      if (keys.length === 0) {
        throw new Error('No private key found on token');
      }

      const mechanism = { mechanism: pkcs11.CKM_SHA256_RSA_PKCS };
      this.pkcs11Module.C_SignInit(this.session, mechanism, keys[0]);
      const signedData = this.pkcs11Module.C_SignFinal(this.session, data);

      return Buffer.from(signedData);
    } catch (error) {
      this.logger.error(`Failed to sign data: ${error.message}`);
      throw error;
    }
  }
}
