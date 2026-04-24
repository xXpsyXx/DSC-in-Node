const { Router } = require('express');
const { getConfigHandler, getStatusHandler, updateDriverPathHandler, appendLogHandler, getLogsFileHandler, getLogsHandler } = require('../controllers/admin.controller.js');

const createAdminRouter = () => {
  const router = Router();

  // GET /admin/config
  router.get('/config', getConfigHandler);

  // GET /admin/status
  router.get('/status', (_req, res) => getStatusHandler(_req, res));

  // POST /admin/driver-path
  router.post('/driver-path', updateDriverPathHandler);

  // POST /admin/logs  -> append a server-side log
  router.post('/logs', appendLogHandler);

  // GET /admin/logs/file -> download persisted logs file
  router.get('/logs/file', getLogsFileHandler);
  // GET /admin/logs -> return JSON logs
  router.get('/logs', (_req, res) => getLogsHandler(_req, res));

  return router;
};

const router = createAdminRouter();

module.exports = router;
