const { Router } = require('express');
const axios = require('axios');

const getBackendUrl = () => {
  return process.env.BACKEND_API_URL || 'http://localhost:8080/api';
};

async function getPublicKey() {
  const backendUrl = getBackendUrl();
  try {
    const response = await axios.get(`${backendUrl}/digital-signature/public-key`, {
      timeout: 5000,
    });
    console.log('[keys] Public key fetched from backend');
    return response?.data?.data?.publicKey || response?.data?.publicKey || null;
  } catch (error) {
    // If the hostname is 'localhost' and DNS resolves to IPv6 (::1) which is refused
    // because the backend listens on IPv4 only (127.0.0.1), retry using IPv4.
    if (backendUrl.includes('localhost')) {
      const ipv4Url = backendUrl.replace('localhost', '127.0.0.1');
      try {
        const response2 = await axios.get(`${ipv4Url}/digital-signature/public-key`, {
          timeout: 5000,
        });
        console.log('[keys] Public key fetched from backend (ipv4 fallback)');
        return response2?.data?.data?.publicKey || response2?.data?.publicKey || null;
      } catch (err2) {
        console.error('[keys] IPv4 fallback failed:', err2.message);
        throw err2;
      }
    }
    throw error;
  }
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