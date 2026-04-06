import type { Request, Response } from "express";
import { SignerService } from "../services/sign.service.ts";
import { HashService } from "../services/hash.service.ts";
import type {
  SignRequest,
  SignResponse,
  FileSignResponse,
  VerifyRequest,
  VerifyResponse,
} from "../types/sign.type.ts";
import { VerifyService } from "../services/verify.service.ts";
import { IncomingForm } from "formidable";
import fs from "fs";

const signer = new SignerService();
const verifyService = new VerifyService();

export const signHandler = (req: Request, res: Response) => {
  const body = req.body as SignRequest;

  if (!body.hash) {
    return res.status(400).json({ error: "hash is required" });
  }

  try {
    const signature = signer.signHash(body.hash);

    const response: SignResponse = { signature };

    res.json(response);
  } catch (error) {
    console.error("[signHandler] Error:", error);
    res.status(500).json({ error: "Failed to sign hash" });
  }
};

export const signPdfHandler = async (req: Request, res: Response) => {
  const form = new IncomingForm({
    maxFileSize: 50 * 1024 * 1024, // 50MB
  });

  try {
    const [fields, files] = await form.parse(req);

    const uploadedFile = files.file?.[0];

    if (!uploadedFile) {
      return res.status(400).json({ error: "file is required" });
    }

    console.log(`[signPdfHandler] Processing file: ${uploadedFile.originalFilename}`);

    // Read file buffer
    const fileBuffer = fs.readFileSync(uploadedFile.filepath);

    // Compute hash
    const hash = HashService.hashBuffer(fileBuffer);
    console.log(`[signPdfHandler] File hash: ${hash}`);

    // Sign the hash
    const signature = signer.signHash(hash);

    const response: FileSignResponse = { hash, signature };

    res.json(response);
  } catch (error) {
    console.error("[signPdfHandler] Error:", error);
    res.status(500).json({ error: "Failed to sign file" });
  }
};

export const verifyHandler = (req: Request, res: Response) => {
  const body = req.body as VerifyRequest;

  if (!body || !body.hash || !body.signature) {
    return res.status(400).json({ error: "hash and signature are required" });
  }

  try {
    const isValid = verifyService.verify(body.hash, body.signature);

    res.json({ isValid });
  } catch (error) {
    console.error("[verifyHandler] Error:", error);
    res.status(500).json({ error: "Failed to verify signature" });
  }
};