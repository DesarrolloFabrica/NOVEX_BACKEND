import { emptyResolutionRepository } from './testing/empty-resolution-repository';
import { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import { UserStatus } from '../common/enums/identity.enums';
import {
  SituationReportKind,
  SituationSeverity,
  SituationStatus,
} from '../common/enums/situation.enums';
import { CoordinationsRepository } from '../coordinations/repositories/coordinations.repository';
import { OperationalOverviewRepository } from '../operational-overview/repositories/operational-overview.repository';
import { buildEstadoAging } from './domain/kpi-estado-aging';
import type { KpiHistoryBucket } from './domain/kpi-history-buckets';
import { OperationalKpiScopeType } from './dto/operational-kpi-query.dto';
import {
  OperationalKpiEstadoPeriodKind,
  OperationalKpiStateQueryDto,
} from './dto/operational-kpi-state-query.dto';
import type { OperationalKpiStateResponseDto } from './dto/operational-kpi-state.dto';
import {
  KPI_AGING_TOP_LIMIT,
  OperationalKpiAgingRepository,
  type KpiAgingOldestRow,
  type KpiAgingSummaryRow,
} from './operational-kpi-aging.repository';
import { OperationalKpiHistoryRepository } from './operational-kpi-history.repository';
import { OperationalKpiService } from './operational-kpi.service';

/**
 * ANTIGÜEDAD · problemas activos más antiguos al corte.
 *
 * No hay Postgres en la suite unitaria: (1) se fija el SQL y sus parámetros,
 * (2) se prueba el mapper puro y (3) el servicio con repositorios en memoria
 * que aplican EXACTAMENTE los mismos predicados que el SQL de Carga
 * (aggregateActiveByKind) y de Antigüedad. La verificación contra Postgres
 * real vive en operational-kpi-aging.pg.spec.ts (opt-in).
 */

const AREA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SERVICIOS = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CODES: Record<string, string> = {
  [AREA]: 'coord-operaciones-academicas',
  [SERVICIOS]: 'coord-servicios',
};
const NAMES: Record<string, string> = {
  [AREA]: 'Op. Académicas',
  [SERVICIOS]: 'Servicios',
};

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

type Fixture = {
  id: string;
  title?: string;
  createdAt: string;
  closedAt?: string | null;
  status?: SituationStatus;
  severity?: SituationSeverity;
  dueAt?: string | null;
  reportKind?: SituationReportKind;
  coordinationId?: string;
  affectedCoordinationId?: string | null;
  categoryName?: string | null;
};

const ms = (iso: string) => Date.parse(iso);
const owner = (s: Fixture) => s.coordinationId ?? AREA;
const kindOf = (s: Fixture) => s.reportKind ?? SituationReportKind.INTERNAL;
const activeAt = (s: Fixture, cut: number) =>
  ms(s.createdAt) < cut && (!s.closedAt || ms(s.closedAt) >= cut);
/** Universo de Carga: INTERNAL o INTER con afectada ≠ responsable. */
const inLoadUniverse = (s: Fixture, id: string) =>
  owner(s) === id &&
  (kindOf(s) === SituationReportKind.INTERNAL ||
    (s.affectedCoordinationId ?? null) !== id);

function bogotaYmd(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const [ay, am, ad] = fromYmd.split('-').map(Number);
  const [by, bm, bd] = toYmd.split('-').map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000,
  );
}

/** Fin exclusivo del día YYYY-MM-DD en Bogotá (UTC−5, sin DST). */
function cutOf(refDate: string): number {
  return ms(`${refDate}T00:00:00-05:00`) + 86_400_000;
}

/** Carga en memoria: solo lo que ESTADO necesita para cuadrar. */
function inMemoryHistory(situations: Fixture[]) {
  const zeros = (buckets: readonly KpiHistoryBucket[]) =>
    Promise.resolve(new Map(buckets.map((b) => [b.end, 0] as const)));
  return {
    aggregateBacklog: (_id: string, buckets: readonly KpiHistoryBucket[]) =>
      zeros(buckets),
    aggregateEventMetric: (
      _id: string,
      _metric: unknown,
      buckets: readonly KpiHistoryBucket[],
    ) => zeros(buckets),
    aggregateActiveInternalByCategory: () => Promise.resolve([]),
    aggregateActiveExternalByCoordination: () => Promise.resolve([]),
    aggregateActiveByKind: (id: string, buckets: readonly KpiHistoryBucket[]) =>
      Promise.resolve(
        new Map(
          buckets.map((bucket) => {
            const cut = ms(bucket.endExclusiveIso);
            const mine = situations.filter(
              (s) => inLoadUniverse(s, id) && activeAt(s, cut),
            );
            return [
              bucket.end,
              {
                internal: mine.filter(
                  (s) => kindOf(s) === SituationReportKind.INTERNAL,
                ).length,
                external: mine.filter(
                  (s) => kindOf(s) === SituationReportKind.INTER_COORDINATION,
                ).length,
              },
            ] as const;
          }),
        ),
      ),
  };
}

/** Antigüedad en memoria: mismos predicados, orden y límite que el SQL, para un ALCANCE. */
function inMemoryAging(situations: Fixture[]) {
  const universe = (scope: string, refDate: string) => {
    const owners = [scope];
    return situations
      .filter(
        (s) =>
          owners.includes(owner(s)) &&
          inLoadUniverse(s, owner(s)) &&
          activeAt(s, cutOf(refDate)),
      )
      .map((s) => ({
        s,
        ageDays: daysBetween(bogotaYmd(s.createdAt), refDate),
      }));
  };
  return {
    aggregateSummary: (
      scope: string,
      refDate: string,
    ): Promise<KpiAgingSummaryRow> => {
      const ages = universe(scope, refDate)
        .map((u) => u.ageDays)
        .sort((a, b) => a - b);
      const n = ages.length;
      const median =
        n === 0
          ? null
          : n % 2 === 1
            ? ages[(n - 1) / 2]
            : (ages[n / 2 - 1] + ages[n / 2]) / 2;
      const band = (lo: number, hi: number) =>
        ages.filter((a) => a >= lo && a <= hi).length;
      return Promise.resolve({
        activeCount: n,
        medianAgeDays: median,
        bands: [
          { key: '0-7', count: band(0, 7) },
          { key: '8-14', count: band(8, 14) },
          { key: '15-30', count: band(15, 30) },
          { key: '31+', count: band(31, Number.POSITIVE_INFINITY) },
        ],
      });
    },
    findOldest: (
      scope: string,
      refDate: string,
    ): Promise<KpiAgingOldestRow[]> =>
      Promise.resolve(
        universe(scope, refDate)
          .sort(
            (a, b) =>
              ms(a.s.createdAt) - ms(b.s.createdAt) ||
              a.s.id.localeCompare(b.s.id),
          )
          .slice(0, KPI_AGING_TOP_LIMIT)
          .map(({ s, ageDays }) => ({
            id: s.id,
            title: s.title ?? `Problema ${s.id}`,
            createdAt: new Date(s.createdAt).toISOString(),
            ageDays,
            severity: s.severity ?? SituationSeverity.MEDIUM,
            status:
              s.status ??
              (s.closedAt ? SituationStatus.CLOSED : SituationStatus.OPEN),
            reportKind: kindOf(s),
            closedAt: s.closedAt ? new Date(s.closedAt).toISOString() : null,
            dueAt: s.dueAt ? new Date(s.dueAt).toISOString() : null,
            categoryId: null,
            categoryName: s.categoryName ?? null,
            affectedCoordinationName:
              kindOf(s) === SituationReportKind.INTERNAL
                ? null
                : (NAMES[s.affectedCoordinationId ?? ''] ?? null),
          })),
      ),
  };
}

/** Snapshot en memoria: MISMA población que Carga, por severidad y status actual. */
function inMemorySnapshot(situations: Fixture[]) {
  return {
    aggregateComposition: (id: string, refDate: string) => {
      const cut = cutOf(refDate);
      const pop = situations.filter(
        (s) => inLoadUniverse(s, id) && activeAt(s, cut),
      );
      const sev = (v: SituationSeverity) =>
        pop.filter((s) => (s.severity ?? SituationSeverity.MEDIUM) === v)
          .length;
      const still = pop.filter((s) => !s.closedAt);
      const status = (s: Fixture) => s.status ?? SituationStatus.OPEN;
      return Promise.resolve({
        activeCount: pop.length,
        severity: {
          low: sev(SituationSeverity.LOW),
          medium: sev(SituationSeverity.MEDIUM),
          high: sev(SituationSeverity.HIGH),
          critical: sev(SituationSeverity.CRITICAL),
        },
        attention: {
          open: still.filter((s) => status(s) === SituationStatus.OPEN).length,
          inProgress: still.filter((s) =>
            [SituationStatus.IN_PROGRESS, SituationStatus.RESOLVED].includes(
              status(s),
            ),
          ).length,
          closedAfterCut: pop.filter((s) => s.closedAt).length,
          unclassified: still.filter(
            (s) => status(s) === SituationStatus.CLOSED,
          ).length,
        },
      });
    },
  };
}

/** Coordinaciones conocidas por el repositorio de coordinaciones del test. */
const CATALOG = [AREA, SERVICIOS];

function serviceWith(situations: Fixture[]) {
  const coordinationsRepository = {
    findActiveById: (id: string) =>
      Promise.resolve(
        CATALOG.includes(id) ? { id, code: CODES[id], isActive: true } : null,
      ),
  };
  const service = new OperationalKpiService(
    coordinationsRepository as unknown as CoordinationsRepository,
    {} as OperationalOverviewRepository,
    new OperationalScopeService(),
    inMemoryHistory(situations) as unknown as OperationalKpiHistoryRepository,
    {} as never,
    {} as never,
    {
      aggregateCommitments: () => Promise.resolve([]),
      aggregateDependencies: () => Promise.resolve([]),
    } as never,
    {} as never,
    inMemoryAging(situations) as unknown as OperationalKpiAgingRepository,
    inMemorySnapshot(situations) as never,
    emptyResolutionRepository() as never,
  );
  return service;
}

const { WEEK, MONTH, CYCLE } = OperationalKpiEstadoPeriodKind;

function query(
  kind: OperationalKpiEstadoPeriodKind,
  from: string,
  to: string,
  calendarEnd: string,
  coordinationId = AREA,
): OperationalKpiStateQueryDto {
  return {
    scope: OperationalKpiScopeType.COORDINATION,
    coordinationId,
    kind,
    from,
    to,
    calendarEnd,
  };
}

/** Octubre en curso (corte hoy), septiembre histórico (corte 30 sep). */
const OCT_NOW = query(MONTH, '2026-10-01', '2026-10-07', '2026-10-31');
const SEP = query(MONTH, '2026-09-01', '2026-09-30', '2026-09-30');
const H2_NOW = query(CYCLE, '2026-07-01', '2026-10-07', '2026-12-31');
const WEEK_PAST = query(WEEK, '2026-09-21', '2026-09-27', '2026-09-27');
const WEEK_NOW = query(WEEK, '2026-10-05', '2026-10-07', '2026-10-11');

/** active.total del ÚLTIMO bucket no futuro de Carga. */
function lastLoad(response: OperationalKpiStateResponseDto): number {
  const known = response.evolution.buckets.filter((b) => !b.future);
  return known.at(-1)?.active?.total ?? -1;
}

const ids = (aging: { oldest: Array<{ id: string }> }) =>
  aging.oldest.map((item) => item.id);

beforeEach(() => {
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

describe('SQL de Antigüedad (repositorio)', () => {
  function capture(rows: unknown[] = []) {
    const query = jest.fn().mockResolvedValue(rows);
    const repository = new OperationalKpiAgingRepository({
      manager: { query },
    } as never);
    return { query, repository };
  }

  it('alcance coordinación: universo de Carga con corte semiabierto T, sin filtrar por status', async () => {
    const { query: q, repository } = capture();
    q.mockResolvedValueOnce([{ active_count: 0 }]);
    await repository.aggregateSummary(AREA, '2026-10-31');
    await repository.findOldest(AREA, '2026-10-31');

    for (const [sql, params] of q.mock.calls as Array<[string, unknown[]]>) {
      expect(sql).toContain('s.coordination_id = $1');
      expect(sql).toContain('s.created_at < $2::timestamptz');
      expect(sql).toContain(
        '(s.closed_at IS NULL OR s.closed_at >= $2::timestamptz)',
      );
      expect(sql).toContain('s.report_kind = $4');
      expect(sql).toContain('s.affected_coordination_id IS DISTINCT FROM $1');
      expect(sql).not.toMatch(/s\.status\s*(=|IN)/i);
      expect(params).toEqual([
        AREA,
        '2026-11-01T05:00:00.000Z',
        '2026-10-31',
        SituationReportKind.INTERNAL,
        SituationReportKind.INTER_COORDINATION,
      ]);
    }
  });

  it('edad en días calendario Bogotá: refDate − fecha local de created_at', async () => {
    const { query: q, repository } = capture();
    await repository.findOldest(AREA, '2026-10-07');
    const [sql] = q.mock.calls[0] as [string];
    expect(sql).toContain(
      "($3::date - (s.created_at AT TIME ZONE 'America/Bogota')::date) AS age_days",
    );
  });

  it('mediana con percentile_cont en SQL (no promedio) y null sin activos', async () => {
    const { query: q, repository } = capture([
      {
        active_count: '0',
        median_age_days: null,
        band_0_7: 0,
        band_8_14: 0,
        band_15_30: 0,
        band_31: 0,
      },
    ]);
    const summary = await repository.aggregateSummary(AREA, '2026-10-07');
    const [sql] = q.mock.calls[0] as [string];
    expect(sql).toContain(
      'percentile_cont(0.5) WITHIN GROUP (ORDER BY age_days)',
    );
    expect(sql).not.toMatch(/\bavg\(/i);
    expect(summary.medianAgeDays).toBeNull();
    expect(summary.activeCount).toBe(0);
  });

  it('rangos de Fase 1 fijados: ≤7 · 8–14 · 15–30 · ≥31, partición sin huecos ni solapes', async () => {
    const { query: q, repository } = capture([{ active_count: 0 }]);
    const summary = await repository.aggregateSummary(AREA, '2026-10-07');
    const [sql] = q.mock.calls[0] as [string];
    expect(sql).toContain('FILTER (WHERE age_days <= 7)');
    expect(sql).toContain('FILTER (WHERE age_days BETWEEN 8 AND 14)');
    expect(sql).toContain('FILTER (WHERE age_days BETWEEN 15 AND 30)');
    expect(sql).toContain('FILTER (WHERE age_days >= 31)');
    expect(summary.bands.map((band) => band.key)).toEqual([
      '0-7',
      '8-14',
      '15-30',
      '31+',
    ]);
    const inBand = [
      (a: number) => a <= 7,
      (a: number) => a >= 8 && a <= 14,
      (a: number) => a >= 15 && a <= 30,
      (a: number) => a >= 31,
    ];
    for (let age = 0; age <= 400; age += 1) {
      expect(inBand.filter((test) => test(age))).toHaveLength(1);
    }
  });

  it('normaliza tipos de pg (bigint en texto, Date) a número e ISO', async () => {
    const { repository } = capture([
      {
        id: 'x',
        title: 'Falla',
        createdAt: new Date('2026-08-25T14:00:00Z'),
        ageDays: '43',
        severity: 'CRITICAL',
        status: 'IN_PROGRESS',
        reportKind: 'INTERNAL',
        closedAt: null,
        dueAt: new Date('2026-08-26T14:00:00Z'),
        categoryId: null,
        categoryName: null,
        affectedCoordinationName: null,
      },
    ]);
    const [row] = await repository.findOldest(AREA, '2026-10-07');
    expect(row.ageDays).toBe(43);
    expect(row.createdAt).toBe('2026-08-25T14:00:00.000Z');
    expect(row.dueAt).toBe('2026-08-26T14:00:00.000Z');
  });
});

describe('buildEstadoAging (fiabilidad de status y SLA)', () => {
  const summary: KpiAgingSummaryRow = {
    activeCount: 1,
    medianAgeDays: 43,
    bands: [
      { key: '0-7', count: 0 },
      { key: '8-14', count: 0 },
      { key: '15-30', count: 0 },
      { key: '31+', count: 1 },
    ],
  };
  const row = (over: Partial<KpiAgingOldestRow> = {}): KpiAgingOldestRow => ({
    id: 'x',
    title: 'Falla en matrícula',
    createdAt: '2026-08-25T14:00:00.000Z',
    ageDays: 43,
    severity: SituationSeverity.CRITICAL,
    status: SituationStatus.IN_PROGRESS,
    reportKind: SituationReportKind.INTERNAL,
    closedAt: null,
    dueAt: '2026-08-26T14:00:00.000Z',
    categoryId: 'cat',
    categoryName: 'Admisiones',
    affectedCoordinationName: null,
    ...over,
  });

  it('corte hoy: status vivo y SLA con la regla actual', () => {
    const aging = buildEstadoAging({
      at: '2026-10-07',
      isNow: true,
      summary,
      oldest: [row()],
      now: NOW,
    });
    expect(aging.reliability).toEqual({ status: 'current', sla: 'current' });
    expect(aging.oldest[0]).toMatchObject({
      status: 'IN_PROGRESS',
      slaOverdue: true,
      closedAfterCutAt: null,
      categoryName: 'Admisiones',
      affectedCoordinationName: null,
    });
  });

  it('corte hoy: RESOLVED legado se presenta como IN_PROGRESS; due futuro no está vencido', () => {
    const aging = buildEstadoAging({
      at: '2026-10-07',
      isNow: true,
      summary,
      oldest: [
        row({
          status: SituationStatus.RESOLVED,
          dueAt: '2026-12-01T00:00:00.000Z',
        }),
      ],
      now: NOW,
    });
    expect(aging.oldest[0].status).toBe('IN_PROGRESS');
    expect(aging.oldest[0].slaOverdue).toBe(false);
  });

  it('corte histórico: NO afirma status ni SLA; sí «solucionado después»', () => {
    const aging = buildEstadoAging({
      at: '2026-09-30',
      isNow: false,
      summary,
      oldest: [
        row({
          status: SituationStatus.CLOSED,
          closedAt: '2026-11-12T15:00:00.000Z',
        }),
        row({ id: 'y', status: SituationStatus.OPEN, closedAt: null }),
      ],
      now: NOW,
    });
    expect(aging.reliability).toEqual({
      status: 'unavailable',
      sla: 'unavailable',
    });
    expect(aging.oldest.map((item) => item.status)).toEqual([null, null]);
    expect(aging.oldest.map((item) => item.slaOverdue)).toEqual([null, null]);
    expect(aging.oldest.map((item) => item.closedAfterCutAt)).toEqual([
      '2026-11-12T15:00:00.000Z',
      null,
    ]);
  });

  it('INTERNAL sin categoría → «Sin categoría»; INTER → afectada, sin categoría', () => {
    const aging = buildEstadoAging({
      at: '2026-10-07',
      isNow: true,
      summary,
      oldest: [
        row({ categoryId: null, categoryName: null }),
        row({
          id: 'inter',
          reportKind: SituationReportKind.INTER_COORDINATION,
          categoryName: null,
          affectedCoordinationName: 'Bienestar',
        }),
      ],
      now: NOW,
    });
    expect(aging.oldest[0].categoryName).toBe('Sin categoría');
    expect(aging.oldest[1]).toMatchObject({
      categoryName: null,
      affectedCoordinationName: 'Bienestar',
    });
  });
});

describe('ANTIGÜEDAD · scope COORDINACIÓN (GET /operational-kpis/state → aging)', () => {
  const OLD_OPEN: Fixture = {
    id: 'old-open',
    createdAt: '2026-08-05T09:00:00-05:00',
  };
  const agingFor = async (situations: Fixture[], q = OCT_NOW) =>
    (await serviceWith(situations).getState(q, DIRECTOR)).aging;

  it('1 · problema antiguo abierto de la coordinación aparece, con su edad al corte', async () => {
    const r = await serviceWith([OLD_OPEN]).getState(OCT_NOW, DIRECTOR);
    expect(r.aging).toMatchObject({
      semantics: 'active-at-cut-age-since-created',
      at: '2026-10-07',
      isNow: true,
      activeCount: 1,
    });
    expect(r.aging.oldest[0]).toMatchObject({ id: 'old-open', ageDays: 63 });
  });

  it('2 · solo la coordinación seleccionada: otra coordinación queda excluida', async () => {
    const situations: Fixture[] = [
      OLD_OPEN,
      {
        id: 'svc',
        createdAt: '2026-07-01T09:00:00-05:00',
        coordinationId: SERVICIOS,
      },
    ];
    const area = await agingFor(situations);
    expect(ids(area)).toEqual(['old-open']);
    const svc = (
      await serviceWith(situations).getState(
        query(MONTH, '2026-10-01', '2026-10-07', '2026-10-31', SERVICIOS),
        DIRECTOR,
      )
    ).aging;
    expect(ids(svc)).toEqual(['svc']);
  });

  it('3 · cerrado antes del corte no aparece; cerrado DESPUÉS aparece en el histórico', async () => {
    expect(
      (await agingFor([{ ...OLD_OPEN, closedAt: '2026-09-15T10:00:00-05:00' }]))
        .activeCount,
    ).toBe(0);
    const sep = await agingFor(
      [
        {
          ...OLD_OPEN,
          closedAt: '2026-10-02T10:00:00-05:00',
          status: SituationStatus.CLOSED,
        },
      ],
      SEP,
    );
    expect(sep).toMatchObject({
      at: '2026-09-30',
      isNow: false,
      activeCount: 1,
    });
    expect(sep.oldest[0]).toMatchObject({
      ageDays: 56,
      closedAfterCutAt: '2026-10-02T15:00:00.000Z',
      status: null,
      slaOverdue: null,
    });
    expect(sep.reliability).toEqual({
      status: 'unavailable',
      sla: 'unavailable',
    });
  });

  it('4 · RESOLVED heredado sin closed_at sigue activo', async () => {
    const r = await agingFor([
      { ...OLD_OPEN, status: SituationStatus.RESOLVED },
    ]);
    expect(r.activeCount).toBe(1);
    expect(r.oldest[0].status).toBe('IN_PROGRESS');
  });

  it('5 · INTER donde X es solo afectada queda excluido', async () => {
    const r = await agingFor([
      {
        id: 'dep',
        createdAt: '2026-08-01T09:00:00-05:00',
        reportKind: SituationReportKind.INTER_COORDINATION,
        coordinationId: SERVICIOS,
        affectedCoordinationId: AREA,
      },
    ]);
    expect(r.activeCount).toBe(0);
  });

  it('6 · INTERNAL incluido con su categoría', async () => {
    const r = await agingFor([{ ...OLD_OPEN, categoryName: 'Admisiones' }]);
    expect(r.oldest[0]).toMatchObject({
      reportKind: 'INTERNAL',
      categoryName: 'Admisiones',
    });
  });

  it('7 · INTER con X responsable incluido, con su afectada', async () => {
    const r = await agingFor([
      {
        id: 'commit',
        createdAt: '2026-09-01T09:00:00-05:00',
        reportKind: SituationReportKind.INTER_COORDINATION,
        affectedCoordinationId: SERVICIOS,
      },
    ]);
    expect(r.oldest[0]).toMatchObject({
      id: 'commit',
      reportKind: 'INTER_COORDINATION',
      affectedCoordinationName: 'Servicios',
      categoryName: null,
    });
  });

  it('8 · edad Bogotá cerca de medianoche: 23:30 local cuenta para ese día', async () => {
    const r = await agingFor([
      { id: 'late', createdAt: '2026-10-06T23:30:00-05:00' },
      { id: 'today', createdAt: '2026-10-07T00:10:00-05:00' },
    ]);
    expect(r.oldest.map((item) => [item.id, item.ageDays])).toEqual([
      ['late', 1],
      ['today', 0],
    ]);
  });

  it('9 · orden created_at ASC, id ASC; la severidad no desempata; LIMIT 5', async () => {
    const r = await agingFor([
      {
        id: 'b-critical',
        createdAt: '2026-09-10T09:00:00-05:00',
        severity: SituationSeverity.CRITICAL,
      },
      {
        id: 'a-low',
        createdAt: '2026-09-10T09:00:00-05:00',
        severity: SituationSeverity.LOW,
      },
      { id: 'c-later', createdAt: '2026-09-10T15:00:00-05:00' },
      { id: 'z-oldest', createdAt: '2026-08-01T09:00:00-05:00' },
      { id: 'd', createdAt: '2026-09-11T09:00:00-05:00' },
      { id: 'e', createdAt: '2026-09-12T09:00:00-05:00' },
    ]);
    expect(ids(r)).toEqual(['z-oldest', 'a-low', 'b-critical', 'c-later', 'd']);
    expect(r.activeCount).toBe(6);
  });

  it('10 · mediana y rangos de la carga de la coordinación (no solo del top 5)', async () => {
    const ages = [63, 43, 31, 18, 9, 3, 0];
    const r = await agingFor(
      ages.map((age, i) => ({
        id: `p${i}`,
        createdAt: new Date(
          ms('2026-10-07T08:00:00-05:00') - age * 86_400_000,
        ).toISOString(),
      })),
    );
    expect(r.activeCount).toBe(7);
    expect(r.medianAgeDays).toBe(18);
    expect(r.bands).toEqual([
      { key: '0-7', count: 2 },
      { key: '8-14', count: 1 },
      { key: '15-30', count: 1 },
      { key: '31+', count: 3 },
    ]);
  });

  it('11 · cuadratura: aging.activeCount = Carga (último bucket) = snapshot = Σ bands', async () => {
    const mix: Fixture[] = [
      OLD_OPEN,
      {
        id: 'closed-sep',
        createdAt: '2026-08-20T09:00:00-05:00',
        closedAt: '2026-09-25T09:00:00-05:00',
      },
      {
        id: 'closed-oct',
        createdAt: '2026-09-02T09:00:00-05:00',
        closedAt: '2026-10-03T09:00:00-05:00',
      },
      {
        id: 'resolved',
        createdAt: '2026-09-05T09:00:00-05:00',
        status: SituationStatus.RESOLVED,
      },
      {
        id: 'commit',
        createdAt: '2026-09-20T09:00:00-05:00',
        reportKind: SituationReportKind.INTER_COORDINATION,
        affectedCoordinationId: SERVICIOS,
      },
      {
        id: 'dep',
        createdAt: '2026-09-21T09:00:00-05:00',
        reportKind: SituationReportKind.INTER_COORDINATION,
        coordinationId: SERVICIOS,
        affectedCoordinationId: AREA,
      },
      {
        id: 'foreign',
        createdAt: '2026-09-22T09:00:00-05:00',
        coordinationId: SERVICIOS,
      },
      { id: 'week', createdAt: '2026-10-06T09:00:00-05:00' },
      { id: 'late-night', createdAt: '2026-09-27T23:59:00-05:00' },
    ];
    const service = serviceWith(mix);
    for (const q of [OCT_NOW, SEP, H2_NOW, WEEK_PAST, WEEK_NOW]) {
      const r = await service.getState(q, DIRECTOR);
      expect(r.aging.activeCount).toBe(lastLoad(r));
      expect(r.snapshot.activeCount).toBe(r.aging.activeCount);
      expect(r.aging.bands.reduce((sum, band) => sum + band.count, 0)).toBe(
        r.aging.activeCount,
      );
      expect(r.aging.at).toBe(r.period.dataTo);
      expect(r.snapshot.at).toBe(r.aging.at);
    }
  });

  it('12 · cambiar de coordinación cambia la lectura en el MISMO periodo', async () => {
    const service = serviceWith([
      OLD_OPEN,
      {
        id: 'svc-a',
        createdAt: '2026-09-02T09:00:00-05:00',
        coordinationId: SERVICIOS,
      },
      {
        id: 'svc-b',
        createdAt: '2026-09-20T09:00:00-05:00',
        coordinationId: SERVICIOS,
      },
    ]);
    const area = await service.getState(SEP, DIRECTOR);
    const svc = await service.getState(
      { ...SEP, coordinationId: SERVICIOS },
      DIRECTOR,
    );
    expect(area.aging.at).toBe(svc.aging.at);
    expect(ids(area.aging)).toEqual(['old-open']);
    expect(ids(svc.aging)).toEqual(['svc-a', 'svc-b']);
    expect(svc.aging.medianAgeDays).not.toBe(area.aging.medianAgeDays);
  });

  it('13 · el periodo cambia la lectura: H2 (hoy) / SEP / semana pasada', async () => {
    const service = serviceWith([
      OLD_OPEN,
      {
        id: 'closed-oct',
        createdAt: '2026-09-02T09:00:00-05:00',
        closedAt: '2026-10-03T09:00:00-05:00',
      },
      { id: 'new', createdAt: '2026-10-05T09:00:00-05:00' },
    ]);
    const now = (await service.getState(H2_NOW, DIRECTOR)).aging;
    const sep = (await service.getState(SEP, DIRECTOR)).aging;
    const week = (await service.getState(WEEK_PAST, DIRECTOR)).aging;
    expect([now.at, sep.at, week.at]).toEqual([
      '2026-10-07',
      '2026-09-30',
      '2026-09-27',
    ]);
    expect(ids(now)).toEqual(['old-open', 'new']);
    expect(ids(sep)).toEqual(['old-open', 'closed-oct']);
    expect(week.oldest[0].ageDays).toBe(53);
  });

  it('14 · coordinación sin activos: vacía aunque otras coordinaciones tengan carga', async () => {
    const r = await agingFor([
      {
        id: 'svc',
        createdAt: '2026-07-01T09:00:00-05:00',
        coordinationId: SERVICIOS,
      },
    ]);
    expect(r).toMatchObject({
      activeCount: 0,
      medianAgeDays: null,
      oldest: [],
    });
  });
});

describe('ESTADO · snapshot (Severidad / Atención) sobre ACTIVE_AT_CUT (coordinación)', () => {
  const MIX: Fixture[] = [
    {
      id: 'a',
      createdAt: '2026-08-05T09:00:00-05:00',
      severity: SituationSeverity.HIGH,
      status: SituationStatus.IN_PROGRESS,
    },
    {
      id: 'b',
      createdAt: '2026-09-02T09:00:00-05:00',
      closedAt: '2026-10-03T09:00:00-05:00',
      severity: SituationSeverity.CRITICAL,
      status: SituationStatus.CLOSED,
    },
    {
      id: 'c',
      createdAt: '2026-09-20T09:00:00-05:00',
      severity: SituationSeverity.LOW,
    },
    {
      id: 'd',
      createdAt: '2026-10-06T09:00:00-05:00',
      severity: SituationSeverity.MEDIUM,
    },
    {
      id: 'e',
      createdAt: '2026-08-01T09:00:00-05:00',
      closedAt: '2026-09-10T09:00:00-05:00',
      severity: SituationSeverity.HIGH,
      status: SituationStatus.CLOSED,
    },
  ];

  it('periodo en curso: activos HOY, severidad y status exactos, sin «cerrados después»', async () => {
    const r = await serviceWith(MIX).getState(OCT_NOW, DIRECTOR);
    expect(r.aging.activeCount).toBe(r.snapshot.activeCount);
    expect(r.snapshot).toMatchObject({
      at: '2026-10-07',
      isNow: true,
      activeCount: 3,
      severity: { low: 1, medium: 1, high: 1, critical: 0 },
      attention: { open: 2, inProgress: 1, closedAfterCut: 0, unclassified: 0 },
      reliability: { severity: 'exact', attention: 'exact' },
    });
  });

  it('septiembre: la población es la del 30 SEP (incluye b, cerrado después) con valor actual', async () => {
    const r = await serviceWith(MIX).getState(SEP, DIRECTOR);
    expect(r.snapshot).toMatchObject({
      at: '2026-09-30',
      isNow: false,
      activeCount: 3,
      severity: { low: 1, medium: 0, high: 1, critical: 1 },
      attention: { open: 1, inProgress: 1, closedAfterCut: 1, unclassified: 0 },
      reliability: { severity: 'current-value', attention: 'current-value' },
    });
  });

  it('Carga (último punto) = Severidad = Atención en cada corte', async () => {
    const service = serviceWith(MIX);
    for (const q of [H2_NOW, SEP, WEEK_PAST]) {
      const r = await service.getState(q, DIRECTOR);
      const s = r.snapshot.severity;
      const a = r.snapshot.attention;
      expect(r.snapshot.activeCount).toBe(lastLoad(r));
      expect(s.low + s.medium + s.high + s.critical).toBe(lastLoad(r));
      expect(a.open + a.inProgress + a.closedAfterCut + a.unclassified).toBe(
        lastLoad(r),
      );
    }
  });
});
