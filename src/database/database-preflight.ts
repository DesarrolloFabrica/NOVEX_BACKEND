import { DataSource } from 'typeorm';
import {
  postgresSslOption,
  resolveDatabaseEnv,
} from '../configuration/resolve-database-env';

const DEFAULT_CONNECTION_TIMEOUT_MS = 15_000;

type DatabasePreflightOptions = {
  timeoutMs?: number;
};

function timeoutError(timeoutMs: number): Error {
  const error = new Error(
    `PostgreSQL preflight exceeded ${timeoutMs} ms before completing`,
  );
  Object.assign(error, { code: 'DB_PREFLIGHT_TIMEOUT' });
  return error;
}

async function withinTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(timeoutError(timeoutMs)), timeoutMs);
  });

  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Verifica el mismo enlace PostgreSQL que usara TypeORM antes de construir Nest.
 * Mantiene el error de socket/autenticacion observable desde readiness y evita
 * que un handshake bloqueado consuma toda la ventana de despliegue de Cloud Run.
 */
export async function verifyDatabaseConnection(
  options: DatabasePreflightOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS;
  const resolved = resolveDatabaseEnv(process.env);

  const dataSource = new DataSource({
    type: 'postgres',
    host: resolved.host,
    port: resolved.port,
    username: resolved.username,
    password: resolved.password,
    database: resolved.database,
    ssl: postgresSslOption(resolved),
    connectTimeoutMS: timeoutMs,
    extra: { connectionTimeoutMillis: timeoutMs },
  });

  try {
    await withinTimeout(dataSource.initialize(), timeoutMs);
    await withinTimeout(dataSource.query('SELECT 1'), timeoutMs);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}
