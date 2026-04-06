import { Router } from 'express';
import {
  signHandler,
  signPdfHandler,
  verifyHandler,
  verifyPdfHandler,
  verifyEmbeddedSignatureHandler,
} from '../controllers/sign.controller.ts';

const router = Router();

router.post('/sign', signHandler);
router.post('/sign-pdf', signPdfHandler);
router.post('/verify', verifyHandler);
router.post('/verify-pdf', verifyPdfHandler);
router.post('/verify-embedded-signature', verifyEmbeddedSignatureHandler);

export default router;
