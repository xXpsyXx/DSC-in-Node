import { Router } from 'express';
import type { Request, Response } from 'express';
import { getConfigHandler, getStatusHandler, updateDriverPathHandler, appendLogHandler, getLogsFileHandler, getLogsHandler } from '../controllers/admin.controller.ts';

const createAdminRouter = (): Router => {
  const router = Router();

  // GET /admin/config
  router.get('/config', getConfigHandler);

  // GET /admin/status
  router.get('/status', (_req: Request, res: Response) => getStatusHandler(_req, res));

  // POST /admin/driver-path
  router.post('/driver-path', updateDriverPathHandler);

  // POST /admin/logs  -> append a server-side log
  router.post('/logs', appendLogHandler);

  // GET /admin/logs/file -> download persisted logs file
  router.get('/logs/file', getLogsFileHandler);
  // GET /admin/logs -> return JSON logs
  router.get('/logs', (_req: Request, res: Response) => getLogsHandler(_req, res));

  return router;
};

const router = createAdminRouter();

export default router;
