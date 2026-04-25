const { Router } = require('express');
const axios = require('axios');

const getBackendUrl = () => {
  return process.env.BACKEND_API_URL || 'http://localhost:8080/api';
};

async function getPublicKey() {
  const backendUrl = getBackendUrl();
  const response = await axios.get(
    `${backendUrl}/digital-signature/public-key`,
    {
      timeout: 5000,
    },
  );
  console.log('[keys] Public key fetched from backend');
  // Support ApiResponse wrapper: prefer response.data.data.publicKey
  return response?.data?.data?.publicKey || response?.data?.publicKey || null;
}

const createKeysRouter = () => {
  const router = Router();

  router.get('/dsc-verify-key', async (_req, res) => {
    try {
      const publicKey = await getPublicKey();
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

// Attach helper so other modules can import getPublicKey from the router
router.getPublicKey = getPublicKey;

module.exports = router;
