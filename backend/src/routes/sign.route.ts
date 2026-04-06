import { Router } from "express";
import { signHandler, verifyHandler } from "../controllers/sign.controller.ts";

const router = Router();

router.post("/sign", signHandler);
router.post('/verify', verifyHandler);

export default router;
