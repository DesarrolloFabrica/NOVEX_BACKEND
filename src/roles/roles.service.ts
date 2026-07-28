import { Injectable, NotFoundException } from '@nestjs/common';
import { ListRolesQueryDto, RoleResponseDto } from './dto/role.dto';
import { Role } from './entities/role.entity';
import { RolesRepository } from './repositories/roles.repository';

@Injectable()
export class RolesService {
  constructor(private readonly rolesRepository: RolesRepository) {}

  async list(query: ListRolesQueryDto): Promise<RoleResponseDto[]> {
    const roles = await this.rolesRepository.findCatalog(
      query.includeInactive ?? false,
    );
    return roles.map((role) => this.toResponse(role));
  }

  async getById(id: string): Promise<RoleResponseDto> {
    const role = await this.rolesRepository.findOne({ where: { id } });
    if (!role) {
      throw new NotFoundException(`Rol no encontrado: ${id}`);
    }
    return this.toResponse(role);
  }

  private toResponse(role: Role): RoleResponseDto {
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      isActive: role.isActive,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }
}
