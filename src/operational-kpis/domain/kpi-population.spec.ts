import { activeAtCutCondition } from './kpi-active-at-cut';
import {
  kpiActiveAtCutWindowSql,
  kpiEffectiveEndSql,
  kpiExternalKindSql,
  kpiOwnKindSql,
  kpiUndatedFrozenSql,
} from './kpi-population';

/**
 * Fase 01B.2 · K-02 / K-06. Contrato textual de la población compartida; la
 * semántica contra datos reales la prueba fase01b2-indicators.pg.spec.ts.
 */
describe('kpi-population · K-02 fin real de los congelados', () => {
  it('el fin efectivo de RESOLVED/CLOSED es closed_at o resolved_at, nunca otra fecha', () => {
    const end = kpiEffectiveEndSql('s');
    expect(end).toContain("s.status IN ('RESOLVED', 'CLOSED')");
    expect(end).toContain('COALESCE(s.closed_at, s.resolved_at)');
    expect(end).not.toMatch(/updated_at|created_at|now\(\)/);
  });

  it('un congelado sin fechas queda fuera de la ventana activa', () => {
    const window = kpiActiveAtCutWindowSql('s', '$2');
    expect(window).toContain(`NOT ${kpiUndatedFrozenSql('s')}`);
    expect(window).toContain('s.created_at < $2');
  });

  it('la población de stock usa la ventana compartida y excluye anuladas', () => {
    const sql = activeAtCutCondition({
      alias: 's',
      owner: '$1',
      cut: '$2',
      internal: '$4',
      inter: '$5',
    });
    expect(sql).toContain(kpiActiveAtCutWindowSql('s', '$2'));
    expect(sql).toContain("s.status <> 'CANCELLED'");
  });
});

describe('kpi-population · K-06 INTER consigo misma', () => {
  it('cuenta como propia y nunca como dependencia', () => {
    expect(kpiOwnKindSql('s', '$1')).toContain("s.report_kind = 'INTERNAL'");
    expect(kpiOwnKindSql('s', '$1')).toContain(
      's.affected_coordination_id = $1',
    );
    expect(kpiExternalKindSql('s', '$1')).toContain(
      's.affected_coordination_id IS DISTINCT FROM $1',
    );
  });

  it('el stock ya no excluye la INTER consigo misma', () => {
    const sql = activeAtCutCondition({
      alias: 's',
      owner: '$1',
      cut: '$2',
      internal: '$4',
      inter: '$5',
    });
    expect(sql).toContain('s.report_kind IN ($4, $5)');
    expect(sql).not.toContain('IS DISTINCT FROM $1');
  });
});
