import { DataSource } from 'typeorm';

const DEFAULT_CONNECTION_TIMEOUT_MS = 15_000;

type DatabasePreflightOptions = {
  timeoutMs?: number;
};

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    const error = new Error(`${name} is required for the database connection`);
    Object.assign(error, { code: 'DB_CONFIG_MISSING' });
    throw error;
  }

  return value;
}

function databaseSsl(host: string): false | { rejectUnauthorized: false } {
  const configured = process.env.DB_SSL?.trim().toLowerCase();
  const enabled =
    configured === 'true' ||
    (configured !== 'false' &&
      process.env.NODE_ENV === 'production' &&
      !host.startsWith('/cloudsql/'));

  return enabled ? { rejectUnauthorized: false } : false;
}

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
  const host = requiredEnvironment('DB_HOST');
  const port = Number.parseInt(requiredEnvironment('DB_PORT'), 10);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    const error = new Error('DB_PORT must be an integer between 1 and 65535');
    Object.assign(error, { code: 'DB_CONFIG_INVALID' });
    throw error;
  }

  const dataSource = new DataSource({
    type: 'postgres',
    host,
    port,
    username: requiredEnvironment('DB_USERNAME'),
    password: requiredEnvironment('DB_PASSWORD'),
    database: requiredEnvironment('DB_DATABASE'),
    ssl: databaseSsl(host),
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
