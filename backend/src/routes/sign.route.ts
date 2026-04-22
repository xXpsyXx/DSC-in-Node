import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  signHandler,
  verifyHandler,
  certStatusHandler,
  getCertDetailsHandler,
  getSupportedDriversHandler,
  autoDetectTokenHandler,
} from '../controllers/sign.controller.ts';
import { verifyBackendJwt } from '../middleware/jwt-verify.middleware.ts';

/**
 * Create and configure the sign API router.
 * Registers all signing-related endpoints with appropriate middleware and handlers.
 */
const createSignRouter = (): Router => {
  const router = Router();

  // Register endpoints
  router.post('/sign', verifyBackendJwt, signHandler);
  router.post('/verify', verifyHandler);
  router.post('/cert-status', certStatusHandler);
  router.post('/get-cert-details', getCertDetailsHandler);
  router.get('/supported-drivers', getSupportedDriversHandler);
  router.get('/auto-detect-token', autoDetectTokenHandler);

  return router;
};

const router = createSignRouter();

export default router;
