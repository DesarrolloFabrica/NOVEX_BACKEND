import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reclamo de análisis IA por situación (lease con token).
 *
 * - `analysis_claim_token`: identificador del intento que tiene el derecho a
 *   analizar y confirmar. Cualquier cambio de token invalida al intento anterior.
 * - `analysis_claim_expires_at`: permite a otro intento tomar el control si el
 *   anterior quedó interrumpido. No prueba por sí solo que el anterior terminó;
 *   la seguridad la da el token (confirmación y borrado fenciados).
 *
 * Aditiva: las filas existentes quedan con NULL, es decir, sin reclamo activo.
 */
export class AddSituationAnalysisClaim1787300000000 implements MigrationInterface {
  name = 'AddSituationAnalysisClaim1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "situations"
        ADD COLUMN IF NOT EXISTS "analysis_claim_token" uuid NULL,
        ADD COLUMN IF NOT EXISTS "analysis_claim_expires_at" timestamptz NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "situations"
        DROP COLUMN IF EXISTS "analysis_claim_expires_at",
        DROP COLUMN IF EXISTS "analysis_claim_token"
    `);
  }
}
