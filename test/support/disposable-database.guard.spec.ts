import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DataSource } from 'typeorm';
import {
  DISPOSABLE_DB_MARKER,
  assertDisposableDatabaseConnection,
  assertDisposableDatabaseEnv,
  openDisposableDataSource,
} from './disposable-database.guard';

/**
 * Guarda central de pruebas destructivas. Se prueba con entornos explícitos
 * (nunca `process.env`) y sin conectar a ninguna base.
 */

/** Destino desechable correctamente declarado y autorizado. */
const DISPOSABLE = {
  NOVEX_DESTRUCTIVE_TESTS: '1',
  NOVEX_TEST_DB_HOST: '127.0.0.1',
  NOVEX_TEST_DB_PORT: '55440',
  NOVEX_TEST_DB_NAME: 'novex_it_fase01a',
  DB_CLOUD: 'false',
  DB_HOST_LOCAL: '127.0.0.1',
  DB_PORT_LOCAL: '55440',
  DB_USERNAME_LOCAL: 'novex_it',
  DB_PASSWORD_LOCAL: 'x',
  DB_DATABASE_LOCAL: 'novex_it_fase01a',
};

/** Ruta inexistente: las pruebas no dependen del .env de quien las ejecuta. */
const NO_ENV_FILE = join(tmpdir(), 'novex-guard-spec-sin-env', '.env');

const reasonOf = (
  env: Record<string, string | undefined>,
  envFile: string = NO_ENV_FILE,
) => {
  try {
    assertDisposableDatabaseEnv('prueba', env, envFile);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
};

describe('guarda central de pruebas destructivas', () => {
  describe('barrera 1 · entorno (sin conectar)', () => {
    it('acepta un destino desechable autorizado, declarado y coincidente', () => {
      expect(
        assertDisposableDatabaseEnv('prueba', DISPOSABLE, NO_ENV_FILE),
      ).toMatchObject({
        host: '127.0.0.1',
        port: 55440,
        database: 'novex_it_fase01a',
        profile: 'local',
      });
    });

    it('INCIDENTE 2026-11-09: la snapshot local del .env aborta aunque DB_CLOUD=false', () => {
      const reason = reasonOf({
        // Lo que había en .env: base local con datos, puerto 5442.
        DB_CLOUD: 'false',
        DB_HOST_LOCAL: 'localhost',
        DB_PORT_LOCAL: '5442',
        DB_USERNAME_LOCAL: 'novex',
        DB_PASSWORD_LOCAL: 'x',
        DB_DATABASE_LOCAL: 'novex_local_snapshot_20261028',
      });
      expect(reason).toMatch(/NOVEX_DESTRUCTIVE_TESTS=1/);
      expect(reason).toMatch(/declarar el destino/);
      expect(reason).toMatch(/patrón desechable/);
      expect(reason).toMatch(/parece una base real/);
    });

    it('…y también si alguien la declara y autoriza a mano', () => {
      const reason = reasonOf({
        ...DISPOSABLE,
        NOVEX_TEST_DB_PORT: '5442',
        NOVEX_TEST_DB_NAME: 'novex_local_snapshot_20261028',
        DB_PORT_LOCAL: '5442',
        DB_DATABASE_LOCAL: 'novex_local_snapshot_20261028',
      });
      expect(reason).toMatch(/parece una base real/);
    });

    it('rechaza la base local normal de desarrollo', () => {
      expect(
        reasonOf({
          ...DISPOSABLE,
          NOVEX_TEST_DB_NAME: 'novex',
          DB_DATABASE_LOCAL: 'novex',
        }),
      ).toMatch(/patrón desechable/);
    });

    it('rechaza la autorización o el destino fijados de forma permanente en .env', () => {
      const dir = mkdtempSync(join(tmpdir(), 'novex-guard-'));
      const envFile = join(dir, '.env');
      writeFileSync(
        envFile,
        [
          'NOVEX_DESTRUCTIVE_TESTS=1',
          'NOVEX_TEST_DB_NAME=novex_it_fase01a',
        ].join('\n'),
      );
      expect(reasonOf(DISPOSABLE, envFile)).toMatch(
        'NOVEX_DESTRUCTIVE_TESTS, NOVEX_TEST_DB_NAME fijado(s)',
      );
    });

    it('exige la autorización explícita', () => {
      expect(
        reasonOf({ ...DISPOSABLE, NOVEX_DESTRUCTIVE_TESTS: undefined }),
      ).toMatch(/NOVEX_DESTRUCTIVE_TESTS=1/);
      expect(
        reasonOf({ ...DISPOSABLE, NOVEX_DESTRUCTIVE_TESTS: 'true' }),
      ).toMatch(/NOVEX_DESTRUCTIVE_TESTS=1/);
    });

    it.each([
      ['host', { NOVEX_TEST_DB_HOST: 'localhost' }, /DB_HOST resuelto/],
      ['puerto', { NOVEX_TEST_DB_PORT: '5442' }, /DB_PORT resuelto/],
      [
        'nombre',
        { NOVEX_TEST_DB_NAME: 'novex_it_otra' },
        /DB_DATABASE resuelto/,
      ],
    ])(
      'aborta si el %s declarado no coincide con el que usaría la aplicación',
      (_label, override, pattern) => {
        expect(reasonOf({ ...DISPOSABLE, ...override })).toMatch(pattern);
      },
    );

    it('rechaza Cloud SQL por perfil y por socket /cloudsql/', () => {
      expect(
        reasonOf({
          ...DISPOSABLE,
          DB_CLOUD: 'true',
          DB_HOST_CLOUD: '127.0.0.1',
          DB_USERNAME_CLOUD: 'u',
          DB_PASSWORD_CLOUD: 'p',
          DB_DATABASE_CLOUD: 'novex',
        }),
      ).toMatch(/Cloud SQL/);
      expect(
        reasonOf({
          ...DISPOSABLE,
          NOVEX_TEST_DB_HOST: '/cloudsql/proyecto:region:instancia',
          DB_HOST_LOCAL: '/cloudsql/proyecto:region:instancia',
        }),
      ).toMatch(/Cloud SQL/);
    });

    it('rechaza hosts que no son de loopback', () => {
      expect(
        reasonOf({
          ...DISPOSABLE,
          NOVEX_TEST_DB_HOST: '10.0.0.5',
          DB_HOST_LOCAL: '10.0.0.5',
        }),
      ).toMatch(/loopback/);
    });

    it('openDisposableDataSource no abre conexión si el entorno falla', async () => {
      await expect(
        openDisposableDataSource('prueba', {}, { DB_DATABASE_LOCAL: 'novex' }),
      ).rejects.toThrow(/ABORTADA antes de ejecutar SQL/);
    });
  });

  describe('barrera 2 · conexión (antes de escribir)', () => {
    const fakeDataSource = (row: { name: string; marker: string | null }) =>
      ({ query: jest.fn().mockResolvedValue([row]) }) as unknown as DataSource;

    it('acepta la base esperada con la marca de desechable', async () => {
      await expect(
        assertDisposableDatabaseConnection(
          'prueba',
          fakeDataSource({
            name: 'novex_it_fase01a',
            marker: DISPOSABLE_DB_MARKER,
          }),
          { database: 'novex_it_fase01a' },
        ),
      ).resolves.toBeUndefined();
    });

    it('rechaza una base sin la marca, aunque el nombre coincida', async () => {
      await expect(
        assertDisposableDatabaseConnection(
          'prueba',
          fakeDataSource({ name: 'novex_it_fase01a', marker: null }),
          { database: 'novex_it_fase01a' },
        ),
      ).rejects.toThrow(/marca de desechable/);
    });

    it('rechaza si la conexión abrió otra base', async () => {
      await expect(
        assertDisposableDatabaseConnection(
          'prueba',
          fakeDataSource({
            name: 'novex_local_snapshot_20261028',
            marker: DISPOSABLE_DB_MARKER,
          }),
          { database: 'novex_it_fase01a' },
        ),
      ).rejects.toThrow(/abrió "novex_local_snapshot_20261028"/);
    });
  });
});
