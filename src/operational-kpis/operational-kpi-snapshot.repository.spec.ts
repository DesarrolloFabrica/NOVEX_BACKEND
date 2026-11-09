import { OperationalKpiSnapshotRepository } from './operational-kpi-snapshot.repository';
import { kpiActiveAtCutWindowSql } from './domain/kpi-population';

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

  it('usa la MISMA población que Carga/Antigüedad (corte semiabierto, sin anuladas)', async () => {
    const { query, repository } = capture([{ active_count: 0 }]);
    await repository.aggregateComposition(AREA, '2026-09-30');
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WITH universe AS');
    expect(sql).toContain('s.created_at < $2::timestamptz');
    expect(sql).toContain(kpiActiveAtCutWindowSql('s', '$2::timestamptz'));
    // Fase 01B.2 · K-06: INTER consigo misma cuenta como propia.
    expect(sql).toContain('s.report_kind IN ($4, $5)');
    // El status solo CLASIFICA la población; la única exclusión es la
    // anulación (Fase 01B.1): una anulada nunca fue un problema operativo.
    expect(sql).toContain("s.status <> 'CANCELLED'");
    // K-02: el status solo fija el fin real de los congelados.
    expect(sql).not.toMatch(/s\.status\s*=\s/);
    expect(sql).toContain("s.status IN ('RESOLVED', 'CLOSED')");
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
    // K-02: RESOLVED ya no se presenta como en atención.
    expect(sql).not.toContain("'IN_PROGRESS', 'RESOLVED'");
    expect(sql).toContain('COALESCE(universe.closed_at, universe.resolved_at)');
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
