import { OperationalKpiResolutionRepository } from './operational-kpi-resolution.repository';
import { emptyResolutionRepository } from './testing/empty-resolution-repository';
import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import { UserStatus } from '../common/enums/identity.enums';
import { SituationReportKind } from '../common/enums/situation.enums';
import { CoordinationsRepository } from '../coordinations/repositories/coordinations.repository';
import { IncidentCategory } from '../intelligence/entities/incident-category.entity';
import { OperationalOverviewRepository } from '../operational-overview/repositories/operational-overview.repository';
import type { KpiHistoryBucket } from './domain/kpi-history-buckets';
import {
  OperationalKpiDependencySide,
  OperationalKpiHistoryGranularity,
  OperationalKpiHistoryMetric,
  OperationalKpiHistoryQueryDto,
} from './dto/operational-kpi-history-query.dto';
import { OperationalKpiScopeType } from './dto/operational-kpi-query.dto';
import { OperationalKpiEstadoPeriodKind } from './dto/operational-kpi-state-query.dto';
import { OperationalKpiAgingRepository } from './operational-kpi-aging.repository';
import { OperationalKpiSnapshotRepository } from './operational-kpi-snapshot.repository';
import { OperationalKpiBreakdownRepository } from './operational-kpi-breakdown.repository';
import { OperationalKpiController } from './operational-kpi.controller';
import { OperationalKpiHistoryRepository } from './operational-kpi-history.repository';
import { OperationalKpiPeriodRepository } from './operational-kpi-period.repository';
import { OperationalKpiRelationsRepository } from './operational-kpi-relations.repository';
import { OperationalKpiService } from './operational-kpi.service';

const AREA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PARTNER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CAT_INTERNET = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

/** Martes 6 oct 2026 Bogotá. */
const NOW = new Date('2026-10-06T12:00:00-05:00');

const DIRECTOR: AuthPayload = {
  sub: 'director-1',
  email: 'director@cun.edu.co',
  roleId: 'role-director',
  roleCode: 'DIRECTOR',
  coordinationId: null,
  permissions: ['KPIS_VIEW'],
  status: UserStatus.ACTIVE,
};

const { WEEK, MONTH, CYCLE } = OperationalKpiEstadoPeriodKind;

function onlyFakeDate() {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      'nextTick',
      'setImmediate',
      'clearImmediate',
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'queueMicrotask',
      'hrtime',
      'performance',
    ],
  });
}

function setup() {
  const coordinationsRepository = {
    findActiveById: jest.fn((id: string) =>
      Promise.resolve(
        id === AREA || id === PARTNER
          ? { id, code: 'coord', name: 'C', shortName: 'C', isActive: true }
          : null,
      ),
    ),
  };
  const historyRepository = {
    aggregateBacklog: jest.fn(
      (_id: string, buckets: readonly KpiHistoryBucket[]) =>
        Promise.resolve(new Map(buckets.map((b) => [b.end, 1]))),
    ),
    aggregateEventMetric: jest.fn(
      (
        _id: string,
        _metric: OperationalKpiHistoryMetric,
        buckets: readonly KpiHistoryBucket[],
      ) => Promise.resolve(new Map(buckets.map((b) => [b.end, 2]))),
    ),
  };
  const categoriesRepository = {
    findOne: jest.fn().mockResolvedValue({ id: CAT_INTERNET }),
  };
  const service = new OperationalKpiService(
    coordinationsRepository as unknown as CoordinationsRepository,
    {} as OperationalOverviewRepository,
    new OperationalScopeService(),
    historyRepository as unknown as OperationalKpiHistoryRepository,
    {} as never,
    {} as never,
    {} as never,
    categoriesRepository as never,
    {} as never,
    {} as never,
  );
  return { service, historyRepository };
}

function periodQuery(
  kind: OperationalKpiEstadoPeriodKind,
  from: string,
  to: string,
  calendarEnd: string,
  extra: Partial<OperationalKpiHistoryQueryDto> = {},
): OperationalKpiHistoryQueryDto {
  return {
    scope: OperationalKpiScopeType.COORDINATION,
    coordinationId: AREA,
    metric: OperationalKpiHistoryMetric.CREATED,
    kind,
    from,
    to,
    calendarEnd,
    ...extra,
  };
}

describe('OperationalKpiService.getHistory · modo AnalysisPeriod (kind)', () => {
  beforeEach(onlyFakeDate);
  afterEach(() => jest.useRealTimers());

  it('semana en curso → buckets diarios hasta hoy y periodo efectivo', async () => {
    const { service } = setup();
    const response = await service.getHistory(
      periodQuery(WEEK, '2026-10-05', '2026-10-06', '2026-10-11'),
      DIRECTOR,
    );
    expect(response.period).toEqual({
      kind: 'week',
      from: '2026-10-05',
      dataTo: '2026-10-06',
      calendarEnd: '2026-10-11',
      bucket: 'day',
    });
    expect(response.granularity).toBeUndefined();
    expect(response.range).toEqual({ from: '2026-10-05', to: '2026-10-06' });
    expect(response.series.map((p) => p.start)).toEqual([
      '2026-10-05',
      '2026-10-06',
    ]);
  });

  it('mes completo → semanas recortadas al mes, como /state', async () => {
    const { service } = setup();
    const response = await service.getHistory(
      periodQuery(MONTH, '2026-09-01', '2026-09-30', '2026-09-30'),
      DIRECTOR,
    );
    expect(response.period?.bucket).toBe('week');
    expect(response.series.map(({ start, end }) => `${start}/${end}`)).toEqual([
      '2026-09-01/2026-09-06',
      '2026-09-07/2026-09-13',
      '2026-09-14/2026-09-20',
      '2026-09-21/2026-09-27',
      '2026-09-28/2026-09-30',
    ]);
  });

  it('ciclo H1 → 6 buckets mensuales', async () => {
    const { service } = setup();
    const response = await service.getHistory(
      periodQuery(CYCLE, '2026-01-01', '2026-06-30', '2026-06-30', {
        metric: OperationalKpiHistoryMetric.BACKLOG,
      }),
      DIRECTOR,
    );
    expect(response.period?.bucket).toBe('month');
    expect(response.series).toHaveLength(6);
  });

  it('con categoryId filtra INTERNAL de esa categoría sobre el mismo periodo', async () => {
    const { service, historyRepository } = setup();
    await service.getHistory(
      periodQuery(MONTH, '2026-09-01', '2026-09-30', '2026-09-30', {
        categoryId: CAT_INTERNET,
      }),
      DIRECTOR,
    );
    const [, , buckets, filter] =
      historyRepository.aggregateEventMetric.mock.calls[0];
    expect(filter).toEqual({
      reportKind: SituationReportKind.INTERNAL,
      categoryId: CAT_INTERNET,
    });
    expect(buckets[0].start).toBe('2026-09-01');
  });

  it('con pareja INTER usa el mismo periodo y el lado pedido', async () => {
    const { service, historyRepository } = setup();
    await service.getHistory(
      periodQuery(WEEK, '2026-09-28', '2026-10-04', '2026-10-04', {
        partnerCoordinationId: PARTNER,
        dependencySide: OperationalKpiDependencySide.DEPENDENCY,
      }),
      DIRECTOR,
    );
    const [, , buckets, filter] =
      historyRepository.aggregateEventMetric.mock.calls[0];
    expect(filter).toMatchObject({
      partner: {
        ownerCoordinationId: AREA,
        partnerCoordinationId: PARTNER,
        side: 'dependency',
      },
    });
    expect(buckets).toHaveLength(7);
  });

  it.each([
    [
      'kind y granularity a la vez',
      periodQuery(WEEK, '2026-10-05', '2026-10-06', '2026-10-11', {
        granularity: OperationalKpiHistoryGranularity.WEEK,
      }),
      /no ambos/,
    ],
    [
      'kind=week con rango que no es semana',
      periodQuery(WEEK, '2026-10-03', '2026-10-06', '2026-10-20'),
      /kind=week/,
    ],
    [
      'periodo futuro',
      periodQuery(WEEK, '2026-10-12', '2026-10-12', '2026-10-18'),
      /periodo futuro/,
    ],
    [
      'sin kind ni granularity',
      {
        ...periodQuery(WEEK, '2026-10-05', '2026-10-06', '2026-10-11'),
        kind: undefined,
        calendarEnd: undefined,
      },
      /Exige kind o granularity/,
    ],
    [
      'calendarEnd sin kind',
      {
        ...periodQuery(WEEK, '2026-09-28', '2026-10-04', '2026-10-04'),
        kind: undefined,
        granularity: OperationalKpiHistoryGranularity.WEEK,
      },
      /calendarEnd solo aplica con kind/,
    ],
  ])('%s → 400', async (_name, query, message) => {
    const { service } = setup();
    const call = service.getHistory(query, DIRECTOR);
    await expect(call).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.getHistory(query, DIRECTOR)).rejects.toThrow(message);
  });

  it('modo legacy granularity sigue respondiendo granularity sin period', async () => {
    const { service } = setup();
    const response = await service.getHistory(
      {
        scope: OperationalKpiScopeType.COORDINATION,
        coordinationId: AREA,
        metric: OperationalKpiHistoryMetric.CREATED,
        granularity: OperationalKpiHistoryGranularity.WEEK,
        from: '2026-09-28',
        to: '2026-10-04',
      },
      DIRECTOR,
    );
    expect(response.granularity).toBe('week');
    expect(response.period).toBeUndefined();
  });
});

describe('GET /operational-kpis/history?kind=… (HTTP)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    onlyFakeDate();
    const { historyRepository } = setup();
    const moduleRef = await Test.createTestingModule({
      controllers: [OperationalKpiController],
      providers: [
        OperationalKpiService,
        OperationalScopeService,
        {
          provide: CoordinationsRepository,
          useValue: {
            findActiveById: jest.fn().mockResolvedValue({
              id: AREA,
              code: 'coord-b2b',
              name: 'B2B',
              shortName: 'B2B',
              isActive: true,
            }),
          },
        },
        { provide: OperationalOverviewRepository, useValue: {} },
        {
          provide: OperationalKpiHistoryRepository,
          useValue: historyRepository,
        },
        { provide: OperationalKpiBreakdownRepository, useValue: {} },
        { provide: OperationalKpiPeriodRepository, useValue: {} },
        { provide: OperationalKpiRelationsRepository, useValue: {} },
        { provide: getRepositoryToken(IncidentCategory), useValue: {} },
        { provide: OperationalKpiAgingRepository, useValue: {} },
        { provide: OperationalKpiSnapshotRepository, useValue: {} },
        {
          provide: OperationalKpiResolutionRepository,
          useValue: emptyResolutionRepository(),
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use((req: { user?: AuthPayload }, _res: unknown, next: () => void) => {
      req.user = DIRECTOR;
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.useRealTimers();
  });

  it('acepta kind + calendarEnd sin granularity → 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/operational-kpis/history')
      .query({
        scope: 'coordination',
        coordinationId: AREA,
        metric: 'backlog',
        kind: 'month',
        from: '2026-10-01',
        to: '2026-10-06',
        calendarEnd: '2026-10-31',
      })
      .expect(200);
    const body = response.body as {
      period: { bucket: string; dataTo: string };
      series: unknown[];
    };
    expect(body.period).toMatchObject({ bucket: 'week', dataTo: '2026-10-06' });
    expect(body.series).toHaveLength(2);
  });

  it('kind inválido → 400', async () => {
    await request(app.getHttpServer())
      .get('/operational-kpis/history')
      .query({
        scope: 'coordination',
        coordinationId: AREA,
        metric: 'created',
        kind: 'year',
        from: '2026-10-01',
        to: '2026-10-06',
      })
      .expect(400);
  });
});
