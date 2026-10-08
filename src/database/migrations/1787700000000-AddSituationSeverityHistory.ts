import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SEVERIDAD REPORTADA + HISTORIAL DE SEVERIDAD (solo esquema).
 *
 * Separa dos conceptos que hasta ahora compartían la columna `severity`:
 *
 *   reported_severity  La evaluación de quien registró. Inmutable y única
 *                      entrada del SLA. Nace NULL aquí; la rellena y la vuelve
 *                      NOT NULL la migración siguiente (backfill), para que el
 *                      esquema y los datos se revisen por separado.
 *   severity           Pasa a significar severidad EFECTIVA (nivel actual). No
 *                      cambia de nombre: todos sus lectores quieren el nivel
 *                      actual.
 *
 * `situation_severity_changes` es append-only. La base, y no solo el código,
 * garantiza su forma:
 *   - una sola fila REPORTED por situación (índice único parcial);
 *   - idempotencia de AUTO_TIME por (situation_id, policy_code, rule_key), que
 *     vuelve inocuos dos barridos simultáneos;
 *   - AUTO_TIME siempre sube de nivel (el enum se compara por su orden);
 *   - ninguna fila se modifica: un trigger rechaza todo UPDATE.
 *
 * `severity_escalation_policy_code` congela la política con la que nació cada
 * caso. NULO = no escala. Nadie lo rellena todavía: no hay política aprobada.
 */
export class AddSituationSeverityHistory1787700000000 implements MigrationInterface {
  name = 'AddSituationSeverityHistory1787700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "situations"
        ADD COLUMN IF NOT EXISTS "reported_severity" "situations_severity_enum",
        ADD COLUMN IF NOT EXISTS "severity_escalation_policy_code" varchar(40)
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "situation_severity_change_source_enum"
          AS ENUM ('REPORTED', 'AUTO_TIME');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "situation_severity_changes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "situation_id" uuid NOT NULL,
        "previous_severity" "situations_severity_enum",
        "new_severity" "situations_severity_enum" NOT NULL,
        "source" "situation_severity_change_source_enum" NOT NULL,
        "effective_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "actor_user_id" uuid,
        "policy_code" varchar(40),
        "rule_key" varchar(40),
        CONSTRAINT "pk_situation_severity_changes" PRIMARY KEY ("id"),
        CONSTRAINT "chk_situation_severity_changes_shape" CHECK (
          (
            "source" = 'REPORTED'
            AND "previous_severity" IS NULL
            AND "policy_code" IS NULL
            AND "rule_key" IS NULL
          )
          OR (
            "source" = 'AUTO_TIME'
            AND "previous_severity" IS NOT NULL
            AND "policy_code" IS NOT NULL
            AND "rule_key" IS NOT NULL
            AND "new_severity" > "previous_severity"
          )
        ),
        CONSTRAINT "fk_situation_severity_changes_situation"
          FOREIGN KEY ("situation_id") REFERENCES "situations"("id")
          ON DELETE CASCADE,
        CONSTRAINT "fk_situation_severity_changes_actor"
          FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
          ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_situation_severity_changes_reported"
      ON "situation_severity_changes" ("situation_id")
      WHERE "source" = 'REPORTED'
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_situation_severity_changes_auto_time"
      ON "situation_severity_changes" ("situation_id", "policy_code", "rule_key")
      WHERE "source" = 'AUTO_TIME'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_situation_severity_changes_situation_effective"
      ON "situation_severity_changes" ("situation_id", "effective_at")
    `);

    /*
     * Función compartida por las tablas append-only del dominio. Rechaza el
     * UPDATE; el DELETE sigue llegando solo por la cascada de la situación
     * (limpieza de seeds), porque ningún endpoint lo expone.
     */
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "novex_reject_append_only_update"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'La tabla % es append-only: no admite UPDATE.', TG_TABLE_NAME
          USING ERRCODE = 'check_violation';
      END;
      $$
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_situation_severity_changes_append_only"
      ON "situation_severity_changes"
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_situation_severity_changes_append_only"
      BEFORE UPDATE ON "situation_severity_changes"
      FOR EACH ROW EXECUTE FUNCTION "novex_reject_append_only_update"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "situation_severity_changes"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "situation_severity_change_source_enum"`,
    );
    await queryRunner.query(`
      ALTER TABLE "situations"
        DROP COLUMN IF EXISTS "severity_escalation_policy_code",
        DROP COLUMN IF EXISTS "reported_severity"
    `);
    // Al revertir en orden, situation_consequences (migración posterior) ya no
    // existe aquí, así que la función queda sin usuarios.
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS "novex_reject_append_only_update"()`,
    );
  }
}
