const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

const signRoutes = require('./routes/sign.route.js');
const keysRoutes = require('./routes/keys.route.js');
const adminRoutes = require('./routes/admin.route.js');

const { appendLog } = require('./utils/status.store.js');

const projectRoot = path.resolve(__dirname, '..');

const loadEnvironmentVariables = () => {
  dotenv.config({ path: path.join(projectRoot, '.env') });
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

const getServerPort = () => {
  return Number.parseInt(process.env.PORT || '5000', 10);
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
    res.render('index', { apiBase: '/api' });
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

  const server = app.listen(port, () => {
    console.log(`DSC Helper running on http://localhost:${port}`);
  });

  configureServerErrorHandler(server);
  configureUnhandledRejectionHandler();
  configureUncaughtExceptionHandler();
};

startServer();
