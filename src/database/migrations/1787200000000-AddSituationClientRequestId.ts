import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Idempotencia del registro con análisis IA: columnas.
 * Aditiva: las filas existentes quedan con NULL. El índice único se crea en
 * 1787200000001 fuera de transacción, porque CONCURRENTLY no admite transacciones.
 * Reversión: el índice se elimina primero en 1787200000001; aquí solo se
 * eliminan las columnas.
 */
export class AddSituationClientRequestId1787200000000 implements MigrationInterface {
  name = 'AddSituationClientRequestId1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "situations"
        ADD COLUMN IF NOT EXISTS "client_request_id" uuid NULL,
        ADD COLUMN IF NOT EXISTS "request_fingerprint" character varying(64) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "situations"
        DROP COLUMN IF EXISTS "request_fingerprint",
        DROP COLUMN IF EXISTS "client_request_id"
    `);
  }
}
