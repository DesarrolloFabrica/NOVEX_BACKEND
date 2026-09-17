import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PERMISOS DE LA FASE, para instalaciones YA EXISTENTES.
 *
 * Por qué hace falta una migración y no basta con el seed: el sincronizador de
 * arranque (`RolePermissionCatalogSeedService`) está condicionado por
 * `isCatalogSeedEnabled()`, que en producción está DESACTIVADO salvo que se
 * fuerce `CATALOG_SEED_ON_BOOT=true`. En una base ya instalada, editar
 * `ROLE_PERMISSION_CODES` no concede nada por sí solo.
 *
 * ALCANCE DELIBERADAMENTE ESTRECHO. Esta migración solo AÑADE tres
 * asignaciones concretas y no revoca ninguna, al contrario que el
 * sincronizador de arranque, que reconcilia el reparto completo. No se toca
 * ningún otro rol ni permiso, así que una instalación con ajustes propios no
 * los pierde al migrar.
 *
 *   ADMIN       + SITUATIONS_CREATE   (reportar; NO cerrar, NO actualizar)
 *   DIRECTOR    + SITUATIONS_CREATE   (reportar; NO cerrar, NO actualizar)
 *   COORDINADOR + SITUATIONS_CLOSE    (único rol que soluciona)
 *
 * ANALISTA no aparece: ya tenía `SITUATIONS_CREATE` y no debe recibir
 * `SITUATIONS_CLOSE`.
 *
 * IDEMPOTENTE por construcción: `INSERT ... SELECT ... ON CONFLICT DO NOTHING`
 * contra la restricción `uq_role_permission`, de modo que reejecutarla no
 * duplica filas ni falla. El `SELECT` correlacionado tolera además que falte un
 * rol o un permiso: en ese caso no inserta nada en lugar de romper la
 * migración.
 *
 * DESPUÉS DE APLICARLA NO HACE FALTA RENOVAR SESIONES. `AuthorizationEnrichment` +
 * `RbacService.resolveActiveAuthorization` releen rol, coordinación y permisos
 * desde la base en CADA petición; los permisos del JWT son solo una foto del
 * login y no se usan para autorizar.
 */
export class GrantReportingAndClosurePermissions1787300000000
  implements MigrationInterface
{
  name = 'GrantReportingAndClosurePermissions1787300000000';

  /** Asignaciones que esta fase añade. Nada más. */
  private static readonly GRANTS: ReadonlyArray<{
    roleCode: string;
    permissionCode: string;
  }> = [
    { roleCode: 'ADMIN', permissionCode: 'SITUATIONS_CREATE' },
    { roleCode: 'DIRECTOR', permissionCode: 'SITUATIONS_CREATE' },
    { roleCode: 'COORDINADOR', permissionCode: 'SITUATIONS_CLOSE' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    /*
     * El permiso SITUATIONS_CLOSE ya figura en el catálogo del código, pero
     * puede no existir como fila si la base se instaló sin el seed de catálogo.
     * Se asegura aquí para que la asignación de abajo tenga a qué apuntar.
     */
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

    for (const grant of GrantReportingAndClosurePermissions1787300000000.GRANTS) {
      await queryRunner.query(
        `
        INSERT INTO "role_permissions" ("role_id", "permission_id")
        SELECT r."id", p."id"
        FROM "roles" r
        CROSS JOIN "permissions" p
        WHERE r."code" = $1 AND p."code" = $2
        ON CONFLICT ON CONSTRAINT "uq_role_permission" DO NOTHING
        `,
        [grant.roleCode, grant.permissionCode],
      );
    }
  }

  /**
   * Revierte EXACTAMENTE las tres asignaciones añadidas. No toca el catálogo de
   * permisos: `SITUATIONS_CLOSE` ya existía en el código antes de esta fase y
   * borrar la fila afectaría a cualquier otra asignación que la use.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const grant of GrantReportingAndClosurePermissions1787300000000.GRANTS) {
      await queryRunner.query(
        `
        DELETE FROM "role_permissions" rp
        USING "roles" r, "permissions" p
        WHERE rp."role_id" = r."id"
          AND rp."permission_id" = p."id"
          AND r."code" = $1
          AND p."code" = $2
        `,
        [grant.roleCode, grant.permissionCode],
      );
    }
  }
}
