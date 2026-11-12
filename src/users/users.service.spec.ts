import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { UserStatus } from '../common/enums/identity.enums';
import { UsersService } from './users.service';

describe('UsersService admin registration', () => {
  const createService = () => {
    const usersRepository = {
      findCatalog: jest.fn(),
      findByIdWithRelations: jest.fn(),
      findByEmail: jest.fn(),
      create: jest.fn((input: unknown) => input),
      save: jest.fn((entity: { id?: string }) =>
        Promise.resolve({
          ...entity,
          id: entity.id ?? 'user-1',
        }),
      ),
      // Fase 01B.1: alta y cambios corren en una transacción con auditoría
      // obligatoria. El manager de prueba delega en el save del repositorio.
      manager: {
        transaction: jest.fn(
          <T>(work: (manager: { save: jest.Mock }) => Promise<T>): Promise<T> =>
            work(txManager),
        ),
      },
    };
    const txManager = {
      save: jest.fn((_entity: unknown, data: { id?: string }) =>
        usersRepository.save(data),
      ),
    };

    const rolesRepository = {
      findOne: jest.fn(),
    };

    const coordinationsRepository = {
      findOne: jest.fn(),
    };

    const auditLogService = {
      record: jest.fn().mockResolvedValue(null),
      recordCritical: jest.fn().mockResolvedValue({}),
    };

    const service = new UsersService(
      usersRepository as never,
      rolesRepository as never,
      coordinationsRepository as never,
      auditLogService as never,
    );

    return {
      service,
      usersRepository,
      rolesRepository,
      coordinationsRepository,
      auditLogService,
    };
  };

  // Tipado como AuthPayload (no `as const`): los servicios reciben listas de
  // permisos mutables, como las que resuelve el guard en cada petición.
  const adminActor: AuthPayload = {
    sub: 'admin-1',
    email: 'admin@cun.edu.co',
    roleId: 'role-admin',
    roleCode: 'ADMIN',
    coordinationId: null,
    permissions: ['USERS_CREATE', 'USERS_UPDATE'],
    status: UserStatus.ACTIVE,
  };

  const role = {
    id: 'role-coord',
    code: 'COORDINADOR',
    name: 'Coordinador',
    isActive: true,
  };

  const coordination = {
    id: 'coord-uuid',
    code: 'coord-b2b',
    name: 'B2B',
    isActive: true,
  };

  it('crea un usuario real con rol, coordinación y estado', async () => {
    const {
      service,
      usersRepository,
      rolesRepository,
      coordinationsRepository,
    } = createService();

    usersRepository.findByEmail.mockResolvedValue(null);
    rolesRepository.findOne.mockResolvedValue(role);
    coordinationsRepository.findOne.mockResolvedValue(coordination);
    usersRepository.findByIdWithRelations.mockResolvedValue({
      id: 'user-1',
      googleSub: null,
      email: 'coord@cun.edu.co',
      fullName: 'Ana Coordinadora',
      photoUrl: null,
      roleId: role.id,
      role,
      coordinationId: coordination.id,
      coordination,
      status: UserStatus.ACTIVE,
      lastLoginAt: null,
      createdAt: new Date('2026-08-03T00:00:00.000Z'),
      updatedAt: new Date('2026-08-03T00:00:00.000Z'),
    });

    const result = await service.create(
      {
        fullName: 'Ana Coordinadora',
        email: 'Coord@cun.edu.co',
        roleCode: 'coordinador',
        coordinationId: coordination.id,
        status: UserStatus.ACTIVE,
      },
      adminActor,
    );

    expect(usersRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'coord@cun.edu.co',
        fullName: 'Ana Coordinadora',
        roleId: role.id,
        coordinationId: coordination.id,
        status: UserStatus.ACTIVE,
        googleSub: null,
      }),
    );
    expect(result.email).toBe('coord@cun.edu.co');
    expect(result.roleCode).toBe('COORDINADOR');
    expect(result.coordinationId).toBe(coordination.id);
    expect(result.status).toBe(UserStatus.ACTIVE);
  });

  it('rechaza correo duplicado', async () => {
    const { service, usersRepository } = createService();
    usersRepository.findByEmail.mockResolvedValue({ id: 'existing' });

    await expect(
      service.create(
        {
          fullName: 'Duplicado',
          email: 'dup@cun.edu.co',
          roleCode: 'ANALISTA',
          coordinationId: coordination.id,
          status: UserStatus.ACTIVE,
        },
        adminActor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rechaza rol inválido', async () => {
    const {
      service,
      usersRepository,
      rolesRepository,
      coordinationsRepository,
    } = createService();
    usersRepository.findByEmail.mockResolvedValue(null);
    rolesRepository.findOne.mockResolvedValue(null);
    coordinationsRepository.findOne.mockResolvedValue(coordination);

    await expect(
      service.create(
        {
          fullName: 'Sin rol',
          email: 'x@cun.edu.co',
          roleCode: 'DESCONOCIDO',
          coordinationId: coordination.id,
          status: UserStatus.ACTIVE,
        },
        adminActor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('actualiza estado y coordinación principal', async () => {
    const {
      service,
      usersRepository,
      rolesRepository,
      coordinationsRepository,
      auditLogService,
    } = createService();

    const existing = {
      id: 'user-1',
      googleSub: null,
      email: 'dir@cun.edu.co',
      fullName: 'Director',
      photoUrl: null,
      roleId: 'role-dir',
      role: {
        id: 'role-dir',
        code: 'DIRECTOR',
        name: 'Director',
        isActive: true,
      },
      coordinationId: 'old-coord',
      coordination: {
        id: 'old-coord',
        code: 'coord-general',
        name: 'General',
        isActive: true,
      },
      status: UserStatus.ACTIVE,
      lastLoginAt: null,
      createdAt: new Date('2026-08-03T00:00:00.000Z'),
      updatedAt: new Date('2026-08-03T00:00:00.000Z'),
    };

    usersRepository.findByIdWithRelations
      .mockResolvedValueOnce({ ...existing })
      .mockResolvedValueOnce({
        ...existing,
        status: UserStatus.INACTIVE,
        coordinationId: coordination.id,
        coordination,
      });
    coordinationsRepository.findOne.mockResolvedValue(coordination);

    const result = await service.update(
      'user-1',
      {
        status: UserStatus.INACTIVE,
        coordinationId: coordination.id,
      },
      adminActor,
    );

    expect(usersRepository.save).toHaveBeenCalled();
    expect(rolesRepository.findOne).not.toHaveBeenCalled();
    expect(result.status).toBe(UserStatus.INACTIVE);
    expect(result.coordinationId).toBe(coordination.id);
    // Cada cambio crítico, con valor anterior y nuevo, en la transacción.
    const actions = auditLogService.recordCritical.mock.calls.map(
      ([input]: [{ action: string; metadata: unknown }]) => input,
    );
    expect(actions).toEqual([
      expect.objectContaining({
        action: 'USER_DEACTIVATED',
        metadata: {
          previousStatus: UserStatus.ACTIVE,
          nextStatus: UserStatus.INACTIVE,
        },
      }),
      expect.objectContaining({
        action: 'USER_COORDINATION_CHANGED',
        metadata: {
          previousCoordinationId: 'old-coord',
          nextCoordinationId: coordination.id,
        },
      }),
    ]);
  });

  it('da de alta un analista sin coordinación (alcance global)', async () => {
    const {
      service,
      usersRepository,
      rolesRepository,
      coordinationsRepository,
    } = createService();
    usersRepository.findByEmail.mockResolvedValue(null);
    rolesRepository.findOne.mockResolvedValue({
      id: 'role-analyst',
      code: 'ANALISTA',
      name: 'Analista',
      isActive: true,
    });
    usersRepository.findByIdWithRelations.mockResolvedValue({
      id: 'user-1',
      email: 'ana@cun.edu.co',
      fullName: 'Ana Global',
      status: UserStatus.ACTIVE,
      roleId: 'role-analyst',
      role: { id: 'role-analyst', code: 'ANALISTA', name: 'Analista' },
      coordinationId: null,
      coordination: null,
    });

    const result = await service.create(
      {
        fullName: 'Ana Global',
        email: 'ana@cun.edu.co',
        roleCode: 'ANALISTA',
        coordinationId: null,
        status: UserStatus.ACTIVE,
      },
      adminActor,
    );

    expect(coordinationsRepository.findOne).not.toHaveBeenCalled();
    expect(result.coordinationId).toBeNull();
  });

  it('rechaza un coordinador sin coordinación', async () => {
    const { service, usersRepository, rolesRepository } = createService();
    usersRepository.findByEmail.mockResolvedValue(null);
    rolesRepository.findOne.mockResolvedValue(role);

    await expect(
      service.create(
        {
          fullName: 'Coord sin área',
          email: 'c@cun.edu.co',
          roleCode: 'COORDINADOR',
          status: UserStatus.ACTIVE,
        },
        adminActor,
      ),
    ).rejects.toThrow(/necesita una coordinación/);
  });

  it('nadie se desactiva ni se cambia el rol a sí mismo', async () => {
    const { service, usersRepository } = createService();
    usersRepository.findByIdWithRelations.mockResolvedValue({
      id: adminActor.sub,
      fullName: 'Admin',
      status: UserStatus.ACTIVE,
      coordinationId: null,
      coordination: null,
      role: { id: 'role-admin', code: 'ADMIN' },
    });

    await expect(
      service.update(
        adminActor.sub,
        { status: UserStatus.INACTIVE },
        adminActor,
      ),
    ).rejects.toThrow(/propia cuenta/);
    await expect(
      service.update(adminActor.sub, { roleCode: 'ANALISTA' }, adminActor),
    ).rejects.toThrow(/propia cuenta/);
  });

  it('falla al actualizar usuario inexistente', async () => {
    const { service, usersRepository } = createService();
    usersRepository.findByIdWithRelations.mockResolvedValue(null);

    await expect(
      service.update('missing', { status: UserStatus.INACTIVE }, adminActor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('persiste el avance del onboarding y limita el paso al rango admitido', async () => {
    const { service, usersRepository } = createService();
    const existing = {
      id: 'user-1',
      googleSub: null,
      email: 'analista@cun.edu.co',
      fullName: 'Analista',
      photoUrl: null,
      roleId: role.id,
      role,
      coordinationId: coordination.id,
      coordination,
      status: UserStatus.ACTIVE,
      lastLoginAt: null,
      onboardingStep: 0,
      onboardingCompleted: false,
      onboardingSeenAt: null,
      createdAt: new Date('2026-08-03T00:00:00.000Z'),
      updatedAt: new Date('2026-08-03T00:00:00.000Z'),
    };
    usersRepository.findByIdWithRelations.mockResolvedValue(existing);

    const result = await service.updateOnboarding('user-1', {
      step: 150,
      completed: true,
    });

    expect(usersRepository.save).toHaveBeenCalledTimes(1);
    expect(existing.onboardingStep).toBe(100);
    expect(existing.onboardingCompleted).toBe(true);
    expect(result.onboardingStep).toBe(100);
    expect(result.onboardingCompleted).toBe(true);
    expect(result.onboardingSeenAt).toBeInstanceOf(Date);
  });
});
