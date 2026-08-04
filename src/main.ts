import { INestApplication, ValidationPipe, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { type Express } from 'express';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import {
  logBootError,
  registerGlobalProcessHandlers,
} from './common/bootstrap-observability';

registerGlobalProcessHandlers();
console.log('[BOOT 1] Process started');

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

function logTypeOrmState(app: INestApplication): boolean {
  try {
    const dataSource = app.get(DataSource, { strict: false });
    if (dataSource?.isInitialized) {
      console.log('PostgreSQL connected successfully');
      console.log('[BOOT 6] TypeORM initialized');
      return true;
    }
  } catch {
    // DataSource aún no registrado en el contenedor DI.
  }

  return false;
}

async function bootstrap() {
  const port = parseInt(process.env.PORT ?? '3001', 10);
  const expressApp = express();
  registerProbeHealthRoutes(expressApp);

  console.log('[BOOT 3] Opening early listener');
  // Cloud Run startup probe (TCP/HTTP) debe pasar mientras Nest + DB inicializan.
  await listenEarly(expressApp, port);
  console.log(`Probe health listening on http://0.0.0.0:${port}`);

  console.log('[BOOT 4] Creating Nest application');
  console.log('[BOOT 4A] Calling NestFactory.create()');
  let app: INestApplication;
  try {
    app = await NestFactory.create(
      AppModule,
      new ExpressAdapter(expressApp),
    );
  } catch (error) {
    logBootError('NestFactory.create', error);
  }
  console.log('[BOOT 4B] NestFactory.create() returned');
  console.log('[BOOT 5] AppModule created');

  let typeOrmLogged = logTypeOrmState(app);

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

  if (!typeOrmLogged) {
    typeOrmLogged = logTypeOrmState(app);
    if (!typeOrmLogged) {
      console.error('PostgreSQL connection failed');
    }
  }

  console.log('[BOOT 7] Modules initialized');
  console.log('[BOOT 8] app.init() completed');
  nestReady = true;
  console.log('[BOOT 9] nestReady=true');

  console.log(`Novex Backend ready on http://0.0.0.0:${port}/${apiPrefix}`);
  console.log('[BOOT 10] Bootstrap finished');
}

bootstrap().catch((error) => {
  logBootError('bootstrap', error);
});
