import type { Request, Response } from "express";
import { SignerService } from "../services/sign.service.ts";
import type { VerifyRequest, VerifyResponse } from "../types/sign.type.ts";
import type { SignRequest, SignResponse } from "../types/sign.type.ts";
import { VerifyService } from "../services/verify.service.ts";

const signer = new SignerService();
const verifyService = new VerifyService();
export const signHandler = (req: Request, res: Response) => {
  const body = req.body as SignRequest;

  if (!body.data) {
    return res.status(400).json({ error: "data is required" });
  }

  const signature = signer.sign(body.data);

  const response: SignResponse = { signature };

  res.json(response);
};

export const verifyHandler = (req: Request, res: Response) => {
  const body = req.body as VerifyRequest;

  if (!body || !body.data || !body.signature) {
    return res.status(400).json({ error: "data and signature are required" });
  }

  const isValid = verifyService.verify(body.data, body.signature);

  res.json({ isValid });
};
