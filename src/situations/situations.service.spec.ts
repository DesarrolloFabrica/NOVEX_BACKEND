import { BadRequestException } from '@nestjs/common';
import { UserStatus } from '../common/enums/identity.enums';
import { SituationStatus } from '../common/enums/situation.enums';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { SituationsService } from './situations.service';

describe('SituationsService status transitions', () => {
  const analystActor: AuthPayload = {
    sub: 'user-1',
    email: 'analyst@cun.edu.co',
    roleId: 'role-analyst',
    roleCode: 'ANALISTA',
    coordinationId: 'coord-general',
    permissions: ['SITUATIONS_VIEW', 'SITUATIONS_UPDATE'],
    status: UserStatus.ACTIVE,
  };

  const createService = () => {
    const situationsRepository = {
      findByIdWithRelations: jest.fn(),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
      create: jest.fn((input: unknown) => input),
      search: jest.fn(),
    };
    const coordinationsRepository = { findOne: jest.fn() };
    const categoriesRepository = { findOne: jest.fn() };
    const usersRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        fullName: 'Juan Pérez',
      }),
    };
    const timelineService = {
      createEntry: jest.fn().mockResolvedValue({}),
    };
    const scopeService = {
      assertPermission: jest.fn(),
      resolveSituationListCoordinationId: jest.fn(
        (_actor: AuthPayload, requested?: string) => requested,
      ),
      assertSituationInScope: jest.fn(),
      assertCanUpdateSituation: jest.fn(),
      resolveCreateCoordinationId: jest.fn(
        (_actor: AuthPayload, requested: string) => requested,
      ),
      isCoordinationScoped: jest.fn().mockReturnValue(false),
    };

    const auditLogService = {
      record: jest.fn().mockResolvedValue(null),
    };

    const service = new SituationsService(
      situationsRepository as never,
      coordinationsRepository as never,
      categoriesRepository as never,
      usersRepository as never,
      { create: jest.fn((input: unknown) => input) } as never,
      timelineService as never,
      scopeService as never,
      auditLogService as never,
    );

    return {
      service,
      situationsRepository,
      usersRepository,
      timelineService,
      scopeService,
      auditLogService,
    };
  };

  const baseSituation = {
    id: 'sit-1',
    title: 'Incidente',
    description: 'Desc',
    coordinationId: 'c1',
    coordination: { code: 'coord', name: 'Coord' },
    createdByUserId: 'creator',
    createdByUser: { fullName: 'Creador' },
    assignedUserId: null,
    assignedUser: null,
    categoryId: 'cat',
    category: { code: 'TECH', name: 'Tech' },
    severity: 'HIGH',
    status: SituationStatus.OPEN,
    lastStatusComment: null,
    resolvedAt: null,
    closedAt: null,
    occurredAt: new Date('2026-07-28T10:00:00.000Z'),
    createdAt: new Date('2026-07-28T10:00:00.000Z'),
    updatedAt: new Date('2026-07-28T10:00:00.000Z'),
    relatedCoordinations: [],
  };

  it('avanza OPEN → IN_PROGRESS y asigna responsable automático', async () => {
    const { service, situationsRepository, timelineService } = createService();
    situationsRepository.findByIdWithRelations
      .mockResolvedValueOnce({ ...baseSituation })
      .mockResolvedValueOnce({
        ...baseSituation,
        status: SituationStatus.IN_PROGRESS,
        assignedUserId: 'user-1',
        assignedUser: { fullName: 'Juan Pérez' },
      });

    const result = await service.update(
      'sit-1',
      { status: SituationStatus.IN_PROGRESS },
      analystActor,
    );

    expect(situationsRepository.save).toHaveBeenCalled();
    expect(timelineService.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        title: 'Estado actualizado',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        metadata: expect.objectContaining({
          previousValue: SituationStatus.OPEN,
          newValue: SituationStatus.IN_PROGRESS,
          assignedUserName: 'Juan Pérez',
          evidenceIds: [],
        }),
      }),
    );
    expect(result.status).toBe(SituationStatus.IN_PROGRESS);
    expect(result.assignedUserName).toBe('Juan Pérez');
  });

  it('exige motivo al pasar a CLOSED desde IN_PROGRESS', async () => {
    const { service, situationsRepository, timelineService } = createService();
    situationsRepository.findByIdWithRelations.mockResolvedValue({
      ...baseSituation,
      status: SituationStatus.IN_PROGRESS,
      assignedUserId: 'user-1',
      assignedUser: { fullName: 'Juan Pérez' },
    });

    await expect(
      service.update('sit-1', { status: SituationStatus.CLOSED }, analystActor),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(timelineService.createEntry).not.toHaveBeenCalled();
  });

  it('avanza IN_PROGRESS → CLOSED con motivo', async () => {
    const { service, situationsRepository, timelineService } = createService();
    situationsRepository.findByIdWithRelations
      .mockResolvedValueOnce({
        ...baseSituation,
        status: SituationStatus.IN_PROGRESS,
        assignedUserId: 'user-1',
        assignedUser: { fullName: 'Juan Pérez' },
      })
      .mockResolvedValueOnce({
        ...baseSituation,
        status: SituationStatus.CLOSED,
        assignedUserId: 'user-1',
        assignedUser: { fullName: 'Juan Pérez' },
        lastStatusComment: 'Caso documentado y cerrado.',
        closedAt: new Date(),
        resolvedAt: new Date(),
      });

    const result = await service.update(
      'sit-1',
      {
        status: SituationStatus.CLOSED,
        statusComment: 'Caso documentado y cerrado.',
      },
      analystActor,
    );

    expect(timelineService.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Situación cerrada',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        metadata: expect.objectContaining({
          previousValue: SituationStatus.IN_PROGRESS,
          newValue: SituationStatus.CLOSED,
          statusComment: 'Caso documentado y cerrado.',
          commentKind: 'closure',
        }),
      }),
    );
    expect(result.status).toBe(SituationStatus.CLOSED);
  });

  it('rechaza saltos de estado y retrocesos', async () => {
    const { service, situationsRepository } = createService();
    situationsRepository.findByIdWithRelations.mockResolvedValue({
      ...baseSituation,
      status: SituationStatus.OPEN,
    });

    await expect(
      service.update(
        'sit-1',
        { status: SituationStatus.CLOSED, statusComment: 'Motivo' },
        analystActor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bloquea cambios cuando la situación está CLOSED', async () => {
    const { service, situationsRepository } = createService();
    situationsRepository.findByIdWithRelations.mockResolvedValue({
      ...baseSituation,
      status: SituationStatus.CLOSED,
      closedAt: new Date(),
    });

    await expect(
      service.update(
        'sit-1',
        { status: SituationStatus.IN_PROGRESS },
        analystActor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persiste comentario de cierre en el historial', async () => {
    const { service, situationsRepository, timelineService } = createService();
    situationsRepository.findByIdWithRelations
      .mockResolvedValueOnce({
        ...baseSituation,
        status: SituationStatus.RESOLVED,
        assignedUserId: 'user-1',
        assignedUser: { fullName: 'Juan Pérez' },
        resolvedAt: new Date(),
      })
      .mockResolvedValueOnce({
        ...baseSituation,
        status: SituationStatus.CLOSED,
        assignedUserId: 'user-1',
        assignedUser: { fullName: 'Juan Pérez' },
        lastStatusComment: 'Validación final realizada.',
        closedAt: new Date(),
      });

    await service.update(
      'sit-1',
      {
        status: SituationStatus.CLOSED,
        statusComment: 'Validación final realizada.',
        evidenceIds: [],
      },
      analystActor,
    );

    expect(timelineService.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Situación cerrada',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        metadata: expect.objectContaining({
          statusComment: 'Validación final realizada.',
          commentKind: 'closure',
          previousValue: SituationStatus.RESOLVED,
          newValue: SituationStatus.CLOSED,
        }),
      }),
    );
  });
});

describe('SituationsService related coordinations', () => {
  const actor: AuthPayload = {
    sub: 'user-1',
    email: 'coord@cun.edu.co',
    roleId: 'role-coord',
    roleCode: 'COORDINADOR',
    coordinationId: 'c1',
    permissions: ['SITUATIONS_CREATE', 'SITUATIONS_VIEW'],
    status: UserStatus.ACTIVE,
  };

  it('persiste relacionadas válidas y excluye la coordinación origen', async () => {
    const situationsRepository = {
      findByIdWithRelations: jest.fn(),
      save: jest.fn((entity: { id?: string }) => ({
        ...entity,
        id: 'sit-new',
      })),
      create: jest.fn((input: unknown) => input),
      search: jest.fn(),
    };
    const relatedRepo = {
      create: jest.fn((input: unknown) => input),
    };
    const coordinationsRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'c1',
        code: 'coord-origin',
        name: 'Origen',
        shortName: 'Origen',
      }),
      find: jest.fn().mockResolvedValue([
        {
          id: 'c2',
          code: 'coord-rel',
          name: 'Relacionada',
          shortName: 'Rel',
        },
      ]),
    };
    const categoriesRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'cat',
        code: 'TECH',
        name: 'Tech',
      }),
    };
    const scopeService = {
      resolveCreateCoordinationId: jest.fn(
        (_actor: AuthPayload, requested: string) => requested,
      ),
    };

    const service = new SituationsService(
      situationsRepository as never,
      coordinationsRepository as never,
      categoriesRepository as never,
      { findOne: jest.fn() } as never,
      relatedRepo as never,
      { createEntry: jest.fn() } as never,
      scopeService as never,
      { record: jest.fn().mockResolvedValue(null) } as never,
    );

    situationsRepository.findByIdWithRelations.mockResolvedValue({
      id: 'sit-new',
      title: 'Incidente',
      description: 'Desc',
      coordinationId: 'c1',
      coordination: { code: 'coord-origin', name: 'Origen' },
      createdByUserId: 'user-1',
      createdByUser: { fullName: 'Juan' },
      assignedUserId: null,
      assignedUser: null,
      categoryId: 'cat',
      category: { code: 'TECH', name: 'Tech' },
      severity: 'MEDIUM',
      status: SituationStatus.OPEN,
      lastStatusComment: null,
      resolvedAt: null,
      closedAt: null,
      occurredAt: new Date('2026-08-01T10:00:00.000Z'),
      createdAt: new Date('2026-08-01T10:00:00.000Z'),
      updatedAt: new Date('2026-08-01T10:00:00.000Z'),
      relatedCoordinations: [
        {
          id: 'rel-1',
          coordinationId: 'c2',
          displayOrder: 0,
          coordination: {
            code: 'coord-rel',
            name: 'Relacionada',
            shortName: 'Rel',
          },
        },
      ],
    });

    const result = await service.create(
      {
        title: 'Incidente',
        description: 'Desc',
        coordinationId: 'c1',
        categoryId: 'cat',
        severity: 'MEDIUM' as never,
        occurredAt: '2026-08-01T10:00:00.000Z',
        relatedCoordinationIds: ['c1', 'c2', 'c2'],
      },
      actor,
    );

    expect(coordinationsRepository.find).toHaveBeenCalled();
    expect(situationsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        relatedCoordinations: [
          expect.objectContaining({ coordinationId: 'c2', displayOrder: 0 }),
        ],
      }),
    );
    expect(result.relatedCoordinations).toHaveLength(1);
    expect(result.relatedCoordinations[0]?.coordinationCode).toBe('coord-rel');
  });
});
