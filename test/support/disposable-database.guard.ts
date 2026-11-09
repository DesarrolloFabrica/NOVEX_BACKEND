import { parse as parseEnvFile } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource, type DataSourceOptions } from 'typeorm';
import {
  isCloudDatabaseEnv,
  resolveDatabaseEnv,
  type ResolvedDatabaseEnv,
} from '../../src/configuration/resolve-database-env';

/**
 * GUARDA CENTRAL DE PRUEBAS DESTRUCTIVAS.
 *
 * Toda prueba que escribe en PostgreSQL real (e2e con AppModule, `*.pg.spec`,
 * integración, servidor aislado) pasa por aquí ANTES de ejecutar SQL. Existe
 * porque `DB_CLOUD=false` no basta: el `.env` de desarrollo apunta por defecto
 * a una base local con datos (incidente 2026-11-09: `phase2-http` truncó una
 * snapshot local). Nada de esto depende de `.env`: la autorización y el
 * destino se declaran en la invocación.
 *
 * Barrera 1 · ENTORNO (antes de conectar):
 *   - `NOVEX_DESTRUCTIVE_TESTS=1` explícito;
 *   - destino DECLARADO con `NOVEX_TEST_DB_HOST`, `NOVEX_TEST_DB_PORT` y
 *     `NOVEX_TEST_DB_NAME`, que debe coincidir exactamente con lo que la
 *     aplicación resolvería (perfil local de `DB_*`);
 *   - nunca Cloud SQL (perfil cloud ni socket `/cloudsql/`);
 *   - solo host de loopback;
 *   - nombre con patrón desechable (`novex_it_…` / `novex_e2e_…`) y sin
 *     palabras de bases reales (snapshot, local, prod, backup, restore).
 *
 * Barrera 2 · CONEXIÓN (antes de cualquier escritura):
 *   - `current_database()` coincide con el destino declarado;
 *   - la base lleva el comentario `novex:disposable-test-db`, que SOLO se pone
 *     al aprovisionar una base desechable. Una base normal o una snapshot no
 *     lo tiene, aunque alguien declare su nombre.
 *
 * Si algo no coincide, se lanza un error y la prueba aborta sin SQL.
 */

export const DESTRUCTIVE_TESTS_FLAG = 'NOVEX_DESTRUCTIVE_TESTS';
export const DISPOSABLE_DB_MARKER = 'novex:disposable-test-db';

/** Variables que SOLO valen declaradas en la invocación, nunca en `.env`. */
export const INVOCATION_ONLY_KEYS = [
  DESTRUCTIVE_TESTS_FLAG,
  'NOVEX_TEST_DB_HOST',
  'NOVEX_TEST_DB_PORT',
  'NOVEX_TEST_DB_NAME',
] as const;

const DEFAULT_ENV_FILE = join(__dirname, '../../.env');

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const DISPOSABLE_NAME = /^novex_(it|e2e)_[a-z0-9_]+$/;
const REAL_DATABASE_WORDS =
  /(snapshot|local|prod|produccion|backup|respaldo|restore|copia)/i;

type Env = NodeJS.ProcessEnv | Record<string, string | undefined>;

/** Reglas de host y nombre compartidas (también por la semilla e2e del FE). */
export function disposableTargetProblems(target: {
  host: string;
  database: string;
}): string[] {
  const problems: string[] = [];
  if (!LOOPBACK_HOSTS.has(target.host)) {
    problems.push(`el host "${target.host}" no es de loopback`);
  }
  if (!DISPOSABLE_NAME.test(target.database)) {
    problems.push(
      `el nombre "${target.database}" no sigue el patrón desechable novex_it_* / novex_e2e_*`,
    );
  }
  if (REAL_DATABASE_WORDS.test(target.database)) {
    problems.push(
      `el nombre "${target.database}" parece una base real (snapshot/local/prod/backup)`,
    );
  }
  return problems;
}

/**
 * La autorización y el destino desechable no pueden quedar fijos en `.env`:
 * si el archivo los define, cualquier ejecución futura heredaría el permiso.
 * Solo valen exportados en la invocación concreta.
 */
export function permanentAuthorizationProblems(envFilePath: string): string[] {
  if (!existsSync(envFilePath)) return [];
  const fileKeys = Object.keys(parseEnvFile(readFileSync(envFilePath)));
  const found = INVOCATION_ONLY_KEYS.filter((key) => fileKeys.includes(key));
  return found.length > 0
    ? [
        `${found.join(', ')} fijado(s) en ${envFilePath}: decláralos solo en la invocación`,
      ]
    : [];
}

/**
 * Barrera 1. Devuelve el destino resuelto (perfil local) si TODO coincide;
 * si no, lanza sin haber abierto ninguna conexión.
 */
export function assertDisposableDatabaseEnv(
  context: string,
  env: Env = process.env,
  envFilePath: string = DEFAULT_ENV_FILE,
): ResolvedDatabaseEnv {
  const problems: string[] = [...permanentAuthorizationProblems(envFilePath)];

  if (env[DESTRUCTIVE_TESTS_FLAG] !== '1') {
    problems.push(
      `falta la autorización explícita ${DESTRUCTIVE_TESTS_FLAG}=1`,
    );
  }
  if (isCloudDatabaseEnv(env)) {
    problems.push('la configuración apunta a Cloud SQL');
  }

  const declared = {
    host: env.NOVEX_TEST_DB_HOST?.trim(),
    port: env.NOVEX_TEST_DB_PORT?.trim(),
    database: env.NOVEX_TEST_DB_NAME?.trim(),
  };
  if (!declared.host || !declared.port || !declared.database) {
    problems.push(
      'falta declarar el destino desechable (NOVEX_TEST_DB_HOST, NOVEX_TEST_DB_PORT, NOVEX_TEST_DB_NAME)',
    );
  }

  let resolved: ResolvedDatabaseEnv | null = null;
  try {
    resolved = resolveDatabaseEnv(env, { profile: 'local' });
  } catch (error) {
    problems.push(
      `configuración DB_* incompleta: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (resolved && declared.host && declared.port && declared.database) {
    if (resolved.host !== declared.host) {
      problems.push(
        `DB_HOST resuelto "${resolved.host}" ≠ declarado "${declared.host}"`,
      );
    }
    if (String(resolved.port) !== declared.port) {
      problems.push(
        `DB_PORT resuelto ${resolved.port} ≠ declarado ${declared.port}`,
      );
    }
    if (resolved.database !== declared.database) {
      problems.push(
        `DB_DATABASE resuelto "${resolved.database}" ≠ declarado "${declared.database}"`,
      );
    }
  }
  if (resolved) {
    problems.push(...disposableTargetProblems(resolved));
  }

  if (problems.length > 0) {
    throw new Error(
      `[${context}] Prueba destructiva ABORTADA antes de ejecutar SQL:\n  - ${problems.join('\n  - ')}`,
    );
  }
  return resolved as ResolvedDatabaseEnv;
}

/** Barrera 2, sobre una conexión ya abierta y antes de cualquier escritura. */
export async function assertDisposableDatabaseConnection(
  context: string,
  dataSource: DataSource,
  expected: Pick<ResolvedDatabaseEnv, 'database'>,
): Promise<void> {
  const rows: Array<{ name: string; marker: string | null }> =
    await dataSource.query(
      `SELECT current_database() AS name,
              shobj_description(d.oid, 'pg_database') AS marker
         FROM pg_database d
        WHERE d.datname = current_database()`,
    );
  const row = rows[0];

  const problems: string[] = [];
  if (!row || row.name !== expected.database) {
    problems.push(
      `la conexión abrió "${row?.name ?? '?'}", no "${expected.database}"`,
    );
  }
  if (row?.marker !== DISPOSABLE_DB_MARKER) {
    problems.push(
      `la base no tiene la marca de desechable (COMMENT ON DATABASE … IS '${DISPOSABLE_DB_MARKER}')`,
    );
  }
  if (problems.length > 0) {
    throw new Error(
      `[${context}] Prueba destructiva ABORTADA antes de escribir:\n  - ${problems.join('\n  - ')}`,
    );
  }
}

/**
 * Ambas barreras con una conexión propia y efímera. Úsese ANTES de arrancar
 * `AppModule` (que escribe al iniciar: semillas de catálogo).
 */
export async function verifyDisposableDatabase(
  context: string,
  env: Env = process.env,
): Promise<ResolvedDatabaseEnv> {
  const target = assertDisposableDatabaseEnv(context, env);
  const probe = new DataSource(connectionOptions(target));
  await probe.initialize();
  try {
    await assertDisposableDatabaseConnection(context, probe, target);
  } finally {
    await probe.destroy();
  }
  return target;
}

/**
 * DataSource para `*.pg.spec`: valida el entorno, conecta y valida la marca
 * antes de devolverla. Ninguna suite debe crear su DataSource a mano.
 */
export async function openDisposableDataSource(
  context: string,
  extra: Partial<DataSourceOptions> = {},
  env: Env = process.env,
): Promise<DataSource> {
  const target = assertDisposableDatabaseEnv(context, env);
  const dataSource = new DataSource({
    ...connectionOptions(target),
    ...extra,
  } as DataSourceOptions);
  await dataSource.initialize();
  try {
    await assertDisposableDatabaseConnection(context, dataSource, target);
  } catch (error) {
    await dataSource.destroy();
    throw error;
  }
  return dataSource;
}

function connectionOptions(target: ResolvedDatabaseEnv): DataSourceOptions {
  return {
    type: 'postgres',
    host: target.host,
    port: target.port,
    username: target.username,
    password: target.password,
    database: target.database,
  };
}
