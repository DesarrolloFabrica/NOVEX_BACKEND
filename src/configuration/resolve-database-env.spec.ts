import {
  applyResolvedDatabaseEnv,
  assertLocalDatabaseProfile,
  resolveDatabaseEnv,
} from './resolve-database-env';

describe('resolveDatabaseEnv', () => {
  it('usa el bloque LOCAL cuando DB_CLOUD no es true', () => {
    const resolved = resolveDatabaseEnv({
      DB_CLOUD: 'false',
      DB_HOST_LOCAL: 'localhost',
      DB_PORT_LOCAL: '5432',
      DB_USERNAME_LOCAL: 'novex',
      DB_PASSWORD_LOCAL: 'novex',
      DB_DATABASE_LOCAL: 'novex',
      DB_SSL_LOCAL: 'false',
      DB_HOST_CLOUD: '34.0.0.1',
      DB_PASSWORD_CLOUD: 'secret',
    });

    expect(resolved.profile).toBe('local');
    expect(resolved.host).toBe('localhost');
    expect(resolved.ssl).toBe(false);
  });

  it('usa el bloque CLOUD cuando DB_CLOUD=true', () => {
    const resolved = resolveDatabaseEnv({
      DB_CLOUD: 'true',
      DB_HOST_LOCAL: 'localhost',
      DB_PASSWORD_LOCAL: 'novex',
      DB_HOST_CLOUD: '34.31.17.63',
      DB_PORT_CLOUD: '5432',
      DB_USERNAME_CLOUD: 'novex',
      DB_PASSWORD_CLOUD: 'cloud-secret',
      DB_DATABASE_CLOUD: 'novex',
      DB_SSL_CLOUD: 'true',
    });

    expect(resolved.profile).toBe('cloud');
    expect(resolved.host).toBe('34.31.17.63');
    expect(resolved.password).toBe('cloud-secret');
    expect(resolved.ssl).toBe(true);
  });

  it('fuerza Cloud aunque DB_CLOUD=false', () => {
    const resolved = resolveDatabaseEnv(
      {
        DB_CLOUD: 'false',
        DB_HOST_CLOUD: '34.31.17.63',
        DB_USERNAME_CLOUD: 'novex',
        DB_PASSWORD_CLOUD: 'cloud-secret',
        DB_DATABASE_CLOUD: 'novex',
      },
      { profile: 'cloud' },
    );

    expect(resolved.profile).toBe('cloud');
    expect(resolved.host).toBe('34.31.17.63');
  });

  it('acepta el formato legado DB_HOST sin sufijo', () => {
    const resolved = resolveDatabaseEnv({
      DB_HOST: '127.0.0.1',
      DB_PORT: '5432',
      DB_USERNAME: 'test-user',
      DB_PASSWORD: 'test-db-password',
      DB_DATABASE: 'test-db',
    });

    expect(resolved.profile).toBe('local');
    expect(resolved.host).toBe('127.0.0.1');
    expect(resolved.username).toBe('test-user');
  });

  it('aplica el perfil resuelto sobre process.env', () => {
    const env: NodeJS.ProcessEnv = {};
    applyResolvedDatabaseEnv(
      {
        profile: 'local',
        host: 'localhost',
        port: 5432,
        username: 'novex',
        password: 'novex',
        database: 'novex',
        ssl: false,
      },
      env,
    );

    expect(env.DB_HOST).toBe('localhost');
    expect(env.DB_SSL).toBe('false');
  });

  it('bloquea seeds contra Cloud salvo ALLOW_CLOUD_SEED', () => {
    const previousCloud = process.env.DB_CLOUD;
    const previousAllow = process.env.ALLOW_CLOUD_SEED;
    const previousHost = process.env.DB_HOST_CLOUD;
    const previousUser = process.env.DB_USERNAME_CLOUD;
    const previousPassword = process.env.DB_PASSWORD_CLOUD;
    const previousDatabase = process.env.DB_DATABASE_CLOUD;

    process.env.DB_CLOUD = 'true';
    process.env.DB_HOST_CLOUD = '34.31.17.63';
    process.env.DB_USERNAME_CLOUD = 'novex';
    process.env.DB_PASSWORD_CLOUD = 'cloud-secret';
    process.env.DB_DATABASE_CLOUD = 'novex';
    delete process.env.ALLOW_CLOUD_SEED;

    expect(() => assertLocalDatabaseProfile('seed:operaciones')).toThrow(
      /DB_CLOUD=true/,
    );

    process.env.ALLOW_CLOUD_SEED = 'true';
    expect(() => assertLocalDatabaseProfile('seed:operaciones')).not.toThrow();

    process.env.DB_CLOUD = previousCloud;
    process.env.ALLOW_CLOUD_SEED = previousAllow;
    process.env.DB_HOST_CLOUD = previousHost;
    process.env.DB_USERNAME_CLOUD = previousUser;
    process.env.DB_PASSWORD_CLOUD = previousPassword;
    process.env.DB_DATABASE_CLOUD = previousDatabase;
  });
});
