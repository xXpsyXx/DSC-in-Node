import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  signHandler,
  verifyHandler,
  certStatusHandler,
  getSupportedDriversHandler,
  autoDetectTokenHandler,
} from '../controllers/sign.controller.js';
import {
  verifyJwtToken,
  validateSigningAuthorization,
} from '../middleware/jwt-verify.middleware.js';

/**
 * Create and configure the sign API router.
 * Registers all signing-related endpoints with JWT authentication.
 * @access private
 * @returns {Router} Configured Express router
 * @since 2.0.0
 */
const createSignRouter = (): Router => {
  const router = Router();

  // Register endpoints with JWT authentication
  router.post(
    '/sign',
    verifyJwtToken,
    validateSigningAuthorization,
    signHandler,
  );
  router.post('/verify', verifyHandler);
  router.post('/cert-status', certStatusHandler);
  router.get('/supported-drivers', getSupportedDriversHandler);
  router.get('/auto-detect-token', autoDetectTokenHandler);

  return router;
};

const router = createSignRouter();

export default router;
