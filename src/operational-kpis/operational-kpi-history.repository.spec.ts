import { buildEstadoEvolutionBuckets } from './domain/kpi-estado-evolution-buckets';
import { KPI_UNCATEGORIZED_CATEGORY_ID } from './domain/kpi-uncategorized-category';
import { OperationalKpiHistoryRepository } from './operational-kpi-history.repository';

const AREA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function repositoryWith(rows: unknown[]) {
  const query = jest.fn().mockResolvedValue(rows);
  const repository = new OperationalKpiHistoryRepository({
    manager: { query },
  } as never);
  return { repository, query };
}

describe('OperationalKpiHistoryRepository.aggregateBacklog', () => {
  it('corta el stock en [inicio, día siguiente 00:00) — sin «23:59:59.999»', async () => {
    const { repository, query } = repositoryWith([]);
    const buckets = buildEstadoEvolutionBuckets(
      'week',
      '2026-10-05',
      '2026-10-06',
    );

    await repository.aggregateBacklog(AREA, buckets);

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('s.created_at < b.end_exclusive');
    expect(sql).toContain(
      '(s.closed_at IS NULL OR s.closed_at >= b.end_exclusive)',
    );
    expect(sql).not.toMatch(/<=\s*b\./);
    expect(params.slice(0, 4)).toEqual([
      '2026-10-06T05:00:00.000Z',
      '2026-10-05',
      '2026-10-07T05:00:00.000Z',
      '2026-10-06',
    ]);
    expect(params.some((value) => String(value).includes('59.999'))).toBe(
      false,
    );
  });

  it('devuelve cero en buckets sin filas y el total por bucket.end', async () => {
    const { repository } = repositoryWith([{ key: '2026-10-06', total: '4' }]);
    const buckets = buildEstadoEvolutionBuckets(
      'week',
      '2026-10-05',
      '2026-10-06',
    );

    const counts = await repository.aggregateBacklog(AREA, buckets);

    expect(Object.fromEntries(counts)).toEqual({
      '2026-10-05': 0,
      '2026-10-06': 4,
    });
  });
});

describe('OperationalKpiHistoryRepository · carga activa (SQL set-based)', () => {
  const buckets = buildEstadoEvolutionBuckets(
    'cycle',
    '2026-07-01',
    '2026-10-06',
  );

  it('aggregateActiveByKind: UNA query para todos los buckets, internos + externos (affected ≠ X)', async () => {
    const { repository, query } = repositoryWith([
      { key: '2026-10-06', internal: 7, external: 5 },
    ]);
    const counts = await repository.aggregateActiveByKind(AREA, buckets);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('s.created_at < b.end_exclusive');
    expect(sql).toContain(
      '(s.closed_at IS NULL OR s.closed_at >= b.end_exclusive)',
    );
    expect(sql).toMatch(/s\.coordination_id = \$\d+/);
    expect(sql).toMatch(/s\.affected_coordination_id IS DISTINCT FROM \$\d+/);
    expect(params.slice(-3)).toEqual([AREA, 'INTERNAL', 'INTER_COORDINATION']);
    expect(counts.get('2026-10-06')).toEqual({ internal: 7, external: 5 });
    expect(counts.get('2026-07-31')).toEqual({ internal: 0, external: 0 });
  });

  it('aggregateActiveInternalByCategory: solo INTERNAL activos, catálogo por JOIN, null → «Sin categoría»', async () => {
    const { repository, query } = repositoryWith([
      {
        key: '2026-10-06',
        categoryId: 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',
        code: 'internet',
        name: 'Internet',
        selectable: true,
        count: 3,
      },
      {
        key: '2026-10-06',
        categoryId: null,
        code: null,
        name: null,
        selectable: null,
        count: 1,
      },
    ]);
    const rows = await repository.aggregateActiveInternalByCategory(
      AREA,
      buckets,
    );

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('LEFT JOIN incident_categories c');
    expect(sql).toContain('GROUP BY b.key, s.category_id');
    expect(params.slice(-2)).toEqual([AREA, 'INTERNAL']);
    expect(rows).toEqual([
      {
        key: '2026-10-06',
        categoryId: 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',
        categoryCode: 'internet',
        categoryName: 'Internet',
        selectable: true,
        count: 3,
      },
      {
        key: '2026-10-06',
        categoryId: KPI_UNCATEGORIZED_CATEGORY_ID,
        categoryCode: 'UNCATEGORIZED',
        categoryName: 'Sin categoría',
        selectable: false,
        count: 1,
      },
    ]);
  });

  it('aggregateActiveExternalByCoordination: INTER de X por afectada, nombres por JOIN (sin findOne)', async () => {
    const { repository, query } = repositoryWith([
      {
        key: '2026-10-06',
        coordinationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        code: 'coord-saber-pro',
        name: 'Coordinación Saber Pro',
        shortName: 'Saber Pro',
        count: 2,
      },
    ]);
    const rows = await repository.aggregateActiveExternalByCoordination(
      AREA,
      buckets,
    );

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(
      'LEFT JOIN coordinations c ON c.id = s.affected_coordination_id',
    );
    expect(sql).toContain('GROUP BY b.key, s.affected_coordination_id');
    expect(sql).toMatch(/s\.affected_coordination_id IS DISTINCT FROM \$\d+/);
    expect(params.slice(-2)).toEqual([AREA, 'INTER_COORDINATION']);
    expect(rows).toEqual([
      {
        key: '2026-10-06',
        coordinationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        coordinationCode: 'coord-saber-pro',
        coordinationName: 'Saber Pro',
        count: 2,
      },
    ]);
  });
});
