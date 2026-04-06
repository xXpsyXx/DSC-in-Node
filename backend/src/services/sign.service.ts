export class SignerService {
  sign(data: string): string {
    // Dummy signature (for now)
    return Buffer.from(`signed:${data}`).toString('base64');
  }
}