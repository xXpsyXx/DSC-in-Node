import { Controller, Post, Body, BadRequestException, Logger } from '@nestjs/common';
import { DscService } from './dsc.service';

@Controller('dsc')
export class DscController {
  private logger = new Logger('DscController');

  constructor(private dscService: DscService) {}

  @Post('sign')
  async signDocument(
    @Body('pdfBase64') pdfBase64: string,
    @Body('reason') reason?: string,
    @Body('location') location?: string,
    @Body('signer') signer?: string,
  ) {
    try {
      if (!pdfBase64) {
        throw new BadRequestException('PDF data is required');
      }

      const pdfBuffer = Buffer.from(pdfBase64, 'base64');
      const signedPdf = await this.dscService.signPdf({
        pdfBuffer,
        reason,
        location,
        signer
      });

      return {
        success: true,
        data: signedPdf.toString('base64'),
        message: 'Document signed successfully'
      };
    } catch (error) {
      this.logger.error(`Sign error: ${error.message}`);
      throw error;
    }
  }

  @Post('verify')
  async verifyDocument(
    @Body('signedPdfBase64') signedPdfBase64: string,
  ) {
    try {
      if (!signedPdfBase64) {
        throw new BadRequestException('Signed PDF data is required');
      }

      const signedPdfBuffer = Buffer.from(signedPdfBase64, 'base64');
      const result = await this.dscService.verifySignature(signedPdfBuffer);

      return {
        success: result.isValid,
        ...result
      };
    } catch (error) {
      this.logger.error(`Verify error: ${error.message}`);
      throw error;
    }
  }
}