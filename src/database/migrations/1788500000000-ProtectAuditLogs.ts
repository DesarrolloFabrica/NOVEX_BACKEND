import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FASE 01B.1 · AUDITORÍA INMUTABLE.
 *
 * `audit_logs` solo admite INSERT: cualquier UPDATE o DELETE de una fila
 * lanza una excepción en la base, venga de la aplicación o de una consola.
 * Los registros históricos no se tocan.
 *
 * Límites conocidos (documentados en docs/seguridad-y-permisos.md):
 * - TRUNCATE no dispara triggers de fila; requiere ser dueño de la tabla.
 *   Revocar privilegios al usuario de la aplicación exige que la tabla tenga
 *   otro dueño (cambio de infraestructura, fuera de esta fase).
 * - Un superusuario puede deshabilitar el trigger.
 */
export class ProtectAuditLogs1788500000000 implements MigrationInterface {
  name = 'ProtectAuditLogs1788500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "novex_reject_audit_mutation"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'audit_logs es inmutable: no admite %.', TG_OP
          USING ERRCODE = 'check_violation';
      END;
      $$
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_audit_logs_immutable" ON "audit_logs"
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_audit_logs_immutable"
      BEFORE UPDATE OR DELETE ON "audit_logs"
      FOR EACH ROW EXECUTE FUNCTION "novex_reject_audit_mutation"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "trg_audit_logs_immutable" ON "audit_logs"`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS "novex_reject_audit_mutation"()`,
    );
  }
}
