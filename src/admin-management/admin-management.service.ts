import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { AuditAction, AuditResourceType } from '../audit/audit-action.enum';
import { AuditLogService } from '../audit/audit-log.service';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { UserStatus } from '../common/enums/identity.enums';
import { SituationStatus } from '../common/enums/situation.enums';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { Permission } from '../permissions/entities/permission.entity';
import { RolePermission } from '../permissions/entities/role-permission.entity';
import { Role } from '../roles/entities/role.entity';
import { Situation } from '../situations/entities/situation.entity';
import { User } from '../users/entities/user.entity';
import type {
  AuditLogPageDto,
  CreateCoordinationDto,
  ListAuditLogsQueryDto,
  ReplaceRolePermissionsDto,
  RoleMatrixRowDto,
  UpdateCoordinationDto,
  UpdateRoleDto,
} from './dto/admin-management.dto';

/** El rol que administra la plataforma: no se desactiva ni se recorta. */
export const LOCKED_ROLE_CODE = 'ADMIN';
/** Permiso que da acceso a esta consola: nadie se lo quita a sí mismo. */
const CONSOLE_PERMISSION = 'SYSTEM_CONFIGURATION';

/**
 * Escrituras de la Consola de Administración.
 *
 * Cada acción cambia el dato y su auditoría en UNA transacción (regla 9): sin
 * registro no se confirma. Los metadatos llevan solo códigos, ids y nombres
 * de campos, nunca textos libres completos. Los permisos se resuelven desde BD
 * en cada petición (AuthorizationEnrichmentGuard), así que los cambios de rol y
 * de matriz se aplican de inmediato a todas las sesiones.
 */
@Injectable()
export class AdminManagementService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditLogService: AuditLogService,
  ) {}

  /* ------------------------------------------------------------ Roles -- */

  async getRoleMatrix(): Promise<RoleMatrixRowDto[]> {
    const roles = await this.dataSource.getRepository(Role).find({
      order: { isSystem: 'DESC', name: 'ASC' },
    });
    const assignments = await this.dataSource
      .getRepository(RolePermission)
      .find({ relations: { permission: true } });
    const counts: Array<{ role_id: string; total: string; active: string }> =
      await this.dataSource.query(
        `SELECT "role_id",
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE "status" = $1) AS active
         FROM "users" GROUP BY "role_id"`,
        [UserStatus.ACTIVE],
      );
    const countByRole = new Map(counts.map((row) => [row.role_id, row]));

    return roles.map((role) => {
      const codes = assignments
        .filter((item) => item.roleId === role.id && item.permission)
        .map((item) => item.permission.code)
        .sort();
      const count = countByRole.get(role.id);
      return {
        id: role.id,
        code: role.code,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        isActive: role.isActive,
        locked: role.code === LOCKED_ROLE_CODE,
        permissionCodes: codes,
        userCount: Number(count?.total ?? 0),
        activeUserCount: Number(count?.active ?? 0),
      };
    });
  }

  async updateRole(
    id: string,
    dto: UpdateRoleDto,
    actor: AuthPayload,
  ): Promise<RoleMatrixRowDto> {
    await this.dataSource.transaction(async (manager) => {
      const role = await this.lockRole(manager, id);
      const changed: string[] = [];

      if (dto.name !== undefined && dto.name.trim() !== role.name) {
        role.name = dto.name.trim();
        changed.push('name');
      }
      if (dto.description !== undefined) {
        const next = dto.description?.trim() || null;
        if (next !== role.description) {
          role.description = next;
          changed.push('description');
        }
      }

      const statusChange =
        dto.isActive !== undefined && dto.isActive !== role.isActive;
      if (statusChange && dto.isActive === false) {
        if (role.code === LOCKED_ROLE_CODE) {
          throw new ConflictException(
            'El rol Administrador no se puede desactivar.',
          );
        }
        const assigned = await manager
          .getRepository(User)
          .count({ where: { roleId: role.id } });
        if (assigned > 0) {
          throw new ConflictException(
            `No se puede desactivar: ${assigned} ${assigned === 1 ? 'usuario tiene' : 'usuarios tienen'} este rol. Reasígnelos primero.`,
          );
        }
      }
      if (statusChange) role.isActive = dto.isActive as boolean;

      if (!changed.length && !statusChange) return;

      await manager.save(Role, role);
      const audit = (action: AuditAction, metadata: Record<string, unknown>) =>
        this.auditLogService.recordCritical(
          {
            actor,
            action,
            resourceType: AuditResourceType.ROLE,
            resourceId: role.id,
            metadata,
          },
          manager,
        );
      if (changed.length) {
        await audit(AuditAction.ROLE_UPDATED, {
          roleCode: role.code,
          fields: changed,
        });
      }
      if (statusChange) {
        await audit(
          role.isActive
            ? AuditAction.ROLE_ACTIVATED
            : AuditAction.ROLE_DEACTIVATED,
          {
            roleCode: role.code,
          },
        );
      }
    });
    return this.findMatrixRow(id);
  }

  async replaceRolePermissions(
    id: string,
    dto: ReplaceRolePermissionsDto,
    actor: AuthPayload,
  ): Promise<RoleMatrixRowDto> {
    await this.dataSource.transaction(async (manager) => {
      const role = await this.lockRole(manager, id);
      if (role.code === LOCKED_ROLE_CODE) {
        throw new ConflictException(
          'El rol Administrador conserva todos los permisos: no se edita desde la consola.',
        );
      }

      const requested = [
        ...new Set(
          dto.permissionCodes.map((code) => code.trim().toUpperCase()),
        ),
      ];
      const permissions = requested.length
        ? await manager
            .getRepository(Permission)
            .find({ where: { code: In(requested) } })
        : [];
      const unknown = requested.filter(
        (code) => !permissions.some((p) => p.code === code),
      );
      if (unknown.length) {
        throw new BadRequestException(
          `Permisos desconocidos: ${unknown.join(', ')}`,
        );
      }
      if (actor.roleId === role.id && !requested.includes(CONSOLE_PERMISSION)) {
        throw new ConflictException(
          `No puede quitar ${CONSOLE_PERMISSION} de su propio rol: perdería el acceso a la consola.`,
        );
      }

      const current = await manager
        .getRepository(RolePermission)
        .find({ where: { roleId: role.id }, relations: { permission: true } });
      const currentCodes = new Set(current.map((item) => item.permission.code));
      const added = permissions.filter((p) => !currentCodes.has(p.code));
      const removed = current.filter(
        (item) => !requested.includes(item.permission.code),
      );
      if (!added.length && !removed.length) return;

      if (removed.length) {
        await manager.delete(RolePermission, {
          id: In(removed.map((item) => item.id)),
        });
      }
      for (const permission of added) {
        await manager.save(
          RolePermission,
          manager.create(RolePermission, {
            roleId: role.id,
            permissionId: permission.id,
          }),
        );
      }
      await this.auditLogService.recordCritical(
        {
          actor,
          action: AuditAction.ROLE_PERMISSIONS_CHANGED,
          resourceType: AuditResourceType.ROLE,
          resourceId: role.id,
          metadata: {
            roleCode: role.code,
            added: added.map((p) => p.code).sort(),
            removed: removed.map((item) => item.permission.code).sort(),
          },
        },
        manager,
      );
    });
    return this.findMatrixRow(id);
  }

  /* --------------------------------------------------- Coordinaciones -- */

  async createCoordination(
    dto: CreateCoordinationDto,
    actor: AuthPayload,
  ): Promise<Coordination> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Coordination);
      const code = dto.code.trim().toLowerCase();
      if (await repository.exists({ where: { code } })) {
        throw new ConflictException(
          `Ya existe una coordinación con el código ${code}.`,
        );
      }
      const { max } = (await repository
        .createQueryBuilder('c')
        .select('COALESCE(MAX(c.displayOrder), 0)', 'max')
        .getRawOne<{ max: number }>()) ?? { max: 0 };

      const saved = await repository.save(
        repository.create({
          code,
          name: dto.name.trim(),
          shortName: dto.shortName.trim(),
          description: dto.description?.trim() || null,
          color: dto.color.toUpperCase(),
          // Sin arte propio: la interfaz usa la presentación genérica.
          icon: code,
          imageAsset: '',
          displayOrder: dto.displayOrder ?? Number(max) + 1,
          isActive: true,
        }),
      );
      await this.auditLogService.recordCritical(
        {
          actor,
          action: AuditAction.COORDINATION_CREATED,
          resourceType: AuditResourceType.COORDINATION,
          resourceId: saved.id,
          metadata: { code: saved.code },
        },
        manager,
      );
      return saved;
    });
  }

  async updateCoordination(
    id: string,
    dto: UpdateCoordinationDto,
    actor: AuthPayload,
  ): Promise<Coordination> {
    return this.dataSource.transaction(async (manager) => {
      const coordination = await manager.getRepository(Coordination).findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!coordination)
        throw new NotFoundException(`Coordinación no encontrada: ${id}`);

      const changed: string[] = [];
      const set = <K extends 'name' | 'shortName' | 'color' | 'displayOrder'>(
        key: K,
        value: Coordination[K] | undefined,
      ) => {
        if (value !== undefined && value !== coordination[key]) {
          coordination[key] = value;
          changed.push(key);
        }
      };
      set('name', dto.name?.trim());
      set('shortName', dto.shortName?.trim());
      set('color', dto.color?.toUpperCase());
      set('displayOrder', dto.displayOrder);
      if (dto.description !== undefined) {
        const next = dto.description?.trim() || null;
        if (next !== coordination.description) {
          coordination.description = next;
          changed.push('description');
        }
      }

      const statusChange =
        dto.isActive !== undefined && dto.isActive !== coordination.isActive;
      if (statusChange && dto.isActive === false) {
        await this.assertCoordinationCanDeactivate(manager, coordination.id);
      }
      if (statusChange) coordination.isActive = dto.isActive as boolean;
      if (!changed.length && !statusChange) return coordination;

      const saved = await manager.save(Coordination, coordination);
      const audit = (action: AuditAction, metadata: Record<string, unknown>) =>
        this.auditLogService.recordCritical(
          {
            actor,
            action,
            resourceType: AuditResourceType.COORDINATION,
            resourceId: saved.id,
            metadata,
          },
          manager,
        );
      if (changed.length) {
        await audit(AuditAction.COORDINATION_UPDATED, {
          code: saved.code,
          fields: changed,
        });
      }
      if (statusChange) {
        await audit(
          saved.isActive
            ? AuditAction.COORDINATION_ACTIVATED
            : AuditAction.COORDINATION_DEACTIVATED,
          { code: saved.code },
        );
      }
      return saved;
    });
  }

  /* --------------------------------------------------------- Auditoría -- */

  async listAuditLogs(query: ListAuditLogsQueryDto): Promise<AuditLogPageDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const qb = this.dataSource
      .getRepository(AuditLog)
      .createQueryBuilder('log')
      .leftJoin(User, 'actor', 'actor.id = log.actorUserId')
      .select('log')
      .addSelect(['actor.fullName', 'actor.email'])
      .orderBy('log.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.action)
      qb.andWhere('log.action = :action', { action: query.action });
    if (query.resourceType) {
      qb.andWhere('log.resourceType = :resourceType', {
        resourceType: query.resourceType,
      });
    }
    if (query.actorUserId)
      qb.andWhere('log.actorUserId = :actorUserId', {
        actorUserId: query.actorUserId,
      });
    if (query.from) qb.andWhere('log.createdAt >= :from', { from: query.from });
    if (query.to) qb.andWhere('log.createdAt <= :to', { to: query.to });

    const total = await qb.getCount();
    const { entities, raw } = await qb.getRawAndEntities();
    const actorByLog = new Map<
      string,
      { name: string | null; email: string | null }
    >();
    raw.forEach((row: Record<string, unknown>) => {
      actorByLog.set(String(row.log_id), {
        name: (row.actor_full_name as string | null) ?? null,
        email: (row.actor_email as string | null) ?? null,
      });
    });

    const [actions, resourceTypes] = await Promise.all([
      this.dataSource.query<Array<{ value: string }>>(
        `SELECT DISTINCT "action" AS value FROM "audit_logs" ORDER BY 1`,
      ),
      this.dataSource.query<Array<{ value: string }>>(
        `SELECT DISTINCT "resource_type" AS value FROM "audit_logs" ORDER BY 1`,
      ),
    ]);

    return {
      items: entities.map((log) => ({
        id: log.id,
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        actorUserId: log.actorUserId,
        actorRole: log.actorRole,
        actorName: actorByLog.get(log.id)?.name ?? null,
        actorEmail: actorByLog.get(log.id)?.email ?? null,
        metadata: log.metadata,
        createdAt: log.createdAt,
      })),
      total,
      page,
      limit,
      facets: {
        actions: actions.map((row) => row.value),
        resourceTypes: resourceTypes.map((row) => row.value),
      },
    };
  }

  /* ---------------------------------------------------------- Ayudas -- */

  private async lockRole(manager: EntityManager, id: string): Promise<Role> {
    const role = await manager.getRepository(Role).findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!role) throw new NotFoundException(`Rol no encontrado: ${id}`);
    return role;
  }

  private async findMatrixRow(id: string): Promise<RoleMatrixRowDto> {
    const row = (await this.getRoleMatrix()).find((item) => item.id === id);
    if (!row) throw new NotFoundException(`Rol no encontrado: ${id}`);
    return row;
  }

  private async assertCoordinationCanDeactivate(
    manager: EntityManager,
    id: string,
  ): Promise<void> {
    const users = await manager
      .getRepository(User)
      .count({ where: { coordinationId: id, status: UserStatus.ACTIVE } });
    if (users > 0) {
      throw new ConflictException(
        `No se puede desactivar: ${users} ${users === 1 ? 'usuario activo pertenece' : 'usuarios activos pertenecen'} a esta coordinación.`,
      );
    }
    const open = await manager.getRepository(Situation).count({
      where: {
        coordinationId: id,
        status: In([SituationStatus.OPEN, SituationStatus.IN_PROGRESS]),
      },
    });
    if (open > 0) {
      throw new ConflictException(
        `No se puede desactivar: tiene ${open} ${open === 1 ? 'situación abierta' : 'situaciones abiertas'}. Ciérrelas o trasládelas primero.`,
      );
    }
  }
}
