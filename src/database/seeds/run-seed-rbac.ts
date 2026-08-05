import dataSource from '../data-source';
import { Permission } from '../../permissions/entities/permission.entity';
import { RolePermission } from '../../permissions/entities/role-permission.entity';
import {
  CATALOG_PERMISSIONS,
  ROLE_PERMISSION_CODES,
} from '../../permissions/seeds/permissions.catalog.seed';
import { Role } from '../../roles/entities/role.entity';

/**
 * Reproduce la sincronización RBAC del arranque (PermissionCatalogSeedService y
 * RolePermissionCatalogSeedService) sin levantar la aplicación, para poder
 * alinear la matriz de permisos de un entorno ya desplegado.
 */
async function main(): Promise<void> {
  await dataSource.initialize();

  try {
    const permissionsRepository = dataSource.getRepository(Permission);
    const rolesRepository = dataSource.getRepository(Role);
    const rolePermissionsRepository = dataSource.getRepository(RolePermission);

    for (const item of CATALOG_PERMISSIONS) {
      const existing = await permissionsRepository.findOne({
        where: { code: item.code },
      });

      await permissionsRepository.save(
        existing
          ? {
              ...existing,
              name: item.name,
              module: item.module,
              description: item.description,
            }
          : permissionsRepository.create({
              code: item.code,
              name: item.name,
              module: item.module,
              description: item.description,
            }),
      );
    }

    const permissions = await permissionsRepository.find();
    const permissionsByCode = new Map(
      permissions.map((permission) => [permission.code, permission]),
    );
    const roles = await rolesRepository.find();
    const rolesByCode = new Map(roles.map((role) => [role.code, role]));

    for (const [roleCode, permissionCodes] of Object.entries(
      ROLE_PERMISSION_CODES,
    )) {
      const role = rolesByCode.get(roleCode);
      if (!role) {
        console.warn(`Rol no encontrado: ${roleCode}. Omitiendo.`);
        continue;
      }

      const expected = new Set(permissionCodes);
      const current = await rolePermissionsRepository.find({
        where: { roleId: role.id },
        relations: { permission: true },
      });
      const currentCodes = new Set(
        current.map((assignment) => assignment.permission.code),
      );

      const revoked: string[] = [];
      for (const assignment of current) {
        if (expected.has(assignment.permission.code)) {
          continue;
        }
        await rolePermissionsRepository.delete({ id: assignment.id });
        revoked.push(assignment.permission.code);
      }

      const granted: string[] = [];
      for (const permissionCode of permissionCodes) {
        if (currentCodes.has(permissionCode)) {
          continue;
        }

        const permission = permissionsByCode.get(permissionCode);
        if (!permission) {
          console.warn(
            `Permiso ausente del catálogo (${permissionCode}): omitiendo.`,
          );
          continue;
        }

        await rolePermissionsRepository.save(
          rolePermissionsRepository.create({
            roleId: role.id,
            permissionId: permission.id,
          }),
        );
        granted.push(permissionCode);
      }

      console.log(
        `${roleCode}: ${granted.length} otorgados${
          granted.length ? ` (${granted.join(', ')})` : ''
        }, ${revoked.length} revocados${
          revoked.length ? ` (${revoked.join(', ')})` : ''
        }`,
      );
    }

    console.log('--- Sincronización RBAC completada ---');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('Error sincronizando RBAC:', error);
  process.exit(1);
});
