import { Injectable, NotFoundException } from '@nestjs/common';
import { ListUsersQueryDto, UserResponseDto } from './dto/user.dto';
import { User } from './entities/user.entity';
import { UsersRepository } from './repositories/users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async list(query: ListUsersQueryDto): Promise<UserResponseDto[]> {
    const users = await this.usersRepository.findCatalog(
      query.includeInactive ?? false,
      query.status,
    );
    return users.map((user) => this.toResponse(user));
  }

  async getById(id: string): Promise<UserResponseDto> {
    const user = await this.usersRepository.findByIdWithRelations(id);
    if (!user) {
      throw new NotFoundException(`Usuario no encontrado: ${id}`);
    }
    return this.toResponse(user);
  }

  private toResponse(user: User): UserResponseDto {
    return {
      id: user.id,
      googleSub: user.googleSub,
      email: user.email,
      fullName: user.fullName,
      photoUrl: user.photoUrl,
      roleId: user.roleId,
      roleCode: user.role.code,
      roleName: user.role.name,
      coordinationId: user.coordinationId,
      coordinationCode: user.coordination.code,
      coordinationName: user.coordination.name,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
