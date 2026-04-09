/**
 * Error Message Detection Utilities
 * Handles USB token, driver, and PIN-related error detection.
 * @module error-handlers
 * @since 1.0.0
 */

/**
 * Check if error message indicates a PIN/password issue.
 * Detects PKCS#12 and PKCS#11 PIN-related errors.
 * @access public
 * @param {string} errorMsg The error message to check
 * @returns {boolean} True if error is PIN-related
 * @since 1.0.0
 */
export const isPinErrorMessage = (errorMsg: string): boolean => {
  return /(PKCS12|password|MAC|CKR_PIN_INCORRECT|CKR_PIN_INVALID|CKR_PIN_LOCKED|CKR_USER_PIN_NOT_INITIALIZED)/i.test(
    errorMsg,
  );
};

/**
 * Check if error message indicates PKCS#11 driver is missing or not configured.
 * Detects driver loading and configuration errors.
 * @access public
 * @param {string} errorMsg The error message to check
 * @returns {boolean} True if error is driver-related
 * @since 1.0.0
 */
export const isPkcs11DriverErrorMessage = (errorMsg: string): boolean => {
  return /(library not configured|PKCS11_LIBRARY_PATH|PKCS11_LIBRARY_PATH_WINDOWS|module could not be found|cannot find module|MODULE_NOT_FOUND|ENOENT|DLL|driver|failed to load|cryptoki)/i.test(
    errorMsg,
  );
};

/**
 * Check if error message indicates USB token is not inserted.
 * Detects token absence or slot errors.
 * @access public
 * @param {string} errorMsg The error message to check
 * @returns {boolean} True if error indicates missing token
 * @since 1.0.0
 */
export const isUsbTokenMissingErrorMessage = (errorMsg: string): boolean => {
  return /(USB token not detected|No USB token detected|No token|CKR_TOKEN_NOT_PRESENT|CKR_DEVICE_REMOVED|CKR_SLOT_ID_INVALID|token slot|No token slot available)/i.test(
    errorMsg,
  );
};

/**
 * Check if error message indicates a USB token or PKCS#11 related error.
 * Generic token/PKCS#11 error detection.
 * @access public
 * @param {string} errorMsg The error message to check
 * @returns {boolean} True if error is token-related
 * @since 1.0.0
 */
export const isUsbTokenErrorMessage = (errorMsg: string): boolean => {
  return /(USB token|PKCS#11|No token|CKR_TOKEN_NOT_PRESENT|CKR_DEVICE_REMOVED|CKR_SLOT_ID_INVALID|token slot|certificate unavailable|No signing key)/i.test(
    errorMsg,
  );
};

/**
 * Convert hardware-related error messages to HTTP responses.
 * Normalizes token/driver failures into actionable API errors.
 * @access public
 * @param {string} errorMsg The error message to analyze
 * @returns {object | null} HTTP response with status and error body, or null if not a hardware error
 * @since 1.0.0
 */
export const getHardwareErrorResponse = (
  errorMsg: string,
): { status: number; body: { code: string; error: string } } | null => {
  if (isPkcs11DriverErrorMessage(errorMsg)) {
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
    isUsbTokenMissingErrorMessage(errorMsg) ||
    isUsbTokenErrorMessage(errorMsg)
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
