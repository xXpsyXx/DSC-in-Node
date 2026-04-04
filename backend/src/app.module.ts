import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DscModule } from '../modules/dsc/dsc.module';
import { Pkcs11ConfigService } from './config/pkcs11.config';

@Module({
  imports: [DscModule],
  controllers: [AppController],
  providers: [AppService, Pkcs11ConfigService],
})
export class AppModule {}
