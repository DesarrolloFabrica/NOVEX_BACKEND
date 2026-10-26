import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Identidad estable para evidencias generadas por la captura.
 * `client_key` identifica la nota (p. ej. `capture:detection`), no su título:
 * dos evidencias legítimas pueden compartir título sin perderse.
 * Aditiva: las evidencias existentes quedan con NULL.
 */
export class AddSituationEvidenceClientKey1787400000000 implements MigrationInterface {
  name = 'AddSituationEvidenceClientKey1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "situation_evidences"
        ADD COLUMN IF NOT EXISTS "client_key" varchar(64) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "situation_evidences" DROP COLUMN IF EXISTS "client_key"
    `);
  }
}
