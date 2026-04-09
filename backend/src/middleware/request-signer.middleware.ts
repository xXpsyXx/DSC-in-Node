import type { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

/**
 * Request signing middleware - Verifies that requests come from authorized frontend.
 *
 * STEP 1 - Frontend signs the request:
 *   const signature = HMAC-SHA256(
 *     sharedSecret,
 *     method + '\n' + path + '\n' + timestamp
 *   )
 *
 * STEP 2 - Frontend sends headers:
 *   X-Request-Signature: <HMAC hex>
 *   X-Request-Timestamp: <timestamp>
 *
 * STEP 3 - Backend verifies signature and timestamp freshness
 */
export interface RequestSignaturePayload {
  method: string;
  path: string;
  timestamp: number;
  signature: string;
}

export const verifyRequestSignature = (
  sharedSecret: string,
  tolerance: number = 300000, // 5 minutes in milliseconds
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const signature = req.headers['x-request-signature'] as
        | string
        | undefined;
      const timestampStr = req.headers['x-request-timestamp'] as
        | string
        | undefined;

      if (!signature || !timestampStr) {
        console.warn('[RequestSigner] Missing signature or timestamp headers');
        return res.status(401).json({
          error: 'Unauthorized',
          message:
            'Missing X-Request-Signature or X-Request-Timestamp header. Frontend must sign the request.',
        });
      }

      const timestamp = parseInt(timestampStr, 10);
      if (Number.isNaN(timestamp)) {
        console.warn('[RequestSigner] Invalid timestamp format');
        return res.status(400).json({
          error: 'Bad Request',
          message: 'X-Request-Timestamp must be a valid number',
        });
      }

      // Check timestamp freshness (prevent replay attacks)
      const now = Date.now();
      const timeDiff = Math.abs(now - timestamp);
      if (timeDiff > tolerance) {
        console.warn(
          `[RequestSigner] Timestamp outside tolerance window: ${timeDiff}ms (tolerance: ${tolerance}ms)`,
        );
        return res.status(401).json({
          error: 'Unauthorized',
          message: `Request timestamp too old (${Math.round(timeDiff / 1000)}s). Re-sign with current timestamp.`,
        });
      }

      // Reconstruct the signed message
      const signedMessage = `${req.method}\n${req.path}\n${timestamp}`;

      // Compute expected HMAC
      const expectedSignature = crypto
        .createHmac('sha256', sharedSecret)
        .update(signedMessage)
        .digest('hex');

      // Constant-time comparison to prevent timing attacks
      const signatureBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');

      if (
        signatureBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
      ) {
        console.warn('[RequestSigner] Signature verification failed');
        return res.status(401).json({
          error: 'Unauthorized',
          message:
            'Invalid request signature. Request must be signed by authorized frontend.',
        });
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
 * Helper: Generate signature for testing/debugging
 * Usage: node -e "console.log(generateRequestSignature('secret', 'POST', '/sign', Date.now()))"
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
