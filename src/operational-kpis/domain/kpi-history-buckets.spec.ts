import { buildKpiHistoryBuckets } from './kpi-history-buckets';
import { OperationalKpiHistoryGranularity } from '../dto/operational-kpi-history-query.dto';

describe('buildKpiHistoryBuckets', () => {
  it('semana usa lunes–domingo Bogotá', () => {
    // 2026-01-07 es miércoles → lunes 05, domingo 11
    const buckets = buildKpiHistoryBuckets(
      OperationalKpiHistoryGranularity.WEEK,
      '2026-01-07',
      '2026-01-07',
    );
    expect(buckets).toHaveLength(1);
    expect(buckets[0].start).toBe('2026-01-05');
    expect(buckets[0].end).toBe('2026-01-11');
  });

  it('mes calendario', () => {
    const buckets = buildKpiHistoryBuckets(
      OperationalKpiHistoryGranularity.MONTH,
      '2026-01-15',
      '2026-02-10',
    );
    expect(buckets.map((item) => item.start)).toEqual([
      '2026-01-01',
      '2026-02-01',
    ]);
    expect(buckets[0].end).toBe('2026-01-31');
  });

  it('cycle H1/H2', () => {
    const buckets = buildKpiHistoryBuckets(
      OperationalKpiHistoryGranularity.CYCLE,
      '2026-03-01',
      '2026-08-01',
    );
    expect(buckets).toHaveLength(2);
    expect(buckets[0].start).toBe('2026-01-01');
    expect(buckets[0].end).toBe('2026-06-30');
    expect(buckets[1].start).toBe('2026-07-01');
    expect(buckets[1].end).toBe('2026-12-31');
  });

  it('borde Bogotá: domingo 23:30-05 aún pertenece a esa semana', () => {
    const buckets = buildKpiHistoryBuckets(
      OperationalKpiHistoryGranularity.WEEK,
      '2026-01-11',
      '2026-01-11',
    );
    expect(buckets[0].end).toBe('2026-01-11');
    // Fin exclusivo = lunes 12 00:00 Bogotá = 05:00Z
    expect(buckets[0].endExclusiveIso).toBe('2026-01-12T05:00:00.000Z');
  });
});
