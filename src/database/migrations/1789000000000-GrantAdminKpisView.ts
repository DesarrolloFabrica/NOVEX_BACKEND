import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADMIN + KPIS_VIEW, para instalaciones YA EXISTENTES.
 *
 * El catálogo (`ROLE_PERMISSION_CODES`) ya deja que ADMIN herede KPIS_VIEW del
 * filtro ALL, pero ese reparto solo se sincroniza con el seed de catálogo. Esta
 * migración añade la asignación en bases ya instaladas. Solo AÑADE; no revoca.
 * Misma forma idempotente que `GrantDirectorKpisView`.
 */
export class GrantAdminKpisView1789000000000 implements MigrationInterface {
  name = 'GrantAdminKpisView1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code", "name", "module", "description")
      VALUES (
        'KPIS_VIEW',
        'Consultar KPIs operacionales',
        'KPIS',
        'Permite consultar el snapshot analítico de la operación (GET /operational-kpis). No implica operar situaciones ni exportar reportes institucionales.'
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
      ['ADMIN', 'KPIS_VIEW'],
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
      ['ADMIN', 'KPIS_VIEW'],
    );
  }
}
