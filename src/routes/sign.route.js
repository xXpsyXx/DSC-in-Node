const { Router } = require('express');
const {
  signHandler,
  verifyHandler,
  certStatusHandler,
  getCertDetailsHandler,
  getSupportedDriversHandler,
  autoDetectTokenHandler,
} = require('../controllers/sign.controller.js');
const { verifyBackendJwt } = require('../middleware/jwt-verify.middleware.js');

const createSignRouter = () => {
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

module.exports = router;
