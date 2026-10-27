import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  SituationReportKind,
  SituationSeverity,
} from '../common/enums/situation.enums';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import type { CreateSituationDto } from './dto/situation.dto';
import { Situation } from './entities/situation.entity';
import { SituationsService } from './situations.service';
import {
  createManagerMock,
  emptyDetailRepositories,
  inertEscalationService,
  transactionalManager,
} from './testing/situations-service.test-kit-spec';

/**
 * CONTRATO ANTERIOR (transitorio): altas del frontend publicado antes de
 * cartas, que no envía `reportKind`. Se aceptan solo con las reglas que aquel
 * contrato tenía; nada se inventa (ver SituationsService.createLegacyContract).
 */
describe('SituationsService · alta con el contrato anterior', () => {
  const AREA_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const AREA_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const coordinatorA = {
    sub: 'coord-a-1',
    email: 'c@t.co',
    roleId: 'r',
    roleCode: 'COORDINADOR',
    coordinationId: AREA_A,
    permissions: ['SITUATIONS_CREATE', 'SITUATIONS_VIEW'],
    status: 'ACTIVE',
  };
  const analyst = {
    ...coordinatorA,
    sub: 'analyst-1',
    roleCode: 'ANALISTA',
    coordinationId: null,
  };

  /** Lo que envía el frontend publicado (b20ffd3): sin campos de cartas. */
  const legacyDto = (overrides: Record<string, unknown> = {}) =>
    ({
      title: 'Internet intermitente',
      description: 'Hay conexión pero el servicio se corta.',
      coordinationId: AREA_A,
      categoryId: 'cat-1',
      severity: SituationSeverity.HIGH,
      occurredAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      relatedCoordinationIds: [],
      ...overrides,
    }) as CreateSituationDto;

  function buildService() {
    const scopeService = new OperationalScopeService();
    const manager = createManagerMock();
    const situationsRepository = {
      manager: transactionalManager(manager),
      findByIdWithRelations: jest.fn((id: string) =>
        Promise.resolve({
          id,
          title: 't',
          description: 'd',
          reportKind: SituationReportKind.INTERNAL,
          coordinationId: AREA_A,
          coordination: { id: AREA_A, code: 'coord-a', name: 'A' },
          affectedCoordinationId: AREA_A,
          affectedCoordination: { id: AREA_A, code: 'coord-a', name: 'A' },
          affectedProcess: null,
          pendingDelivery: null,
          createdByUserId: coordinatorA.sub,
          createdByUser: { fullName: 'Coordinadora' },
          assignedUserId: null,
          assignedUser: null,
          categoryId: 'cat-1',
          category: { id: 'cat-1', code: 'INTERNET', name: 'Internet' },
          severity: SituationSeverity.HIGH,
          reportedSeverity: SituationSeverity.HIGH,
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
        }),
      ),
    };
    const coordinationsRepository = {
      findOne: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({
          id: where.id,
          code: where.id === AREA_A ? 'coord-a' : 'coord-b',
          name: where.id === AREA_A ? 'A' : 'B',
          isActive: true,
        }),
      ),
      find: jest.fn(() => Promise.resolve([])),
    };
    const categoriesRepository = {
      findOne: jest.fn(() =>
        Promise.resolve({
          id: 'cat-1',
          code: 'INTERNET',
          name: 'Internet',
          icon: 'internet',
          isSelectable: true,
        }),
      ),
    };
    const detail = emptyDetailRepositories();

    const service = new SituationsService(
      situationsRepository as never,
      coordinationsRepository as never,
      categoriesRepository as never,
      {} as never,
      { create: jest.fn((row: unknown) => row) } as never,
      {} as never,
      detail.severityChangesRepository as never,
      detail.consequencesRepository as never,
      { createEntry: jest.fn().mockResolvedValue({}) } as never,
      scopeService,
      { record: jest.fn().mockResolvedValue(null) } as never,
      inertEscalationService() as never,
    );

    const savedSituation = (): Partial<Situation> | undefined =>
      manager.save.mock.calls.find(([entity]) => entity === Situation)?.[1];

    return { service, manager, savedSituation };
  }

  it('coordinador con su coordinación: alta INTERNAL con la severidad enviada como reportada', async () => {
    const { service, savedSituation } = buildService();

    await service.create(legacyDto(), coordinatorA as never);

    expect(savedSituation()).toEqual(
      expect.objectContaining({
        reportKind: SituationReportKind.INTERNAL,
        coordinationId: AREA_A,
        affectedCoordinationId: AREA_A,
        categoryId: 'cat-1',
        severity: SituationSeverity.HIGH,
        reportedSeverity: SituationSeverity.HIGH,
      }),
    );
  });

  it('coordinador sin coordinationId: usa la de su sesión (regla de main)', async () => {
    const { service, savedSituation } = buildService();

    await service.create(
      legacyDto({ coordinationId: undefined }),
      coordinatorA as never,
    );

    expect(savedSituation()?.coordinationId).toBe(AREA_A);
  });

  it('coordinador que envía otra coordinación: se rechaza como antes', async () => {
    const { service, manager } = buildService();

    await expect(
      service.create(
        legacyDto({ coordinationId: AREA_B }),
        coordinatorA as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('analista (registraba sin coordinación): rechazo explícito, sin inventar coordinación', async () => {
    const { service, manager } = buildService();

    const error = await service
      .create(legacyDto({ coordinationId: undefined }), analyst as never)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'LEGACY_REGISTRATION_REQUIRES_COORDINATION',
    });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('analista que envía una coordinación sin reportKind: también se rechaza', async () => {
    const { service, manager } = buildService();

    await expect(
      service.create(legacyDto(), analyst as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it.each([
    ['affectedCoordinationId', { affectedCoordinationId: AREA_B }],
    ['affectedProcess', { affectedProcess: 'Certificación' }],
    ['pendingDelivery', { pendingDelivery: 'Guiones' }],
    ['initialConsequence', { initialConsequence: { description: 'x' } }],
  ])(
    'sin reportKind pero con %s no es el contrato anterior: se rechaza',
    async (_field, extra) => {
      const { service, manager } = buildService();

      await expect(
        service.create(legacyDto(extra), coordinatorA as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(manager.save).not.toHaveBeenCalled();
    },
  );

  it('sin reportKind y sin categoría no es el contrato anterior: se rechaza', async () => {
    const { service, manager } = buildService();

    await expect(
      service.create(
        legacyDto({ categoryId: undefined }),
        coordinatorA as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });
});
