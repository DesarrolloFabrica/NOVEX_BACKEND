import {
  applyResolvedDatabaseEnv,
  assertCloudDatabaseCliAllowed,
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
    // 'each': cada migración en su propia transacción. Permite marcar migraciones
    // concretas con transaction = false (CREATE INDEX CONCURRENTLY). 'all' lo prohíbe.
    migrationsTransactionMode: 'each',
    ssl: postgresSslOption(resolved),
  };
}

/**
 * DATA SOURCE DEL CLI (`migration:*`) y de los seeds locales.
 *
 * Valida el destino al CONECTAR, no al importar: el CLI de TypeORM llama a
 * `initialize()` antes de migrar, y así los scripts que importan este módulo
 * pero abren su propia conexión explícita a la nube (`cloud:sql`,
 * sincronización de usuarios) no se ven afectados. Contra Cloud SQL exige
 * `ALLOW_CLOUD_MIGRATIONS=true` en la invocación; antes no había ninguna
 * barrera y `DB_CLOUD=true` bastaba para migrar o revertir producción.
 */
class GuardedCliDataSource extends DataSource {
  override async initialize(): Promise<this> {
    assertCloudDatabaseCliAllowed('Conexión del CLI de base de datos');
    return super.initialize();
  }
}

const dataSource = new GuardedCliDataSource(buildDataSourceOptions());

export default dataSource;
