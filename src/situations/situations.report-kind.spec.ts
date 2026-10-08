import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TimelineEventType } from '../common/enums/situation-timeline.enums';
import {
  SituationReportKind,
  SituationSeverity,
  SituationSeverityChangeSource,
} from '../common/enums/situation.enums';
import { AuditAction } from '../audit/audit-action.enum';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import { SituationConsequence } from './entities/situation-consequence.entity';
import { SituationSeverityChange } from './entities/situation-severity-change.entity';
import { Situation } from './entities/situation.entity';
import { SLA_WINDOWS_BY_SEVERITY } from './situation-sla.policy';
import { SituationsService } from './situations.service';
import {
  createManagerMock,
  emptyDetailRepositories,
  inertEscalationService,
  transactionalManager,
  type ManagerMockOptions,
} from './testing/situations-service.test-kit-spec';

/**
 * Alta INTERNAL e INTER sin base de datos, con la POLÍTICA REAL de alcance.
 * La transacción se simula: el callback corre con un `manager` falso que
 * registra lo escrito y puede fallar a mitad de camino.
 */
describe('SituationsService · alta por tipo de registro', () => {
  const AREA_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const AREA_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const analyst = {
    sub: 'analyst-1',
    email: 'a@t.co',
    roleId: 'r',
    roleCode: 'ANALISTA',
    coordinationId: null,
    permissions: ['SITUATIONS_CREATE', 'SITUATIONS_VIEW', 'SITUATIONS_UPDATE'],
    status: 'ACTIVE',
  };
  const coordinatorA = {
    ...analyst,
    sub: 'coord-a-1',
    roleCode: 'COORDINADOR',
    coordinationId: AREA_A,
  };

  const internalDto = (overrides: Record<string, unknown> = {}) => ({
    title: 'Internet intermitente',
    description: 'Hay conexión pero el servicio se corta.',
    reportKind: SituationReportKind.INTERNAL,
    coordinationId: AREA_A,
    categoryId: 'cat-1',
    severity: SituationSeverity.MEDIUM,
    occurredAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    ...overrides,
  });

  function buildService(
    options: {
      manager?: ManagerMockOptions;
      category?: Record<string, unknown>;
      reportKind?: SituationReportKind;
    } = {},
  ) {
    const scopeService = new OperationalScopeService();
    const manager = createManagerMock(options.manager);
    const reportKind = options.reportKind ?? SituationReportKind.INTERNAL;
    const situationsRepository = {
      manager: transactionalManager(manager),
      findByIdWithRelations: jest.fn(async (id: string) => ({
        id,
        title: 't',
        description: 'd',
        reportKind,
        coordinationId:
          reportKind === SituationReportKind.INTERNAL ? AREA_A : AREA_B,
        coordination: { id: AREA_B, code: 'coord-b', name: 'B' },
        affectedCoordinationId: AREA_A,
        affectedCoordination: { id: AREA_A, code: 'coord-a', name: 'A' },
        affectedProcess: null,
        pendingDelivery: null,
        createdByUserId: analyst.sub,
        createdByUser: { fullName: 'Analista' },
        assignedUserId: null,
        assignedUser: null,
        categoryId: null,
        category: null,
        severity: SituationSeverity.MEDIUM,
        reportedSeverity: SituationSeverity.MEDIUM,
        severityEscalationPolicyCode: null,
        status: 'OPEN',
        lastStatusComment: null,
        resolvedAt: null,
        closedAt: null,
        dueAt: null,
        slaPolicyCode: null,
        slaBreachedAt: null,
        occurredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        relatedCoordinations: [],
        resolution: null,
      })),
    };
    const coordinationsRepository = {
      findOne: jest.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        code: where.id === AREA_A ? 'coord-a' : 'coord-b',
        name: where.id === AREA_A ? 'A' : 'B',
        isActive: true,
      })),
      find: jest.fn(async () => []),
    };
    const categoriesRepository = {
      findOne: jest.fn(async () => ({
        id: 'cat-1',
        code: 'INTERNET',
        name: 'Internet',
        icon: 'internet',
        isSelectable: true,
        ...options.category,
      })),
    };
    const timelineService = { createEntry: jest.fn().mockResolvedValue({}) };
    const auditLogService = { record: jest.fn().mockResolvedValue(null) };
    const detail = emptyDetailRepositories();

    const service = new SituationsService(
      situationsRepository as never,
      coordinationsRepository as never,
      categoriesRepository as never,
      {} as never,
      { create: jest.fn((row) => row) } as never,
      {} as never,
      detail.severityChangesRepository as never,
      detail.consequencesRepository as never,
      timelineService as never,
      scopeService,
      auditLogService as never,
      inertEscalationService() as never,
    );

    return {
      service,
      manager,
      situationsRepository,
      timelineService,
      auditLogService,
    };
  }

  const savedSituation = (manager: ReturnType<typeof createManagerMock>) =>
    manager.save.mock.calls.find(([entity]) => entity === Situation)?.[1] as
      Record<string, unknown> | undefined;

  describe('INTER_COORDINATION', () => {
    it('rechaza INTER cuando responsable = afectada', async () => {
      const { service } = buildService();
      await expect(
        service.create(
          {
            title: 'Dep',
            description: 'Desc',
            reportKind: SituationReportKind.INTER_COORDINATION,
            coordinationId: AREA_A,
            affectedCoordinationId: AREA_A,
            severity: SituationSeverity.MEDIUM,
            occurredAt: new Date().toISOString(),
            affectedProcess: 'proceso',
            pendingDelivery: 'entrega',
          },
          analyst as never,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza INTER sin proceso afectado', async () => {
      const { service } = buildService();
      await expect(
        service.create(
          {
            title: 'Dep',
            description: 'Desc',
            reportKind: SituationReportKind.INTER_COORDINATION,
            coordinationId: AREA_B,
            affectedCoordinationId: AREA_A,
            severity: SituationSeverity.MEDIUM,
            occurredAt: new Date().toISOString(),
            pendingDelivery: 'entrega',
          },
          analyst as never,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza afectación inicial en INTER', async () => {
      const { service, manager } = buildService();
      await expect(
        service.create(
          {
            title: 'Dep',
            description: 'Desc',
            reportKind: SituationReportKind.INTER_COORDINATION,
            coordinationId: AREA_B,
            affectedCoordinationId: AREA_A,
            severity: SituationSeverity.MEDIUM,
            occurredAt: new Date().toISOString(),
            affectedProcess: 'Certificación',
            pendingDelivery: 'Guiones',
            initialConsequence: { description: 'algo' },
          },
          analyst as never,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('persiste INTER con responsable B y afectada A', async () => {
      const { service, manager } = buildService({
        reportKind: SituationReportKind.INTER_COORDINATION,
      });
      const result = await service.create(
        {
          title: 'Dep',
          description: 'Desc',
          reportKind: SituationReportKind.INTER_COORDINATION,
          coordinationId: AREA_B,
          affectedCoordinationId: AREA_A,
          severity: SituationSeverity.MEDIUM,
          occurredAt: new Date().toISOString(),
          affectedProcess: 'Certificación',
          pendingDelivery: 'Guiones',
        },
        analyst as never,
      );

      const saved = savedSituation(manager)!;
      expect(saved.reportKind).toBe(SituationReportKind.INTER_COORDINATION);
      expect(saved.coordinationId).toBe(AREA_B);
      expect(saved.affectedCoordinationId).toBe(AREA_A);
      expect(saved.categoryId).toBeNull();
      expect(result.reportKind).toBe(SituationReportKind.INTER_COORDINATION);
      expect(result.canResolve).toBe(false);
      expect(result.canAddConsequence).toBe(false);
    });
  });

  describe('INTERNAL', () => {
    it('sin reportKind no hay alta (ya no existe el default silencioso)', async () => {
      const { service, manager } = buildService();
      await expect(
        service.create(
          internalDto({ reportKind: undefined }) as never,
          analyst as never,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('sin coordinationId no hay alta, tampoco para el ANALISTA', async () => {
      const { service, manager } = buildService();
      await expect(
        service.create(
          internalDto({ coordinationId: undefined }) as never,
          analyst as never,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('un COORDINADOR no registra INTERNAL en otra coordinación (403)', async () => {
      const { service, manager } = buildService();
      await expect(
        service.create(
          internalDto({ coordinationId: AREA_B }) as never,
          coordinatorA as never,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('un COORDINADOR registra INTERNAL en su coordinación', async () => {
      const { service, manager } = buildService();
      await service.create(internalDto() as never, coordinatorA as never);
      expect(savedSituation(manager)?.coordinationId).toBe(AREA_A);
    });

    it('rechaza una categoría legacy en el alta', async () => {
      const { service, manager } = buildService({
        category: { isSelectable: false, code: 'PLATFORM_OUTAGE' },
      });
      await expect(
        service.create(internalDto() as never, analyst as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('nace con reported = efectiva, fila REPORTED, sin política y due_at desde el mismo created_at', async () => {
      const { service, manager, timelineService } = buildService();
      await service.create(
        internalDto({ severity: SituationSeverity.HIGH }) as never,
        analyst as never,
      );

      const saved = savedSituation(manager)!;
      expect(saved.severity).toBe(SituationSeverity.HIGH);
      expect(saved.reportedSeverity).toBe(SituationSeverity.HIGH);
      expect(saved.severityEscalationPolicyCode).toBeNull();
      expect(saved.affectedCoordinationId).toBe(AREA_A);

      const createdAt = saved.createdAt as Date;
      const dueAt = saved.dueAt as Date;
      expect(createdAt).toBeInstanceOf(Date);
      expect(dueAt.getTime() - createdAt.getTime()).toBe(
        SLA_WINDOWS_BY_SEVERITY[SituationSeverity.HIGH].dueMs,
      );

      expect(manager.insert).toHaveBeenCalledWith(
        SituationSeverityChange,
        expect.objectContaining({
          previousSeverity: null,
          newSeverity: SituationSeverity.HIGH,
          source: SituationSeverityChangeSource.REPORTED,
          effectiveAt: createdAt,
          actorUserId: analyst.sub,
        }),
      );

      // Sin afectación inicial: cero afectaciones y ningún CONSEQUENCE_ADDED.
      expect(
        manager.save.mock.calls.some(
          ([entity]) => entity === SituationConsequence,
        ),
      ).toBe(false);
      expect(timelineService.createEntry).not.toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: TimelineEventType.CONSEQUENCE_ADDED,
        }),
        expect.anything(),
      );
    });

    it('con afectación inicial la crea en la misma transacción, con la fecha del problema', async () => {
      const { service, manager, timelineService, auditLogService } =
        buildService();
      const occurredAt = new Date(
        Date.now() - 2 * 60 * 60 * 1000,
      ).toISOString();

      await service.create(
        internalDto({
          occurredAt,
          initialConsequence: {
            description: '  Se retrasó la entrega de dos contenidos.  ',
          },
        }) as never,
        analyst as never,
      );

      const consequence = manager.save.mock.calls.find(
        ([entity]) => entity === SituationConsequence,
      )?.[1] as Record<string, unknown>;
      expect(consequence.description).toBe(
        'Se retrasó la entrega de dos contenidos.',
      );
      expect((consequence.occurredAt as Date).toISOString()).toBe(occurredAt);
      expect(consequence.createdByUserId).toBe(analyst.sub);

      expect(timelineService.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: TimelineEventType.CONSEQUENCE_ADDED,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          metadata: expect.objectContaining({ occurredAt }),
        }),
        // El evento usa el MISMO manager: va dentro de la transacción.
        manager,
      );
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.SITUATION_CONSEQUENCE_ADDED,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          metadata: expect.objectContaining({
            descriptionLength: 'Se retrasó la entrega de dos contenidos.'
              .length,
          }),
        }),
      );
    });

    it('ATOMICIDAD: si falla la afectación inicial, el alta entera falla y no se audita', async () => {
      const failure = new Error('fallo al escribir la afectación');
      const { service, situationsRepository, auditLogService } = buildService({
        manager: {
          failSaveOf: { entity: SituationConsequence, error: failure },
        },
      });

      await expect(
        service.create(
          internalDto({
            initialConsequence: { description: 'Algo pasó' },
          }) as never,
          analyst as never,
        ),
      ).rejects.toBe(failure);

      // El error escapa de `transaction(cb)`: en PostgreSQL eso es ROLLBACK de
      // la situación, su SITUATION_CREATED y la fila REPORTED.
      expect(situationsRepository.manager.transaction).toHaveBeenCalledTimes(1);
      expect(situationsRepository.findByIdWithRelations).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
    });
  });
});
