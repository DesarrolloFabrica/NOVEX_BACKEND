import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { Role } from '../roles/entities/role.entity';
import {
  CreateUserDto,
  ListUsersQueryDto,
  UpdateUserDto,
  UserResponseDto,
} from './dto/user.dto';
import { User } from './entities/user.entity';
import { UsersRepository } from './repositories/users.repository';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    @InjectRepository(Role)
    private readonly rolesRepository: Repository<Role>,
    @InjectRepository(Coordination)
    private readonly coordinationsRepository: Repository<Coordination>,
  ) {}

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

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.usersRepository.findByEmail(email);
    if (existing) {
      throw new ConflictException(`Ya existe un usuario con el correo: ${email}`);
    }

    const role = await this.resolveActiveRole(dto.roleCode);
    const coordination = await this.resolveActiveCoordination(dto.coordinationId);

    const created = this.usersRepository.create({
      email,
      fullName: dto.fullName.trim(),
      roleId: role.id,
      coordinationId: coordination.id,
      status: dto.status,
      googleSub: null,
      photoUrl: null,
      lastLoginAt: null,
    });

    const saved = await this.usersRepository.save(created);
    const user = await this.usersRepository.findByIdWithRelations(saved.id);
    if (!user) {
      throw new NotFoundException(`Usuario no encontrado tras crear: ${saved.id}`);
    }

    return this.toResponse(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.usersRepository.findByIdWithRelations(id);
    if (!user) {
      throw new NotFoundException(`Usuario no encontrado: ${id}`);
    }

    if (dto.fullName !== undefined) {
      user.fullName = dto.fullName.trim();
    }

    if (dto.roleCode !== undefined) {
      const role = await this.resolveActiveRole(dto.roleCode);
      user.roleId = role.id;
      user.role = role;
    }

    if (dto.coordinationId !== undefined) {
      const coordination = await this.resolveActiveCoordination(
        dto.coordinationId,
      );
      user.coordinationId = coordination.id;
      user.coordination = coordination;
    }

    if (dto.status !== undefined) {
      user.status = dto.status;
    }

    await this.usersRepository.save(user);
    const refreshed = await this.usersRepository.findByIdWithRelations(id);
    if (!refreshed) {
      throw new NotFoundException(`Usuario no encontrado tras actualizar: ${id}`);
    }

    return this.toResponse(refreshed);
  }

  private async resolveActiveRole(roleCode: string): Promise<Role> {
    const normalized = roleCode.trim().toUpperCase();
    const role = await this.rolesRepository.findOne({
      where: { code: normalized },
    });

    if (!role || !role.isActive) {
      throw new BadRequestException(`Rol inválido o inactivo: ${roleCode}`);
    }

    return role;
  }

  private async resolveActiveCoordination(
    coordinationId: string,
  ): Promise<Coordination> {
    const coordination = await this.coordinationsRepository.findOne({
      where: { id: coordinationId },
    });

    if (!coordination || !coordination.isActive) {
      throw new BadRequestException(
        `Coordinación inválida o inactiva: ${coordinationId}`,
      );
    }

    return coordination;
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
      coordinationCode: user.coordination?.code ?? null,
      coordinationName: user.coordination?.name ?? null,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
