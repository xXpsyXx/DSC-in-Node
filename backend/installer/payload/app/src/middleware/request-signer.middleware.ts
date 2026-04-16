import type { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

/**
 * Interface for request signature payload information.
 * Represents the data structure for a signed request.
 * @since 1.0.0
 */
export interface RequestSignaturePayload {
  method: string;
  path: string;
  timestamp: number;
  signature: string;
}

/**
 * Extract signature and timestamp from request headers.
 * Retrieves the HMAC signature and timestamp from X-Request-Signature and X-Request-Timestamp headers.
 * @access private
 * @param {Request} req Express request object
 * @returns {{signature: string | undefined, timestampStr: string | undefined}} Extracted values
 * @since 1.0.0
 */
const extractSignatureHeaders = (
  req: Request,
): { signature: string | undefined; timestampStr: string | undefined } => {
  return {
    signature: req.headers['x-request-signature'] as string | undefined,
    timestampStr: req.headers['x-request-timestamp'] as string | undefined,
  };
};

/**
 * Validate that required signature headers are present.
 * Checks if both signature and timestamp headers exist and are provided.
 * @access private
 * @param {string | undefined} signature The request signature value
 * @param {string | undefined} timestampStr The request timestamp value
 * @returns {{valid: boolean, errorMsg?: string}} Validation result
 * @since 1.0.0
 */
const validateHeadersPresent = (
  signature: string | undefined,
  timestampStr: string | undefined,
): { valid: boolean; errorMsg?: string } => {
  if (!signature || !timestampStr) {
    console.warn('[RequestSigner] Missing signature or timestamp headers');
    return {
      valid: false,
      errorMsg:
        'Missing X-Request-Signature or X-Request-Timestamp header. Frontend must sign the request.',
    };
  }
  return { valid: true };
};

/**
 * Parse and validate the timestamp value.
 * Converts timestamp string to number and validates it's in correct format.
 * @access private
 * @param {string} timestampStr The timestamp string to parse
 * @returns {{timestamp: number | null, errorMsg?: string}} Parsed timestamp and validation result
 * @since 1.0.0
 */
const parseAndValidateTimestamp = (
  timestampStr: string,
): { timestamp: number | null; errorMsg?: string } => {
  const timestamp = parseInt(timestampStr, 10);
  if (Number.isNaN(timestamp)) {
    console.warn('[RequestSigner] Invalid timestamp format');
    return {
      timestamp: null,
      errorMsg: 'X-Request-Timestamp must be a valid number',
    };
  }
  return { timestamp };
};

/**
 * Verify that request timestamp is within acceptable time window.
 * Prevents replay attacks by rejecting old requests outside the tolerance period.
 * @access private
 * @param {number} timestamp The request timestamp in milliseconds
 * @param {number} tolerance The maximum age in milliseconds (default: 5 minutes)
 * @returns {{valid: boolean, errorMsg?: string}} Timestamp freshness validation result
 * @since 1.0.0
 */
const validateTimestampFreshness = (
  timestamp: number,
  tolerance: number,
): { valid: boolean; errorMsg?: string } => {
  const now = Date.now();
  const timeDiff = Math.abs(now - timestamp);

  if (timeDiff > tolerance) {
    console.warn(
      `[RequestSigner] Timestamp outside tolerance window: ${timeDiff}ms (tolerance: ${tolerance}ms)`,
    );
    return {
      valid: false,
      errorMsg: `Request timestamp too old (${Math.round(timeDiff / 1000)}s). Re-sign with current timestamp.`,
    };
  }

  return { valid: true };
};

/**
 * Reconstruct the original signed message from request data.
 * Builds the exact message that should have been signed: "METHOD\nPATH\nTIMESTAMP".
 * @access private
 * @param {string} method HTTP method (GET, POST, etc.)
 * @param {string} path Request path (e.g., /api/sign)
 * @param {number} timestamp Request timestamp in milliseconds
 * @returns {string} The message that should have been signed
 * @since 1.0.0
 */
const reconstructSignedMessage = (
  method: string,
  path: string,
  timestamp: number,
): string => {
  return `${method}\n${path}\n${timestamp}`;
};

/**
 * Compute the expected HMAC-SHA256 signature for the request.
 * Calculates what the signature should be based on the shared secret and message.
 * @access private
 * @param {string} sharedSecret The HMAC secret shared between frontend and backend
 * @param {string} message The message to sign
 * @returns {string} The computed HMAC signature in hex format
 * @since 1.0.0
 */
const computeExpectedSignature = (
  sharedSecret: string,
  message: string,
): string => {
  return crypto
    .createHmac('sha256', sharedSecret)
    .update(message)
    .digest('hex');
};

/**
 * Perform constant-time comparison of two signatures.
 * Prevents timing attacks by comparing signatures in constant time.
 * @access private
 * @param {string} receivedSignature The signature from the request
 * @param {string} expectedSignature The computed expected signature
 * @returns {{valid: boolean, errorMsg?: string}} Comparison result
 * @since 1.0.0
 */
const compareSignaturesConstantTime = (
  receivedSignature: string,
  expectedSignature: string,
): { valid: boolean; errorMsg?: string } => {
  const signatureBuffer = Buffer.from(receivedSignature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    console.warn('[RequestSigner] Signature verification failed');
    return {
      valid: false,
      errorMsg:
        'Invalid request signature. Request must be signed by authorized frontend.',
    };
  }

  return { valid: true };
};

/**
 * Send an unauthorized response with error details.
 * Returns 401 status with JSON error message.
 * @access private
 * @param {Response} res Express response object
 * @param {string} errorMsg The error message to send
 * @returns {Response} The response object with error
 * @since 1.0.0
 */
const sendUnauthorizedResponse = (
  res: Response,
  errorMsg: string,
): Response => {
  return res.status(401).json({
    error: 'Unauthorized',
    message: errorMsg,
  });
};

/**
 * Send a bad request response with error details.
 * Returns 400 status with JSON error message for invalid input.
 * @access private
 * @param {Response} res Express response object
 * @param {string} errorMsg The error message to send
 * @returns {Response} The response object with error
 * @since 1.0.0
 */
const sendBadRequestResponse = (res: Response, errorMsg: string): Response => {
  return res.status(400).json({
    error: 'Bad Request',
    message: errorMsg,
  });
};

/**
 * Verify that requests come from authorized frontend.
 * Middleware that validates request signatures using HMAC-SHA256.
 * Prevents unauthorized API calls and replay attacks.
 *
 * Frontend sign flow:
 *   1. Create signed message: "METHOD\nPATH\nTIMESTAMP"
 *   2. Compute HMAC: crypto.subtle.sign('HMAC', key, message)
 *   3. Send headers: X-Request-Signature + X-Request-Timestamp
 *
 * Backend verify flow:
 *   1. Extract headers from request
 *   2. Validate timestamp freshness (prevent replay)
 *   3. Reconstruct signed message
 *   4. Compute expected HMAC
 *   5. Constant-time comparison
 *
 * @access public
 * @param {string} sharedSecret The HMAC secret shared between frontend and backend
 * @param {number} tolerance The maximum request age in milliseconds (default: 300000 = 5 min)
 * @returns {Function} Express middleware function
 * @since 1.0.0
 * @author PDFSignatureApp
 */
export const verifyRequestSignature = (
  sharedSecret: string,
  tolerance: number = 300000, // 5 minutes in milliseconds
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract headers
      const { signature, timestampStr } = extractSignatureHeaders(req);

      // Validate headers present
      const headersValid = validateHeadersPresent(signature, timestampStr);
      if (!headersValid.valid) {
        return sendUnauthorizedResponse(res, headersValid.errorMsg!);
      }

      // Parse and validate timestamp
      const timestampResult = parseAndValidateTimestamp(timestampStr!);
      if (timestampResult.errorMsg) {
        return sendBadRequestResponse(res, timestampResult.errorMsg);
      }

      const timestamp = timestampResult.timestamp!;

      // Validate timestamp freshness
      const freshnessValid = validateTimestampFreshness(timestamp, tolerance);
      if (!freshnessValid.valid) {
        return sendUnauthorizedResponse(res, freshnessValid.errorMsg!);
      }

      // Reconstruct signed message
      const signedMessage = reconstructSignedMessage(
        req.method,
        req.path,
        timestamp,
      );

      // Compute expected signature
      const expectedSignature = computeExpectedSignature(
        sharedSecret,
        signedMessage,
      );

      // Compare signatures with constant-time comparison
      const signatureValid = compareSignaturesConstantTime(
        signature!,
        expectedSignature,
      );
      if (!signatureValid.valid) {
        return sendUnauthorizedResponse(res, signatureValid.errorMsg!);
      }

      console.log(
        `[RequestSigner] ✓ Request signature verified for ${req.method} ${req.path}`,
      );
      next();
    } catch (error) {
      console.error('[RequestSigner] Error verifying signature:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to verify request signature',
      });
    }
  };
};

/**
 * Generate request signature for testing and debugging purposes.
 * Creates an HMAC-SHA256 signature that can be manually computed for verifying the middleware.
 *
 * Usage: node -e "console.log(generateRequestSignature('secret', 'POST', '/sign', Date.now()))"
 * @access public
 * @param {string} sharedSecret The HMAC secret shared between frontend and backend
 * @param {string} method HTTP method (GET, POST, etc.)
 * @param {string} path Request path (e.g., /api/sign)
 * @param {number} timestamp Request timestamp in milliseconds
 * @returns {string} The computed HMAC-SHA256 signature in hex format
 * @since 1.0.0
 * @author PDFSignatureApp
 */
export function generateRequestSignature(
  sharedSecret: string,
  method: string,
  path: string,
  timestamp: number,
): string {
  const signedMessage = `${method}\n${path}\n${timestamp}`;
  return crypto
    .createHmac('sha256', sharedSecret)
    .update(signedMessage)
    .digest('hex');
}
