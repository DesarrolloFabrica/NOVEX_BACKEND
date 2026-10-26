import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * RETIRA `SITUATIONS_CREATE` DE ADMIN Y DIRECTOR.
 *
 * `1787300000000-GrantReportingAndClosurePermissions` se los concedió en una
 * fase anterior. Después el producto cambió y hoy NINGUNA fuente los prevé:
 *
 *   - catálogo de permisos (`ROLE_PERMISSION_CODES`): ADMIN excluye las
 *     operaciones de situación y DIRECTOR no las incluye, igual que en la
 *     versión anterior a cartas (main 49a6483), que es lo que tiene producción;
 *   - `ai-orchestration.controller.ts`: «esos roles ya no tienen
 *     SITUATIONS_CREATE»;
 *   - frontend: `canCreateSituations` solo admite ANALISTA y COORDINADOR.
 *
 * Sin esta migración, aplicar el lote de cartas en producción daría a ADMIN y
 * DIRECTOR un permiso de alta por API que hoy no tienen. Se quitan EXACTAMENTE
 * esas dos asignaciones; ningún otro rol ni permiso cambia. Las sesiones no se
 * renuevan: la autorización relee permisos de la base en cada petición.
 *
 * `down` restaura las dos asignaciones (estado tras 1787300000000).
 */
export class RevokeAdminDirectorSituationsCreate1788200000000 implements MigrationInterface {
  name = 'RevokeAdminDirectorSituationsCreate1788200000000';

  private static readonly ROLES = ['ADMIN', 'DIRECTOR'] as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      DELETE FROM "role_permissions" rp
      USING "roles" r, "permissions" p
      WHERE rp."role_id" = r."id"
        AND rp."permission_id" = p."id"
        AND p."code" = 'SITUATIONS_CREATE'
        AND r."code" = ANY($1)
      `,
      [RevokeAdminDirectorSituationsCreate1788200000000.ROLES],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id"
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE r."code" = ANY($1) AND p."code" = 'SITUATIONS_CREATE'
      ON CONFLICT ON CONSTRAINT "uq_role_permission" DO NOTHING
      `,
      [RevokeAdminDirectorSituationsCreate1788200000000.ROLES],
    );
  }
}
