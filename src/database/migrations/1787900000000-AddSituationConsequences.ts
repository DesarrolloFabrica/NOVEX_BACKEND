import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AFECTACIONES de un problema INTERNAL (`situation_consequences`).
 *
 * Colección append-only, distinta de `situations.description`: la descripción
 * dice QUÉ ES el problema; cada fila aquí, QUÉ CONSECUENCIA fue produciendo.
 *
 *   - Sin `updated_at` ni `deleted_at`: no se editan ni se borran. Un trigger
 *     rechaza todo UPDATE (función de la migración 1787700000000).
 *   - `occurred_at` (cuándo ocurrió, lo declara el usuario) y `created_at`
 *     (cuándo se registró) son instantes distintos.
 *   - El texto se valida también en la base (1..2000 tras recortar).
 *   - La severidad al ocurrir NO se guarda: se deriva del historial.
 *
 * NO HAY BACKFILL: las situaciones existentes quedan con cero afectaciones.
 * Inventarlas desde `description` mezclaría precisamente lo que esta tabla
 * separa.
 */
export class AddSituationConsequences1787900000000 implements MigrationInterface {
  name = 'AddSituationConsequences1787900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "situation_consequences" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "situation_id" uuid NOT NULL,
        "description" text NOT NULL,
        "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by_user_id" uuid NOT NULL,
        CONSTRAINT "pk_situation_consequences" PRIMARY KEY ("id"),
        CONSTRAINT "chk_situation_consequences_description" CHECK (
          length(btrim("description")) BETWEEN 1 AND 2000
        ),
        CONSTRAINT "fk_situation_consequences_situation"
          FOREIGN KEY ("situation_id") REFERENCES "situations"("id")
          ON DELETE CASCADE,
        CONSTRAINT "fk_situation_consequences_created_by"
          FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
          ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_situation_consequences_situation_occurred"
      ON "situation_consequences" ("situation_id", "occurred_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_situation_consequences_created_by"
      ON "situation_consequences" ("created_by_user_id")
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_situation_consequences_append_only"
      ON "situation_consequences"
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_situation_consequences_append_only"
      BEFORE UPDATE ON "situation_consequences"
      FOR EACH ROW EXECUTE FUNCTION "novex_reject_append_only_update"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "situation_consequences"`);
  }
}
