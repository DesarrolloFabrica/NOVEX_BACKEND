import { emptyResolutionRepository } from './testing/empty-resolution-repository';
import { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import { UserStatus } from '../common/enums/identity.enums';
import { CoordinationsRepository } from '../coordinations/repositories/coordinations.repository';
import { OperationalOverviewRepository } from '../operational-overview/repositories/operational-overview.repository';
import {
  bogotaDayStartIso,
  type KpiHistoryBucket,
} from './domain/kpi-history-buckets';
import { KPI_UNCATEGORIZED_CATEGORY_ID } from './domain/kpi-uncategorized-category';
import { OperationalKpiHistoryMetric } from './dto/operational-kpi-history-query.dto';
import { OperationalKpiScopeType } from './dto/operational-kpi-query.dto';
import {
  OperationalKpiEstadoPeriodKind,
  OperationalKpiStateQueryDto,
} from './dto/operational-kpi-state-query.dto';
import { OperationalKpiHistoryRepository } from './operational-kpi-history.repository';
import { OperationalKpiService } from './operational-kpi.service';

/**
 * FLUJO DE PROBLEMAS · eventos frente a stock.
 *
 * - REPORTADOS (created): evento, solo en el bucket donde nació.
 * - SOLUCIONADOS (closed): evento, solo en el bucket donde cerró.
 * - PENDIENTES (backlog): stock al cierre del bucket; un problema abierto
 *   aparece en TODOS los buckets hasta su cierre real, aunque su created_at
 *   pertenezca a otra semana.
 *
 * El repositorio en memoria aplica los mismos cortes que el SQL
 * (operational-kpi-history.repository.ts):
 *   eventos  → col >= inicio(start) AND col < endExclusive
 *   backlog  → created_at < endExclusive AND (closed_at IS NULL OR closed_at >= endExclusive)
 */

const AREA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
/** Martes 6 oct 2026, 10:00 Bogotá. */
const NOW = new Date('2026-10-06T10:00:00-05:00');

const DIRECTOR: AuthPayload = {
  sub: 'director-1',
  email: 'director@cun.edu.co',
  roleId: 'role-director',
  roleCode: 'DIRECTOR',
  coordinationId: null,
  permissions: ['KPIS_VIEW'],
  status: UserStatus.ACTIVE,
};

type Category = {
  id: string;
  code: string;
  name: string;
  selectable: boolean;
};

type Situation = {
  createdAt: string;
  closedAt: string | null;
  /** Por defecto INTERNAL de la coordinación seleccionada (AREA). */
  reportKind?: 'INTERNAL' | 'INTER_COORDINATION';
  coordinationId?: string;
  affectedCoordinationId?: string | null;
  category?: Category | null;
};

const SABER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SERVICIOS = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OTRA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const COORDINATION_NAMES: Record<string, string> = {
  [SABER]: 'Saber Pro',
  [SERVICIOS]: 'Servicios',
  [OTRA]: 'Otra',
};

const ms = (iso: string) => Date.parse(iso);
const owner = (s: Situation) => s.coordinationId ?? AREA;
const kind = (s: Situation) => s.reportKind ?? 'INTERNAL';
/** Mismo predicado de stock que el SQL: activo al corte exclusivo T. */
const activeAt = (s: Situation, cut: number) =>
  ms(s.createdAt) < cut && (s.closedAt === null || ms(s.closedAt) >= cut);
const isExternalOf = (s: Situation, id: string) =>
  kind(s) === 'INTER_COORDINATION' && (s.affectedCoordinationId ?? null) !== id;

/**
 * Repositorio en memoria con las MISMAS reglas que el SQL de
 * operational-kpi-history.repository.ts (universo = responsable X).
 */
function inMemoryHistory(situations: Situation[]) {
  const calls: Record<string, number> = {};
  const count = (name: string) => {
    calls[name] = (calls[name] ?? 0) + 1;
  };
  return {
    calls,
    aggregateBacklog: (id: string, buckets: readonly KpiHistoryBucket[]) => {
      count('aggregateBacklog');
      return Promise.resolve(
        new Map(
          buckets.map((bucket) => {
            const cut = ms(bucket.endExclusiveIso);
            const total = situations.filter(
              (s) => owner(s) === id && activeAt(s, cut),
            ).length;
            return [bucket.end, total] as const;
          }),
        ),
      );
    },
    aggregateEventMetric: (
      id: string,
      metric: OperationalKpiHistoryMetric,
      buckets: readonly KpiHistoryBucket[],
    ) => {
      count('aggregateEventMetric:' + metric);
      return Promise.resolve(
        new Map(
          buckets.map((bucket) => {
            const from = ms(bogotaDayStartIso(bucket.start));
            const to = ms(bucket.endExclusiveIso);
            const total = situations.filter((s) => {
              if (owner(s) !== id) return false;
              const at =
                metric === OperationalKpiHistoryMetric.CREATED
                  ? s.createdAt
                  : s.closedAt;
              return at !== null && ms(at) >= from && ms(at) < to;
            }).length;
            return [bucket.end, total] as const;
          }),
        ),
      );
    },
    aggregateActiveByKind: (
      id: string,
      buckets: readonly KpiHistoryBucket[],
    ) => {
      count('aggregateActiveByKind');
      return Promise.resolve(
        new Map(
          buckets.map((bucket) => {
            const cut = ms(bucket.endExclusiveIso);
            const mine = situations.filter(
              (s) => owner(s) === id && activeAt(s, cut),
            );
            return [
              bucket.end,
              {
                internal: mine.filter((s) => kind(s) === 'INTERNAL').length,
                external: mine.filter((s) => isExternalOf(s, id)).length,
              },
            ] as const;
          }),
        ),
      );
    },
    aggregateActiveInternalByCategory: (
      id: string,
      buckets: readonly KpiHistoryBucket[],
    ) => {
      count('aggregateActiveInternalByCategory');
      return Promise.resolve(
        buckets.flatMap((bucket) => {
          const cut = ms(bucket.endExclusiveIso);
          const groups = new Map<
            string,
            { category: Category | null; n: number }
          >();
          for (const s of situations) {
            if (owner(s) !== id || kind(s) !== 'INTERNAL') continue;
            if (!activeAt(s, cut)) continue;
            const key = s.category?.id ?? 'null';
            const prev = groups.get(key) ?? {
              category: s.category ?? null,
              n: 0,
            };
            groups.set(key, { ...prev, n: prev.n + 1 });
          }
          return [...groups.values()].map(({ category, n }) => ({
            key: bucket.end,
            categoryId: category?.id ?? KPI_UNCATEGORIZED_CATEGORY_ID,
            categoryCode: category?.code ?? 'UNCATEGORIZED',
            categoryName: category?.name ?? 'Sin categoría',
            selectable: category?.selectable ?? false,
            count: n,
          }));
        }),
      );
    },
    aggregateActiveExternalByCoordination: (
      id: string,
      buckets: readonly KpiHistoryBucket[],
    ) => {
      count('aggregateActiveExternalByCoordination');
      return Promise.resolve(
        buckets.flatMap((bucket) => {
          const cut = ms(bucket.endExclusiveIso);
          const groups = new Map<string, number>();
          for (const s of situations) {
            if (owner(s) !== id || !isExternalOf(s, id)) continue;
            if (!activeAt(s, cut)) continue;
            const key = s.affectedCoordinationId ?? 'null';
            groups.set(key, (groups.get(key) ?? 0) + 1);
          }
          return [...groups.entries()].map(([affected, n]) => ({
            key: bucket.end,
            coordinationId: affected === 'null' ? null : affected,
            coordinationCode: affected === 'null' ? null : affected,
            coordinationName:
              COORDINATION_NAMES[affected] ?? 'Sin coordinación afectada',
            count: n,
          }));
        }),
      );
    },
  };
}

function serviceWith(
  situations: Situation[],
  repo = inMemoryHistory(situations),
) {
  return new OperationalKpiService(
    {
      findActiveById: () =>
        Promise.resolve({ id: AREA, code: 'coord-b2b', isActive: true }),
    } as unknown as CoordinationsRepository,
    {} as OperationalOverviewRepository,
    new OperationalScopeService(),
    repo as unknown as OperationalKpiHistoryRepository,
    {} as never,
    {
      aggregateComposition: () =>
        Promise.resolve({
          severity: { low: 0, medium: 0, high: 0, critical: 0 },
          attention: { open: 0, inProgress: 0 },
          registeredCount: 0,
        }),
    } as never,
    {
      aggregateCommitments: () => Promise.resolve([]),
      aggregateDependencies: () => Promise.resolve([]),
    } as never,
    {} as never,
    {
      aggregateSummary: () =>
        Promise.resolve({ activeCount: 0, medianAgeDays: null, bands: [] }),
      findOldest: () => Promise.resolve([]),
    } as never,
    {
      aggregateComposition: () =>
        Promise.resolve({
          activeCount: 0,
          severity: { low: 0, medium: 0, high: 0, critical: 0 },
          attention: {
            open: 0,
            inProgress: 0,
            closedAfterCut: 0,
            unclassified: 0,
          },
        }),
    } as never,
    emptyResolutionRepository() as never,
  );
}

function query(
  kind: OperationalKpiEstadoPeriodKind,
  from: string,
  to: string,
  calendarEnd: string,
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

/** Situación A: creada 1 sep, sin cerrar. */
const A: Situation = { createdAt: '2026-09-01T09:00:00-05:00', closedAt: null };
/** Situación B: creada 1 sep, cerrada 22 sep. */
const B: Situation = {
  createdAt: '2026-09-01T09:00:00-05:00',
  closedAt: '2026-09-22T16:00:00-05:00',
};

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

describe('Pendientes persisten hasta el cierre real (stock, no evento)', () => {
  it('A (abierta desde 1 sep) es pendiente en cada semana de septiembre y en octubre hasta hoy', async () => {
    const service = serviceWith([A]);
    const sep = await service.getState(
      query(MONTH, '2026-09-01', '2026-09-30', '2026-09-30'),
      DIRECTOR,
    );
    expect(sep.evolution.buckets.map((b) => b.backlog)).toEqual([
      1, 1, 1, 1, 1,
    ]);
    // Reportada una sola vez: solo en la semana donde nació.
    expect(sep.evolution.buckets.map((b) => b.created)).toEqual([
      1, 0, 0, 0, 0,
    ]);

    const oct = await service.getState(
      query(MONTH, '2026-10-01', '2026-10-06', '2026-10-31'),
      DIRECTOR,
    );
    const known = oct.evolution.buckets.filter((b) => !b.future);
    expect(known.map((b) => b.backlog)).toEqual([1, 1]);
    expect(oct.activeAtPeriodEnd).toEqual({
      count: 1,
      at: '2026-10-06',
      isNow: true,
    });
  });

  it('A no desaparece de la semana actual aunque se reportó en otra semana', async () => {
    const service = serviceWith([A]);
    const week = await service.getState(
      query(WEEK, '2026-10-05', '2026-10-06', '2026-10-11'),
      DIRECTOR,
    );
    expect(week.evolution.buckets.find((b) => b.created === 1)).toBeUndefined();
    expect(week.activeAtPeriodEnd.count).toBe(1);
    expect(week.activeAtPeriodEnd.isNow).toBe(true);
  });

  it.each([
    ['31 ago – 6 sep', '2026-08-31', '2026-09-06', 1],
    ['7 – 13 sep', '2026-09-07', '2026-09-13', 1],
    ['14 – 20 sep', '2026-09-14', '2026-09-20', 1],
    ['21 – 27 sep (cerró el 22)', '2026-09-21', '2026-09-27', 0],
    ['28 sep – 4 oct', '2026-09-28', '2026-10-04', 0],
  ])(
    'B (1 sep → 22 sep) pendiente al cierre de %s = %i',
    async (_name, from, to, expected) => {
      const service = serviceWith([B]);
      const week = await service.getState(query(WEEK, from, to, to), DIRECTOR);
      expect(week.activeAtPeriodEnd).toEqual({
        count: expected,
        at: to,
        isNow: false,
      });
    },
  );

  it('B: solucionado = 1 solo en el bucket que contiene el 22 sep; pendiente antes, no después', async () => {
    const service = serviceWith([B]);
    const sep = await service.getState(
      query(MONTH, '2026-09-01', '2026-09-30', '2026-09-30'),
      DIRECTOR,
    );
    const rows = sep.evolution.buckets.map(
      ({ label, created, closed, backlog }) => ({
        label,
        created,
        closed,
        backlog,
      }),
    );
    expect(rows).toEqual([
      { label: '1–6 sep', created: 1, closed: 0, backlog: 1 },
      { label: '7–13 sep', created: 0, closed: 0, backlog: 1 },
      { label: '14–20 sep', created: 0, closed: 0, backlog: 1 },
      { label: '21–27 sep', created: 0, closed: 1, backlog: 0 },
      { label: '28–30 sep', created: 0, closed: 0, backlog: 0 },
    ]);
    expect(sep.activeAtPeriodEnd).toEqual({
      count: 0,
      at: '2026-09-30',
      isNow: false,
    });
  });

  it('día a día: B pendiente el 21 sep y ya no el 22 (cierre ese día)', async () => {
    const service = serviceWith([B]);
    const week = await service.getState(
      query(WEEK, '2026-09-21', '2026-09-27', '2026-09-27'),
      DIRECTOR,
    );
    const [mon, tue] = week.evolution.buckets;
    expect(mon).toMatchObject({ start: '2026-09-21', backlog: 1, closed: 0 });
    expect(tue).toMatchObject({ start: '2026-09-22', backlog: 0, closed: 1 });
  });
});

describe('Casillas del flujo (geometría completa + metadatos de drill-down)', () => {
  it('ciclo H2 en curso: 6 meses; NOV/DIC futuros sin ceros fingidos; OCT actual', async () => {
    const service = serviceWith([A]);
    const h2 = await service.getState(
      query(CYCLE, '2026-07-01', '2026-10-06', '2026-12-31'),
      DIRECTOR,
    );
    const buckets = h2.evolution.buckets;
    expect(buckets.map((b) => b.label)).toEqual([
      'Jul 2026',
      'Ago 2026',
      'Sep 2026',
      'Oct 2026',
      'Nov 2026',
      'Dic 2026',
    ]);
    expect(buckets.map((b) => b.future)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
    expect(buckets[4]).toMatchObject({
      created: null,
      closed: null,
      backlog: null,
      dataEnd: null,
    });
    expect(buckets[3]).toMatchObject({
      current: true,
      dataEnd: '2026-10-06',
      calendarStart: '2026-10-01',
      calendarEnd: '2026-10-31',
    });
    // Compatibilidad: las series previas siguen cubriendo solo hasta hoy.
    expect(h2.evolution.created).toHaveLength(4);
  });

  it('mes: «1–4 oct» lleva la semana calendario completa 28 sep – 4 oct', async () => {
    const service = serviceWith([]);
    const oct = await service.getState(
      query(MONTH, '2026-10-01', '2026-10-06', '2026-10-31'),
      DIRECTOR,
    );
    const [first, second, third] = oct.evolution.buckets;
    expect(first).toMatchObject({
      start: '2026-10-01',
      end: '2026-10-04',
      label: '1–4 oct',
      calendarStart: '2026-09-28',
      calendarEnd: '2026-10-04',
      future: false,
    });
    expect(second).toMatchObject({
      start: '2026-10-05',
      end: '2026-10-11',
      dataEnd: '2026-10-06',
      label: '5–11 oct',
      current: true,
      calendarStart: '2026-10-05',
      calendarEnd: '2026-10-11',
    });
    expect(third).toMatchObject({ future: true, created: null });
    expect(oct.evolution.buckets.at(-1)).toMatchObject({
      start: '2026-10-26',
      end: '2026-10-31',
      calendarEnd: '2026-11-01',
    });
  });

  it('semana: 7 días; los posteriores a hoy son futuros', async () => {
    const service = serviceWith([]);
    const week = await service.getState(
      query(WEEK, '2026-10-05', '2026-10-06', '2026-10-11'),
      DIRECTOR,
    );
    expect(week.evolution.buckets).toHaveLength(7);
    expect(week.evolution.buckets.map((b) => b.future)).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(week.evolution.buckets[1]).toMatchObject({
      calendarStart: '2026-10-06',
      calendarEnd: '2026-10-06',
      current: true,
    });
  });
});

describe('CARGA DE PROBLEMAS · activos (stock) internos / externos y solucionados (evento)', () => {
  const INTERNET: Category = {
    id: 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',
    code: 'internet',
    name: 'Internet',
    selectable: true,
  };
  const ACAS: Category = {
    id: 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2',
    code: 'acas',
    name: 'ACAS',
    selectable: true,
  };
  const H2 = query(CYCLE, '2026-07-01', '2026-10-06', '2026-12-31');
  const SEP = query(MONTH, '2026-09-01', '2026-09-30', '2026-09-30');
  type ActiveLike = {
    active: { internal: number; external: number; total: number } | null;
  };
  const actives = (buckets: ActiveLike[]) =>
    buckets.map((b) =>
      b.active ? [b.active.internal, b.active.external, b.active.total] : null,
    );

  it('interno creado 1 sep y abierto: activo en sep y oct (no en agosto); futuros null', async () => {
    const h2 = await serviceWith([A]).getState(H2, DIRECTOR);
    expect(actives(h2.evolution.buckets)).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [1, 0, 1],
      [1, 0, 1],
      null,
      null,
    ]);
    expect(h2.evolution.buckets[4]).toMatchObject({
      future: true,
      active: null,
      solved: null,
    });
  });

  it('externo (INTER, responsable B2B, afecta Saber Pro) persiste como externo de B2B', async () => {
    const external: Situation = {
      createdAt: '2026-09-01T09:00:00-05:00',
      closedAt: null,
      reportKind: 'INTER_COORDINATION',
      affectedCoordinationId: SABER,
    };
    const sep = await serviceWith([external]).getState(SEP, DIRECTOR);
    expect(actives(sep.evolution.buckets)).toEqual([
      [0, 1, 1],
      [0, 1, 1],
      [0, 1, 1],
      [0, 1, 1],
      [0, 1, 1],
    ]);
    expect(sep.evolution.buckets[0].active?.externalBreakdown).toEqual([
      {
        coordinationId: SABER,
        coordinationCode: SABER,
        coordinationName: 'Saber Pro',
        count: 1,
      },
    ]);
  });

  it('lo que B2B sufre de otra área (responsable otra, afectada B2B) NO es carga de B2B', async () => {
    const dependency: Situation = {
      createdAt: '2026-09-01T09:00:00-05:00',
      closedAt: null,
      reportKind: 'INTER_COORDINATION',
      coordinationId: OTRA,
      affectedCoordinationId: AREA,
    };
    const sep = await serviceWith([dependency]).getState(SEP, DIRECTOR);
    expect(sep.evolution.buckets.every((b) => b.active?.total === 0)).toBe(
      true,
    );
    expect(sep.evolution.buckets.every((b) => b.solved?.total === 0)).toBe(
      true,
    );
  });

  it('al cerrar (22 sep) deja de estar activo después de T y suma 1 solucionado en ese bucket', async () => {
    const sep = await serviceWith([B]).getState(SEP, DIRECTOR);
    expect(sep.evolution.buckets.map((b) => b.active?.total)).toEqual([
      1, 1, 1, 0, 0,
    ]);
    expect(sep.evolution.buckets.map((b) => b.solved?.total)).toEqual([
      0, 0, 0, 1, 0,
    ]);
  });

  it('solucionado = evento de cierre: creado en agosto y cerrado en octubre cuenta en octubre', async () => {
    const lateClose: Situation = {
      createdAt: '2026-08-10T09:00:00-05:00',
      closedAt: '2026-10-02T11:00:00-05:00',
      reportKind: 'INTER_COORDINATION',
      affectedCoordinationId: SERVICIOS,
    };
    const h2 = await serviceWith([lateClose]).getState(H2, DIRECTOR);
    expect(h2.evolution.buckets.map((b) => b.solved?.total ?? null)).toEqual([
      0,
      0,
      0,
      1,
      null,
      null,
    ]);
    // Stock: externo activo al cierre de agosto y septiembre; ya no al de octubre.
    expect(h2.evolution.buckets.map((b) => b.active?.external ?? null)).toEqual(
      [0, 1, 1, 0, null, null],
    );
  });

  it('desglose interno por categoría (count DESC, nombre ASC) con «Sin categoría»', async () => {
    const internal = (category: Category | null): Situation => ({
      createdAt: '2026-09-03T09:00:00-05:00',
      closedAt: null,
      category,
    });
    const sep = await serviceWith([
      internal(INTERNET),
      internal(INTERNET),
      internal(ACAS),
      internal(null),
    ]).getState(SEP, DIRECTOR);
    const last = sep.evolution.buckets.at(-1)!;
    expect(last.active?.internal).toBe(4);
    expect(
      last.active?.internalBreakdown.map((row) => [
        row.categoryName,
        row.count,
      ]),
    ).toEqual([
      ['Internet', 2],
      ['ACAS', 1],
      ['Sin categoría', 1],
    ]);
    expect(last.active?.internalBreakdown[2].categoryId).toBe(
      KPI_UNCATEGORIZED_CATEGORY_ID,
    );
  });

  it('desglose externo por coordinación afectada (Saber Pro 2, Servicios 1)', async () => {
    const inter = (affected: string): Situation => ({
      createdAt: '2026-09-03T09:00:00-05:00',
      closedAt: null,
      reportKind: 'INTER_COORDINATION',
      affectedCoordinationId: affected,
    });
    const sep = await serviceWith([
      inter(SERVICIOS),
      inter(SABER),
      inter(SABER),
    ]).getState(SEP, DIRECTOR);
    const last = sep.evolution.buckets.at(-1)!;
    expect(last.active?.external).toBe(3);
    expect(
      last.active?.externalBreakdown.map((row) => [
        row.coordinationName,
        row.count,
      ]),
    ).toEqual([
      ['Saber Pro', 2],
      ['Servicios', 1],
    ]);
  });

  it('el número de consultas no crece con los buckets (ciclo 6, mes 5, semana 7)', async () => {
    for (const q of [
      H2,
      SEP,
      query(WEEK, '2026-09-28', '2026-10-04', '2026-10-04'),
    ]) {
      const repo = inMemoryHistory([A]);
      await serviceWith([A], repo).getState(q, DIRECTOR);
      expect(repo.calls).toEqual({
        aggregateBacklog: 1,
        'aggregateEventMetric:created': 1,
        'aggregateEventMetric:closed': 1,
        aggregateActiveByKind: 1,
        aggregateActiveInternalByCategory: 1,
        aggregateActiveExternalByCoordination: 1,
      });
    }
  });
});
