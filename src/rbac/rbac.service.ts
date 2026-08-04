import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RolePermissionsResponseDto,
  UserPermissionsResponseDto,
} from '../permissions/dto/permission.dto';
import { PermissionsService } from '../permissions/permissions.service';
import { RolePermissionsRepository } from '../permissions/repositories/role-permissions.repository';
import { Role } from '../roles/entities/role.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class RbacService {
  constructor(
    private readonly permissionsService: PermissionsService,
    private readonly rolePermissionsRepository: RolePermissionsRepository,
    @InjectRepository(Role)
    private readonly rolesRepository: Repository<Role>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async getRolePermissions(
    roleId: string,
  ): Promise<RolePermissionsResponseDto> {
    const role = await this.rolesRepository.findOne({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException(`Rol no encontrado: ${roleId}`);
    }

    const permissions =
      await this.rolePermissionsRepository.findPermissionsByRoleId(roleId);

    return {
      roleId: role.id,
      roleCode: role.code,
      permissions: permissions.map((permission) =>
        this.permissionsService.toResponse(permission),
      ),
    };
  }

  async getUserPermissions(
    userId: string,
  ): Promise<UserPermissionsResponseDto> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: { role: true },
    });
    if (!user) {
      throw new NotFoundException(`Usuario no encontrado: ${userId}`);
    }

    const rolePermissions = await this.getRolePermissions(user.roleId);

    return {
      userId: user.id,
      roleId: user.roleId,
      roleCode: user.role.code,
      permissions: rolePermissions.permissions,
    };
  }

  async roleHasPermission(
    roleId: string,
    permissionCode: string,
  ): Promise<boolean> {
    const permission = await this.permissionsService.findByCode(permissionCode);
    return this.rolePermissionsRepository.existsAssignment(
      roleId,
      permission.id,
    );
  }
}
