import express from 'express';
import cors from 'cors';

import signRoutes from './routes/sign.route.ts';
import keysRoutes from './routes/keys.route.ts';
import adminRoutes from './routes/admin.route.ts';

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { appendLog } from './utils/status.store.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

/**
 * Load environment variables from .env file.
 * Initializes configuration before app starts.
 * @access private
 * @returns {void}
 * @since 1.0.0
 */
const loadEnvironmentVariables = (): void => {
  dotenv.config({ path: path.join(projectRoot, '.env') });
};

/**
 * Configure CORS (Cross-Origin Resource Sharing) middleware.
 * Allows cross-origin requests and exposes custom headers to frontend.
 * @access private
 * @returns {express.Express} Express app with CORS configured
 * @since 1.0.0
 */
const configureCorsMiddleware = (
  app: express.Express,
  frontendEnv?: string,
): void => {
  // frontendEnv may be a single origin or a comma-separated list of origins
  let originOption: cors.CorsOptions['origin'] | boolean = true;
  if (frontendEnv) {
    const allowed = frontendEnv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    originOption = allowed.length === 1 ? allowed[0] : allowed;
  }

  const corsOptions: cors.CorsOptions = {
    origin: originOption,
    credentials: true,
    exposedHeaders: [
      'X-File-Hash',
      'X-File-Signature',
      'X-Signed-Date',
      'X-PKCS7-Signature',
      'X-Signature-Format',
    ],
  };

  app.use(cors(corsOptions));

  if (frontendEnv) {
    const originsLog = Array.isArray(originOption)
      ? originOption.join(', ')
      : originOption;
    console.log(`[server] CORS allowed origins: ${originsLog}`);
  } else {
    console.log('[server] CORS origin: any (origin=true)');
  }
};

/**
 * Configure JSON body parser middleware.
 * Allows the app to parse incoming JSON request bodies.
 * @access private
 * @returns {void}
 * @since 1.0.0
 */
const configureJsonParser = (app: express.Express): void => {
  app.use(express.json());
};

/**
 * Register application routes.
 * Mounts API routes at the /api base path.
 * @access private
 * @param {express.Express} app Express application instance
 * @returns {void}
 * @since 1.0.0
 */
const registerRoutes = (app: express.Express): void => {
  app.use('/api', signRoutes);
  app.use('/api/keys', keysRoutes);
};

/**
 * Register health check endpoint.
 * Provides a simple health check endpoint for monitoring.
 * @access private
 * @param {express.Express} app Express application instance
 * @returns {void}
 * @since 1.0.0
 */
const registerHealthCheckEndpoint = (app: express.Express): void => {
  app.get('/health', (_, res) => {
    res.send('Helper app running');
  });
};

/**
 * Get the server port from environment or default value.
 * Validates and parses the port configuration.
 * @access private
 * @returns {number} Port number for the server
 * @since 1.0.0
 */
const getServerPort = (): number => {
  return Number.parseInt(process.env.PORT || '5000', 10);
};

/**
 * Configure unhandled rejection handler.
 * Logs unhandled promise rejections for debugging.
 * @access private
 * @returns {void}
 * @since 1.0.0
 */
const configureUnhandledRejectionHandler = (): void => {
  process.on('unhandledRejection', (reason) => {
    console.error('[server] Unhandled rejection:', reason);
  });
};

/**
 * Configure uncaught exception handler.
 * Logs uncaught exceptions and gracefully exits the process.
 * @access private
 * @returns {void}
 * @since 1.0.0
 */
const configureUncaughtExceptionHandler = (): void => {
  process.on('uncaughtException', (error) => {
    console.error('[server] Uncaught exception:', error);
    process.exit(1);
  });
};

/**
 * Configure server error handler.
 * Handles server startup errors and exits gracefully.
 * @access private
 * @param {any} server HTTP server instance
 * @returns {void}
 * @since 1.0.0
 */
const configureServerErrorHandler = (server: any): void => {
  server.on('error', (error: any) => {
    console.error('[server] Failed to start:', error);
    process.exit(1);
  });
};

/**
 * Initialize and start the Express server.
 * Sets up all middleware, routes, and error handlers, then listens on the configured port.
 * @access public
 * @returns {void}
 * @since 1.0.0
 * @author PDFSignatureApp
 */
const startServer = (): void => {
  // Load environment variables
  loadEnvironmentVariables();

  // Create Express application
  const app = express();
  const port = getServerPort();

  // Compute frontend origin from env and configure middleware
  const frontendUrl =
    process.env.FRONTEND_URL ||
    (process.env.FRONTEND_PORT
      ? `http://localhost:${process.env.FRONTEND_PORT}`
      : undefined);
  configureCorsMiddleware(app, frontendUrl);
  configureJsonParser(app);

  // Register routes and endpoints
  registerRoutes(app);
  // Admin routes for runtime configuration
  app.use('/api/admin', adminRoutes);
  // Global error logger - capture errors and persist to server-side logs
  // Note: This middleware should be registered after routes so it catches route errors
  app.use((err: any, _req: any, res: any, _next: any) => {
    try {
      appendLog('error', err?.message || String(err || 'unknown error'));
    } catch (e) {
      console.error('[server] Failed to append log:', e);
    }
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  registerHealthCheckEndpoint(app);

  // Start listening
  const server = app.listen(port, () => {
    console.log(`DSC Helper running on http://localhost:${port}`);
  });

  // Configure error handlers
  configureServerErrorHandler(server);
  configureUnhandledRejectionHandler();
  configureUncaughtExceptionHandler();
};

// Start the server
startServer();
