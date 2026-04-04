import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DscModule } from '../modules/dsc/dsc.module';

@Module({
  imports: [DscModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
