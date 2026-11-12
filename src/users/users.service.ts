import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditAction, AuditResourceType } from '../audit/audit-action.enum';
import { AuditLogService } from '../audit/audit-log.service';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { UserStatus } from '../common/enums/identity.enums';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { Role } from '../roles/entities/role.entity';
import {
  CreateUserDto,
  ListUsersQueryDto,
  UpdateOnboardingDto,
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
    private readonly auditLogService: AuditLogService,
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

  async create(
    dto: CreateUserDto,
    actor: AuthPayload,
  ): Promise<UserResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.usersRepository.findByEmail(email);
    if (existing) {
      throw new ConflictException(
        `Ya existe un usuario con el correo: ${email}`,
      );
    }

    const role = await this.resolveActiveRole(dto.roleCode);
    const coordination = dto.coordinationId
      ? await this.resolveActiveCoordination(dto.coordinationId)
      : null;
    this.assertCoordinationForRole(role, coordination);

    const created = this.usersRepository.create({
      email,
      fullName: dto.fullName.trim(),
      roleId: role.id,
      coordinationId: coordination?.id ?? null,
      status: dto.status,
      googleSub: null,
      photoUrl: null,
      lastLoginAt: null,
    });

    // Alta y auditoría en UNA transacción (Fase 01B.1): sin registro de
    // auditoría no hay usuario creado.
    const savedId = await this.usersRepository.manager.transaction(
      async (manager) => {
        const saved = await manager.save(User, created);
        await this.auditLogService.recordCritical(
          {
            actor,
            action: AuditAction.USER_CREATED,
            resourceType: AuditResourceType.USER,
            resourceId: saved.id,
            metadata: {
              roleCode: role.code,
              status: saved.status,
              coordinationId: saved.coordinationId,
            },
          },
          manager,
        );
        return saved.id;
      },
    );

    const user = await this.usersRepository.findByIdWithRelations(savedId);
    if (!user) {
      throw new NotFoundException(
        `Usuario no encontrado tras crear: ${savedId}`,
      );
    }

    return this.toResponse(user);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actor: AuthPayload,
  ): Promise<UserResponseDto> {
    const user = await this.usersRepository.findByIdWithRelations(id);
    if (!user) {
      throw new NotFoundException(`Usuario no encontrado: ${id}`);
    }

    // Anti-bloqueo: nadie se desactiva ni se cambia el rol a sí mismo.
    if (id === actor.sub) {
      if (dto.status !== undefined && dto.status !== user.status) {
        throw new BadRequestException(
          'No puede cambiar el estado de su propia cuenta.',
        );
      }
      if (
        dto.roleCode !== undefined &&
        dto.roleCode.trim().toUpperCase() !== user.role.code
      ) {
        throw new BadRequestException(
          'No puede cambiar el rol de su propia cuenta.',
        );
      }
    }

    const previousRoleCode = user.role.code;
    const previousStatus = user.status;
    const previousCoordinationId = user.coordinationId;
    const previousFullName = user.fullName;

    if (dto.fullName !== undefined) {
      user.fullName = dto.fullName.trim();
    }

    if (dto.roleCode !== undefined) {
      const role = await this.resolveActiveRole(dto.roleCode);
      user.roleId = role.id;
      user.role = role;
    }

    if (dto.coordinationId !== undefined) {
      const coordination = dto.coordinationId
        ? await this.resolveActiveCoordination(dto.coordinationId)
        : null;
      user.coordinationId = coordination?.id ?? null;
      user.coordination = coordination;
    }
    if (dto.roleCode !== undefined || dto.coordinationId !== undefined) {
      this.assertCoordinationForRole(user.role, user.coordination ?? null);
    }

    if (dto.status !== undefined) {
      user.status = dto.status;
    }

    /*
     * Cambio y auditoría en UNA transacción (Fase 01B.1). Cada cambio crítico
     * deja su propio registro con valor anterior y nuevo. Del nombre solo se
     * registra QUE cambió (dato personal, sin valores).
     */
    await this.usersRepository.manager.transaction(async (manager) => {
      await manager.save(User, user);

      const audit = (action: AuditAction, metadata: Record<string, unknown>) =>
        this.auditLogService.recordCritical(
          {
            actor,
            action,
            resourceType: AuditResourceType.USER,
            resourceId: user.id,
            metadata,
          },
          manager,
        );

      if (user.role.code !== previousRoleCode) {
        await audit(AuditAction.USER_ROLE_CHANGED, {
          previousRoleCode,
          nextRoleCode: user.role.code,
        });
      }
      if (user.status !== previousStatus) {
        await audit(
          user.status === UserStatus.ACTIVE
            ? AuditAction.USER_ACTIVATED
            : AuditAction.USER_DEACTIVATED,
          { previousStatus, nextStatus: user.status },
        );
      }
      if (user.coordinationId !== previousCoordinationId) {
        await audit(AuditAction.USER_COORDINATION_CHANGED, {
          previousCoordinationId,
          nextCoordinationId: user.coordinationId,
        });
      }
      if (user.fullName !== previousFullName) {
        await audit(AuditAction.USER_PROFILE_UPDATED, {
          changedFields: ['fullName'],
        });
      }
    });

    const refreshed = await this.usersRepository.findByIdWithRelations(id);
    if (!refreshed) {
      throw new NotFoundException(
        `Usuario no encontrado tras actualizar: ${id}`,
      );
    }

    return this.toResponse(refreshed);
  }

  async updateOnboarding(
    id: string,
    dto: UpdateOnboardingDto,
  ): Promise<UserResponseDto> {
    const user = await this.usersRepository.findByIdWithRelations(id);
    if (!user) {
      throw new NotFoundException(`Usuario no encontrado: ${id}`);
    }

    user.onboardingStep = Math.max(0, Math.min(100, dto.step));
    if (dto.completed !== undefined) {
      user.onboardingCompleted = dto.completed;
      user.onboardingSeenAt = dto.completed ? new Date() : null;
    }

    const saved = await this.usersRepository.save(user);
    return this.toResponse(saved);
  }

  /** Un COORDINADOR opera SU coordinación: no puede quedar sin ella. */
  private assertCoordinationForRole(
    role: Role,
    coordination: Coordination | null,
  ): void {
    if (role.code === 'COORDINADOR' && !coordination) {
      throw new BadRequestException(
        'Un coordinador necesita una coordinación asignada.',
      );
    }
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
      onboardingStep: user.onboardingStep,
      onboardingCompleted: user.onboardingCompleted,
      onboardingSeenAt: user.onboardingSeenAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
