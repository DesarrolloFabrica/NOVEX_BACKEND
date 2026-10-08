import { emptyResolutionRepository } from './testing/empty-resolution-repository';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import { UserStatus } from '../common/enums/identity.enums';
import { CoordinationsRepository } from '../coordinations/repositories/coordinations.repository';
import { OperationalOverviewRepository } from '../operational-overview/repositories/operational-overview.repository';
import type { KpiHistoryBucket } from './domain/kpi-history-buckets';
import { OperationalKpiHistoryMetric } from './dto/operational-kpi-history-query.dto';
import { OperationalKpiScopeType } from './dto/operational-kpi-query.dto';
import {
  OperationalKpiEstadoPeriodKind,
  OperationalKpiStateQueryDto,
} from './dto/operational-kpi-state-query.dto';
import { OperationalKpiHistoryRepository } from './operational-kpi-history.repository';
import { OperationalKpiService } from './operational-kpi.service';

const AREA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PARTNER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** Miércoles 7 oct 2026, 10:00 Bogotá. */
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

/** Cuenta por bucket: valor = día del mes de `end` (determinista). */
function countsByEnd(buckets: readonly KpiHistoryBucket[], offset = 0) {
  return new Map(
    buckets.map((bucket) => [bucket.end, Number(bucket.end.slice(8)) + offset]),
  );
}

function setup() {
  const coordinationsRepository = {
    findActiveById: jest.fn().mockResolvedValue({
      id: AREA,
      code: 'coord-b2b',
      name: 'B2B',
      shortName: 'B2B',
      isActive: true,
    }),
  };
  const periodRepository = {
    aggregateComposition: jest.fn().mockResolvedValue({
      severity: { low: 1, medium: 8, high: 1, critical: 0 },
      attention: { open: 6, inProgress: 4 },
      registeredCount: 12,
    }),
  };
  const relationsRepository = {
    aggregateCommitments: jest
      .fn()
      .mockResolvedValue([{ coordination: { id: PARTNER }, value: 2 }]),
    aggregateDependencies: jest.fn().mockResolvedValue([
      { coordination: { id: PARTNER }, value: 1 },
      {
        coordination: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
        value: 3,
      },
    ]),
  };
  const historyRepository = {
    aggregateActiveByKind: jest.fn(() => Promise.resolve(new Map())),
    aggregateActiveInternalByCategory: jest.fn(() => Promise.resolve([])),
    aggregateActiveExternalByCoordination: jest.fn(() => Promise.resolve([])),
    aggregateBacklog: jest.fn(
      (_id: string, buckets: readonly KpiHistoryBucket[]) =>
        Promise.resolve(countsByEnd(buckets, 100)),
    ),
    aggregateEventMetric: jest.fn(
      (
        _id: string,
        metric: OperationalKpiHistoryMetric,
        buckets: readonly KpiHistoryBucket[],
      ) =>
        Promise.resolve(
          countsByEnd(
            buckets,
            metric === OperationalKpiHistoryMetric.CREATED ? 0 : 50,
          ),
        ),
    ),
  };

  const agingRepository = {
    aggregateSummary: jest.fn().mockResolvedValue({
      activeCount: 0,
      medianAgeDays: null,
      bands: [
        { key: '0-7', count: 0 },
        { key: '8-14', count: 0 },
        { key: '15-30', count: 0 },
        { key: '31+', count: 0 },
      ],
    }),
    findOldest: jest.fn().mockResolvedValue([]),
  };

  const snapshotRepository = {
    aggregateComposition: jest.fn().mockResolvedValue({
      activeCount: 15,
      severity: { low: 4, medium: 7, high: 3, critical: 1 },
      attention: { open: 9, inProgress: 6, closedAfterCut: 0, unclassified: 0 },
    }),
  };

  const empty = emptyResolutionRepository();
  const resolutionRepository = {
    aggregateByBucket: jest.fn(empty.aggregateByBucket),
    aggregateSummary: jest.fn(empty.aggregateSummary),
  };

  const service = new OperationalKpiService(
    coordinationsRepository as unknown as CoordinationsRepository,
    {} as OperationalOverviewRepository,
    new OperationalScopeService(),
    historyRepository as unknown as OperationalKpiHistoryRepository,
    {} as never,
    periodRepository as never,
    relationsRepository as never,
    {} as never,
    agingRepository as never,
    snapshotRepository as never,
    resolutionRepository as never,
  );

  return {
    service,
    resolutionRepository,
    agingRepository,
    snapshotRepository,
    coordinationsRepository,
    periodRepository,
    relationsRepository,
    historyRepository,
  };
}

function query(
  kind: OperationalKpiEstadoPeriodKind,
  from: string,
  to: string,
  calendarEnd?: string,
): OperationalKpiStateQueryDto {
  return {
    scope: OperationalKpiScopeType.COORDINATION,
    coordinationId: AREA,
    kind,
    from,
    to,
    calendarEnd,
  };
}

const { WEEK, MONTH, CYCLE } = OperationalKpiEstadoPeriodKind;

beforeEach(() => {
  // Solo Date: el resto de timers y microtareas siguen reales.
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
});

afterEach(() => {
  jest.useRealTimers();
});

describe('OperationalKpiService.getState · semana', () => {
  it('semana en curso lun→mié: actual, parcial, dataTo = hoy, buckets diarios', async () => {
    const { service, historyRepository } = setup();
    const response = await service.getState(
      query(WEEK, '2026-10-05', '2026-10-07', '2026-10-11'),
      DIRECTOR,
    );

    expect(response.period).toEqual({
      kind: 'week',
      from: '2026-10-05',
      to: '2026-10-07',
      calendarEnd: '2026-10-11',
      label: '2026-10-05 – 2026-10-11',
      isCurrent: true,
      isPartial: true,
      dataTo: '2026-10-07',
    });
    expect(response.evolution.bucket).toBe('day');
    expect(response.evolution.backlog.map((point) => point.start)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
    ]);
    const buckets = historyRepository.aggregateBacklog.mock.calls[0][1];
    expect(buckets.every((bucket) => bucket.start === bucket.end)).toBe(true);
  });

  it('pedir to = domingo en la semana en curso sigue recortando datos a hoy', async () => {
    const { service } = setup();
    const response = await service.getState(
      query(WEEK, '2026-10-05', '2026-10-11', '2026-10-11'),
      DIRECTOR,
    );
    expect(response.period).toMatchObject({
      to: '2026-10-07',
      dataTo: '2026-10-07',
      isPartial: true,
    });
    expect(response.evolution.created).toHaveLength(3);
  });

  it('semana pasada completa: no actual, no parcial, 7 días', async () => {
    const { service } = setup();
    const response = await service.getState(
      query(WEEK, '2026-09-28', '2026-10-04', '2026-10-04'),
      DIRECTOR,
    );
    expect(response.period).toMatchObject({
      isCurrent: false,
      isPartial: false,
      dataTo: '2026-10-04',
    });
    expect(response.evolution.backlog).toHaveLength(7);
  });
});

describe('OperationalKpiService.getState · mes', () => {
  it('mes que empieza martes y termina miércoles → buckets semanales dentro del mes', async () => {
    // Septiembre 2026: 1 = martes, 30 = miércoles.
    const { service } = setup();
    const response = await service.getState(
      query(MONTH, '2026-09-01', '2026-09-30', '2026-09-30'),
      DIRECTOR,
    );
    expect(response.evolution.bucket).toBe('week');
    expect(
      response.evolution.backlog.map(({ start, end, label }) => ({
        start,
        end,
        label,
      })),
    ).toEqual([
      { start: '2026-09-01', end: '2026-09-06', label: '1–6 sep' },
      { start: '2026-09-07', end: '2026-09-13', label: '7–13 sep' },
      { start: '2026-09-14', end: '2026-09-20', label: '14–20 sep' },
      { start: '2026-09-21', end: '2026-09-27', label: '21–27 sep' },
      { start: '2026-09-28', end: '2026-09-30', label: '28–30 sep' },
    ]);
    for (const point of response.evolution.backlog) {
      expect(point.start >= '2026-09-01').toBe(true);
      expect(point.end <= '2026-09-30').toBe(true);
    }
  });

  it('mes en curso: primera semana recortada «1–4 oct» y última a hoy', async () => {
    const { service } = setup();
    const response = await service.getState(
      query(MONTH, '2026-10-01', '2026-10-07', '2026-10-31'),
      DIRECTOR,
    );
    expect(response.period).toMatchObject({ isCurrent: true, isPartial: true });
    expect(response.evolution.created.map((point) => point.label)).toEqual([
      '1–4 oct',
      '5–7 oct',
    ]);
  });
});

describe('OperationalKpiService.getState · ciclo', () => {
  it('H1 completo → 6 buckets mensuales ene–jun', async () => {
    const { service } = setup();
    const response = await service.getState(
      query(CYCLE, '2026-01-01', '2026-06-30', '2026-06-30'),
      DIRECTOR,
    );
    expect(response.evolution.bucket).toBe('month');
    expect(response.evolution.backlog.map((point) => point.start)).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
    ]);
    expect(response.period).toMatchObject({
      isCurrent: false,
      isPartial: false,
    });
  });

  it('H2 en curso → jul–oct, último mes recortado a hoy', async () => {
    const { service } = setup();
    const response = await service.getState(
      query(CYCLE, '2026-07-01', '2026-10-07', '2026-12-31'),
      DIRECTOR,
    );
    expect(response.evolution.bucket).toBe('month');
    const labels = response.evolution.backlog.map((point) => point.label);
    expect(labels).toEqual(['Jul 2026', 'Ago 2026', 'Sep 2026', 'Oct 2026']);
    expect(response.evolution.backlog.at(-1)?.end).toBe('2026-10-07');
    expect(response.period).toMatchObject({ isCurrent: true, isPartial: true });
  });
});

describe('OperationalKpiService.getState · semántica', () => {
  it('snapshot = composición de ACTIVE_AT_CUT al corte dataTo (no registradas en el periodo)', async () => {
    const { service, periodRepository, snapshotRepository } = setup();
    const response = await service.getState(
      query(WEEK, '2026-10-05', '2026-10-07', '2026-10-11'),
      DIRECTOR,
    );
    expect(snapshotRepository.aggregateComposition).toHaveBeenCalledWith(
      AREA,
      '2026-10-07',
    );
    expect(periodRepository.aggregateComposition).not.toHaveBeenCalled();
    expect(response.snapshot).toEqual({
      semantics: 'active-at-cut',
      at: '2026-10-07',
      isNow: true,
      activeCount: 15,
      severity: { low: 4, medium: 7, high: 3, critical: 1 },
      attention: { open: 9, inProgress: 6, closedAfterCut: 0, unclassified: 0 },
      reliability: { severity: 'exact', attention: 'exact' },
    });
    expect(response).not.toHaveProperty('severity');
    expect(response).not.toHaveProperty('attention');
    expect(response).not.toHaveProperty('registeredCount');
  });

  it('corte histórico: severidad y atención declaran «valor actual»', async () => {
    const { service, snapshotRepository } = setup();
    const response = await service.getState(
      query(MONTH, '2026-09-01', '2026-09-30', '2026-09-30'),
      DIRECTOR,
    );
    expect(snapshotRepository.aggregateComposition).toHaveBeenCalledWith(
      AREA,
      '2026-09-30',
    );
    expect(response.snapshot).toMatchObject({
      at: '2026-09-30',
      isNow: false,
      reliability: { severity: 'current-value', attention: 'current-value' },
    });
  });

  it('relaciones = INTER creadas en el periodo (métrica CREATED, sumadas)', async () => {
    const { service, relationsRepository } = setup();
    const response = await service.getState(
      query(WEEK, '2026-10-05', '2026-10-07', '2026-10-11'),
      DIRECTOR,
    );
    expect(relationsRepository.aggregateCommitments).toHaveBeenCalledWith(
      AREA,
      OperationalKpiHistoryMetric.CREATED,
      '2026-10-05',
      '2026-10-07',
    );
    expect(relationsRepository.aggregateDependencies).toHaveBeenCalledWith(
      AREA,
      OperationalKpiHistoryMetric.CREATED,
      '2026-10-05',
      '2026-10-07',
    );
    expect(response.relations).toEqual({ dependencies: 4, commitments: 2 });
  });

  it('evolución: backlog reconstruido + created/closed por evento, mapeados por bucket', async () => {
    const { service, historyRepository } = setup();
    const response = await service.getState(
      query(WEEK, '2026-10-05', '2026-10-07', '2026-10-11'),
      DIRECTOR,
    );
    expect(historyRepository.aggregateEventMetric).toHaveBeenCalledWith(
      AREA,
      OperationalKpiHistoryMetric.CREATED,
      expect.any(Array),
    );
    expect(historyRepository.aggregateEventMetric).toHaveBeenCalledWith(
      AREA,
      OperationalKpiHistoryMetric.CLOSED,
      expect.any(Array),
    );
    expect(response.evolution.backlog.map((point) => point.value)).toEqual([
      105, 106, 107,
    ]);
    expect(response.evolution.created.map((point) => point.value)).toEqual([
      5, 6, 7,
    ]);
    expect(response.evolution.closed.map((point) => point.value)).toEqual([
      55, 56, 57,
    ]);
  });
});

describe('OperationalKpiService.getState · contrato', () => {
  const rejects = async (dto: OperationalKpiStateQueryDto, message: RegExp) => {
    const { service, snapshotRepository } = setup();
    const call = service.getState(dto, DIRECTOR);
    await expect(call).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.getState(dto, DIRECTOR)).rejects.toThrow(message);
    expect(snapshotRepository.aggregateComposition).not.toHaveBeenCalled();
  };

  it('from > to → 400', async () => {
    await rejects(
      query(WEEK, '2026-10-05', '2026-10-04', '2026-10-11'),
      /from no puede ser posterior a to/,
    );
  });

  it('kind=week con rango incoherente (3 → 20 oct) → 400', async () => {
    await rejects(
      query(WEEK, '2026-10-03', '2026-10-07', '2026-10-20'),
      /kind=week/,
    );
  });

  it('kind=month que no es mes calendario → 400', async () => {
    await rejects(
      query(MONTH, '2026-09-02', '2026-09-30', '2026-09-30'),
      /kind=month/,
    );
  });

  it('kind=cycle que no es H1/H2 → 400', async () => {
    await rejects(
      query(CYCLE, '2026-03-01', '2026-06-30', '2026-06-30'),
      /kind=cycle/,
    );
  });

  it('to > calendarEnd → 400', async () => {
    await rejects(
      query(WEEK, '2026-09-28', '2026-10-05', '2026-10-04'),
      /to no puede ser posterior a calendarEnd/,
    );
  });

  it('periodo futuro → 400 con mensaje propio', async () => {
    await rejects(
      query(WEEK, '2026-10-12', '2026-10-12', '2026-10-18'),
      /periodo futuro/,
    );
  });

  it('periodo terminado con to < calendarEnd → 400', async () => {
    await rejects(
      query(MONTH, '2026-09-01', '2026-09-15', '2026-09-30'),
      /to = calendarEnd/,
    );
  });

  it('sin KPIS_VIEW → Forbidden', async () => {
    const { service } = setup();
    await expect(
      service.getState(query(WEEK, '2026-10-05', '2026-10-07', '2026-10-11'), {
        ...DIRECTOR,
        permissions: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('coordinación inexistente → NotFound', async () => {
    const { service, coordinationsRepository } = setup();
    coordinationsRepository.findActiveById.mockResolvedValue(null);
    await expect(
      service.getState(
        query(WEEK, '2026-10-05', '2026-10-07', '2026-10-11'),
        DIRECTOR,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('scope=direction → 400 (no disponible en /state)', async () => {
    const { service } = setup();
    await expect(
      service.getState(
        {
          ...query(WEEK, '2026-10-05', '2026-10-07', '2026-10-11'),
          scope: OperationalKpiScopeType.DIRECTION,
          coordinationId: undefined,
        },
        DIRECTOR,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('RESOLUCIÓN: misma coordinación y periodo; buckets 1:1 con evolution.buckets (futuros null)', async () => {
    const { service, resolutionRepository, historyRepository } = setup();
    const r = await service.getState(
      query(CYCLE, '2026-07-01', '2026-10-07', '2026-12-31'),
      DIRECTOR,
    );
    expect(resolutionRepository.aggregateSummary).toHaveBeenCalledWith(
      AREA,
      '2026-07-01',
      '2026-10-07',
    );
    // Mismos buckets que los «Solucionados» (aggregateEventMetric CLOSED).
    const closedCall = historyRepository.aggregateEventMetric.mock.calls.find(
      (call: unknown[]) => call[1] === OperationalKpiHistoryMetric.CLOSED,
    );
    expect(resolutionRepository.aggregateByBucket.mock.calls[0][1]).toEqual(
      closedCall?.[2],
    );
    expect(r.resolution.buckets.map((b) => b.start)).toEqual(
      r.evolution.buckets.map((b) => b.start),
    );
    r.resolution.buckets.forEach((b, i) => {
      const flow = r.evolution.buckets[i];
      expect(b.closedCount === null).toBe(flow.future);
    });
    expect(r.resolution.semantics).toBe(
      'closed-in-period-duration-since-created',
    );
    expect(r.resolution.distribution).toHaveLength(6);
  });
});
