import { ValidationPipe, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { type Express } from 'express';
import { AppModule } from './app.module';

let nestReady = false;

/** Rutas de health sin prefijo global (Cloud Run startup/liveness). */
function registerProbeHealthRoutes(app: Express): void {
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/health/ready', (_req, res) => {
    if (!nestReady) {
      res.status(503).json({
        status: 'starting',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  });
}

async function listenEarly(expressApp: Express, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = expressApp.listen(port, '0.0.0.0', () => resolve());
    server.on('error', reject);
  });
}

async function bootstrap() {
  const port = parseInt(process.env.PORT ?? '3001', 10);
  const expressApp = express();
  registerProbeHealthRoutes(expressApp);

  // Cloud Run startup probe (TCP/HTTP) debe pasar mientras Nest + DB inicializan.
  await listenEarly(expressApp, port);
  console.log(`Probe health listening on http://0.0.0.0:${port}`);

  console.log('Creating Nest application...');
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressApp),
  );

  const configService = app.get(ConfigService);
  const apiPrefix = configService.get<string>('apiPrefix') ?? 'api/v1';

  app.setGlobalPrefix(apiPrefix, {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableCors({
    origin: true,
    credentials: true,
  });

  console.log('Initializing Nest application (DB, modules, routes)...');
  await app.init();
  nestReady = true;

  console.log(`Novex Backend ready on http://0.0.0.0:${port}/${apiPrefix}`);
}

bootstrap().catch((error) => {
  console.error('Bootstrap failed:', error);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
