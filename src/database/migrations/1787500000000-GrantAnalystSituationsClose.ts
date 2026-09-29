import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ANALISTA + SITUATIONS_CLOSE.
 *
 * El cierre sigue restringido en dominio: solo situaciones ligadas a
 * Coordinación General (`coord-general`) como responsable. El permiso abre el
 * endpoint; `OperationalScopeService.canResolveSituation` delimita el caso
 * (ser afectada no concede cierre).
 *
 * Misma forma idempotente que `GrantReportingAndClosurePermissions`.
 */
export class GrantAnalystSituationsClose1787500000000
  implements MigrationInterface
{
  name = 'GrantAnalystSituationsClose1787500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code", "name", "module", "description")
      VALUES (
        'SITUATIONS_CLOSE',
        'Cerrar situaciones',
        'SITUATIONS',
        'Permite cerrar situaciones operacionales registrando el aprendizaje.'
      )
      ON CONFLICT ("code") DO NOTHING
    `);

    await queryRunner.query(
      `
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id"
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE r."code" = $1 AND p."code" = $2
      ON CONFLICT ON CONSTRAINT "uq_role_permission" DO NOTHING
      `,
      ['ANALISTA', 'SITUATIONS_CLOSE'],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      DELETE FROM "role_permissions" rp
      USING "roles" r, "permissions" p
      WHERE rp."role_id" = r."id"
        AND rp."permission_id" = p."id"
        AND r."code" = $1
        AND p."code" = $2
      `,
      ['ANALISTA', 'SITUATIONS_CLOSE'],
    );
  }
}
