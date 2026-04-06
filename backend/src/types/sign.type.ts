export type SignRequest = {
  hash: string;
  pin: string;
};

export type SignResponse = {
  signature: string;
};

export type FileSignResponse = {
  hash: string;
  signature: string;
  fileName: string;
  message: string;
};

export type VerifyRequest = {
  hash: string;
  signature: string;
};

export type VerifyResponse = {
  isValid: boolean;
};
