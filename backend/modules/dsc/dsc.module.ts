import { Module } from '@nestjs/common';
import { DscService } from './dsc.service';
import { DscController } from './dsc.controller';
import { SignarService } from '../../services/signar/signar.service';

@Module({
  providers: [DscService, SignarService],
  controllers: [DscController],
  exports: [DscService, SignarService]
})
export class DscModule {}