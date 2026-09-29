import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DOS TIPOS DE REGISTRO desde el Centro Operacional.
 *
 *   INTERNAL             Problema que ocurre en la coordinación responsable.
 *   INTER_COORDINATION   Dependencia: una coordinación afectada espera algo de
 *                        otra (la responsable). Un solo ID / estado / cierre.
 *
 * `coordination_id` SIGUE siendo la responsable (quien atiende y puede
 * resolver). `affected_coordination_id` es la que sufre el impacto.
 *
 * Históricos: se leen como INTERNAL y, si tenían dueña, esa dueña también es
 * la afectada. `category_id` pasa a ser nullable porque INTER no usa categoría
 * para simular el tipo.
 */
export class AddSituationReportKindAndAffectedCoordination1787400000000
  implements MigrationInterface
{
  name = 'AddSituationReportKindAndAffectedCoordination1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "situations_report_kind_enum" AS ENUM (
          'INTERNAL',
          'INTER_COORDINATION'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "situations"
      ADD COLUMN IF NOT EXISTS "report_kind" "situations_report_kind_enum"
        NOT NULL DEFAULT 'INTERNAL'
    `);

    await queryRunner.query(`
      ALTER TABLE "situations"
      ADD COLUMN IF NOT EXISTS "affected_coordination_id" uuid NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "situations"
      ADD COLUMN IF NOT EXISTS "affected_process" text NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "situations"
      ADD COLUMN IF NOT EXISTS "pending_delivery" text NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "situations"
      ALTER COLUMN "category_id" DROP NOT NULL
    `);

    await queryRunner.query(`
      UPDATE "situations"
      SET "affected_coordination_id" = "coordination_id"
      WHERE "affected_coordination_id" IS NULL
        AND "coordination_id" IS NOT NULL
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "situations"
        ADD CONSTRAINT "fk_situations_affected_coordination"
        FOREIGN KEY ("affected_coordination_id")
        REFERENCES "coordinations"("id")
        ON DELETE RESTRICT;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_situations_affected_coordination_status"
      ON "situations" ("affected_coordination_id", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_situations_report_kind"
      ON "situations" ("report_kind")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_situations_report_kind"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_situations_affected_coordination_status"`,
    );
    await queryRunner.query(`
      ALTER TABLE "situations"
      DROP CONSTRAINT IF EXISTS "fk_situations_affected_coordination"
    `);
    await queryRunner.query(`
      ALTER TABLE "situations"
      DROP COLUMN IF EXISTS "pending_delivery"
    `);
    await queryRunner.query(`
      ALTER TABLE "situations"
      DROP COLUMN IF EXISTS "affected_process"
    `);
    await queryRunner.query(`
      ALTER TABLE "situations"
      DROP COLUMN IF EXISTS "affected_coordination_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "situations"
      DROP COLUMN IF EXISTS "report_kind"
    `);
    await queryRunner.query(`
      ALTER TABLE "situations"
      ALTER COLUMN "category_id" SET NOT NULL
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "situations_report_kind_enum"`);
  }
}
