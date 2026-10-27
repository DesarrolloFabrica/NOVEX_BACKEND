import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DIRECTOR + KPIS_VIEW, para instalaciones YA EXISTENTES.
 *
 * `ROLE_PERMISSION_CODES` ya asigna KPIS_VIEW a DIRECTOR, pero ese reparto
 * solo se sincroniza con `RolePermissionCatalogSeedService`, condicionado por
 * `isCatalogSeedEnabled()` (desactivado en producción salvo
 * `CATALOG_SEED_ON_BOOT=true`). Sin esta migración, un DIRECTOR de una base
 * ya instalada recibiría 403 en todo `/operational-kpis`.
 *
 * Solo AÑADE el permiso y su asignación; no revoca nada. ADMIN no lo recibe.
 * Misma forma idempotente que `GrantAnalystSituationsClose`.
 */
export class GrantDirectorKpisView1787600000000 implements MigrationInterface {
  name = 'GrantDirectorKpisView1787600000000';

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
      ['DIRECTOR', 'KPIS_VIEW'],
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
      ['DIRECTOR', 'KPIS_VIEW'],
    );
  }
}
