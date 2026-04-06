import { Router } from 'express';
import { signHandler } from '../controllers/sign.controller.ts';

const router = Router();

router.post('/sign', signHandler);

export default router;