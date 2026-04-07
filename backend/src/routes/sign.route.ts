import { Router } from 'express';
import {
  signHandler,
  verifyHandler,
  certStatusHandler,
} from '../controllers/sign.controller.ts';

const router = Router();

// Accepts PDF + PIN and returns signed PDF bytes with signature metadata headers.
router.post('/sign', signHandler);
// Accepts signed PDF and returns signature validation details.
router.post('/verify', verifyHandler);
// Diagnostic endpoint to check certificate expiration status
router.post('/cert-status', certStatusHandler);

export default router;
