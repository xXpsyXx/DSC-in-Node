import { Router } from 'express';
import {
  signHandler,
  verifyHandler,
  certStatusHandler,
  getSupportedDriversHandler,
  autoDetectTokenHandler,
} from '../controllers/sign.controller.ts';
import { verifyRequestSignature } from '../middleware/request-signer.middleware.ts';

const router = Router();

// Get request signer secret from environment
const REQUEST_SIGNER_SECRET = process.env.REQUEST_SIGNER_SECRET;
const REQUEST_SIGNER_TOLERANCE = parseInt(
  process.env.REQUEST_SIGNER_TOLERANCE || '300000',
  10,
);

if (!REQUEST_SIGNER_SECRET || REQUEST_SIGNER_SECRET.includes('change-this')) {
  console.warn(
    '[sign.route] ⚠️ REQUEST_SIGNER_SECRET not configured - /sign endpoint is UNPROTECTED',
  );
}

// Apply request signature verification to /sign endpoint (REQUIRED for security)
const requestSignerMiddleware = REQUEST_SIGNER_SECRET
  ? verifyRequestSignature(REQUEST_SIGNER_SECRET, REQUEST_SIGNER_TOLERANCE)
  : (req: any, res: any, next: any) => {
      console.warn(
        '[sign.route] ⚠️ Skipping request verification - REQUEST_SIGNER_SECRET not configured',
      );
      next();
    };

// Accepts PDF + PIN and returns signed PDF bytes with signature metadata headers.
// REQUIRES: X-Request-Signature and X-Request-Timestamp headers (signed by frontend with REQUEST_SIGNER_SECRET)
router.post('/sign', requestSignerMiddleware, signHandler);
// Accepts signed PDF and returns signature validation details.
router.post('/verify', verifyHandler);
// Diagnostic endpoint to check certificate expiration status
router.post('/cert-status', certStatusHandler);
// Get list of supported USB token drivers
router.get('/supported-drivers', getSupportedDriversHandler);
// Auto-detect connected USB token device
router.get('/auto-detect-token', autoDetectTokenHandler);

export default router;
