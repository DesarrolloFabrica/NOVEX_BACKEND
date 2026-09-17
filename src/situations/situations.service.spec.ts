import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
      // `toResponse` consulta la política de resolución para poblar
      // `canResolve`. Este actor es ANALISTA, que nunca resuelve.
      canResolveSituation: jest.fn().mockReturnValue(false),
      // `getById` lee con la regla ampliada (alcance O reporte propio).
      assertSituationReadable: jest.fn(),
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
      // Repositorio de resoluciones: inerte. Estos casos cubren las
      // transiciones del PATCH, no la operación de resolución.
      {} as never,
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

  it('el PATCH genérico NO puede cerrar desde IN_PROGRESS', async () => {
    // Verdad nueva: cerrar dejó de ser una transición más del PATCH. Antes esto
    // solo exigía un motivo; ahora la ruta entera está cerrada, porque
    // `assertCanUpdateSituation` autoriza por AUTORÍA o por área y eso es más
    // amplio que la regla de resolución. El cierre vive en
    // POST /situations/:id/resolution.
    const { service, situationsRepository, timelineService } = createService();
    situationsRepository.findByIdWithRelations.mockResolvedValue({
      ...baseSituation,
      status: SituationStatus.IN_PROGRESS,
      assignedUserId: 'user-1',
      assignedUser: { fullName: 'Juan Pérez' },
    });

    await expect(
      service.update('sit-1', { status: SituationStatus.CLOSED }, analystActor),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(timelineService.createEntry).not.toHaveBeenCalled();
  });

  it('el PATCH tampoco cierra aportando un motivo', async () => {
    // El motivo de transición no es un sustituto del aprendizaje: aportar texto
    // no reabre esta vía.
    const { service, situationsRepository, situationsRepository: repo } =
      createService();
    void repo;
    situationsRepository.findByIdWithRelations.mockResolvedValue({
      ...baseSituation,
      status: SituationStatus.IN_PROGRESS,
      assignedUserId: 'user-1',
      assignedUser: { fullName: 'Juan Pérez' },
    });

    await expect(
      service.update(
        'sit-1',
        {
          status: SituationStatus.CLOSED,
          statusComment: 'Caso documentado y cerrado.',
        },
        analystActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(situationsRepository.save).not.toHaveBeenCalled();
  });

  it('el PATCH conserva las transiciones que NO son el cierre', async () => {
    // Se bloqueó el DESTINO `CLOSED`, no el endpoint: el resto del ciclo sigue
    // funcionando por esta vía. Lo cubre la prueba OPEN → IN_PROGRESS de arriba;
    // aquí se comprueba que un cambio de campo sin estado tampoco se ve
    // afectado.
    const { service, situationsRepository } = createService();
    situationsRepository.findByIdWithRelations
      .mockResolvedValueOnce({ ...baseSituation, status: SituationStatus.OPEN })
      .mockResolvedValueOnce({
        ...baseSituation,
        status: SituationStatus.OPEN,
        title: 'Título corregido',
      });

    const result = await service.update(
      'sit-1',
      { title: 'Título corregido' },
      analystActor,
    );

    expect(result.title).toBe('Título corregido');
    expect(situationsRepository.save).toHaveBeenCalled();
  });

  it('rechaza saltos de estado y retrocesos', async () => {
    // El ejemplo histórico de este caso era OPEN -> CLOSED. Ese salto ahora se
    // detiene ANTES, al bloquearse el destino CLOSED en el PATCH, así que se
    // comprueban las dos verdades por separado: el salto a CLOSED da
    // ForbiddenException y cualquier otro salto sigue dando BadRequestException.
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
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.update(
        'sit-1',
        { status: SituationStatus.RESOLVED },
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

  it('una fila RESOLVED legada tampoco se cierra por el PATCH', async () => {
    // Verdad nueva: RESOLVED sigue siendo un valor legado y cerrable, pero solo
    // desde la operación de resolución, que exige aprendizaje y coordinador
    // responsable. El historial de cierre lo escribe ahora esa operación.
    const { service, situationsRepository, timelineService } = createService();
    situationsRepository.findByIdWithRelations.mockResolvedValue({
      ...baseSituation,
      status: SituationStatus.RESOLVED,
      assignedUserId: 'user-1',
      assignedUser: { fullName: 'Juan Pérez' },
      resolvedAt: new Date(),
    });

    await expect(
      service.update(
        'sit-1',
        {
          status: SituationStatus.CLOSED,
          statusComment: 'Validación final realizada.',
          evidenceIds: [],
        },
        analystActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(timelineService.createEntry).not.toHaveBeenCalled();
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
      canResolveSituation: jest.fn().mockReturnValue(false),
    };

    const service = new SituationsService(
      situationsRepository as never,
      coordinationsRepository as never,
      categoriesRepository as never,
      { findOne: jest.fn() } as never,
      relatedRepo as never,
      // Repositorio de resoluciones: inerte, este caso solo crea.
      {} as never,
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
