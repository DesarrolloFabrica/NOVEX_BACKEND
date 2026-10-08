import { OperationalKpiSnapshotRepository } from './operational-kpi-snapshot.repository';

const AREA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('OperationalKpiSnapshotRepository · composición de ACTIVE_AT_CUT', () => {
  function capture(rows: unknown[]) {
    const query = jest.fn().mockResolvedValue(rows);
    return {
      query,
      repository: new OperationalKpiSnapshotRepository({
        manager: { query },
      } as never),
    };
  }

  it('usa la MISMA población que Carga/Antigüedad (corte semiabierto, sin filtrar status)', async () => {
    const { query, repository } = capture([{ active_count: 0 }]);
    await repository.aggregateComposition(AREA, '2026-09-30');
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WITH universe AS');
    expect(sql).toContain('s.created_at < $2::timestamptz');
    expect(sql).toContain(
      '(s.closed_at IS NULL OR s.closed_at >= $2::timestamptz)',
    );
    expect(sql).toContain('s.affected_coordination_id IS DISTINCT FROM $1');
    // El status solo CLASIFICA la población, nunca la recorta.
    expect(sql).not.toMatch(/WHERE[^()]*s\.status/);
    expect(params).toEqual([
      AREA,
      '2026-10-01T05:00:00.000Z',
      '2026-09-30',
      'INTERNAL',
      'INTER_COORDINATION',
    ]);
  });

  it('clasifica atención sin perder problemas: cerrados después del corte e inconsistentes son explícitos', async () => {
    const { query, repository } = capture([
      {
        active_count: '7',
        sev_low: 2,
        sev_medium: 3,
        sev_high: 1,
        sev_critical: 1,
        att_open: 3,
        att_in_progress: 2,
        att_closed_after_cut: 1,
        att_unclassified: 1,
      },
    ]);
    const row = await repository.aggregateComposition(AREA, '2026-09-30');
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain("status IN ('IN_PROGRESS', 'RESOLVED')");
    expect(sql).toContain('COUNT(*) FILTER (WHERE closed_at IS NOT NULL)');
    expect(row).toEqual({
      activeCount: 7,
      severity: { low: 2, medium: 3, high: 1, critical: 1 },
      attention: { open: 3, inProgress: 2, closedAfterCut: 1, unclassified: 1 },
    });
    const { severity: s, attention: a } = row;
    expect(s.low + s.medium + s.high + s.critical).toBe(row.activeCount);
    expect(a.open + a.inProgress + a.closedAfterCut + a.unclassified).toBe(
      row.activeCount,
    );
  });
});
