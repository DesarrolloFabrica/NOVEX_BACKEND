import { BadRequestException } from '@nestjs/common';
import { SituationReportKind, SituationSeverity } from '../common/enums/situation.enums';
import { SituationsService } from './situations.service';
import { OperationalScopeService } from '../auth/services/operational-scope.service';

/**
 * Validaciones de create INTERNAL vs INTER sin base de datos.
 * Los repositorios solo se ejercen cuando la validación ya pasó.
 */
describe('SituationsService · reportKind', () => {
  const AREA_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const AREA_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const actor = {
    sub: 'analyst-1',
    email: 'a@t.co',
    roleId: 'r',
    roleCode: 'ANALISTA',
    coordinationId: null,
    permissions: ['SITUATIONS_CREATE', 'SITUATIONS_VIEW'],
    status: 'ACTIVE',
  };

  function buildService() {
    const scopeService = new OperationalScopeService();
    const situationsRepository = {
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => ({ ...row, id: 'sit-1' })),
      findByIdWithRelations: jest.fn(async () => ({
        id: 'sit-1',
        title: 't',
        description: 'd',
        reportKind: SituationReportKind.INTER_COORDINATION,
        coordinationId: AREA_B,
        coordination: { id: AREA_B, code: 'coord-b', name: 'B' },
        affectedCoordinationId: AREA_A,
        affectedCoordination: { id: AREA_A, code: 'coord-a', name: 'A' },
        affectedProcess: 'proceso',
        pendingDelivery: 'entrega',
        createdByUserId: actor.sub,
        createdByUser: { fullName: 'Analista' },
        assignedUserId: null,
        assignedUser: null,
        categoryId: null,
        category: null,
        severity: SituationSeverity.MEDIUM,
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
        code: 'ACAS',
        name: 'ACAS',
        icon: 'x',
      })),
    };
    const relatedRepo = { create: jest.fn((row) => row) };
    const auditLogService = { record: jest.fn() };

    const service = new SituationsService(
      situationsRepository as never,
      coordinationsRepository as never,
      categoriesRepository as never,
      {} as never,
      relatedRepo as never,
      {} as never,
      {} as never,
      scopeService,
      auditLogService as never,
    );

    return { service, situationsRepository };
  }

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
        actor as never,
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
        actor as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persiste INTER con responsable B y afectada A', async () => {
    const { service, situationsRepository } = buildService();
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
      actor as never,
    );

    expect(situationsRepository.save).toHaveBeenCalled();
    const saved = situationsRepository.save.mock.calls[0][0];
    expect(saved.reportKind).toBe(SituationReportKind.INTER_COORDINATION);
    expect(saved.coordinationId).toBe(AREA_B);
    expect(saved.affectedCoordinationId).toBe(AREA_A);
    expect(saved.categoryId).toBeNull();
    expect(result.reportKind).toBe(SituationReportKind.INTER_COORDINATION);
    expect(result.canResolve).toBe(false);
  });
});
