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
    const isProduction =
      configService.get<string>('nodeEnv') === 'production';

    return {
      type: 'postgres' as const,
      host: configService.get<string>('database.host'),
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
      ssl: isProduction ? { rejectUnauthorized: false } : false,
    };
  },
};
