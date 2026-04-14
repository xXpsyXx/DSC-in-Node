import { Router } from 'express';
import type { Request, Response } from 'express';
import axios from 'axios';

let cachedPublicKey: string | null = null;

/**
 * Get the backend API URL from environment.
 * @returns {string} Backend API base URL
 */
const getBackendUrl = (): string => {
  return process.env.BACKEND_API_URL || 'http://localhost:8080/api';
};

/**
 * Fetch and cache the RSA public key from the backend.
 * Called on agent startup and available for JWT verification.
 * @returns {Promise<string>} The RSA public key PEM string
 */
export const fetchAndCachePublicKey = async (): Promise<string> => {
  const backendUrl = getBackendUrl();
  const response = await axios.get(
    `${backendUrl}/digital-signature/public-key`,
    {
      timeout: 5000,
    },
  );
  cachedPublicKey = response.data.data.publicKey;
  console.log('[keys] Public key fetched and cached from backend');
  return cachedPublicKey!;
};

/**
 * Get the cached public key. Fetches from backend if not yet cached.
 * @returns {Promise<string>} The RSA public key PEM string
 */
export const getPublicKey = async (): Promise<string> => {
  if (cachedPublicKey) return cachedPublicKey;
  return fetchAndCachePublicKey();
};

/**
 * Create and configure the keys API router.
 * Provides endpoint to fetch backend's public verification key.
 * The local agent uses this to verify JWT tokens issued by the backend.
 * @returns {Router} Configured Express router
 * @since 1.0.0
 */
const createKeysRouter = (): Router => {
  const router = Router();

  /**
   * GET /keys/dsc-verify-key
   * Return the cached DSC signing public key.
   */
  router.get('/dsc-verify-key', async (_req: Request, res: Response) => {
    try {
      const publicKey = await getPublicKey();
      res.json({
        success: true,
        data: { publicKey },
      });
    } catch (error: any) {
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

export default router;
