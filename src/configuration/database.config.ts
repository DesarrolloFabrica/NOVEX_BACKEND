import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModuleAsyncOptions } from '@nestjs/typeorm';
import { join } from 'node:path';

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
    const dbSslFlag = process.env.DB_SSL?.trim().toLowerCase();
    const sslEnabled =
      dbSslFlag === 'true' ||
      (dbSslFlag !== 'false' && isProduction && !host.startsWith('/cloudsql/'));

    console.log('TypeORM connection parameters:');
    console.log('DB_HOST:', host);
    console.log('DB_PORT:', configService.get<number>('database.port'));
    console.log('DB_DATABASE:', configService.get<string>('database.name'));
    console.log('DB_USERNAME:', configService.get<string>('database.username'));
    console.log('DB_SSL:', dbSslFlag ?? '(unset)');
    console.log('NODE_ENV:', configService.get<string>('nodeEnv'));
    console.log('Connecting to PostgreSQL...');

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
