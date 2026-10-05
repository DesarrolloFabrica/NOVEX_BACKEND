import { buildEstadoEvolutionBuckets } from './kpi-estado-evolution-buckets';

describe('buildEstadoEvolutionBuckets', () => {
  it('week → buckets diarios', () => {
    const buckets = buildEstadoEvolutionBuckets(
      'week',
      '2026-09-29',
      '2026-10-05',
    );
    expect(buckets).toHaveLength(7);
    expect(buckets[0]).toMatchObject({
      start: '2026-09-29',
      end: '2026-09-29',
    });
    expect(buckets[6]).toMatchObject({
      start: '2026-10-05',
      end: '2026-10-05',
    });
  });

  it('month → semanas que intersectan, recortadas al mes', () => {
    // Oct 2026: primera semana lun 28 sep – dom 4 oct
    const buckets = buildEstadoEvolutionBuckets(
      'month',
      '2026-10-01',
      '2026-10-31',
    );
    expect(buckets[0]).toMatchObject({
      start: '2026-10-01',
      end: '2026-10-04',
      label: expect.stringMatching(/sep/i),
    });
    const last = buckets[buckets.length - 1];
    expect(last.start).toBe('2026-10-26');
    expect(last.end).toBe('2026-10-31');
  });

  it('cycle → meses', () => {
    const buckets = buildEstadoEvolutionBuckets(
      'cycle',
      '2026-07-01',
      '2026-12-31',
    );
    expect(buckets).toHaveLength(6);
    expect(buckets[0].label).toMatch(/Jul/i);
    expect(buckets[5].label).toMatch(/Dic/i);
  });

  it('week crossing year edge', () => {
    const buckets = buildEstadoEvolutionBuckets(
      'week',
      '2025-12-29',
      '2026-01-04',
    );
    expect(buckets).toHaveLength(7);
    expect(buckets[0].start).toBe('2025-12-29');
    expect(buckets[6].end).toBe('2026-01-04');
  });
});
