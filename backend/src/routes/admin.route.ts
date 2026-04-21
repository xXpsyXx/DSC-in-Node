import { Router } from 'express';
import type { Request, Response } from 'express';
import { getConfigHandler, getStatusHandler, updateDriverPathHandler } from '../controllers/admin.controller.ts';

const createAdminRouter = (): Router => {
  const router = Router();

  // GET /admin/config
  router.get('/config', getConfigHandler);

  // GET /admin/status
  router.get('/status', (_req: Request, res: Response) => getStatusHandler(_req, res));

  // POST /admin/driver-path
  router.post('/driver-path', updateDriverPathHandler);

  return router;
};

const router = createAdminRouter();

export default router;
