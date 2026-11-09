import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserStatus } from '../common/enums/identity.enums';
import { SituationStatus } from '../common/enums/situation.enums';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { Situation } from './entities/situation.entity';
import { SituationRelatedCoordination } from './entities/situation-related-coordination.entity';
import { SituationsService } from './situations.service';
import {
  createManagerMock,
  emptyDetailRepositories,
  inertEscalationService,
  transactionalManager,
} from './testing/situations-service.test-kit-spec';

describe('SituationsService PATCH (transacción, bloqueo y reglas de edición)', () => {
  const analystActor: AuthPayload = {
    sub: 'user-1',
    email: 'analyst@test.novex.invalid',
    roleId: 'role-analyst',
    roleCode: 'ANALISTA',
    coordinationId: null,
    permissions: ['SITUATIONS_VIEW', 'SITUATIONS_UPDATE'],
    status: UserStatus.ACTIVE,
  };

  /** Fila tal como la devuelve la lectura BLOQUEADA (sin relaciones eager). */
  const lockedRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'sit-1',
    title: 'Incidente',
    description: 'Desc',
    reportKind: 'INTERNAL',
    coordinationId: 'c1',
    affectedCoordinationId: 'c1',
    createdByUserId: 'user-1',
    assignedUserId: null,
    categoryId: 'cat',
    severity: 'HIGH',
    reportedSeverity: 'HIGH',
    status: SituationStatus.OPEN,
    lastStatusComment: null,
    resolvedAt: null,
    closedAt: null,
    dueAt: new Date('2026-07-31T10:00:00.000Z'),
    slaBreachedAt: null,
    occurredAt: new Date('2026-07-28T10:00:00.000Z'),
    createdAt: new Date('2026-07-28T10:00:00.000Z'),
    updatedAt: new Date('2026-07-28T10:00:00.000Z'),
    ...overrides,
  });

  /** Detalle completo que devuelve `getById` tras el commit. */
  const detail = (overrides: Record<string, unknown> = {}) => ({
    ...lockedRow(overrides),
    coordination: { code: 'coord', name: 'Coord' },
    affectedCoordination: { code: 'coord', name: 'Coord' },
    createdByUser: { fullName: 'Creador' },
    assignedUser: null,
    category: { code: 'TECH', name: 'Tech' },
    relatedCoordinations: [],
    ...overrides,
  });

  const createService = (row: Record<string, unknown> = lockedRow()) => {
    const manager = createManagerMock({ findOneResult: row });
    const situationsRepository = {
      findByIdWithRelations: jest.fn().mockResolvedValue(detail()),
      save: jest.fn(),
      manager: transactionalManager(manager),
    };
    const usersRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        fullName: 'Juan Pérez',
      }),
    };
    const timelineService = { createEntry: jest.fn().mockResolvedValue({}) };
    const scopeService = {
      assertPermission: jest.fn(),
      assertCanUpdateSituation: jest.fn(),
      assertCanAdvanceSituationToInProgress: jest.fn(),
      isCoordinationScoped: jest.fn().mockReturnValue(false),
      canResolveSituation: jest.fn().mockReturnValue(false),
      canUpdateSituation: jest.fn().mockReturnValue(true),
      canAdvanceSituationToInProgress: jest.fn().mockReturnValue(false),
      canAddConsequence: jest.fn().mockReturnValue(false),
      canAdministerSituation: jest.fn().mockReturnValue(false),
      assertSituationReadable: jest.fn(),
    };
    const auditLogService = {
      record: jest.fn().mockResolvedValue(null),
      recordCritical: jest.fn().mockResolvedValue({}),
    };
    const detailRepos = emptyDetailRepositories();

    const service = new SituationsService(
      situationsRepository as never,
      // Coordinación General: el avance la consulta (aquí no existe).
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      {} as never,
      usersRepository as never,
      {} as never,
      {} as never,
      detailRepos.severityChangesRepository as never,
      detailRepos.consequencesRepository as never,
      timelineService as never,
      scopeService as never,
      auditLogService as never,
      inertEscalationService() as never,
    );

    return {
      service,
      manager,
      situationsRepository,
      timelineService,
      scopeService,
      auditLogService,
    };
  };

  const errorOf = async (promise: Promise<unknown>) =>
    promise.then(
      () => {
        throw new Error('se esperaba un error');
      },
      (error: unknown) => error,
    );

  describe('F-01 · concurrencia', () => {
    it('lee la fila con pessimistic_write dentro de la transacción y guarda con el mismo manager', async () => {
      const { service, manager, situationsRepository } = createService();

      await service.update(
        'sit-1',
        { title: 'Título corregido' },
        analystActor,
      );

      expect(situationsRepository.manager.transaction).toHaveBeenCalledTimes(1);
      expect(manager.findOne).toHaveBeenCalledWith(Situation, {
        where: { id: 'sit-1' },
        loadEagerRelations: false,
        lock: { mode: 'pessimistic_write' },
      });
      expect(manager.save).toHaveBeenCalledWith(
        Situation,
        expect.objectContaining({ title: 'Título corregido' }),
      );
      // Nunca el `save` del repositorio, que escribía la entidad leída SIN
      // bloqueo y revertía columnas cambiadas por otra petición.
      expect(situationsRepository.save).not.toHaveBeenCalled();
    });

    it('si un cierre confirmó antes, el PATCH lo ve bajo bloqueo y no lo revierte', async () => {
      // La resolución ganó el bloqueo: al leer, la fila ya está CLOSED.
      const { service, manager } = createService(
        lockedRow({
          status: SituationStatus.CLOSED,
          closedAt: new Date('2026-07-29T10:00:00.000Z'),
        }),
      );

      const error = await errorOf(
        service.update(
          'sit-1',
          { status: SituationStatus.IN_PROGRESS },
          analystActor,
        ),
      );

      expect(error).toBeInstanceOf(ConflictException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('conserva las marcas SLA y de análisis de la fila bloqueada', async () => {
      const breachedAt = new Date('2026-07-31T10:00:00.000Z');
      const { service, manager } = createService(
        lockedRow({
          slaBreachedAt: breachedAt,
          analysisClaimToken: 'claim-vigente',
        }),
      );

      await service.update('sit-1', { title: 'Nuevo título' }, analystActor);

      expect(manager.save).toHaveBeenCalledWith(
        Situation,
        expect.objectContaining({
          slaBreachedAt: breachedAt,
          analysisClaimToken: 'claim-vigente',
          status: SituationStatus.OPEN,
        }),
      );
    });
  });

  describe('avance OPEN → IN_PROGRESS', () => {
    it('usa la política de avance, asigna a quien avanza y registra la línea de tiempo en la transacción', async () => {
      const { service, manager, timelineService, scopeService } =
        createService();

      await service.update(
        'sit-1',
        { status: SituationStatus.IN_PROGRESS },
        analystActor,
      );

      expect(
        scopeService.assertCanAdvanceSituationToInProgress,
      ).toHaveBeenCalled();
      expect(scopeService.assertCanUpdateSituation).not.toHaveBeenCalled();
      expect(manager.save).toHaveBeenCalledWith(
        Situation,
        expect.objectContaining({
          status: SituationStatus.IN_PROGRESS,
          assignedUserId: 'user-1',
        }),
      );
      expect(timelineService.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Estado actualizado',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          metadata: expect.objectContaining({
            previousValue: SituationStatus.OPEN,
            newValue: SituationStatus.IN_PROGRESS,
            assignedUserName: 'Juan Pérez',
          }),
        }),
        manager,
      );
    });

    it('rechaza el avance si la política lo deniega, sin escribir', async () => {
      const { service, manager, scopeService, timelineService } =
        createService();
      scopeService.assertCanAdvanceSituationToInProgress.mockImplementation(
        () => {
          throw new ForbiddenException('Solo puede pasar a «En atención»…');
        },
      );

      await expect(
        service.update(
          'sit-1',
          { status: SituationStatus.IN_PROGRESS },
          analystActor,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(manager.save).not.toHaveBeenCalled();
      expect(timelineService.createEntry).not.toHaveBeenCalled();
    });

    it('admite un comentario de transición junto al avance', async () => {
      const { service, manager } = createService();

      await service.update(
        'sit-1',
        { status: SituationStatus.IN_PROGRESS, statusComment: 'Lo tomo yo.' },
        analystActor,
      );

      expect(manager.save).toHaveBeenCalledWith(
        Situation,
        expect.objectContaining({ lastStatusComment: 'Lo tomo yo.' }),
      );
    });

    it.each([
      ['title', { title: 'Otro título' }],
      ['description', { description: 'Otra descripción' }],
      ['occurredAt', { occurredAt: '2026-07-27T10:00:00.000Z' }],
    ])(
      'O1 · avance + %s → 400 ADVANCE_WITH_FIELD_CHANGES, sin escribir ni auditar',
      async (_field, extra) => {
        const { service, manager, auditLogService } = createService();

        const error = await errorOf(
          service.update(
            'sit-1',
            { status: SituationStatus.IN_PROGRESS, ...extra },
            analystActor,
          ),
        );

        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toMatchObject({
          code: 'ADVANCE_WITH_FIELD_CHANGES',
        });
        expect(manager.save).not.toHaveBeenCalled();
        expect(auditLogService.recordCritical).not.toHaveBeenCalled();
      },
    );
  });

  describe('N1 / N2 · la coordinación responsable no se cambia por PATCH', () => {
    it.each([
      ['INTERNAL', { reportKind: 'INTERNAL', affectedCoordinationId: 'c1' }],
      [
        'INTER_COORDINATION',
        { reportKind: 'INTER_COORDINATION', affectedCoordinationId: 'c9' },
      ],
    ])(
      'un autor ANALISTA no reasigna un %s (403 COORDINATION_TRANSFER_NOT_ALLOWED)',
      async (_kind, overrides) => {
        const { service, manager } = createService(lockedRow(overrides));

        const error = await errorOf(
          service.update(
            'sit-1',
            // Destino coord-general (N1) o la propia afectada (N2).
            { coordinationId: 'c9' },
            analystActor,
          ),
        );

        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).getResponse()).toMatchObject({
          code: 'COORDINATION_TRANSFER_NOT_ALLOWED',
        });
        expect(manager.save).not.toHaveBeenCalled();
      },
    );

    it('tampoco combinada con el avance (variante O1 de N1)', async () => {
      const { service, manager } = createService();

      const error = await errorOf(
        service.update(
          'sit-1',
          { status: SituationStatus.IN_PROGRESS, coordinationId: 'c9' },
          analystActor,
        ),
      );

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(manager.save).not.toHaveBeenCalled();
    });
  });

  describe('O2 · CLOSED es inmutable para operaciones ordinarias', () => {
    const closed = () =>
      lockedRow({
        status: SituationStatus.CLOSED,
        closedAt: new Date('2026-07-29T10:00:00.000Z'),
      });

    it.each([
      ['título', { title: 'Retoque' }],
      ['descripción', { description: 'Retoque' }],
      ['fecha', { occurredAt: '2026-07-27T10:00:00.000Z' }],
      ['comentario', { statusComment: 'Nota tardía' }],
      ['estado', { status: SituationStatus.IN_PROGRESS }],
    ])('rechaza editar %s de un caso cerrado (409)', async (_label, dto) => {
      const { service, manager } = createService(closed());

      const error = await errorOf(service.update('sit-1', dto, analystActor));

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'SITUATION_CLOSED',
      });
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('decide el alcance ANTES que el estado: fuera de alcance responde 404, no 409', async () => {
      const { service, scopeService } = createService(closed());
      scopeService.assertCanUpdateSituation.mockImplementation(() => {
        throw new NotFoundException('Situación no encontrada.');
      });

      await expect(
        service.update('sit-1', { title: 'x' }, analystActor),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('cierre fuera del PATCH', () => {
    it.each([
      ['IN_PROGRESS', SituationStatus.IN_PROGRESS],
      ['RESOLVED (legado)', SituationStatus.RESOLVED],
    ])(
      'no cierra desde %s, ni aportando un motivo (403)',
      async (_label, status) => {
        const { service, manager } = createService(lockedRow({ status }));

        await expect(
          service.update(
            'sit-1',
            { status: SituationStatus.CLOSED, statusComment: 'Motivo' },
            analystActor,
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(manager.save).not.toHaveBeenCalled();
      },
    );

    it('rechaza saltos de estado distintos del cierre (400)', async () => {
      const { service } = createService();

      await expect(
        service.update(
          'sit-1',
          { status: SituationStatus.RESOLVED },
          analystActor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('edición ordinaria', () => {
    it('edita el título con la política de edición y lo audita en la transacción', async () => {
      const { service, scopeService, auditLogService } = createService();

      await service.update(
        'sit-1',
        { title: 'Título corregido' },
        analystActor,
      );

      expect(scopeService.assertCanUpdateSituation).toHaveBeenCalled();
      expect(auditLogService.recordCritical).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SITUATION_UPDATED',
          metadata: { changedFields: ['title'] },
        }),
        // Misma transacción que la acción (manager).
        expect.anything(),
      );
    });

    it('un caso inexistente responde 404 sin escribir', async () => {
      const { service, manager } = createService();
      manager.findOne.mockResolvedValueOnce(null);

      await expect(
        service.update('sit-1', { title: 'x' }, analystActor),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(manager.save).not.toHaveBeenCalled();
    });
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
    const manager = createManagerMock();
    const situationsRepository = {
      findByIdWithRelations: jest.fn(),
      manager: transactionalManager(manager),
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
        isSelectable: true,
      }),
    };
    const scopeService = {
      resolveInternalCreateCoordinationId: jest.fn(
        (_actor: AuthPayload, requested: string) => requested,
      ),
      canResolveSituation: jest.fn().mockReturnValue(false),
      canUpdateSituation: jest.fn().mockReturnValue(false),
      canAdvanceSituationToInProgress: jest.fn().mockReturnValue(false),
      assertCanAdvanceSituationToInProgress: jest.fn(),
      canAddConsequence: jest.fn().mockReturnValue(false),
      canAdministerSituation: jest.fn().mockReturnValue(false),
    };
    const detail = emptyDetailRepositories();

    const service = new SituationsService(
      situationsRepository as never,
      coordinationsRepository as never,
      categoriesRepository as never,
      { findOne: jest.fn() } as never,
      relatedRepo as never,
      // Repositorio de resoluciones: inerte, este caso solo crea.
      {} as never,
      detail.severityChangesRepository as never,
      detail.consequencesRepository as never,
      { createEntry: jest.fn() } as never,
      scopeService as never,
      {
        record: jest.fn().mockResolvedValue(null),
        recordCritical: jest.fn().mockResolvedValue({}),
      } as never,
      inertEscalationService() as never,
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
        reportKind: 'INTERNAL' as never,
        coordinationId: 'c1',
        categoryId: 'cat',
        severity: 'MEDIUM' as never,
        occurredAt: '2026-08-01T10:00:00.000Z',
        relatedCoordinationIds: ['c1', 'c2', 'c2'],
      },
      actor,
    );

    expect(coordinationsRepository.find).toHaveBeenCalled();
    expect(manager.create).toHaveBeenCalledWith(
      SituationRelatedCoordination,
      expect.objectContaining({ coordinationId: 'c2', displayOrder: 0 }),
    );
    expect(manager.create).toHaveBeenCalledWith(
      Situation,
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
