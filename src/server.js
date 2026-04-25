const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');
const os = require('os');

const signRoutes = require('./routes/sign.route.js');
const keysRoutes = require('./routes/keys.route.js');
const adminRoutes = require('./routes/admin.route.js');

const { appendLog } = require('./utils/status.store.js');

const projectRoot = path.resolve(__dirname, '..');

const loadEnvironmentVariables = () => {
  // Prefer a user-configured .env (set by Electron) when present
  const userEnvPath = process.env.USER_CONFIG_PATH;
  const fallbackPath = path.join(projectRoot, '.env');
  try {
    if (userEnvPath && fs.existsSync(userEnvPath)) {
      dotenv.config({ path: userEnvPath });
      console.log(`[server] Loaded env from USER_CONFIG_PATH: ${userEnvPath}`);
      return;
    }
    if (userEnvPath) {
      console.log(`[server] USER_CONFIG_PATH set but file missing: ${userEnvPath}`);
    }
    if (fs.existsSync(fallbackPath)) {
      dotenv.config({ path: fallbackPath });
      console.log(`[server] Loaded env from project .env: ${fallbackPath}`);
    } else {
      console.log(`[server] No env file found at ${fallbackPath}`);
    }
  } catch (e) {
    console.warn('[server] Failed to load env file:', e && e.message);
  }
};

const configureCorsMiddleware = (app) => {
  app.use(
    cors({
      origin: true,
      credentials: true,
      exposedHeaders: [
        'X-File-Hash',
        'X-File-Signature',
        'X-Signed-Date',
        'X-PKCS7-Signature',
        'X-Signature-Format',
      ],
    }),
  );
};

const configureJsonParser = (app) => {
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
};

const registerRoutes = (app) => {
  app.use('/api', signRoutes);
  app.use('/api/keys', keysRoutes);
};

const registerHealthCheckEndpoint = (app) => {
  app.get('/health', (_, res) => {
    res.send('Helper app running');
  });
};

const FIXED_PORT = 45763;
const getServerPort = () => {
  // Use a fixed port required by the Electron app
  return FIXED_PORT;
};

const configureUnhandledRejectionHandler = () => {
  process.on('unhandledRejection', (reason) => {
    console.error('[server] Unhandled rejection:', reason);
  });
};

const configureUncaughtExceptionHandler = () => {
  process.on('uncaughtException', (error) => {
    console.error('[server] Uncaught exception:', error);
    process.exit(1);
  });
};

const configureServerErrorHandler = (server) => {
  server.on('error', (error) => {
    console.error('[server] Failed to start:', error);
    process.exit(1);
  });
};

const startServer = () => {
  loadEnvironmentVariables();

  const app = express();
  const port = getServerPort();

  configureCorsMiddleware(app);
  configureJsonParser(app);

  // Views + static assets are served from backend root
  const viewsDir = path.join(projectRoot, 'views');
  const publicDir = path.join(projectRoot, 'public');

  app.set('views', viewsDir);
  app.set('view engine', 'ejs');

  app.use(express.static(publicDir));

  // Register API routes
  registerRoutes(app);
  app.use('/api/admin', adminRoutes);

  // Render SPA root
  app.get('/', (req, res) => {
    const getDefaultDriverPath = () => {
      const direct = process.env.PKCS11_LIBRARY_PATH && process.env.PKCS11_LIBRARY_PATH.trim();
      if (direct) return direct;
      const platform = os.platform();
      if (platform === 'win32') return process.env.PKCS11_LIBRARY_PATH_WINDOWS || '';
      if (platform === 'linux') return process.env.PKCS11_LIBRARY_PATH_LINUX || '';
      if (platform === 'darwin') return process.env.PKCS11_LIBRARY_PATH_DARWIN || '';
      return '';
    };

    res.render('index', { apiBase: '/api', defaultDriverPath: getDefaultDriverPath() });
  });

  // Global error logger
  app.use((err, _req, res, _next) => {
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

  const server = app.listen(port, '127.0.0.1', () => {
    console.log(`DSC Helper running on http://localhost:${port}`);
  });

  configureServerErrorHandler(server);
  configureUnhandledRejectionHandler();
  configureUncaughtExceptionHandler();
};

startServer();
