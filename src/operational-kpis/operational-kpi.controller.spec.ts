import { OperationalKpiResolutionRepository } from './operational-kpi-resolution.repository';
import { emptyResolutionRepository } from './testing/empty-resolution-repository';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { REQUIRE_PERMISSIONS_KEY } from '../auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import { UserStatus } from '../common/enums/identity.enums';
import { CoordinationsRepository } from '../coordinations/repositories/coordinations.repository';
import { OperationalOverviewRepository } from '../operational-overview/repositories/operational-overview.repository';
import { OperationalKpiController } from './operational-kpi.controller';
import { OPERATIONAL_KPI_COMPARE_MAX } from './operational-kpi.constants';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IncidentCategory } from '../intelligence/entities/incident-category.entity';
import { OperationalKpiAgingRepository } from './operational-kpi-aging.repository';
import { OperationalKpiSnapshotRepository } from './operational-kpi-snapshot.repository';
import { OperationalKpiBreakdownRepository } from './operational-kpi-breakdown.repository';
import { OperationalKpiHistoryRepository } from './operational-kpi-history.repository';
import { OperationalKpiPeriodRepository } from './operational-kpi-period.repository';
import { OperationalKpiRelationsRepository } from './operational-kpi-relations.repository';
import { OperationalKpiService } from './operational-kpi.service';

const AREA_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AREA_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const DIRECTOR: AuthPayload = {
  sub: 'director-1',
  email: 'director@cun.edu.co',
  roleId: 'role-director',
  roleCode: 'DIRECTOR',
  coordinationId: null,
  permissions: ['KPIS_VIEW'],
  status: UserStatus.ACTIVE,
};

describe('OperationalKpiController metadata', () => {
  const handler = (
    OperationalKpiController.prototype as unknown as Record<string, object>
  ).getSnapshot;

  it('expone GET /operational-kpis y exige KPIS_VIEW', () => {
    expect(Reflect.getMetadata(PATH_METADATA, OperationalKpiController)).toBe(
      'operational-kpis',
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, OperationalKpiController),
    ).toContain(PermissionsGuard);
    expect(Reflect.getMetadata(REQUIRE_PERMISSIONS_KEY, handler)).toEqual([
      'KPIS_VIEW',
    ]);
  });
});

describe('GET /operational-kpis', () => {
  let app: INestApplication;
  const catalog = [
    {
      id: AREA_A,
      code: 'coord-ingenierias',
      name: 'Ingenierías',
      shortName: 'Ingenierías',
      isActive: true,
    },
    {
      id: AREA_B,
      code: 'coord-especializaciones',
      name: 'Especializaciones',
      shortName: 'Especializaciones',
      isActive: true,
    },
  ];

  const coordinationsRepository = {
    findCatalog: jest.fn(),
    findActiveById: jest.fn(),
    findActiveByIds: jest.fn(),
  };
  const overviewRepository = {
    aggregateActiveSituationsBySeverity: jest.fn(),
    aggregateAffectedCoordinations: jest.fn(),
    aggregateIncomingDependencies: jest.fn(),
    aggregateActiveSituationsByStatus: jest.fn(),
    aggregateOutgoingDependencies: jest.fn(),
  };

  const historyRepository = {
    aggregateBacklog: jest.fn().mockResolvedValue(new Map()),
    aggregateEventMetric: jest.fn().mockResolvedValue(new Map()),
  };
  const breakdownRepository = {
    aggregateByCategory: jest.fn().mockResolvedValue([
      {
        categoryId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        code: 'internet',
        name: 'Internet',
        selectable: true,
        value: 5,
      },
    ]),
  };
  const categoriesRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      code: 'internet',
      name: 'Internet',
      isSelectable: true,
    }),
  };

  beforeEach(async () => {
    coordinationsRepository.findCatalog.mockResolvedValue(catalog);
    coordinationsRepository.findActiveById.mockResolvedValue(catalog[0]);
    coordinationsRepository.findActiveByIds.mockImplementation(
      async (ids: string[]) => catalog.filter((item) => ids.includes(item.id)),
    );
    overviewRepository.aggregateActiveSituationsBySeverity.mockResolvedValue(
      [],
    );
    overviewRepository.aggregateAffectedCoordinations.mockResolvedValue([]);
    overviewRepository.aggregateIncomingDependencies.mockResolvedValue([]);
    overviewRepository.aggregateActiveSituationsByStatus.mockResolvedValue([]);
    overviewRepository.aggregateOutgoingDependencies.mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      controllers: [OperationalKpiController],
      providers: [
        OperationalKpiService,
        OperationalScopeService,
        {
          provide: CoordinationsRepository,
          useValue: coordinationsRepository,
        },
        {
          provide: OperationalOverviewRepository,
          useValue: overviewRepository,
        },
        {
          provide: OperationalKpiHistoryRepository,
          useValue: historyRepository,
        },
        {
          provide: OperationalKpiBreakdownRepository,
          useValue: breakdownRepository,
        },
        {
          provide: OperationalKpiPeriodRepository,
          useValue: {
            aggregateComposition: jest.fn().mockResolvedValue({
              severity: { low: 0, medium: 0, high: 0, critical: 0 },
              attention: { open: 0, inProgress: 0 },
              registeredCount: 0,
            }),
          },
        },
        {
          provide: OperationalKpiRelationsRepository,
          useValue: {
            aggregateCommitments: jest.fn().mockResolvedValue([]),
            aggregateDependencies: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: getRepositoryToken(IncidentCategory),
          useValue: categoriesRepository,
        },
        { provide: OperationalKpiAgingRepository, useValue: {} },
        { provide: OperationalKpiSnapshotRepository, useValue: {} },
        {
          provide: OperationalKpiResolutionRepository,
          useValue: emptyResolutionRepository(),
        },
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { user?: AuthPayload } };
        }) => {
          context.switchToHttp().getRequest().user = DIRECTOR;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
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
  });

  it('GET ?scope=direction → 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/operational-kpis')
      .query({ scope: 'direction' })
      .expect(200);

    expect(response.body.scope.type).toBe('direction');
    expect(response.body.direction).toBeDefined();
    expect(Array.isArray(response.body.direction.coordinations)).toBe(true);
    expect(response.body.universe.type).toBe('active-catalog');
    expect(response.body.metricVersions.integrity).toBe('integrity-mvp-v1');
  });

  it('GET ?scope=coordination&coordinationId= → 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/operational-kpis')
      .query({ scope: 'coordination', coordinationId: AREA_A })
      .expect(200);

    expect(response.body.scope).toEqual({
      type: 'coordination',
      coordinationId: AREA_A,
    });
    expect(response.body.coordination.coordination.id).toBe(AREA_A);
  });

  it('scope inexistente → 400', async () => {
    await request(app.getHttpServer())
      .get('/operational-kpis')
      .query({ scope: 'group' })
      .expect(400);
  });

  it('coordinationId inválida → 400', async () => {
    await request(app.getHttpServer())
      .get('/operational-kpis')
      .query({ scope: 'coordination', coordinationId: 'no-es-uuid' })
      .expect(400);
  });

  it('coordinationId faltante → 400', async () => {
    await request(app.getHttpServer())
      .get('/operational-kpis')
      .query({ scope: 'coordination' })
      .expect(400);
  });

  it('direction + coordinationId → 400', async () => {
    await request(app.getHttpServer())
      .get('/operational-kpis')
      .query({ scope: 'direction', coordinationId: AREA_A })
      .expect(400);
  });

  it('GET /compare?coordinationIds=B,A → 200 en ese orden', async () => {
    const response = await request(app.getHttpServer())
      .get('/operational-kpis/compare')
      .query({ coordinationIds: `${AREA_B},${AREA_A}` })
      .expect(200);

    expect(
      response.body.items.map(
        (item: { coordination: { id: string } }) => item.coordination.id,
      ),
    ).toEqual([AREA_B, AREA_A]);
    expect(response.body.metricVersions.integrity).toBe('integrity-mvp-v1');
    expect(response.body).not.toHaveProperty('winner');
    expect(response.body).not.toHaveProperty('bestCoordination');
  });

  it('compare sin ids → 400', async () => {
    await request(app.getHttpServer())
      .get('/operational-kpis/compare')
      .expect(400);
  });

  it('compare con 1 id → 400', async () => {
    await request(app.getHttpServer())
      .get('/operational-kpis/compare')
      .query({ coordinationIds: AREA_A })
      .expect(400);
  });

  it('compare con id duplicado → 400', async () => {
    await request(app.getHttpServer())
      .get('/operational-kpis/compare')
      .query({ coordinationIds: `${AREA_A},${AREA_A}` })
      .expect(400);
  });

  it('compare con UUID inválido → 400', async () => {
    await request(app.getHttpServer())
      .get('/operational-kpis/compare')
      .query({ coordinationIds: `${AREA_A},no-uuid` })
      .expect(400);
  });

  it('compare con id inexistente → 404', async () => {
    const missing = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await request(app.getHttpServer())
      .get('/operational-kpis/compare')
      .query({ coordinationIds: `${AREA_A},${missing}` })
      .expect(404);
  });

  it('compare por encima del máximo del catálogo → 400', async () => {
    const ids = Array.from(
      { length: OPERATIONAL_KPI_COMPARE_MAX + 1 },
      (_, index) =>
        `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    );
    await request(app.getHttpServer())
      .get('/operational-kpis/compare')
      .query({ coordinationIds: ids.join(',') })
      .expect(400);
  });

  it('history coordination → 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/operational-kpis/history')
      .query({
        scope: 'coordination',
        coordinationId: AREA_A,
        metric: 'backlog',
        granularity: 'week',
        from: '2026-01-12',
        to: '2026-01-19',
      })
      .expect(200);

    expect(response.body.metric).toBe('backlog');
    expect(response.body.granularity).toBe('week');
    expect(response.body.timezone).toBe('America/Bogota');
    expect(Array.isArray(response.body.series)).toBe(true);
  });

  it('history sin coordinationId → 400', async () => {
    await request(app.getHttpServer())
      .get('/operational-kpis/history')
      .query({
        scope: 'coordination',
        metric: 'created',
        granularity: 'month',
        from: '2026-01-01',
        to: '2026-02-01',
      })
      .expect(400);
  });

  it('history metric inválida → 400', async () => {
    await request(app.getHttpServer())
      .get('/operational-kpis/history')
      .query({
        scope: 'coordination',
        coordinationId: AREA_A,
        metric: 'mttc',
        granularity: 'week',
        from: '2026-01-12',
        to: '2026-01-19',
      })
      .expect(400);
  });

  it('history coordinación inexistente → 404', async () => {
    coordinationsRepository.findActiveById.mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .get('/operational-kpis/history')
      .query({
        scope: 'coordination',
        coordinationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        metric: 'closed',
        granularity: 'cycle',
        from: '2026-01-01',
        to: '2026-12-31',
      })
      .expect(404);
  });

  it('breakdown coordination → 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/operational-kpis/breakdown')
      .query({
        scope: 'coordination',
        coordinationId: AREA_A,
        dimension: 'category',
        metric: 'created',
        from: '2026-01-01',
        to: '2026-01-31',
      })
      .expect(200);

    expect(response.body.dimension).toBe('category');
    expect(response.body.items[0].category.name).toBe('Internet');
    expect(response.body.items[0].value).toBe(5);
  });

  it('breakdown sin coordinationId → 400', async () => {
    await request(app.getHttpServer())
      .get('/operational-kpis/breakdown')
      .query({
        scope: 'coordination',
        dimension: 'category',
        metric: 'created',
        from: '2026-01-01',
        to: '2026-01-31',
      })
      .expect(400);
  });

  it('breakdown dimension inválida → 400', async () => {
    await request(app.getHttpServer())
      .get('/operational-kpis/breakdown')
      .query({
        scope: 'coordination',
        coordinationId: AREA_A,
        dimension: 'severity',
        metric: 'created',
        from: '2026-01-01',
        to: '2026-01-31',
      })
      .expect(400);
  });
});
