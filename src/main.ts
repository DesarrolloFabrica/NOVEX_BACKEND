import 'dotenv/config';
import { ValidationPipe, RequestMethod } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { type Express } from 'express';
import { DataSource } from 'typeorm';
import {
  isBootVerbose,
  logBootDebug,
  logBootError,
  registerGlobalProcessHandlers,
} from './common/bootstrap-observability';
import {
  ProbeHealthState,
  registerProbeHealthRoutes,
} from './health/probe-health';
import { verifyDatabaseConnection } from './database/database-preflight';
import { resolveCorsOrigins } from './configuration/cors.config';

registerGlobalProcessHandlers();
logBootDebug('[BOOT 1] Process started');

const healthState = new ProbeHealthState();

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
      logBootDebug('[BOOT 6] TypeORM initialized');
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
  registerProbeHealthRoutes(expressApp, healthState);

  logBootDebug('[BOOT 3] Opening early listener');
  // Cloud Run startup probe (TCP/HTTP) debe pasar mientras Nest + DB inicializan.
  await listenEarly(expressApp, port);
  console.log(`Probe health listening on http://0.0.0.0:${port}`);

  logBootDebug('[BOOT 3A] Verifying PostgreSQL connection');
  await verifyDatabaseConnection();
  logBootDebug('[BOOT 3B] PostgreSQL preflight completed');

  logBootDebug('[BOOT 4] Loading AppModule');
  const { AppModule } = await import('./app.module.js');
  logBootDebug('[BOOT 4A] Calling NestFactory.create()');
  const app: INestApplication = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressApp),
    {
      logger: isBootVerbose() ? undefined : ['error', 'warn'],
    },
  );
  logBootDebug('[BOOT 4B] NestFactory.create() returned');
  logBootDebug('[BOOT 5] AppModule created');

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
    origin: resolveCorsOrigins(),
    credentials: true,
  });

  logBootDebug('Initializing Nest application (DB, modules, routes)...');
  await app.init();

  if (!typeOrmLogged) {
    typeOrmLogged = logTypeOrmState(app);
    if (!typeOrmLogged) {
      console.error('PostgreSQL connection failed');
    }
  }

  logBootDebug('[BOOT 7] Modules initialized');
  logBootDebug('[BOOT 8] app.init() completed');
  const dataSource = app.get(DataSource, { strict: false });
  healthState.markNestReady(dataSource);
  logBootDebug('[BOOT 9] readiness enabled');

  console.log(`Novex Backend ready on http://0.0.0.0:${port}/${apiPrefix}`);
  logBootDebug('[BOOT 10] Bootstrap finished');
}

bootstrap().catch((error) => {
  healthState.markBootstrapFailed(error);
  logBootError('bootstrap', error);
});
