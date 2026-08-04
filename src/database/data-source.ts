import { config as loadEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { join } from 'node:path';

loadEnv({
  path: join(__dirname, '../../.env'),
  // No sobrescribe variables ya definidas en el proceso (CI / scripts).
  override: false,
});

/**
 * Opciones compartidas entre NestJS (runtime) y TypeORM CLI (migrations).
 * synchronize queda siempre desactivado: el esquema se administra solo con migraciones.
 */
export function buildDataSourceOptions(): DataSourceOptions {
  const isProduction = (process.env.NODE_ENV ?? 'development') === 'production';
  const host = process.env.DB_HOST ?? 'localhost';
  const dbSslFlag = process.env.DB_SSL?.trim().toLowerCase();
  const sslEnabled =
    dbSslFlag === 'true' ||
    (dbSslFlag !== 'false' && isProduction && !host.startsWith('/cloudsql/'));

  return {
    type: 'postgres',
    host,
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'novex',
    password: process.env.DB_PASSWORD ?? 'novex',
    database: process.env.DB_DATABASE ?? 'novex',
    synchronize: false,
    logging: (process.env.DB_LOGGING ?? 'false') === 'true',
    entities: [join(__dirname, '../**/*.entity{.ts,.js}')],
    migrations: [join(__dirname, './migrations/*{.ts,.js}')],
    migrationsTableName: 'typeorm_migrations',
    migrationsRun: false,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
  };
}

const dataSource = new DataSource(buildDataSourceOptions());

export default dataSource;
