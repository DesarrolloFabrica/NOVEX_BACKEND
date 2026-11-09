import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FASE 01B.1 · ANULACIÓN DE SITUACIONES.
 *
 * - Estado `CANCELLED` en `situations_status_enum`, distinto de `CLOSED`.
 * - Eventos de línea de tiempo `CANCELLED` y `COORDINATION_TRANSFERRED`.
 * - Tabla `situation_cancellations`: motivo, estado anterior, autor y fecha.
 *   Clave primaria = situación (una sola anulación posible) y append-only.
 *
 * ADITIVA: no toca filas existentes. Los registros históricos conservan su
 * estado; ninguno pasa a `CANCELLED`.
 *
 * REVERSIBILIDAD. `down()` elimina la tabla. Los valores añadidos a los enums
 * NO se retiran (PostgreSQL no admite `DROP VALUE`; recrear los tipos exigiría
 * reescribir columnas e índices). Quedan sin uso y no afectan a nada; mismo
 * criterio que 1788000000000. `down()` se niega a ejecutarse si hay
 * situaciones anuladas: revertir dejaría casos `CANCELLED` sin su registro.
 */
export class AddSituationCancellation1788300000000 implements MigrationInterface {
  name = 'AddSituationCancellation1788300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // El valor nuevo se añade y no se usa en esta transacción (regla de
    // PostgreSQL para ADD VALUE dentro de un bloque transaccional).
    await queryRunner.query(`
      ALTER TYPE "situations_status_enum" ADD VALUE IF NOT EXISTS 'CANCELLED'
    `);
    await queryRunner.query(`
      ALTER TYPE "situation_timeline_entries_event_type_enum"
      ADD VALUE IF NOT EXISTS 'CANCELLED'
    `);
    await queryRunner.query(`
      ALTER TYPE "situation_timeline_entries_event_type_enum"
      ADD VALUE IF NOT EXISTS 'COORDINATION_TRANSFERRED'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "situation_cancellations" (
        "situation_id" uuid NOT NULL,
        "reason" text NOT NULL,
        "previous_status" "situations_status_enum" NOT NULL,
        "cancelled_by_user_id" uuid NOT NULL,
        "cancelled_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_situation_cancellations" PRIMARY KEY ("situation_id"),
        CONSTRAINT "fk_situation_cancellations_situation"
          FOREIGN KEY ("situation_id") REFERENCES "situations"("id")
          ON DELETE CASCADE,
        CONSTRAINT "fk_situation_cancellations_user"
          FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id")
          ON DELETE RESTRICT,
        CONSTRAINT "ck_situation_cancellations_reason_length"
          CHECK (char_length(btrim("reason")) BETWEEN 10 AND 1000)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_situation_cancellations_user"
      ON "situation_cancellations" ("cancelled_by_user_id")
    `);

    // Append-only: misma función compartida que severidades y afectaciones.
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_situation_cancellations_append_only"
      ON "situation_cancellations"
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_situation_cancellations_append_only"
      BEFORE UPDATE ON "situation_cancellations"
      FOR EACH ROW EXECUTE FUNCTION "novex_reject_append_only_update"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT count(*)::text AS total FROM "situations" WHERE "status"::text = 'CANCELLED'`,
    )) as Array<{ total: string }>;
    if (Number(rows[0]?.total ?? 0) > 0) {
      throw new Error(
        'No se puede revertir AddSituationCancellation: hay situaciones anuladas.',
      );
    }
    await queryRunner.query(`DROP TABLE IF EXISTS "situation_cancellations"`);
  }
}
