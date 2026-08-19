import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModuleAsyncOptions } from '@nestjs/typeorm';
import { join } from 'node:path';
import { logBootDebug } from '../common/bootstrap-observability';

/**
 * TypeORM para NestJS.
 * - synchronize: siempre false (esquema solo vía migraciones).
 * - entities: autoLoadEntities + glob de seguridad para CLI parity.
 * - migrations: registradas para introspection; se ejecutan con npm scripts.
 */
export const typeOrmAsyncConfig: TypeOrmModuleAsyncOptions = {
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const isProduction = configService.get<string>('nodeEnv') === 'production';
    const host = configService.get<string>('database.host') ?? '';
    const sslEnabled = configService.get<boolean>('database.ssl') === true;

    logBootDebug('TypeORM connection parameters:');
    logBootDebug(
      'DB_PROFILE:',
      configService.get<string>('database.profile') ?? 'local',
    );
    logBootDebug('DB_HOST:', host);
    logBootDebug('DB_PORT:', configService.get<number>('database.port'));
    logBootDebug('DB_DATABASE:', configService.get<string>('database.name'));
    logBootDebug(
      'DB_USERNAME:',
      configService.get<string>('database.username'),
    );
    logBootDebug('DB_SSL:', sslEnabled);
    logBootDebug('NODE_ENV:', configService.get<string>('nodeEnv'));
    logBootDebug('Connecting to PostgreSQL...');

    return {
      type: 'postgres' as const,
      host,
      port: configService.get<number>('database.port'),
      username: configService.get<string>('database.username'),
      password: configService.get<string>('database.password'),
      database: configService.get<string>('database.name'),
      autoLoadEntities: true,
      synchronize: false,
      logging: configService.get<boolean>('database.logging'),
      migrations: [join(__dirname, '../database/migrations/*{.ts,.js}')],
      migrationsTableName: 'typeorm_migrations',
      migrationsRun: false,
      // Mantener el peor caso por debajo de la ventana maxima del startup probe
      // de Cloud Run (240 s), sin renunciar a reintentos de cold start.
      retryAttempts: isProduction ? 6 : 5,
      retryDelay: isProduction ? 3000 : 2000,
      connectTimeoutMS: isProduction ? 15000 : 10000,
      extra: {
        connectionTimeoutMillis: isProduction ? 15000 : 10000,
      },
      ssl: sslEnabled ? { rejectUnauthorized: false } : false,
    };
  },
};
