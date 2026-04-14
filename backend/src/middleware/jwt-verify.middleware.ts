import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getPublicKey } from '../routes/keys.route.ts';

/**
 * Middleware to verify JWT tokens issued by the backend.
 * Fetches the RSA public key (auto-cached) and verifies the token
 * from the Authorization header or request body.
 * @param {Request} req Express request
 * @param {Response} res Express response
 * @param {NextFunction} next Next middleware
 */
export const verifyBackendJwt = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    if (!token) {
      res.status(401).json({ success: false, error: 'Missing JWT token' });
      return;
    }

    const publicKey = await getPublicKey();
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    (req as any).signPayload = decoded;
    next();
  } catch (error: any) {
    console.error('[jwt-verify] JWT verification failed:', error.message);
    res
      .status(401)
      .json({ success: false, error: 'Invalid or expired JWT token' });
  }
};
