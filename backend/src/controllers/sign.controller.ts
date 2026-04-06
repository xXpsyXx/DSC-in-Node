import type { Request, Response } from "express";
import { SignerService } from "../services/sign.service.ts";
import type { SignRequest, SignResponse } from "../types/sign.type.ts";

const signer = new SignerService();

export const signHandler = (req: Request, res: Response) => {
  const body = req.body as SignRequest;

  if (!body.data) {
    return res.status(400).json({ error: "data is required" });
  }

  const signature = signer.sign(body.data);

  const response: SignResponse = { signature };

  res.json(response);
};
