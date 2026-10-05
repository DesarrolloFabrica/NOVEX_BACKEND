import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import { SituationSeverity } from '../common/enums/situation.enums';
import { SituationStatus } from '../common/enums/situation.enums';
import { UserStatus } from '../common/enums/identity.enums';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { CoordinationsRepository } from '../coordinations/repositories/coordinations.repository';
import {
  ActiveSeverityRow,
  AffectedCoordinationRow,
  IncomingDependencyRow,
  OperationalOverviewRepository,
} from '../operational-overview/repositories/operational-overview.repository';
import { OperationalKpiScopeType } from './dto/operational-kpi-query.dto';
import {
  OperationalKpiHistoryGranularity,
  OperationalKpiHistoryMetric,
} from './dto/operational-kpi-history-query.dto';
import { OperationalKpiBreakdownDimension } from './dto/operational-kpi-breakdown-query.dto';
import { OperationalKpiBreakdownRepository } from './operational-kpi-breakdown.repository';
import { OperationalKpiHistoryRepository } from './operational-kpi-history.repository';
import { OperationalKpiService } from './operational-kpi.service';
import { KPI_UNCATEGORIZED_CATEGORY_ID } from './domain/kpi-uncategorized-category';
import { SituationReportKind } from '../common/enums/situation.enums';
import { IncidentCategory } from '../intelligence/entities/incident-category.entity';

const AREA_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AREA_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CAT_INTERNET = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function emptyBreakdownRepository(): {
  aggregateByCategory: jest.Mock;
} {
  return {
    aggregateByCategory: jest.fn().mockResolvedValue([]),
  };
}

function emptyCategoriesRepository(): {
  findOne: jest.Mock;
} {
  return {
    findOne: jest.fn().mockResolvedValue(null),
  };
}

function emptyRelationsRepository(): {
  aggregateCommitments: jest.Mock;
  aggregateDependencies: jest.Mock;
} {
  return {
    aggregateCommitments: jest.fn().mockResolvedValue([]),
    aggregateDependencies: jest.fn().mockResolvedValue([]),
  };
}

function emptyPeriodRepository() {
  return {
    aggregateComposition: jest.fn().mockResolvedValue({
      severity: { low: 0, medium: 0, high: 0, critical: 0 },
      attention: { open: 0, inProgress: 0 },
      registeredCount: 0,
    }),
  };
}

function buildService(
  coordinationsRepository: unknown,
  overviewRepository: unknown,
  historyRepository: unknown,
  breakdownRepository: unknown = emptyBreakdownRepository(),
  periodRepository: unknown = emptyPeriodRepository(),
  relationsRepository: unknown = emptyRelationsRepository(),
  categoriesRepository: unknown = emptyCategoriesRepository(),
): OperationalKpiService {
  return new OperationalKpiService(
    coordinationsRepository as CoordinationsRepository,
    overviewRepository as OperationalOverviewRepository,
    new OperationalScopeService(),
    historyRepository as OperationalKpiHistoryRepository,
    breakdownRepository as OperationalKpiBreakdownRepository,
    periodRepository as never,
    relationsRepository as never,
    categoriesRepository as never,
  );
}

const DIRECTOR: AuthPayload = {
  sub: 'director-1',
  email: 'director@cun.edu.co',
  roleId: 'role-director',
  roleCode: 'DIRECTOR',
  coordinationId: null,
  permissions: ['KPIS_VIEW'],
  status: UserStatus.ACTIVE,
};

function coordination(
  id: string,
  code: string,
  displayOrder: number,
): Coordination {
  return {
    id,
    code,
    name: code,
    shortName: code,
    color: '#000',
    displayOrder,
    isActive: true,
  } as unknown as Coordination;
}

function incoming(
  affectedCoordinationId: string,
  total: number,
  criticalTotal = 0,
): IncomingDependencyRow {
  return {
    affectedCoordinationId,
    total,
    criticalTotal,
    externalLowTotal: 0,
    externalMediumTotal: 0,
    externalHighTotal: 0,
    externalCriticalTotal: criticalTotal,
  };
}

describe('OperationalKpiService', () => {
  const catalog = [
    coordination(AREA_A, 'coord-ingenierias', 1),
    coordination(AREA_B, 'coord-b2b', 2),
  ];

  let coordinationsRepository: {
    findCatalog: jest.Mock;
    findActiveById: jest.Mock;
    findActiveByIds: jest.Mock;
  };
  let overviewRepository: {
    aggregateActiveSituationsBySeverity: jest.Mock;
    aggregateAffectedCoordinations: jest.Mock;
    aggregateIncomingDependencies: jest.Mock;
    aggregateActiveSituationsByStatus: jest.Mock;
    aggregateOutgoingDependencies: jest.Mock;
  };
  let historyRepository: {
    aggregateBacklog: jest.Mock;
    aggregateEventMetric: jest.Mock;
  };
  let service: OperationalKpiService;

  beforeEach(() => {
    coordinationsRepository = {
      findCatalog: jest.fn().mockResolvedValue(catalog),
      findActiveById: jest.fn().mockResolvedValue(catalog[0]),
      findActiveByIds: jest.fn().mockImplementation(async (ids: string[]) =>
        catalog.filter((item) => ids.includes(item.id)),
      ),
    };
    overviewRepository = {
      aggregateActiveSituationsBySeverity: jest.fn().mockResolvedValue([]),
      aggregateAffectedCoordinations: jest.fn().mockResolvedValue([]),
      aggregateIncomingDependencies: jest.fn().mockResolvedValue([]),
      aggregateActiveSituationsByStatus: jest.fn().mockResolvedValue([]),
      aggregateOutgoingDependencies: jest.fn().mockResolvedValue([]),
    };
    historyRepository = {
      aggregateBacklog: jest.fn().mockResolvedValue(new Map()),
      aggregateEventMetric: jest.fn().mockResolvedValue(new Map()),
    };
    service = buildService(
      coordinationsRepository,
      overviewRepository,
      historyRepository,
    );
  });

  it('rechaza actores sin KPIS_VIEW', async () => {
    const analyst = { ...DIRECTOR, permissions: ['SITUATIONS_VIEW'] };
    await expect(
      service.getSnapshot(
        { scope: OperationalKpiScopeType.DIRECTION },
        analyst,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('direction + coordinationId es 400', () => {
    expect(() =>
      service.resolveScope({
        scope: OperationalKpiScopeType.DIRECTION,
        coordinationId: AREA_A,
      }),
    ).toThrow(BadRequestException);
  });

  it('coordination sin coordinationId es 400', () => {
    expect(() =>
      service.resolveScope({
        scope: OperationalKpiScopeType.COORDINATION,
      }),
    ).toThrow(BadRequestException);
  });

  it('coordination: 2 OPEN, 3 IN_PROGRESS y desglose de severidad', async () => {
    const severityRows: ActiveSeverityRow[] = [
      { coordinationId: AREA_A, severity: SituationSeverity.CRITICAL, total: 1 },
      { coordinationId: AREA_A, severity: SituationSeverity.HIGH, total: 2 },
      { coordinationId: AREA_A, severity: SituationSeverity.MEDIUM, total: 1 },
      { coordinationId: AREA_A, severity: SituationSeverity.LOW, total: 1 },
    ];
    overviewRepository.aggregateActiveSituationsBySeverity.mockResolvedValue(
      severityRows,
    );
    overviewRepository.aggregateActiveSituationsByStatus.mockResolvedValue([
      { coordinationId: AREA_A, status: SituationStatus.OPEN, total: 2 },
      {
        coordinationId: AREA_A,
        status: SituationStatus.IN_PROGRESS,
        total: 3,
      },
    ]);

    const result = await service.getSnapshot(
      {
        scope: OperationalKpiScopeType.COORDINATION,
        coordinationId: AREA_A,
      },
      DIRECTOR,
    );

    expect(result.scope.type).toBe('coordination');
    expect(result.coordination?.problems.activeCount).toBe(5);
    expect(result.coordination?.problems.status).toEqual({
      open: 2,
      inProgress: 3,
    });
    expect(result.coordination?.problems.severity).toEqual({
      critical: 1,
      high: 2,
      medium: 1,
      low: 1,
    });
    expect(result.metricVersions.integrity).toBe('integrity-mvp-v1');
    expect(result.metricVersions.lifePoints).toBe('life-points-v1');
    expect(result.direction).toBeUndefined();
  });

  it('INTER incoming usa affected_coordination_id, no la responsable', async () => {
    overviewRepository.aggregateIncomingDependencies.mockResolvedValue([
      incoming(AREA_B, 4, 1),
    ]);
    overviewRepository.aggregateOutgoingDependencies.mockResolvedValue([
      { coordinationId: AREA_A, total: 4 },
    ]);
    coordinationsRepository.findActiveById.mockResolvedValue(catalog[1]);

    const affected = await service.getSnapshot(
      {
        scope: OperationalKpiScopeType.COORDINATION,
        coordinationId: AREA_B,
      },
      DIRECTOR,
    );
    expect(affected.coordination?.dependencies.incoming).toBe(4);
    expect(affected.coordination?.dependencies.outgoing).toBe(0);

    coordinationsRepository.findActiveById.mockResolvedValue(catalog[0]);
    const responsible = await service.getSnapshot(
      {
        scope: OperationalKpiScopeType.COORDINATION,
        coordinationId: AREA_A,
      },
      DIRECTOR,
    );
    expect(responsible.coordination?.dependencies.incoming).toBe(0);
    expect(responsible.coordination?.dependencies.outgoing).toBe(4);
  });

  it('direction agrega problemas del catálogo y no suma el registro como coordinación', async () => {
    const severityRows: ActiveSeverityRow[] = [
      { coordinationId: AREA_A, severity: SituationSeverity.HIGH, total: 2 },
      { coordinationId: AREA_B, severity: SituationSeverity.LOW, total: 1 },
      { coordinationId: null, severity: SituationSeverity.CRITICAL, total: 3 },
    ];
    const affectedRows: AffectedCoordinationRow[] = [];
    overviewRepository.aggregateActiveSituationsBySeverity.mockResolvedValue(
      severityRows,
    );
    overviewRepository.aggregateAffectedCoordinations.mockResolvedValue(
      affectedRows,
    );
    overviewRepository.aggregateActiveSituationsByStatus.mockResolvedValue([
      { coordinationId: AREA_A, status: SituationStatus.OPEN, total: 2 },
      { coordinationId: AREA_B, status: SituationStatus.IN_PROGRESS, total: 1 },
      { coordinationId: null, status: SituationStatus.OPEN, total: 3 },
    ]);

    const result = await service.getSnapshot(
      { scope: OperationalKpiScopeType.DIRECTION },
      DIRECTOR,
    );

    expect(result.universe.coordinationCount).toBe(2);
    expect(result.direction?.problems.activeCount).toBe(3);
    expect(result.direction?.problems.severity).toEqual({
      critical: 0,
      high: 2,
      medium: 0,
      low: 1,
    });
    expect(result.direction?.problems.status).toEqual({
      open: 2,
      inProgress: 1,
    });
    expect(result.direction?.analystRegistry.problems.activeCount).toBe(3);
    expect(result.direction?.analystRegistry.problems.severity.critical).toBe(
      3,
    );
    expect(result.direction?.coordinationStatusTotals.unknown).toBe(0);
    expect(result.coordination).toBeUndefined();
    expect(result.direction?.coordinations).toHaveLength(2);
    expect(
      result.direction?.coordinations.map((row) => row.coordination.id),
    ).toEqual([AREA_A, AREA_B]);
  });

  it('coordination inexistente o inactiva es 404', async () => {
    coordinationsRepository.findActiveById.mockResolvedValue(null);
    await expect(
      service.getSnapshot(
        {
          scope: OperationalKpiScopeType.COORDINATION,
          coordinationId: AREA_A,
        },
        DIRECTOR,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('OperationalKpiService.compare', () => {
  const AREA_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const catalog = [
    coordination(AREA_A, 'coord-ingenierias', 1),
    coordination(AREA_B, 'coord-especializaciones', 2),
    coordination(AREA_C, 'coord-saber-pro', 3),
  ];

  let coordinationsRepository: {
    findCatalog: jest.Mock;
    findActiveById: jest.Mock;
    findActiveByIds: jest.Mock;
  };
  let overviewRepository: {
    aggregateActiveSituationsBySeverity: jest.Mock;
    aggregateAffectedCoordinations: jest.Mock;
    aggregateIncomingDependencies: jest.Mock;
    aggregateActiveSituationsByStatus: jest.Mock;
    aggregateOutgoingDependencies: jest.Mock;
  };
  let historyRepository: {
    aggregateBacklog: jest.Mock;
    aggregateEventMetric: jest.Mock;
  };
  let service: OperationalKpiService;

  beforeEach(() => {
    coordinationsRepository = {
      findCatalog: jest.fn().mockResolvedValue(catalog),
      findActiveById: jest.fn(),
      findActiveByIds: jest.fn().mockImplementation(async (ids: string[]) =>
        catalog.filter((item) => ids.includes(item.id)),
      ),
    };
    overviewRepository = {
      aggregateActiveSituationsBySeverity: jest.fn().mockResolvedValue([]),
      aggregateAffectedCoordinations: jest.fn().mockResolvedValue([]),
      aggregateIncomingDependencies: jest.fn().mockResolvedValue([]),
      aggregateActiveSituationsByStatus: jest.fn().mockResolvedValue([]),
      aggregateOutgoingDependencies: jest.fn().mockResolvedValue([]),
    };
    historyRepository = {
      aggregateBacklog: jest.fn().mockResolvedValue(new Map()),
      aggregateEventMetric: jest.fn().mockResolvedValue(new Map()),
    };
    service = buildService(
      coordinationsRepository,
      overviewRepository,
      historyRepository,
    );
  });

  it('A + B preserva orden, identidad y conteos', async () => {
    overviewRepository.aggregateActiveSituationsBySeverity.mockResolvedValue([
      { coordinationId: AREA_A, severity: SituationSeverity.CRITICAL, total: 1 },
      { coordinationId: AREA_A, severity: SituationSeverity.HIGH, total: 2 },
      { coordinationId: AREA_B, severity: SituationSeverity.LOW, total: 3 },
    ]);
    overviewRepository.aggregateActiveSituationsByStatus.mockResolvedValue([
      { coordinationId: AREA_A, status: SituationStatus.OPEN, total: 2 },
      {
        coordinationId: AREA_A,
        status: SituationStatus.IN_PROGRESS,
        total: 1,
      },
      { coordinationId: AREA_B, status: SituationStatus.OPEN, total: 3 },
    ]);

    const result = await service.compare(
      { coordinationIds: [AREA_B, AREA_A] },
      DIRECTOR,
    );

    expect(result.items.map((item) => item.coordination.id)).toEqual([
      AREA_B,
      AREA_A,
    ]);
    expect(result.items[0].problems).toEqual({
      activeCount: 3,
      status: { open: 3, inProgress: 0 },
      severity: { critical: 0, high: 0, medium: 0, low: 3 },
    });
    expect(result.items[1].problems.activeCount).toBe(3);
    expect(result.items[1].problems.status).toEqual({
      open: 2,
      inProgress: 1,
    });
    expect(result.items[1].problems.severity).toEqual({
      critical: 1,
      high: 2,
      medium: 0,
      low: 0,
    });
    expect(result.items[0].integrityStatus).toBeDefined();
    expect(result.items[0].lifePoints).not.toBeUndefined();
  });

  it('A + B + C replica el orden pedido', async () => {
    const result = await service.compare(
      { coordinationIds: [AREA_C, AREA_A, AREA_B] },
      DIRECTOR,
    );
    expect(result.items.map((item) => item.coordination.code)).toEqual([
      'coord-saber-pro',
      'coord-ingenierias',
      'coord-especializaciones',
    ]);
  });

  it('INTER: outgoing en responsable B, incoming en afectada A', async () => {
    overviewRepository.aggregateIncomingDependencies.mockResolvedValue([
      incoming(AREA_A, 1, 0),
    ]);
    overviewRepository.aggregateOutgoingDependencies.mockResolvedValue([
      { coordinationId: AREA_B, total: 1 },
    ]);

    const result = await service.compare(
      { coordinationIds: [AREA_A, AREA_B] },
      DIRECTOR,
    );

    expect(result.items[0].dependencies).toEqual({ incoming: 1, outgoing: 0 });
    expect(result.items[1].dependencies).toEqual({ incoming: 0, outgoing: 1 });
  });

  it('INTERNAL no incrementa incoming ni outgoing', async () => {
    overviewRepository.aggregateActiveSituationsBySeverity.mockResolvedValue([
      { coordinationId: AREA_A, severity: SituationSeverity.MEDIUM, total: 2 },
    ]);

    const result = await service.compare(
      { coordinationIds: [AREA_A, AREA_B] },
      DIRECTOR,
    );

    expect(result.items[0].problems.activeCount).toBe(2);
    expect(result.items[0].dependencies).toEqual({ incoming: 0, outgoing: 0 });
    expect(result.items[1].dependencies).toEqual({ incoming: 0, outgoing: 0 });
  });

  it('id inexistente o inactivo es 404', async () => {
    coordinationsRepository.findActiveByIds.mockResolvedValue([catalog[0]]);
    await expect(
      service.compare({ coordinationIds: [AREA_A, AREA_B] }, DIRECTOR),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sin KPIS_VIEW es 403', async () => {
    await expect(
      service.compare(
        { coordinationIds: [AREA_A, AREA_B] },
        { ...DIRECTOR, permissions: ['REPORTS_VIEW'] },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('el número de agregaciones no crece con N coordinaciones', async () => {
    await service.compare({ coordinationIds: [AREA_A, AREA_B] }, DIRECTOR);
    await service.compare(
      { coordinationIds: [AREA_A, AREA_B, AREA_C] },
      DIRECTOR,
    );

    expect(
      overviewRepository.aggregateActiveSituationsBySeverity,
    ).toHaveBeenCalledTimes(2);
    expect(
      overviewRepository.aggregateOutgoingDependencies,
    ).toHaveBeenCalledTimes(2);
    expect(coordinationsRepository.findActiveByIds).toHaveBeenCalledTimes(2);
  });
});

describe('OperationalKpiService.getHistory', () => {
  const catalog = [
    coordination(AREA_A, 'coord-ingenierias', 1),
    coordination(AREA_B, 'coord-b2b', 2),
  ];

  let coordinationsRepository: {
    findCatalog: jest.Mock;
    findActiveById: jest.Mock;
    findActiveByIds: jest.Mock;
  };
  let overviewRepository: {
    aggregateActiveSituationsBySeverity: jest.Mock;
    aggregateAffectedCoordinations: jest.Mock;
    aggregateIncomingDependencies: jest.Mock;
    aggregateActiveSituationsByStatus: jest.Mock;
    aggregateOutgoingDependencies: jest.Mock;
  };
  let historyRepository: {
    aggregateBacklog: jest.Mock;
    aggregateEventMetric: jest.Mock;
  };
  let categoriesRepository: { findOne: jest.Mock };
  let service: OperationalKpiService;

  beforeEach(() => {
    coordinationsRepository = {
      findCatalog: jest.fn().mockResolvedValue(catalog),
      findActiveById: jest.fn().mockResolvedValue(catalog[0]),
      findActiveByIds: jest.fn(),
    };
    overviewRepository = {
      aggregateActiveSituationsBySeverity: jest.fn(),
      aggregateAffectedCoordinations: jest.fn(),
      aggregateIncomingDependencies: jest.fn(),
      aggregateActiveSituationsByStatus: jest.fn(),
      aggregateOutgoingDependencies: jest.fn(),
    };
    historyRepository = {
      aggregateBacklog: jest.fn().mockResolvedValue(
        new Map([
          ['2026-01-18', 3],
          ['2026-01-25', 5],
        ]),
      ),
      aggregateEventMetric: jest.fn().mockResolvedValue(
        new Map([
          ['2026-01-18', 2],
          ['2026-01-25', 4],
        ]),
      ),
    };
    categoriesRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: CAT_INTERNET,
        code: 'internet',
        name: 'Internet',
        isSelectable: true,
      } as IncidentCategory),
    };
    service = buildService(
      coordinationsRepository,
      overviewRepository,
      historyRepository,
      emptyBreakdownRepository(),
      emptyPeriodRepository(),
      emptyRelationsRepository(),
      categoriesRepository,
    );
  });

  it('backlog semanal preserva buckets y valores', async () => {
    const result = await service.getHistory(
      {
        scope: OperationalKpiScopeType.COORDINATION,
        coordinationId: AREA_A,
        metric: OperationalKpiHistoryMetric.BACKLOG,
        granularity: OperationalKpiHistoryGranularity.WEEK,
        from: '2026-01-12',
        to: '2026-01-19',
      },
      DIRECTOR,
    );

    expect(result.timezone).toBe('America/Bogota');
    expect(result.metric).toBe('backlog');
    expect(result.granularity).toBe('week');
    expect(result.series).toHaveLength(2);
    expect(result.series[0]).toMatchObject({
      start: '2026-01-12',
      end: '2026-01-18',
      value: 3,
    });
    expect(result.series[1]).toMatchObject({
      start: '2026-01-19',
      end: '2026-01-25',
      value: 5,
    });
    expect(historyRepository.aggregateBacklog).toHaveBeenCalledTimes(1);
  });

  it('created usa aggregateEventMetric', async () => {
    await service.getHistory(
      {
        scope: OperationalKpiScopeType.COORDINATION,
        coordinationId: AREA_A,
        metric: OperationalKpiHistoryMetric.CREATED,
        granularity: OperationalKpiHistoryGranularity.MONTH,
        from: '2026-01-01',
        to: '2026-02-28',
      },
      DIRECTOR,
    );
    expect(historyRepository.aggregateEventMetric).toHaveBeenCalledWith(
      AREA_A,
      OperationalKpiHistoryMetric.CREATED,
      expect.any(Array),
      {},
    );
  });

  it('cycle genera H1/H2', async () => {
    historyRepository.aggregateEventMetric.mockResolvedValue(new Map());
    const result = await service.getHistory(
      {
        scope: OperationalKpiScopeType.COORDINATION,
        coordinationId: AREA_A,
        metric: OperationalKpiHistoryMetric.CLOSED,
        granularity: OperationalKpiHistoryGranularity.CYCLE,
        from: '2026-01-01',
        to: '2026-12-31',
      },
      DIRECTOR,
    );
    expect(result.series).toHaveLength(2);
    expect(result.series[0].label).toContain('Ciclo 1');
    expect(result.series[1].label).toContain('Ciclo 2');
  });

  it('from > to es 400', async () => {
    await expect(
      service.getHistory(
        {
          scope: OperationalKpiScopeType.COORDINATION,
          coordinationId: AREA_A,
          metric: OperationalKpiHistoryMetric.BACKLOG,
          granularity: OperationalKpiHistoryGranularity.WEEK,
          from: '2026-02-01',
          to: '2026-01-01',
        },
        DIRECTOR,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('direction scope es 400 en esta fase', async () => {
    await expect(
      service.getHistory(
        {
          scope: OperationalKpiScopeType.DIRECTION,
          metric: OperationalKpiHistoryMetric.BACKLOG,
          granularity: OperationalKpiHistoryGranularity.WEEK,
          from: '2026-01-01',
          to: '2026-01-31',
        } as never,
        DIRECTOR,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('coordinación inexistente es 404', async () => {
    coordinationsRepository.findActiveById.mockResolvedValue(null);
    await expect(
      service.getHistory(
        {
          scope: OperationalKpiScopeType.COORDINATION,
          coordinationId: AREA_A,
          metric: OperationalKpiHistoryMetric.BACKLOG,
          granularity: OperationalKpiHistoryGranularity.WEEK,
          from: '2026-01-01',
          to: '2026-01-31',
        },
        DIRECTOR,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sin KPIS_VIEW es 403', async () => {
    await expect(
      service.getHistory(
        {
          scope: OperationalKpiScopeType.COORDINATION,
          coordinationId: AREA_A,
          metric: OperationalKpiHistoryMetric.BACKLOG,
          granularity: OperationalKpiHistoryGranularity.WEEK,
          from: '2026-01-01',
          to: '2026-01-31',
        },
        { ...DIRECTOR, permissions: [] },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('categoryId filtra INTERNAL y la categoría', async () => {
    await service.getHistory(
      {
        scope: OperationalKpiScopeType.COORDINATION,
        coordinationId: AREA_A,
        metric: OperationalKpiHistoryMetric.CREATED,
        granularity: OperationalKpiHistoryGranularity.WEEK,
        from: '2026-01-12',
        to: '2026-01-19',
        categoryId: CAT_INTERNET,
      },
      DIRECTOR,
    );
    expect(historyRepository.aggregateEventMetric).toHaveBeenCalledWith(
      AREA_A,
      OperationalKpiHistoryMetric.CREATED,
      expect.any(Array),
      {
        reportKind: SituationReportKind.INTERNAL,
        categoryId: CAT_INTERNET,
      },
    );
  });

  it('categoryId Sin categoría usa NULL', async () => {
    await service.getHistory(
      {
        scope: OperationalKpiScopeType.COORDINATION,
        coordinationId: AREA_A,
        metric: OperationalKpiHistoryMetric.CLOSED,
        granularity: OperationalKpiHistoryGranularity.WEEK,
        from: '2026-01-12',
        to: '2026-01-19',
        categoryId: KPI_UNCATEGORIZED_CATEGORY_ID,
      },
      DIRECTOR,
    );
    expect(historyRepository.aggregateEventMetric).toHaveBeenCalledWith(
      AREA_A,
      OperationalKpiHistoryMetric.CLOSED,
      expect.any(Array),
      {
        reportKind: SituationReportKind.INTERNAL,
        categoryId: null,
      },
    );
  });

  it('categoryId inexistente es 404', async () => {
    categoriesRepository.findOne.mockResolvedValue(null);
    await expect(
      service.getHistory(
        {
          scope: OperationalKpiScopeType.COORDINATION,
          coordinationId: AREA_A,
          metric: OperationalKpiHistoryMetric.CREATED,
          granularity: OperationalKpiHistoryGranularity.WEEK,
          from: '2026-01-12',
          to: '2026-01-19',
          categoryId: CAT_INTERNET,
        },
        DIRECTOR,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('OperationalKpiService.getBreakdown', () => {
  const catalog = [
    coordination(AREA_A, 'coord-ingenierias', 1),
    coordination(AREA_B, 'coord-b2b', 2),
  ];

  let coordinationsRepository: {
    findCatalog: jest.Mock;
    findActiveById: jest.Mock;
    findActiveByIds: jest.Mock;
  };
  let breakdownRepository: { aggregateByCategory: jest.Mock };
  let service: OperationalKpiService;

  beforeEach(() => {
    coordinationsRepository = {
      findCatalog: jest.fn().mockResolvedValue(catalog),
      findActiveById: jest.fn().mockResolvedValue(catalog[0]),
      findActiveByIds: jest.fn(),
    };
    breakdownRepository = {
      aggregateByCategory: jest.fn().mockResolvedValue([
        {
          categoryId: CAT_INTERNET,
          code: 'internet',
          name: 'Internet',
          selectable: true,
          value: 12,
        },
        {
          categoryId: KPI_UNCATEGORIZED_CATEGORY_ID,
          code: 'UNCATEGORIZED',
          name: 'Sin categoría',
          selectable: false,
          value: 2,
        },
        {
          categoryId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          code: 'legacy-apps',
          name: 'Apps legacy',
          selectable: false,
          value: 1,
        },
      ]),
    };
    service = buildService(
      coordinationsRepository,
      {
        aggregateActiveSituationsBySeverity: jest.fn(),
        aggregateAffectedCoordinations: jest.fn(),
        aggregateIncomingDependencies: jest.fn(),
        aggregateActiveSituationsByStatus: jest.fn(),
        aggregateOutgoingDependencies: jest.fn(),
      },
      {
        aggregateBacklog: jest.fn().mockResolvedValue(new Map()),
        aggregateEventMetric: jest.fn().mockResolvedValue(new Map()),
      },
      breakdownRepository,
    );
  });

  it('devuelve items INTERNAL por categoría con null y legacy', async () => {
    const result = await service.getBreakdown(
      {
        scope: OperationalKpiScopeType.COORDINATION,
        coordinationId: AREA_A,
        dimension: OperationalKpiBreakdownDimension.CATEGORY,
        metric: OperationalKpiHistoryMetric.CREATED,
        from: '2026-01-01',
        to: '2026-01-31',
      },
      DIRECTOR,
    );

    expect(result.dimension).toBe('category');
    expect(result.timezone).toBe('America/Bogota');
    expect(result.items).toHaveLength(3);
    expect(result.items[0].category.name).toBe('Internet');
    expect(result.items[0].value).toBe(12);
    expect(result.items[1].category.id).toBe(KPI_UNCATEGORIZED_CATEGORY_ID);
    expect(result.items[2].category.selectable).toBe(false);
    expect(breakdownRepository.aggregateByCategory).toHaveBeenCalledWith(
      AREA_A,
      OperationalKpiHistoryMetric.CREATED,
      '2026-01-01',
      '2026-01-31',
    );
  });

  it('backlog usa to como instante de snapshot', async () => {
    await service.getBreakdown(
      {
        scope: OperationalKpiScopeType.COORDINATION,
        coordinationId: AREA_A,
        dimension: OperationalKpiBreakdownDimension.CATEGORY,
        metric: OperationalKpiHistoryMetric.BACKLOG,
        from: '2026-01-01',
        to: '2026-01-31',
      },
      DIRECTOR,
    );
    expect(breakdownRepository.aggregateByCategory).toHaveBeenCalledWith(
      AREA_A,
      OperationalKpiHistoryMetric.BACKLOG,
      '2026-01-01',
      '2026-01-31',
    );
  });

  it('from > to es 400', async () => {
    await expect(
      service.getBreakdown(
        {
          scope: OperationalKpiScopeType.COORDINATION,
          coordinationId: AREA_A,
          dimension: OperationalKpiBreakdownDimension.CATEGORY,
          metric: OperationalKpiHistoryMetric.CREATED,
          from: '2026-02-01',
          to: '2026-01-01',
        },
        DIRECTOR,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('coordinación inexistente es 404', async () => {
    coordinationsRepository.findActiveById.mockResolvedValue(null);
    await expect(
      service.getBreakdown(
        {
          scope: OperationalKpiScopeType.COORDINATION,
          coordinationId: AREA_A,
          dimension: OperationalKpiBreakdownDimension.CATEGORY,
          metric: OperationalKpiHistoryMetric.CLOSED,
          from: '2026-01-01',
          to: '2026-01-31',
        },
        DIRECTOR,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sin KPIS_VIEW es 403', async () => {
    await expect(
      service.getBreakdown(
        {
          scope: OperationalKpiScopeType.COORDINATION,
          coordinationId: AREA_A,
          dimension: OperationalKpiBreakdownDimension.CATEGORY,
          metric: OperationalKpiHistoryMetric.CREATED,
          from: '2026-01-01',
          to: '2026-01-31',
        },
        { ...DIRECTOR, permissions: [] },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('OperationalKpiService.getRelations', () => {
  const catalog = [
    coordination(AREA_A, 'coord-ingenierias', 1),
    coordination(AREA_B, 'coord-b2b', 2),
  ];
  let coordinationsRepository: {
    findCatalog: jest.Mock;
    findActiveById: jest.Mock;
    findActiveByIds: jest.Mock;
  };
  let relationsRepository: {
    aggregateCommitments: jest.Mock;
    aggregateDependencies: jest.Mock;
  };
  let service: OperationalKpiService;

  beforeEach(() => {
    coordinationsRepository = {
      findCatalog: jest.fn().mockResolvedValue(catalog),
      findActiveById: jest.fn().mockResolvedValue(catalog[0]),
      findActiveByIds: jest.fn(),
    };
    relationsRepository = {
      aggregateCommitments: jest.fn().mockResolvedValue([
        {
          coordinationId: AREA_B,
          code: 'coord-b2b',
          name: 'B2B',
          shortName: 'B2B',
          value: 5,
        },
      ]),
      aggregateDependencies: jest.fn().mockResolvedValue([]),
    };
    service = buildService(
      coordinationsRepository,
      {
        aggregateActiveSituationsBySeverity: jest.fn(),
        aggregateAffectedCoordinations: jest.fn(),
        aggregateIncomingDependencies: jest.fn(),
        aggregateActiveSituationsByStatus: jest.fn(),
        aggregateOutgoingDependencies: jest.fn(),
      },
      {
        aggregateBacklog: jest.fn().mockResolvedValue(new Map()),
        aggregateEventMetric: jest.fn().mockResolvedValue(new Map()),
      },
      emptyBreakdownRepository(),
      emptyPeriodRepository(),
      relationsRepository,
    );
  });

  it('devuelve compromisos y dependencias INTER', async () => {
    const result = await service.getRelations(
      {
        scope: OperationalKpiScopeType.COORDINATION,
        coordinationId: AREA_A,
        metric: OperationalKpiHistoryMetric.CREATED,
        from: '2026-01-01',
        to: '2026-01-31',
      },
      DIRECTOR,
    );
    expect(result.commitments).toHaveLength(1);
    expect(result.commitments[0].coordination.shortName).toBe('B2B');
    expect(result.dependencies).toHaveLength(0);
    expect(relationsRepository.aggregateCommitments).toHaveBeenCalled();
    expect(relationsRepository.aggregateDependencies).toHaveBeenCalled();
  });
});

describe('OperationalKpiService.getPeriod', () => {
  let service: OperationalKpiService;
  let periodRepository: ReturnType<typeof emptyPeriodRepository>;
  let relationsRepository: ReturnType<typeof emptyRelationsRepository>;

  beforeEach(() => {
    periodRepository = emptyPeriodRepository();
    periodRepository.aggregateComposition.mockResolvedValue({
      severity: { low: 1, medium: 3, high: 2, critical: 0 },
      attention: { open: 4, inProgress: 2 },
      registeredCount: 6,
    });
    relationsRepository = emptyRelationsRepository();
    relationsRepository.aggregateCommitments.mockResolvedValue([
      {
        coordinationId: AREA_B,
        code: 'coord-b2b',
        name: 'B2B',
        shortName: 'B2B',
        value: 2,
      },
    ]);
    relationsRepository.aggregateDependencies.mockResolvedValue([
      {
        coordinationId: AREA_B,
        code: 'coord-b2b',
        name: 'B2B',
        shortName: 'B2B',
        value: 1,
      },
    ]);
    const coordinationsRepository = {
      findActiveById: jest.fn().mockResolvedValue({
        id: AREA_A,
        code: 'coord-a',
        name: 'Área A',
        shortName: 'A',
      }),
    };
    service = buildService(
      coordinationsRepository,
      {
        aggregateActiveSituationsBySeverity: jest.fn(),
        aggregateAffectedCoordinations: jest.fn(),
        aggregateIncomingDependencies: jest.fn(),
        aggregateActiveSituationsByStatus: jest.fn(),
        aggregateOutgoingDependencies: jest.fn(),
      },
      {
        aggregateBacklog: jest.fn().mockResolvedValue(new Map()),
        aggregateEventMetric: jest.fn().mockResolvedValue(new Map()),
      },
      emptyBreakdownRepository(),
      periodRepository,
      relationsRepository,
    );
  });

  it('agrega severidad, atención y relaciones del periodo (legacy granularity)', async () => {
    const result = await service.getPeriod(
      {
        scope: OperationalKpiScopeType.COORDINATION,
        coordinationId: AREA_A,
        granularity: OperationalKpiHistoryGranularity.WEEK,
      },
      DIRECTOR,
    );
    expect(result.severity).toEqual({
      low: 1,
      medium: 3,
      high: 2,
      critical: 0,
    });
    expect(result.attention).toEqual({ open: 4, inProgress: 2 });
    expect(result.relations).toEqual({ dependencies: 1, commitments: 2 });
    expect(result.registeredCount).toBe(6);
    expect(result.severitySemantics).toBe(
      'current-severity-of-period-registrations',
    );
    expect(periodRepository.aggregateComposition).toHaveBeenCalled();
  });

  it('acepta from/to explícitos', async () => {
    const result = await service.getPeriod(
      {
        scope: OperationalKpiScopeType.COORDINATION,
        coordinationId: AREA_A,
        from: '2026-09-29',
        to: '2026-10-05',
      },
      DIRECTOR,
    );
    expect(result.period.from).toBe('2026-09-29');
    expect(result.severity.medium).toBe(3);
    expect(periodRepository.aggregateComposition).toHaveBeenCalled();
  });
});
