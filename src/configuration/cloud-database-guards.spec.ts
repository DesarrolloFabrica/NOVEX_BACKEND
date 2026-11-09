import { isCatalogSeedEnabled } from './catalog-seed.guard';
import {
  assertCloudDatabaseCliAllowed,
  assertLocalDatabaseProfile,
  isCloudDatabaseEnv,
} from './resolve-database-env';

/**
 * Fase 01A · OP-02. Ninguna escritura de desarrollo (seeds de arranque, seeds
 * de CLI, migraciones) debe llegar a Cloud SQL sin una confirmación explícita.
 *
 * Dos formas de apuntar a la nube:
 *   - perfil cloud: `DB_CLOUD=true` + `DB_*_CLOUD` (proxy local);
 *   - socket de Cloud Run: `DB_HOST=/cloudsql/<instancia>` SIN `DB_CLOUD`, que
 *     es exactamente cómo se conecta producción y que el perfil, por sí solo,
 *     resolvía como «local».
 */
const KEYS = [
  'DB_CLOUD',
  'DB_HOST',
  'DB_HOST_LOCAL',
  'DB_HOST_CLOUD',
  'DB_PORT',
  'DB_USERNAME',
  'DB_USERNAME_CLOUD',
  'DB_PASSWORD',
  'DB_PASSWORD_CLOUD',
  'DB_DATABASE',
  'DB_DATABASE_CLOUD',
  'NODE_ENV',
  'CATALOG_SEED_ON_BOOT',
  'ALLOW_CLOUD_SEED',
  'ALLOW_CLOUD_MIGRATIONS',
] as const;

const PROXY_CLOUD = {
  DB_CLOUD: 'true',
  DB_HOST_CLOUD: '127.0.0.1',
  DB_USERNAME_CLOUD: 'novex',
  DB_PASSWORD_CLOUD: 'x',
  DB_DATABASE_CLOUD: 'novex',
};

const CLOUD_RUN_SOCKET = {
  DB_HOST: '/cloudsql/proyecto:region:instancia',
  DB_USERNAME: 'novex',
  DB_PASSWORD: 'x',
  DB_DATABASE: 'novex',
};

const LOCAL = {
  DB_CLOUD: 'false',
  DB_HOST_LOCAL: 'localhost',
};

describe('Fase 01A · guardas de base de datos en la nube', () => {
  const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  const setEnv = (values: Record<string, string>) =>
    Object.assign(process.env, values);

  describe('detección del destino', () => {
    it('perfil cloud (DB_CLOUD=true) es nube', () => {
      setEnv(PROXY_CLOUD);
      expect(isCloudDatabaseEnv()).toBe(true);
    });

    it('socket /cloudsql/ sin DB_CLOUD también es nube', () => {
      setEnv(CLOUD_RUN_SOCKET);
      expect(isCloudDatabaseEnv()).toBe(true);
    });

    it('perfil local no es nube', () => {
      setEnv(LOCAL);
      expect(isCloudDatabaseEnv()).toBe(false);
    });

    it('configuración de nube incompleta falla cerrado (se trata como nube)', () => {
      setEnv({ DB_CLOUD: 'true' });
      expect(isCloudDatabaseEnv()).toBe(true);
    });
  });

  describe('seeds de catálogo al arrancar', () => {
    it.each([
      ['proxy (DB_CLOUD=true)', PROXY_CLOUD],
      ['socket de Cloud Run', CLOUD_RUN_SOCKET],
    ])(
      'contra la nube NO corren, aunque NODE_ENV=development y CATALOG_SEED_ON_BOOT=true: %s',
      (_label, env) => {
        setEnv({
          ...env,
          NODE_ENV: 'development',
          CATALOG_SEED_ON_BOOT: 'true',
        });
        expect(isCatalogSeedEnabled()).toBe(false);
      },
    );

    it('contra la nube solo con ALLOW_CLOUD_SEED=true explícito', () => {
      setEnv({
        ...PROXY_CLOUD,
        CATALOG_SEED_ON_BOOT: 'true',
        ALLOW_CLOUD_SEED: 'true',
      });
      expect(isCatalogSeedEnabled()).toBe(true);
    });

    it('en local conserva el comportamiento previo (development → sí)', () => {
      setEnv({ ...LOCAL, NODE_ENV: 'development' });
      expect(isCatalogSeedEnabled()).toBe(true);
    });

    it('en local, production sigue desactivado por defecto', () => {
      setEnv({ ...LOCAL, NODE_ENV: 'production' });
      expect(isCatalogSeedEnabled()).toBe(false);
    });
  });

  describe('CLI de migraciones y seeds con el data source por defecto', () => {
    it.each([
      ['proxy (DB_CLOUD=true)', PROXY_CLOUD],
      ['socket de Cloud Run', CLOUD_RUN_SOCKET],
    ])('aborta contra la nube sin confirmación: %s', (_label, env) => {
      setEnv(env);
      expect(() => assertCloudDatabaseCliAllowed('migration:run')).toThrow(
        /ALLOW_CLOUD_MIGRATIONS=true/,
      );
    });

    it('permite la nube con ALLOW_CLOUD_MIGRATIONS=true', () => {
      setEnv({ ...PROXY_CLOUD, ALLOW_CLOUD_MIGRATIONS: 'true' });
      expect(() =>
        assertCloudDatabaseCliAllowed('migration:run'),
      ).not.toThrow();
    });

    it('ALLOW_CLOUD_SEED no sirve como confirmación de migraciones', () => {
      setEnv({ ...PROXY_CLOUD, ALLOW_CLOUD_SEED: 'true' });
      expect(() => assertCloudDatabaseCliAllowed('migration:run')).toThrow();
    });

    it('no interfiere en local', () => {
      setEnv(LOCAL);
      expect(() =>
        assertCloudDatabaseCliAllowed('migration:run'),
      ).not.toThrow();
    });
  });

  describe('seeds de CLI (seed:rbac y demás)', () => {
    it('el socket /cloudsql/ también bloquea los seeds', () => {
      setEnv(CLOUD_RUN_SOCKET);
      expect(() => assertLocalDatabaseProfile('seed:rbac')).toThrow(
        /seed:rbac abortado/,
      );
    });
  });
});
