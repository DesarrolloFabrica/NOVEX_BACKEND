import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hardening de historial institucional.
 *
 * `audit_logs`, `situation_cancellations` y `situation_coordination_transfers`
 * rechazan UPDATE, DELETE y TRUNCATE mediante triggers, vengan de la
 * aplicación o de una consola, y la baja física de una situación no puede
 * arrastrar su historia (ON DELETE RESTRICT).
 *
 * No exige roles de base de datos adicionales: corre con el mismo usuario que
 * la aplicación. Límite aceptado: quien posea las tablas (o un superusuario)
 * puede deshabilitar los triggers de forma deliberada; la protección cubre
 * errores de la aplicación y borrados accidentales, no credenciales
 * comprometidas. Separar un propietario NOLOGIN sería un endurecimiento
 * posterior de infraestructura.
 */
export class HardenSituationHistory1788700000000 implements MigrationInterface {
  name = 'HardenSituationHistory1788700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "novex_reject_history_mutation"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION '% es historial institucional inmutable: no admite %.', TG_TABLE_NAME, TG_OP
          USING ERRCODE = 'check_violation';
      END;
      $$
    `);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "trg_audit_logs_immutable" ON "audit_logs"`,
    );
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_situation_cancellations_append_only"
      ON "situation_cancellations"
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_situation_coordination_transfers_append_only"
      ON "situation_coordination_transfers"
    `);

    for (const table of [
      'audit_logs',
      'situation_cancellations',
      'situation_coordination_transfers',
    ]) {
      await queryRunner.query(`
        DROP TRIGGER IF EXISTS "trg_${table}_immutable_rows" ON "${table}"
      `);
      await queryRunner.query(`
        CREATE TRIGGER "trg_${table}_immutable_rows"
        BEFORE UPDATE OR DELETE ON "${table}"
        FOR EACH ROW EXECUTE FUNCTION "novex_reject_history_mutation"()
      `);
      await queryRunner.query(`
        DROP TRIGGER IF EXISTS "trg_${table}_immutable_truncate" ON "${table}"
      `);
      await queryRunner.query(`
        CREATE TRIGGER "trg_${table}_immutable_truncate"
        BEFORE TRUNCATE ON "${table}"
        FOR EACH STATEMENT EXECUTE FUNCTION "novex_reject_history_mutation"()
      `);
      await queryRunner.query(`REVOKE ALL ON TABLE "${table}" FROM PUBLIC`);
    }

    // La anulación y los traslados son historia de la situación: una baja
    // física del padre no debe propagar un borrado en cascada.
    await queryRunner.query(`
      ALTER TABLE "situation_cancellations"
      DROP CONSTRAINT "fk_situation_cancellations_situation",
      ADD CONSTRAINT "fk_situation_cancellations_situation"
        FOREIGN KEY ("situation_id") REFERENCES "situations"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "situation_coordination_transfers"
      DROP CONSTRAINT "fk_situation_coordination_transfers_situation",
      ADD CONSTRAINT "fk_situation_coordination_transfers_situation"
        FOREIGN KEY ("situation_id") REFERENCES "situations"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "situation_coordination_transfers"
        ADD COLUMN "previous_assigned_user_id" uuid NULL,
        ADD COLUMN "next_assigned_user_id" uuid NULL,
        ADD CONSTRAINT "fk_situation_coordination_transfers_previous_assignee"
          FOREIGN KEY ("previous_assigned_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        ADD CONSTRAINT "fk_situation_coordination_transfers_next_assignee"
          FOREIGN KEY ("next_assigned_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(
      `REVOKE ALL ON FUNCTION "novex_reject_history_mutation"() FROM PUBLIC`,
    );
  }

  public down(): Promise<void> {
    throw new Error(
      'HardenSituationHistory es irreversible automáticamente: revertirlo quitaría protecciones de auditoría e historial. Requiere un plan de seguridad aprobado.',
    );
  }
}
