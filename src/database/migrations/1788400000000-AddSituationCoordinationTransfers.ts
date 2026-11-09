import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FASE 01B.1 · TRASLADO ADMINISTRATIVO DE LA COORDINACIÓN RESPONSABLE.
 *
 * Tabla append-only con el historial de traslados: coordinación anterior y
 * nueva, motivo, estado y tipo del caso en ese momento, administrador y fecha.
 * Aditiva y reversible (no hay otros objetos que dependan de ella).
 */
export class AddSituationCoordinationTransfers1788400000000 implements MigrationInterface {
  name = 'AddSituationCoordinationTransfers1788400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "situation_coordination_transfers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "situation_id" uuid NOT NULL,
        "from_coordination_id" uuid NULL,
        "to_coordination_id" uuid NOT NULL,
        "reason" text NOT NULL,
        "status_at_transfer" "situations_status_enum" NOT NULL,
        "report_kind" "situations_report_kind_enum" NOT NULL,
        "transferred_by_user_id" uuid NOT NULL,
        "transferred_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_situation_coordination_transfers" PRIMARY KEY ("id"),
        CONSTRAINT "fk_situation_coordination_transfers_situation"
          FOREIGN KEY ("situation_id") REFERENCES "situations"("id")
          ON DELETE CASCADE,
        CONSTRAINT "fk_situation_coordination_transfers_from"
          FOREIGN KEY ("from_coordination_id") REFERENCES "coordinations"("id")
          ON DELETE RESTRICT,
        CONSTRAINT "fk_situation_coordination_transfers_to"
          FOREIGN KEY ("to_coordination_id") REFERENCES "coordinations"("id")
          ON DELETE RESTRICT,
        CONSTRAINT "fk_situation_coordination_transfers_user"
          FOREIGN KEY ("transferred_by_user_id") REFERENCES "users"("id")
          ON DELETE RESTRICT,
        CONSTRAINT "ck_situation_coordination_transfers_distinct"
          CHECK ("from_coordination_id" IS DISTINCT FROM "to_coordination_id"),
        CONSTRAINT "ck_situation_coordination_transfers_reason_length"
          CHECK (char_length(btrim("reason")) BETWEEN 10 AND 1000)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_situation_coordination_transfers_situation"
      ON "situation_coordination_transfers" ("situation_id", "transferred_at")
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_situation_coordination_transfers_append_only"
      ON "situation_coordination_transfers"
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_situation_coordination_transfers_append_only"
      BEFORE UPDATE ON "situation_coordination_transfers"
      FOR EACH ROW EXECUTE FUNCTION "novex_reject_append_only_update"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT count(*)::text AS total FROM "situation_coordination_transfers"`,
    )) as Array<{ total: string }>;
    if (Number(rows[0]?.total ?? 0) > 0) {
      throw new Error(
        'No se puede revertir AddSituationCoordinationTransfers: hay historial de traslados. Exporte y preserve esos registros antes de una reversión explícita.',
      );
    }
    await queryRunner.query(
      `DROP TABLE IF EXISTS "situation_coordination_transfers"`,
    );
  }
}
