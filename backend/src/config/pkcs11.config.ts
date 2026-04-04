import { Injectable, Logger } from '@nestjs/common';
import * as os from 'os';

@Injectable()
export class Pkcs11ConfigService {
  private logger = new Logger('Pkcs11ConfigService');

  getLibraryPath(): string {
    const platform = os.platform();
    let libPath: string;

    if (platform === 'linux') {
      libPath =
        process.env.PKCS11_LIBRARY_PATH_LINUX ||
        '/opt/hypersecu/lib/libpkcs11.so';
    } else if (platform === 'win32') {
      libPath =
        process.env.PKCS11_LIBRARY_PATH_WINDOWS ||
        'C:\\Program Files\\HyperSecu\\lib\\eToken.dll';
    } else if (platform === 'darwin') {
      libPath =
        process.env.PKCS11_LIBRARY_PATH_DARWIN ||
        '/usr/local/lib/libpkcs11.dylib';
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    this.logger.log(`Using PKCS#11 library: ${libPath}`);
    return libPath;
  }

  getConfig() {
    return {
      libraryPath: this.getLibraryPath(),
      slotId: parseInt(process.env.PKCS11_SLOT_ID || '0'),
      pin: process.env.PKCS11_PIN,
    };
  }
}
