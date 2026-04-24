const { Router } = require('express');
const axios = require('axios');

const getBackendUrl = () => {
  return process.env.BACKEND_API_URL || 'http://localhost:8080/api';
};

exports.getPublicKey = async () => {
  const backendUrl = getBackendUrl();
  const response = await axios.get(
    `${backendUrl}/digital-signature/public-key`,
    {
      timeout: 5000,
    },
  );
  console.log('[keys] Public key fetched from backend');
  return response.data.data.publicKey;
};

const createKeysRouter = () => {
  const router = Router();

  router.get('/dsc-verify-key', async (_req, res) => {
    try {
      const publicKey = await exports.getPublicKey();
      res.json({
        success: true,
        data: { publicKey },
      });
    } catch (error) {
      console.error(
        '[keys.route] Failed to fetch public key from backend:',
        error.message,
      );
      res.status(502).json({
        success: false,
        error: 'Failed to fetch verification key from backend',
      });
    }
  });

  return router;
};

const router = createKeysRouter();

module.exports = router;
