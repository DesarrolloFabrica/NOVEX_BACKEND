import { DataSource } from 'typeorm';
import { seedE2eDatabase } from './seed-e2e-database';

const KEYS = [
  'NOVEX_DESTRUCTIVE_TESTS',
  'NOVEX_TEST_DB_HOST',
  'NOVEX_TEST_DB_PORT',
  'NOVEX_TEST_DB_NAME',
  'DB_CLOUD',
  'DB_HOST_LOCAL',
  'DB_PORT_LOCAL',
  'DB_USERNAME_LOCAL',
  'DB_PASSWORD_LOCAL',
  'DB_DATABASE_LOCAL',
  'DB_SSL_LOCAL',
  'DB_HOST',
  'DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_DATABASE',
  'DB_SSL',
] as const;

const VALID_ENV: Record<(typeof KEYS)[number], string> = {
  NOVEX_DESTRUCTIVE_TESTS: '1',
  NOVEX_TEST_DB_HOST: '127.0.0.1',
  NOVEX_TEST_DB_PORT: '55440',
  NOVEX_TEST_DB_NAME: 'novex_e2e_seed_spec',
  DB_CLOUD: 'false',
  DB_HOST_LOCAL: '127.0.0.1',
  DB_PORT_LOCAL: '55440',
  DB_USERNAME_LOCAL: 'novex_it',
  DB_PASSWORD_LOCAL: 'unit-test-only',
  DB_DATABASE_LOCAL: 'novex_e2e_seed_spec',
  DB_SSL_LOCAL: 'false',
  DB_HOST: '127.0.0.1',
  DB_PORT: '55440',
  DB_USERNAME: 'novex_it',
  DB_PASSWORD: 'unit-test-only',
  DB_DATABASE: 'novex_e2e_seed_spec',
  DB_SSL: 'false',
};

type InvalidEnvironmentCase = [string, () => void, RegExp];

const INVALID_ENVIRONMENT_CASES: InvalidEnvironmentCase[] = [
  [
    'autorización explícita ausente',
    () => delete process.env.NOVEX_DESTRUCTIVE_TESTS,
    /NOVEX_DESTRUCTIVE_TESTS=1/,
  ],
  [
    'host resuelto distinto al declarado',
    () => (process.env.DB_HOST_LOCAL = 'localhost'),
    /DB_HOST resuelto/,
  ],
  [
    'puerto resuelto distinto al declarado',
    () => (process.env.DB_PORT_LOCAL = '55441'),
    /DB_PORT resuelto/,
  ],
  [
    'base resuelta distinta a la declarada',
    () => (process.env.DB_DATABASE_LOCAL = 'novex_e2e_other'),
    /DB_DATABASE resuelto/,
  ],
  [
    'destino fuera de loopback',
    () => {
      process.env.NOVEX_TEST_DB_HOST = '192.0.2.10';
      process.env.DB_HOST_LOCAL = '192.0.2.10';
      process.env.DB_HOST = '192.0.2.10';
    },
    /no es de loopback/,
  ],
  ['perfil Cloud SQL', () => (process.env.DB_CLOUD = 'true'), /Cloud SQL/],
  [
    'nombre de base no desechable',
    () => {
      process.env.NOVEX_TEST_DB_NAME = 'novex';
      process.env.DB_DATABASE_LOCAL = 'novex';
      process.env.DB_DATABASE = 'novex';
    },
    /patrón desechable/,
  ],
];

describe('seed-e2e-database: barreras antes de DROP SCHEMA', () => {
  let original: Partial<Record<(typeof KEYS)[number], string>>;
  let initialize: jest.SpyInstance;
  let query: jest.SpyInstance;
  let destroy: jest.SpyInstance;

  beforeEach(() => {
    original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
    Object.assign(process.env, VALID_ENV);
    initialize = jest
      .spyOn(DataSource.prototype, 'initialize')
      .mockImplementation(function (this: DataSource) {
        return Promise.resolve(this);
      });
    query = jest
      .spyOn(DataSource.prototype, 'query')
      .mockResolvedValue([{ name: 'novex_e2e_seed_spec', marker: null }]);
    destroy = jest
      .spyOn(DataSource.prototype, 'destroy')
      .mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    initialize.mockRestore();
    query.mockRestore();
    destroy.mockRestore();
    for (const key of KEYS) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it.each(INVALID_ENVIRONMENT_CASES)(
    'aborta sin conexión ni SQL si falta %s',
    async (_label, change, error) => {
      change();

      await expect(seedE2eDatabase()).rejects.toThrow(error);

      expect(initialize).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
      expect(destroy).not.toHaveBeenCalled();
    },
  );

  it('aborta sin DROP si la conexión no tiene la marca desechable', async () => {
    await expect(seedE2eDatabase()).rejects.toThrow(/marca de desechable/);

    expect(initialize).toHaveBeenCalledTimes(1); // solo el probe de lectura
    expect(query).toHaveBeenCalledTimes(1);
    const sqlCalls = query.mock.calls as Array<[string, ...unknown[]]>;
    expect(sqlCalls[0]?.[0]).toMatch(/current_database\(\)/);
    expect(sqlCalls[0]?.[0]).not.toMatch(/DROP SCHEMA/i);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
