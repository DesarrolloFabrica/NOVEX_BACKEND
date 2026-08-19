import {
  applyResolvedDatabaseEnv,
  postgresSslOption,
  resolveDatabaseEnv,
} from '../configuration/resolve-database-env';
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
export function buildDataSourceOptions(
  profile: 'auto' | 'local' | 'cloud' = 'auto',
): DataSourceOptions {
  const resolved = resolveDatabaseEnv(process.env, { profile });
  applyResolvedDatabaseEnv(resolved);

  return {
    type: 'postgres',
    host: resolved.host,
    port: resolved.port,
    username: resolved.username,
    password: resolved.password,
    database: resolved.database,
    synchronize: false,
    logging: (process.env.DB_LOGGING ?? 'false') === 'true',
    entities: [join(__dirname, '../**/*.entity{.ts,.js}')],
    migrations: [join(__dirname, './migrations/*{.ts,.js}')],
    migrationsTableName: 'typeorm_migrations',
    migrationsRun: false,
    ssl: postgresSslOption(resolved),
  };
}

const dataSource = new DataSource(buildDataSourceOptions());

export default dataSource;
