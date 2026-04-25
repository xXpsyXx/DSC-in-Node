/**
 * Error Message Detection Utilities
 */

exports.isPinErrorMessage = (errorMsg) => {
  return /(PKCS12|password|MAC|CKR_PIN_INCORRECT|CKR_PIN_INVALID|CKR_PIN_LOCKED|CKR_USER_PIN_NOT_INITIALIZED)/i.test(
    errorMsg,
  );
};

exports.isPkcs11DriverErrorMessage = (errorMsg) => {
  return /(library not configured|PKCS11_LIBRARY_PATH|PKCS11_LIBRARY_PATH_WINDOWS|module could not be found|cannot find module|MODULE_NOT_FOUND|ENOENT|DLL|driver|failed to load|cryptoki)/i.test(
    errorMsg,
  );
};

exports.isUsbTokenMissingErrorMessage = (errorMsg) => {
  return /(USB token not detected|No USB token detected|No token|CKR_TOKEN_NOT_PRESENT|CKR_DEVICE_REMOVED|CKR_SLOT_ID_INVALID|token slot|No token slot available)/i.test(
    errorMsg,
  );
};

exports.isUsbTokenErrorMessage = (errorMsg) => {
  return /(USB token|PKCS#11|No token|CKR_TOKEN_NOT_PRESENT|CKR_DEVICE_REMOVED|CKR_SLOT_ID_INVALID|token slot|certificate unavailable|No signing key)/i.test(
    errorMsg,
  );
};

exports.getHardwareErrorResponse = (errorMsg) => {
  if (exports.isPkcs11DriverErrorMessage(errorMsg)) {
    return {
      status: 500,
      body: {
        code: 'PKCS11_DRIVER_MISSING',
        error:
          'USB token driver is missing or PKCS#11 library is not configured. Install Hypersecu driver and set PKCS11_LIBRARY_PATH.',
      },
    };
  }

  if (
    exports.isUsbTokenMissingErrorMessage(errorMsg) ||
    exports.isUsbTokenErrorMessage(errorMsg)
  ) {
    return {
      status: 503,
      body: {
        code: 'TOKEN_NOT_INSERTED',
        error:
          'USB token not detected. Please insert Hypersecu USB token and try again.',
      },
    };
  }

  return null;
};
