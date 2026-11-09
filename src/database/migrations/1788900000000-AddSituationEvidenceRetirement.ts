import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FASE 01B.2 · RETIRO (SOFT DELETE) DE EVIDENCIAS.
 *
 * Una evidencia deja de estar activa sin borrarse: se registran fecha, autor y
 * motivo obligatorio. Las retiradas no aparecen como activas ni viajan a
 * Gemini; el historial se conserva y se consulta con acceso controlado.
 *
 * - Columnas `retired_at`, `retired_by_user_id`, `retirement_reason`, todas
 *   nulas (activa) o todas presentes (retirada), con motivo de 10 a 1000
 *   caracteres (mismo criterio que la anulación).
 * - Un retiro no se deshace: un trigger rechaza volver a NULL o cambiar los
 *   datos de un retiro ya registrado.
 * - Evento de línea de tiempo `ATTACHMENT_RETIRED` (no se usa en esta
 *   transacción, regla de PostgreSQL para ADD VALUE).
 *
 * ADITIVA: no toca filas existentes; todas siguen activas.
 * REVERSIBILIDAD: `down()` se niega si existe alguna evidencia retirada
 * (revertir la haría reaparecer como activa). El valor de enum no se retira
 * (mismo criterio que 1788300000000).
 */
export class AddSituationEvidenceRetirement1788900000000 implements MigrationInterface {
  name = 'AddSituationEvidenceRetirement1788900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "situation_timeline_entries_event_type_enum"
      ADD VALUE IF NOT EXISTS 'ATTACHMENT_RETIRED'
    `);

    await queryRunner.query(`
      ALTER TABLE "situation_evidences"
        ADD COLUMN IF NOT EXISTS "retired_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "retired_by_user_id" uuid,
        ADD COLUMN IF NOT EXISTS "retirement_reason" text
    `);

    await queryRunner.query(`
      ALTER TABLE "situation_evidences"
        ADD CONSTRAINT "fk_situation_evidences_retired_by"
          FOREIGN KEY ("retired_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        ADD CONSTRAINT "chk_situation_evidences_retirement_complete" CHECK (
          ("retired_at" IS NULL AND "retired_by_user_id" IS NULL AND "retirement_reason" IS NULL)
          OR (
            "retired_at" IS NOT NULL
            AND "retired_by_user_id" IS NOT NULL
            AND char_length(btrim("retirement_reason")) BETWEEN 10 AND 1000
          )
        )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_situation_evidences_active"
      ON "situation_evidences" ("situation_id", "created_at")
      WHERE "retired_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "novex_reject_evidence_unretire"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.retired_at IS NOT NULL AND (
          NEW.retired_at IS DISTINCT FROM OLD.retired_at
          OR NEW.retired_by_user_id IS DISTINCT FROM OLD.retired_by_user_id
          OR NEW.retirement_reason IS DISTINCT FROM OLD.retirement_reason
        ) THEN
          RAISE EXCEPTION 'El retiro de una evidencia es definitivo y no se modifica.'
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_situation_evidences_retirement_final" ON "situation_evidences"
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_situation_evidences_retirement_final"
      BEFORE UPDATE ON "situation_evidences"
      FOR EACH ROW EXECUTE FUNCTION "novex_reject_evidence_unretire"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $novex$
      BEGIN
        IF EXISTS (SELECT 1 FROM situation_evidences WHERE retired_at IS NOT NULL) THEN
          RAISE EXCEPTION 'No se revierte: existen evidencias retiradas que reaparecerían como activas';
        END IF;
      END
      $novex$;
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_situation_evidences_retirement_final" ON "situation_evidences"
    `);
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS "novex_reject_evidence_unretire"()`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_situation_evidences_active"`,
    );
    await queryRunner.query(`
      ALTER TABLE "situation_evidences"
        DROP CONSTRAINT IF EXISTS "chk_situation_evidences_retirement_complete",
        DROP CONSTRAINT IF EXISTS "fk_situation_evidences_retired_by",
        DROP COLUMN IF EXISTS "retirement_reason",
        DROP COLUMN IF EXISTS "retired_by_user_id",
        DROP COLUMN IF EXISTS "retired_at"
    `);
  }
}
