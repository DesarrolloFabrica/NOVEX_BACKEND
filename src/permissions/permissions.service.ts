import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreatePermissionDto,
  PermissionResponseDto,
  UpdatePermissionDto,
} from './dto/permission.dto';
import { Permission } from './entities/permission.entity';
import { RolePermission } from './entities/role-permission.entity';
import { PermissionsRepository } from './repositories/permissions.repository';
import { RolePermissionsRepository } from './repositories/role-permissions.repository';

@Injectable()
export class PermissionsService {
  constructor(
    private readonly permissionsRepository: PermissionsRepository,
    private readonly rolePermissionsRepository: RolePermissionsRepository,
  ) {}

  list(): Promise<PermissionResponseDto[]> {
    return this.permissionsRepository
      .findCatalog()
      .then((permissions) => permissions.map((item) => this.toResponse(item)));
  }

  async findById(id: string): Promise<Permission> {
    const permission = await this.permissionsRepository.findOne({
      where: { id },
    });
    if (!permission) {
      throw new NotFoundException(`Permiso no encontrado: ${id}`);
    }
    return permission;
  }

  async findByCode(code: string): Promise<Permission> {
    const permission = await this.permissionsRepository.findByCode(code);
    if (!permission) {
      throw new NotFoundException(`Permiso no encontrado: ${code}`);
    }
    return permission;
  }

  async create(dto: CreatePermissionDto): Promise<Permission> {
    const existing = await this.permissionsRepository.findByCode(dto.code);
    if (existing) {
      throw new ConflictException(
        `Ya existe un permiso con el código: ${dto.code}`,
      );
    }

    const permission = this.permissionsRepository.create({
      code: dto.code,
      name: dto.name,
      module: dto.module,
      description: dto.description ?? null,
    });

    return this.permissionsRepository.save(permission);
  }

  async update(id: string, dto: UpdatePermissionDto): Promise<Permission> {
    const permission = await this.findById(id);

    if (dto.code && dto.code !== permission.code) {
      const duplicate = await this.permissionsRepository.findByCode(dto.code);
      if (duplicate) {
        throw new ConflictException(
          `Ya existe un permiso con el código: ${dto.code}`,
        );
      }
      permission.code = dto.code;
    }

    if (dto.name !== undefined) {
      permission.name = dto.name;
    }
    if (dto.module !== undefined) {
      permission.module = dto.module;
    }
    if (dto.description !== undefined) {
      permission.description = dto.description;
    }

    return this.permissionsRepository.save(permission);
  }

  async delete(id: string): Promise<void> {
    const permission = await this.findById(id);
    await this.permissionsRepository.remove(permission);
  }

  async assignToRole(
    roleId: string,
    permissionId: string,
  ): Promise<RolePermission> {
    const exists = await this.rolePermissionsRepository.existsAssignment(
      roleId,
      permissionId,
    );
    if (exists) {
      const current = await this.rolePermissionsRepository.findOne({
        where: { roleId, permissionId },
      });
      if (!current) {
        throw new ConflictException('Asignación Role-Permission duplicada.');
      }
      return current;
    }

    return this.rolePermissionsRepository.save(
      this.rolePermissionsRepository.create({ roleId, permissionId }),
    );
  }

  async removeFromRole(roleId: string, permissionId: string): Promise<void> {
    const assignment = await this.rolePermissionsRepository.findOne({
      where: { roleId, permissionId },
    });
    if (!assignment) {
      throw new NotFoundException('Asignación Role-Permission no encontrada.');
    }
    await this.rolePermissionsRepository.remove(assignment);
  }

  toResponse(permission: Permission): PermissionResponseDto {
    return {
      id: permission.id,
      code: permission.code,
      name: permission.name,
      module: permission.module,
      description: permission.description,
      createdAt: permission.createdAt,
    };
  }
}
