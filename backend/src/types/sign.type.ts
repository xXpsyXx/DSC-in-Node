export type SignRequest = {
  hash: string;
};

export type SignResponse = {
  signature: string;
};

export type FileSignResponse = {
  hash: string;
  signature: string;
};

export type VerifyRequest = {
  hash: string;
  signature: string;
};

export type VerifyResponse = {
  isValid: boolean;
};