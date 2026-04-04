import { Module } from '@nestjs/common';
import { DscService } from './dsc.service';
import { DscController } from './dsc.controller';

@Module({
  providers: [DscService],
  controllers: [DscController]
})
export class DscModule {}
