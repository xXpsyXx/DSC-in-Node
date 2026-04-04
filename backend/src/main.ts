import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SignarService } from 'services/signar/signar.service';
import { Pkcs11ConfigService } from './config/pkcs11.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: 'http://localhost:4200',
    credentials: true,
  });
  // Initialize PKCS#11 on startup
  try {
    const signarService = app.get(SignarService);
    const configService = app.get(Pkcs11ConfigService);

    const config = configService.getConfig();
    console.log('🔧 Initializing PKCS#11 with config:', {
      libraryPath: config.libraryPath,
      slotId: config.slotId,
    });

    await signarService.initialize(config);
    console.log('✅ PKCS#11 initialized successfully');
  } catch (error) {
    console.error('⚠️ PKCS#11 initialization warning:', error.message);
    console.log('ℹ️  Smartcard may not be available. Check:');
    console.log('   1. HyperSecu PKCS#11 library installed');
    console.log('   2. .env file has correct library path');
    console.log('   3. Smartcard reader is connected');
  }
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
