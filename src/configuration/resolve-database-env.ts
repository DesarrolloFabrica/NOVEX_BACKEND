export type DatabaseProfile = 'local' | 'cloud';

export interface ResolvedDatabaseEnv {
  profile: DatabaseProfile;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
}

type EnvSource = Record<string, unknown> | NodeJS.ProcessEnv;

function normalize(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

function read(source: EnvSource, key: string): string | undefined {
  return normalize((source as Record<string, unknown>)[key]);
}

function isCloudFlag(source: EnvSource): boolean {
  return read(source, 'DB_CLOUD') === 'true';
}

function pick(
  source: EnvSource,
  base: string,
  suffix: 'LOCAL' | 'CLOUD',
): string | undefined {
  return (
    read(source, `${base}_${suffix}`) ??
    (suffix === 'CLOUD' ? read(source, `CLOUD_${base}`) : undefined) ??
    read(source, base)
  );
}

/**
 * Resuelve local vs Cloud SQL desde .env.
 * Una línea: DB_CLOUD=false (local) o DB_CLOUD=true (Cloud).
 */
export function resolveDatabaseEnv(
  source: EnvSource = process.env,
  options?: { profile?: DatabaseProfile | 'auto' },
): ResolvedDatabaseEnv {
  const requested = options?.profile ?? 'auto';
  const profile: DatabaseProfile =
    requested === 'auto'
      ? isCloudFlag(source)
        ? 'cloud'
        : 'local'
      : requested;
  const suffix = profile === 'cloud' ? 'CLOUD' : 'LOCAL';

  const host =
    pick(source, 'DB_HOST', suffix) ??
    (profile === 'local' ? 'localhost' : undefined);
  const port = Number(pick(source, 'DB_PORT', suffix) ?? 5432);
  const username =
    pick(source, 'DB_USERNAME', suffix) ??
    (profile === 'local' ? 'novex' : undefined);
  const password =
    pick(source, 'DB_PASSWORD', suffix) ??
    (profile === 'local' ? 'novex' : undefined);
  const database =
    pick(source, 'DB_DATABASE', suffix) ??
    (profile === 'local' ? 'novex' : undefined);
  const sslRaw =
    pick(source, 'DB_SSL', suffix) ?? (profile === 'cloud' ? 'true' : 'false');

  if (!host || !username || password === undefined || !database) {
    throw new Error(
      `[DB] Configuración incompleta para perfil "${profile}". Revisa DB_*_${suffix} en NOVEX_BACKEND/.env`,
    );
  }

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`[DB] DB_PORT_${suffix} inválido: ${port}`);
  }

  return {
    profile,
    host,
    port,
    username,
    password,
    database,
    ssl: sslRaw === 'true',
  };
}

export function applyResolvedDatabaseEnv(
  resolved: ResolvedDatabaseEnv,
  env: NodeJS.ProcessEnv = process.env,
): void {
  env.DB_HOST = resolved.host;
  env.DB_PORT = String(resolved.port);
  env.DB_USERNAME = resolved.username;
  env.DB_PASSWORD = resolved.password;
  env.DB_DATABASE = resolved.database;
  env.DB_SSL = resolved.ssl ? 'true' : 'false';
}

export function postgresSslOption(
  resolved: ResolvedDatabaseEnv,
): false | { rejectUnauthorized: false } {
  return resolved.ssl ? { rejectUnauthorized: false } : false;
}

export function assertLocalDatabaseProfile(action: string): void {
  const resolved = resolveDatabaseEnv(process.env);
  if (resolved.profile !== 'cloud') return;
  if (process.env.ALLOW_CLOUD_SEED === 'true') return;

  throw new Error(
    `${action} abortado: DB_CLOUD=true apunta a Cloud SQL. ` +
      `Usa DB_CLOUD=false para seeds locales, o ALLOW_CLOUD_SEED=true si es intencional.`,
  );
}
