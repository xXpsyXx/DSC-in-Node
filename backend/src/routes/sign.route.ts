import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  signHandler,
  verifyHandler,
  certStatusHandler,
  getSupportedDriversHandler,
  autoDetectTokenHandler,
} from '../controllers/sign.controller';
import { verifyRequestSignature } from '../middleware/request-signer.middleware';

/**
 * Get request signer secret from environment configuration.
 * Returns the shared secret used to validate request signatures from frontend.
 * @access private
 * @returns {string | undefined} The request signer secret or undefined
 * @since 1.0.0
 */
const getRequestSignerSecret = (): string | undefined => {
  return process.env.REQUEST_SIGNER_SECRET;
};

/**
 * Get request signature verification tolerance from environment.
 * Specifies how long a request signature remains valid (in milliseconds).
 * @access private
 * @returns {number} Tolerance in milliseconds (default: 300000 = 5 minutes)
 * @since 1.0.0
 */
const getRequestSignerTolerance = (): number => {
  return parseInt(process.env.REQUEST_SIGNER_TOLERANCE || '300000', 10);
};

/**
 * Validate that request signer is properly configured.
 * Logs a warning if the secret is missing or not changed from default.
 * @access private
 * @param {string | undefined} secret The request signer secret
 * @returns {void}
 * @since 1.0.0
 */
const validateRequestSignerConfiguration = (
  secret: string | undefined,
): void => {
  if (!secret || secret.includes('change-this')) {
    console.warn(
      '[sign.route] ⚠️ REQUEST_SIGNER_SECRET not configured - /sign endpoint is UNPROTECTED',
    );
  }
};

/**
 * Create request signature verification middleware.
 * Returns middleware that verifies request signatures or logs a warning if secret is not configured.
 * @access private
 * @param {string | undefined} secret The request signer secret
 * @param {number} tolerance The verification tolerance in milliseconds
 * @returns {Function} Express middleware function
 * @since 1.0.0
 */
const createRequestSignerMiddleware = (
  secret: string | undefined,
  tolerance: number,
): ((req: any, res: any, next: any) => void) => {
  if (secret) {
    return verifyRequestSignature(secret, tolerance);
  }

  return (req: any, res: any, next: any) => {
    console.warn(
      '[sign.route] ⚠️ Skipping request verification - REQUEST_SIGNER_SECRET not configured',
    );
    next();
  };
};

/**
 * Create and configure the sign API router.
 * Registers all signing-related endpoints with appropriate middleware and handlers.
 * @access private
 * @returns {Router} Configured Express router
 * @since 1.0.0
 */
const createSignRouter = (): Router => {
  const router = Router();

  // Get configuration
  const requestSignerSecret = getRequestSignerSecret();
  const requestSignerTolerance = getRequestSignerTolerance();

  // Validate configuration
  validateRequestSignerConfiguration(requestSignerSecret);

  // Create middleware
  const requestSignerMiddleware = createRequestSignerMiddleware(
    requestSignerSecret,
    requestSignerTolerance,
  );

  // Register endpoints
  router.post('/sign', requestSignerMiddleware, signHandler);
  router.post('/verify', verifyHandler);
  router.post('/cert-status', certStatusHandler);
  router.get('/supported-drivers', getSupportedDriversHandler);
  router.get('/auto-detect-token', autoDetectTokenHandler);

  return router;
};

const router = createSignRouter();

export default router;
