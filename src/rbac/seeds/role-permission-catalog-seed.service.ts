import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PermissionsService } from '../../permissions/permissions.service';
import { ROLE_PERMISSION_CODES } from '../../permissions/seeds/permissions.catalog.seed';
import { RolePermissionsRepository } from '../../permissions/repositories/role-permissions.repository';
import { Role } from '../../roles/entities/role.entity';

@Injectable()
export class RolePermissionCatalogSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RolePermissionCatalogSeedService.name);

  constructor(
    private readonly permissionsService: PermissionsService,
    private readonly rolePermissionsRepository: RolePermissionsRepository,
    @InjectRepository(Role)
    private readonly rolesRepository: Repository<Role>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const roles = await this.rolesRepository.find();
    const rolesByCode = new Map(roles.map((role) => [role.code, role]));
    let totalAssignments = 0;
    let totalRevocations = 0;

    for (const [roleCode, permissionCodes] of Object.entries(
      ROLE_PERMISSION_CODES,
    )) {
      const role = rolesByCode.get(roleCode);
      if (!role) {
        this.logger.warn(
          `Rol no encontrado para asignación RBAC: ${roleCode}. Omitiendo.`,
        );
        continue;
      }

      const expected = new Set(permissionCodes);
      const currentAssignments =
        await this.rolePermissionsRepository.findByRoleId(role.id);

      for (const assignment of currentAssignments) {
        const permissionCode = assignment.permission?.code;
        if (!permissionCode || expected.has(permissionCode)) {
          continue;
        }

        await this.permissionsService.removeFromRole(
          role.id,
          assignment.permissionId,
        );
        totalRevocations += 1;
      }

      for (const permissionCode of permissionCodes) {
        try {
          const permission =
            await this.permissionsService.findByCode(permissionCode);
          await this.permissionsService.assignToRole(role.id, permission.id);
          totalAssignments += 1;
        } catch (error) {
          this.logger.warn(
            `Permiso no encontrado para RBAC (${permissionCode}): omitiendo asignación.`,
          );
        }
      }
    }

    this.logger.log(
      `Asignaciones RBAC sincronizadas: ${totalAssignments} Role-Permission, ${totalRevocations} revocaciones.`,
    );
  }
}
