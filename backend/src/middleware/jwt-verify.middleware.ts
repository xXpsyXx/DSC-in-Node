import type { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { getPublicKeyService } from '../services/public-key.service';

/**
 * JWT payload interface for authorized signing requests.
 * Contains action, file hash, user info, and standard JWT claims.
 * @since 2.0.0
 */
interface AuthorizedSigningPayload extends jwt.JwtPayload {
  action: 'sign' | 'verify';
  fileHash: string;
  fileName: string;
  userId: string;
  kid: string; // Key ID for key rotation support
}

/**
 * Extend Express Request to include optional JWT payload.
 * @since 2.0.0
 */
declare global {
  namespace Express {
    interface Request {
      jwtPayload?: AuthorizedSigningPayload;
    }
  }
}

/**
 * JWT Verification Middleware
 * Verifies JWT tokens issued by production backend.
 *
 * Configuration via environment variables:
 * - ENABLE_JWT_AUTH: Enable/disable JWT verification (default: false)
 * - JWT_VERIFY_OPTIONS: JSON string with verification options
 *
 * @access public
 * @param {Request} req Express request object
 * @param {Response} res Express response object
 * @param {NextFunction} next Express next middleware function
 * @returns {void}
 * @since 2.0.0
 */
export async function verifyJwtToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const enableJwtAuth = process.env.ENABLE_JWT_AUTH === 'true';

  // If JWT auth is disabled, pass through
  if (!enableJwtAuth) {
    next();
    return;
  }

  const authorizationHeader = req.headers['authorization'];

  // Check if authorization header is present
  if (!authorizationHeader) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing authorization header',
      code: 'NO_AUTH_HEADER',
    });
    return;
  }

  // Extract token from "Bearer <token>" format
  const parts = authorizationHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid authorization header format. Expected: Bearer <token>',
      code: 'INVALID_AUTH_FORMAT',
    });
    return;
  }

  const token = parts[1] as string;

  try {
    // Decode token without verification first to get kid
    const unverifiedPayload = jwt.decode(token);
    if (!unverifiedPayload || typeof unverifiedPayload === 'string') {
      throw new Error('Invalid token format');
    }

    const kid = (unverifiedPayload as any).kid;
    if (!kid) {
      throw new Error('Token missing key ID (kid)');
    }

    // Fetch public key using kid
    const publicKeyService = getPublicKeyService();
    const publicKey = await publicKeyService.getPublicKey(kid);

    if (!publicKey) {
      throw new Error(`Public key not found for kid: ${kid}`);
    }

    // Verify token using the public key
    const payload = jwt.verify(token, publicKey as string, {
      algorithms: ['RS256', 'RS384', 'RS512'],
      clockTolerance: 60, // Allow 60 second clock skew
    }) as unknown as AuthorizedSigningPayload;

    // Validate required fields
    if (!payload.action || !payload.fileHash || !payload.userId) {
      throw new Error('Token missing required fields');
    }

    // Attach payload to request for use in controllers
    req.jwtPayload = payload;
    next();
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    console.error('[verifyJwtToken] JWT verification failed:', errorMessage);

    // Return appropriate error based on error type
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Token has expired',
        code: 'TOKEN_EXPIRED',
      });
    } else if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token signature',
        code: 'INVALID_TOKEN',
      });
    } else {
      res.status(401).json({
        error: 'Unauthorized',
        message: errorMessage,
        code: 'JWT_VERIFICATION_FAILED',
      });
    }
  }
}

/**
 * Optional JWT verification middleware.
 * Verifies JWT if present, but doesn't require it.
 * Useful for endpoints that support both authenticated and unauthenticated access.
 *
 * @access public
 * @param {Request} req Express request object
 * @param {Response} res Express response object
 * @param {NextFunction} next Express next middleware function
 * @returns {void}
 * @since 2.0.0
 */
export async function verifyJwtTokenOptional(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authorizationHeader = req.headers['authorization'];

  // If no authorization header, pass through
  if (!authorizationHeader) {
    next();
    return;
  }

  // If authorization header present, verify it
  await verifyJwtToken(req, res, next);
}

/**
 * Validate JWT payload for signing action.
 * Ensures the token authorizes a signing operation.
 *
 * @access public
 * @param {Request} req Express request object
 * @param {Response} res Express response object
 * @param {NextFunction} next Express next middleware function
 * @returns {void}
 * @since 2.0.0
 */
export function validateSigningAuthorization(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.jwtPayload) {
    next(); // No JWT, let other auth methods handle it
    return;
  }

  if (req.jwtPayload.action !== 'sign') {
    res.status(403).json({
      error: 'Forbidden',
      message: `Token not authorized for signing action. Authorized for: ${req.jwtPayload.action}`,
      code: 'INVALID_ACTION_AUTHORIZATION',
    });
    return;
  }

  next();
}

/**
 * Initialize JWT service on startup.
 * Fetches public keys from backend at server start.
 *
 * @access public
 * @returns {Promise<void>}
 * @since 2.0.0
 */
export async function initializeJwtService(): Promise<void> {
  const enableJwtAuth = process.env.ENABLE_JWT_AUTH === 'true';

  if (!enableJwtAuth) {
    console.log('[verifyJwtToken] JWT authentication is disabled');
    return;
  }

  try {
    const publicKeyService = getPublicKeyService();
    console.log('[JWT Service] Initializing public key service...');
    await publicKeyService.refreshPublicKeys();
    console.log('[JWT Service] ✅ Public keys loaded successfully');
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.warn(
      `[JWT Service] ⚠️ Failed to initialize public key service: ${errorMessage}`,
    );
    console.warn(
      '[JWT Service] Continuing with JWT auth disabled. Enable ENABLE_JWT_AUTH=true only when backend is ready.',
    );
  }
}
