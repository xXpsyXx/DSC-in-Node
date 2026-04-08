import { Router } from 'express';
import {
  signHandler,
  verifyHandler,
  certStatusHandler,
  getSupportedDriversHandler,
  autoDetectTokenHandler,
} from '../controllers/sign.controller.ts';

const router = Router();

// Accepts PDF + PIN and returns signed PDF bytes with signature metadata headers.
router.post('/sign', signHandler);
// Accepts signed PDF and returns signature validation details.
router.post('/verify', verifyHandler);
// Diagnostic endpoint to check certificate expiration status
router.post('/cert-status', certStatusHandler);
// Get list of supported USB token drivers
router.get('/supported-drivers', getSupportedDriversHandler);
// Auto-detect connected USB token device
router.get('/auto-detect-token', autoDetectTokenHandler);

export default router;
