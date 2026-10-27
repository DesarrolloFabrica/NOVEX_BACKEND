import { OperationalKpiResolutionRepository } from './operational-kpi-resolution.repository';
import { emptyResolutionRepository } from './testing/empty-resolution-repository';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import { UserStatus } from '../common/enums/identity.enums';
import { CoordinationsRepository } from '../coordinations/repositories/coordinations.repository';
import { IncidentCategory } from '../intelligence/entities/incident-category.entity';
import { OperationalOverviewRepository } from '../operational-overview/repositories/operational-overview.repository';
import { OperationalKpiAgingRepository } from './operational-kpi-aging.repository';
import { OperationalKpiSnapshotRepository } from './operational-kpi-snapshot.repository';
import { OperationalKpiBreakdownRepository } from './operational-kpi-breakdown.repository';
import { OperationalKpiController } from './operational-kpi.controller';
import { OperationalKpiHistoryRepository } from './operational-kpi-history.repository';
import { OperationalKpiPeriodRepository } from './operational-kpi-period.repository';
import { OperationalKpiRelationsRepository } from './operational-kpi-relations.repository';
import { OperationalKpiService } from './operational-kpi.service';

const AREA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MISSING = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

/** Miércoles 7 oct 2026 Bogotá. */
const NOW = new Date('2026-10-07T10:00:00-05:00');

const DIRECTOR: AuthPayload = {
  sub: 'director-1',
  email: 'director@cun.edu.co',
  roleId: 'role-director',
  roleCode: 'DIRECTOR',
  coordinationId: null,
  permissions: ['KPIS_VIEW'],
  status: UserStatus.ACTIVE,
};

const ANALYST_WITHOUT_KPIS: AuthPayload = {
  ...DIRECTOR,
  sub: 'analyst-1',
  roleCode: 'ANALISTA',
  permissions: ['SITUATIONS_VIEW'],
};

type ErrorBody = { message: string };
type StateBody = { evolution: { backlog: unknown[] } };

/** Semana en curso válida (lun 5 – dom 11 oct, datos hasta hoy). */
const CURRENT_WEEK = {
  scope: 'coordination',
  coordinationId: AREA,
  kind: 'week',
  from: '2026-10-05',
  to: '2026-10-07',
  calendarEnd: '2026-10-11',
};

describe('GET /operational-kpis/state (HTTP, PermissionsGuard real)', () => {
  let app: INestApplication;
  /** Identidad que el middleware de prueba coloca en req.user (como el JwtAuthGuard). */
  let actor: AuthPayload;

  const coordinationsRepository = {
    findCatalog: jest.fn(),
    findActiveById: jest.fn(),
    findActiveByIds: jest.fn(),
  };

  beforeEach(async () => {
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
    actor = DIRECTOR;
    coordinationsRepository.findActiveById.mockImplementation((id: string) =>
      Promise.resolve(
        id === AREA
          ? {
              id: AREA,
              code: 'coord-b2b',
              name: 'B2B',
              shortName: 'B2B',
              isActive: true,
            }
          : null,
      ),
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [OperationalKpiController],
      providers: [
        OperationalKpiService,
        OperationalScopeService,
        { provide: CoordinationsRepository, useValue: coordinationsRepository },
        { provide: OperationalOverviewRepository, useValue: {} },
        {
          provide: OperationalKpiHistoryRepository,
          useValue: {
            aggregateBacklog: jest.fn().mockResolvedValue(new Map()),
            aggregateEventMetric: jest.fn().mockResolvedValue(new Map()),
            aggregateActiveByKind: jest.fn().mockResolvedValue(new Map()),
            aggregateActiveInternalByCategory: jest.fn().mockResolvedValue([]),
            aggregateActiveExternalByCoordination: jest
              .fn()
              .mockResolvedValue([]),
          },
        },
        { provide: OperationalKpiBreakdownRepository, useValue: {} },
        {
          provide: OperationalKpiPeriodRepository,
          useValue: {
            aggregateComposition: jest.fn().mockResolvedValue({
              severity: { low: 1, medium: 8, high: 1, critical: 0 },
              attention: { open: 6, inProgress: 4 },
              registeredCount: 12,
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
        { provide: getRepositoryToken(IncidentCategory), useValue: {} },
        {
          provide: OperationalKpiResolutionRepository,
          useValue: emptyResolutionRepository(),
        },
        {
          provide: OperationalKpiSnapshotRepository,
          useValue: {
            aggregateComposition: jest.fn().mockResolvedValue({
              activeCount: 0,
              severity: { low: 0, medium: 0, high: 0, critical: 0 },
              attention: {
                open: 0,
                inProgress: 0,
                closedAfterCut: 0,
                unclassified: 0,
              },
            }),
          },
        },
        {
          provide: OperationalKpiAgingRepository,
          useValue: {
            aggregateSummary: jest.fn().mockResolvedValue({
              activeCount: 0,
              medianAgeDays: null,
              bands: [],
            }),
            findOldest: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use((req: { user?: AuthPayload }, _res: unknown, next: () => void) => {
      req.user = actor;
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

  const get = (query: Record<string, string>) =>
    request(app.getHttpServer()).get('/operational-kpis/state').query(query);

  it('DIRECTOR + KPIS_VIEW → 200 con la fotografía del periodo', async () => {
    const response = await get(CURRENT_WEEK).expect(200);
    expect(response.body).toMatchObject({
      scope: { type: 'coordination', coordinationId: AREA },
      timezone: 'America/Bogota',
      period: {
        kind: 'week',
        from: '2026-10-05',
        to: '2026-10-07',
        calendarEnd: '2026-10-11',
        isCurrent: true,
        isPartial: true,
        dataTo: '2026-10-07',
      },
      relations: { dependencies: 0, commitments: 0 },
      snapshot: {
        semantics: 'active-at-cut',
        at: '2026-10-07',
        isNow: true,
        activeCount: 0,
        reliability: { severity: 'exact', attention: 'exact' },
      },
      evolution: { bucket: 'day' },
    });
    expect((response.body as StateBody).evolution.backlog).toHaveLength(3);
  });

  it('sin KPIS_VIEW → 403', async () => {
    actor = ANALYST_WITHOUT_KPIS;
    const response = await get(CURRENT_WEEK).expect(403);
    expect((response.body as ErrorBody).message).toContain('KPIS_VIEW');
  });

  it('coordinationId inválida → 400', async () => {
    await get({ ...CURRENT_WEEK, coordinationId: 'no-es-uuid' }).expect(400);
  });

  it('coordinación inexistente → 404', async () => {
    await get({ ...CURRENT_WEEK, coordinationId: MISSING }).expect(404);
  });

  it('rango inválido (from > to) → 400', async () => {
    const response = await get({
      ...CURRENT_WEEK,
      from: '2026-10-07',
      to: '2026-10-05',
    }).expect(400);
    expect((response.body as ErrorBody).message).toContain(
      'from no puede ser posterior a to',
    );
  });

  it('fecha con formato inválido → 400', async () => {
    await get({ ...CURRENT_WEEK, from: '2026-13-01' }).expect(400);
  });

  it('kind/rango incompatibles (week 3 → 20 oct) → 400', async () => {
    const response = await get({
      ...CURRENT_WEEK,
      from: '2026-10-03',
      to: '2026-10-07',
      calendarEnd: '2026-10-20',
    }).expect(400);
    expect((response.body as ErrorBody).message).toContain('kind=week');
  });

  it('periodo futuro → 400 con mensaje de periodo futuro', async () => {
    const response = await get({
      ...CURRENT_WEEK,
      from: '2026-10-12',
      to: '2026-10-12',
      calendarEnd: '2026-10-18',
    }).expect(400);
    expect((response.body as ErrorBody).message).toContain('periodo futuro');
    expect((response.body as ErrorBody).message).not.toContain(
      'from no puede ser posterior',
    );
  });
});
