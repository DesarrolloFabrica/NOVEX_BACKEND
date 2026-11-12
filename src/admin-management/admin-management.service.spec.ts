import { BadRequestException, ConflictException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { AuditAction } from '../audit/audit-action.enum';
import type { AuditLogService } from '../audit/audit-log.service';
import { UserStatus } from '../common/enums/identity.enums';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { Permission } from '../permissions/entities/permission.entity';
import { RolePermission } from '../permissions/entities/role-permission.entity';
import { Role } from '../roles/entities/role.entity';
import { Situation } from '../situations/entities/situation.entity';
import { User } from '../users/entities/user.entity';
import { AdminManagementService } from './admin-management.service';

const ADMIN_ROLE = {
  id: 'r-admin',
  code: 'ADMIN',
  name: 'Administrador',
  description: null,
  isSystem: true,
  isActive: true,
} as Role;
const ANALYST_ROLE = {
  id: 'r-analyst',
  code: 'ANALISTA',
  name: 'Analista',
  description: null,
  isSystem: true,
  isActive: true,
} as Role;

const actor: AuthPayload = {
  sub: 'u-admin',
  email: 'admin@test.co',
  roleId: 'r-admin',
  roleCode: 'ADMIN',
  coordinationId: null,
  permissions: ['SYSTEM_CONFIGURATION', 'COORDINATIONS_MANAGE'],
  status: UserStatus.ACTIVE,
};

interface Fixture {
  roles?: Role[];
  permissions?: Permission[];
  assignments?: RolePermission[];
  userCount?: number;
  activeUsersInCoordination?: number;
  openSituations?: number;
  coordination?: Coordination | null;
}

function build(fixture: Fixture) {
  const saved: Array<{ entity: unknown; value: unknown }> = [];
  const deleted: unknown[] = [];
  const recordCritical = jest.fn().mockResolvedValue({});

  const repoFor = (entity: unknown) => {
    if (entity === Role) {
      return {
        findOne: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(
            (fixture.roles ?? []).find((role) => role.id === where.id) ?? null,
          ),
        ),
        find: jest.fn().mockResolvedValue(fixture.roles ?? []),
      };
    }
    if (entity === Permission) {
      return { find: jest.fn().mockResolvedValue(fixture.permissions ?? []) };
    }
    if (entity === RolePermission) {
      return { find: jest.fn().mockResolvedValue(fixture.assignments ?? []) };
    }
    if (entity === User) {
      return {
        count: jest.fn(({ where }: { where: Record<string, unknown> }) =>
          Promise.resolve(
            where.coordinationId
              ? (fixture.activeUsersInCoordination ?? 0)
              : (fixture.userCount ?? 0),
          ),
        ),
      };
    }
    if (entity === Situation) {
      return {
        count: jest.fn().mockResolvedValue(fixture.openSituations ?? 0),
      };
    }
    if (entity === Coordination) {
      return {
        findOne: jest.fn().mockResolvedValue(fixture.coordination ?? null),
        exists: jest.fn().mockResolvedValue(false),
      };
    }
    throw new Error('repositorio no simulado');
  };

  const manager = {
    getRepository: jest.fn(repoFor),
    save: jest.fn((entity: unknown, value: unknown) => {
      saved.push({ entity, value });
      return Promise.resolve(value);
    }),
    delete: jest.fn((_entity: unknown, criteria: unknown) => {
      deleted.push(criteria);
      return Promise.resolve();
    }),
    create: jest.fn((_entity: unknown, value: unknown) => value),
  } as unknown as EntityManager;

  const dataSource = {
    transaction: jest.fn((work: (m: EntityManager) => Promise<unknown>) =>
      work(manager),
    ),
    getRepository: jest.fn(repoFor),
    query: jest.fn().mockResolvedValue([]),
  } as unknown as DataSource;

  const service = new AdminManagementService(dataSource, {
    recordCritical,
  } as unknown as AuditLogService);
  return { service, saved, deleted, recordCritical };
}

describe('AdminManagementService · roles', () => {
  it('no permite desactivar el rol Administrador', async () => {
    const { service, recordCritical } = build({ roles: [{ ...ADMIN_ROLE }] });
    await expect(
      service.updateRole('r-admin', { isActive: false }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(recordCritical).not.toHaveBeenCalled();
  });

  it('no desactiva un rol que todavía tiene usuarios', async () => {
    const { service } = build({ roles: [{ ...ANALYST_ROLE }], userCount: 3 });
    await expect(
      service.updateRole('r-analyst', { isActive: false }, actor),
    ).rejects.toThrow(/3 usuarios tienen este rol/);
  });

  it('renombra un rol y audita qué campo cambió, en la misma transacción', async () => {
    const { service, saved, recordCritical } = build({
      roles: [{ ...ANALYST_ROLE }],
    });
    await service.updateRole(
      'r-analyst',
      { name: '  Analista senior ' },
      actor,
    );
    expect(saved[0].value).toMatchObject({ name: 'Analista senior' });
    expect(recordCritical).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.ROLE_UPDATED,
        metadata: { roleCode: 'ANALISTA', fields: ['name'] },
      }),
      expect.anything(),
    );
  });

  it('no edita la matriz del rol Administrador', async () => {
    const { service } = build({ roles: [{ ...ADMIN_ROLE }] });
    await expect(
      service.replaceRolePermissions('r-admin', { permissionCodes: [] }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rechaza códigos de permiso desconocidos', async () => {
    const { service } = build({
      roles: [{ ...ANALYST_ROLE }],
      permissions: [],
    });
    await expect(
      service.replaceRolePermissions(
        'r-analyst',
        { permissionCodes: ['NO_EXISTE'] },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('nadie se quita SYSTEM_CONFIGURATION de su propio rol', async () => {
    const own = { ...ANALYST_ROLE, id: 'r-own' };
    const { service } = build({ roles: [own], permissions: [] });
    await expect(
      service.replaceRolePermissions(
        'r-own',
        { permissionCodes: [] },
        { ...actor, roleId: 'r-own' },
      ),
    ).rejects.toThrow(/propio rol/);
  });

  it('aplica solo la diferencia y audita lo añadido y lo retirado', async () => {
    const view = { id: 'p1', code: 'SITUATIONS_VIEW' } as Permission;
    const kpi = { id: 'p2', code: 'KPIS_VIEW' } as Permission;
    const { service, saved, deleted, recordCritical } = build({
      roles: [{ ...ANALYST_ROLE }],
      permissions: [view],
      assignments: [
        {
          id: 'a1',
          roleId: 'r-analyst',
          permissionId: 'p1',
          permission: view,
        } as RolePermission,
        {
          id: 'a2',
          roleId: 'r-analyst',
          permissionId: 'p2',
          permission: kpi,
        } as RolePermission,
      ],
    });
    await service.replaceRolePermissions(
      'r-analyst',
      { permissionCodes: ['situations_view'] },
      actor,
    );
    expect(deleted).toHaveLength(1);
    expect(saved).toHaveLength(0);
    expect(recordCritical).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.ROLE_PERMISSIONS_CHANGED,
        metadata: { roleCode: 'ANALISTA', added: [], removed: ['KPIS_VIEW'] },
      }),
      expect.anything(),
    );
  });
});

describe('AdminManagementService · coordinaciones', () => {
  const coordination = (): Coordination =>
    ({
      id: 'c1',
      code: 'coord-x',
      name: 'X',
      shortName: 'X',
      description: null,
      color: '#112233',
      displayOrder: 3,
      isActive: true,
    }) as Coordination;

  it('no desactiva una coordinación con usuarios activos', async () => {
    const { service } = build({
      coordination: coordination(),
      activeUsersInCoordination: 2,
    });
    await expect(
      service.updateCoordination('c1', { isActive: false }, actor),
    ).rejects.toThrow(/usuarios activos/);
  });

  it('no desactiva una coordinación con situaciones abiertas', async () => {
    const { service } = build({
      coordination: coordination(),
      openSituations: 4,
    });
    await expect(
      service.updateCoordination('c1', { isActive: false }, actor),
    ).rejects.toThrow(/4 situaciones abiertas/);
  });

  it('desactiva cuando no hay dependencias y lo audita', async () => {
    const { service, recordCritical } = build({ coordination: coordination() });
    const result = await service.updateCoordination(
      'c1',
      { isActive: false },
      actor,
    );
    expect(result.isActive).toBe(false);
    expect(recordCritical).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.COORDINATION_DEACTIVATED }),
      expect.anything(),
    );
  });
});
