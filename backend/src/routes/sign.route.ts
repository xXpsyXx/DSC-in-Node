import { Router } from "express";
import { signHandler, signPdfHandler, verifyHandler } from "../controllers/sign.controller.ts";

const router = Router();

router.post("/sign", signHandler);
router.post("/sign-pdf", signPdfHandler);
router.post("/verify", verifyHandler);

export default router;