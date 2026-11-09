import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FASE 01B.1 · PERMISOS ADMINISTRATIVOS SOBRE SITUACIONES.
 *
 * Dos permisos nuevos y ESPECÍFICOS, solo para ADMIN:
 *   SITUATIONS_CANCEL    anular una situación (con motivo).
 *   SITUATIONS_TRANSFER  trasladar la coordinación responsable (con motivo).
 *
 * No concede a ADMIN ningún permiso general de operación (CREATE, UPDATE,
 * CLOSE, AI_ANALYZE) y no cambia los permisos de DIRECTOR, ANALISTA ni
 * COORDINADOR. En producción los cambios RBAC llegan por migración (las
 * semillas de catálogo están desactivadas).
 */
const PERMISSIONS = [
  {
    code: 'SITUATIONS_CANCEL',
    name: 'Anular situaciones',
    description:
      'Permite anular un reporte erróneo o duplicado con motivo obligatorio. La situación y su historial se conservan; deja de contar en los indicadores.',
  },
  {
    code: 'SITUATIONS_TRANSFER',
    name: 'Trasladar coordinación responsable',
    description:
      'Permite trasladar la coordinación responsable de una situación activa con motivo obligatorio. No concede editar, atender ni resolver.',
  },
] as const;

export class GrantAdminSituationAdministration1788600000000 implements MigrationInterface {
  name = 'GrantAdminSituationAdministration1788600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const permission of PERMISSIONS) {
      await queryRunner.query(
        `
        INSERT INTO "permissions" ("code", "name", "module", "description")
        VALUES ($1, $2, 'SITUATIONS', $3)
        ON CONFLICT ("code") DO NOTHING
        `,
        [permission.code, permission.name, permission.description],
      );
      await queryRunner.query(
        `
        INSERT INTO "role_permissions" ("role_id", "permission_id")
        SELECT r."id", p."id"
        FROM "roles" r
        CROSS JOIN "permissions" p
        WHERE r."code" = 'ADMIN' AND p."code" = $1
        ON CONFLICT ON CONSTRAINT "uq_role_permission" DO NOTHING
        `,
        [permission.code],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const codes = PERMISSIONS.map((permission) => permission.code);
    await queryRunner.query(
      `
      DELETE FROM "role_permissions" rp
      USING "permissions" p
      WHERE rp."permission_id" = p."id" AND p."code" = ANY($1)
      `,
      [codes],
    );
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "code" = ANY($1)`,
      [codes],
    );
  }
}
