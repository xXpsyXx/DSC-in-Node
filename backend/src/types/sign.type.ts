export type SignRequest = {
  data: string; // later: hash
};

export type SignResponse = {
  signature: string;
};

export type VerifyRequest = {
  data: string;
  signature: string;
};

export type VerifyResponse = {
  isValid: boolean;
};