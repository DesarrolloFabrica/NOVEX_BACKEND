import { buildEstadoFlowSlots } from './kpi-estado-evolution-buckets';
import {
  KPI_RESOLUTION_BANDS,
  buildEstadoResolution,
  resolutionBandOf,
  type KpiResolutionSummaryRow,
} from './kpi-estado-resolution';

const EMPTY_BANDS = {
  'lt-1d': 0,
  '1-3d': 0,
  '3-7d': 0,
  '7-14d': 0,
  '14-30d': 0,
  '30d+': 0,
} as const;

describe('RESOLUCIÓN · rangos (semiabiertos, en horas)', () => {
  it.each([
    [23 + 59 / 60, 'lt-1d'],
    [24, '1-3d'],
    [71 + 59 / 60, '1-3d'],
    [72, '3-7d'],
    [167 + 59 / 60, '3-7d'],
    [168, '7-14d'],
    [335 + 59 / 60, '7-14d'],
    [336, '14-30d'],
    [719 + 59 / 60, '14-30d'],
    [720, '30d+'],
    [0, 'lt-1d'],
    [0.5, 'lt-1d'],
  ] as const)('%d h → %s (exactamente un rango)', (hours, key) => {
    expect(resolutionBandOf(hours)).toBe(key);
    const matches = KPI_RESOLUTION_BANDS.filter(
      (b) => hours >= b.fromHours && (b.toHours === null || hours < b.toHours),
    );
    expect(matches).toHaveLength(1);
  });

  it('seis rangos contiguos, sin huecos ni solapes', () => {
    expect(KPI_RESOLUTION_BANDS.map((b) => b.key)).toEqual([
      'lt-1d',
      '1-3d',
      '3-7d',
      '7-14d',
      '14-30d',
      '30d+',
    ]);
    for (let i = 1; i < KPI_RESOLUTION_BANDS.length; i += 1) {
      expect(KPI_RESOLUTION_BANDS[i].fromHours).toBe(
        KPI_RESOLUTION_BANDS[i - 1].toHours,
      );
    }
  });
});

describe('RESOLUCIÓN · buildEstadoResolution', () => {
  // H2 en curso: JUL–OCT con datos, NOV–DIC futuros.
  const slots = buildEstadoFlowSlots(
    'cycle',
    '2026-07-01',
    '2026-12-31',
    '2026-10-07',
    '2026-10-07',
  );
  const summary: KpiResolutionSummaryRow = {
    closedCount: 3,
    medianDays: 4.5,
    p75Days: 9,
    bandCounts: { ...EMPTY_BANDS, '3-7d': 2, '7-14d': 1 },
  };

  it('buckets 1:1 con los flow slots: futuro null, pasado sin cierres 0 / null / null', () => {
    const res = buildEstadoResolution({
      slots,
      byBucket: new Map([
        ['2026-08-31', { closedCount: 2, medianDays: 4, p75Days: 5 }],
        ['2026-10-07', { closedCount: 1, medianDays: 10, p75Days: 10 }],
      ]),
      summary,
    });
    expect(res.buckets.map((b) => b.start)).toEqual(
      slots.map((s) => s.bucket.start),
    );
    expect(res.buckets).toEqual([
      { start: '2026-07-01', closedCount: 0, medianDays: null, p75Days: null },
      { start: '2026-08-01', closedCount: 2, medianDays: 4, p75Days: 5 },
      { start: '2026-09-01', closedCount: 0, medianDays: null, p75Days: null },
      { start: '2026-10-01', closedCount: 1, medianDays: 10, p75Days: 10 },
      {
        start: '2026-11-01',
        closedCount: null,
        medianDays: null,
        p75Days: null,
      },
      {
        start: '2026-12-01',
        closedCount: null,
        medianDays: null,
        p75Days: null,
      },
    ]);
    expect(res.semantics).toBe('closed-in-period-duration-since-created');
    expect(res.distribution.map((b) => b.count)).toEqual([0, 0, 2, 1, 0, 0]);
    expect(res.distribution[5]).toEqual({
      key: '30d+',
      fromHours: 720,
      toHours: null,
      count: 0,
    });
  });

  it('sin cierres: mediana y P75 null (nunca 0, que sería «instantáneo»)', () => {
    const res = buildEstadoResolution({
      slots,
      byBucket: new Map([
        ['2026-07-31', { closedCount: 0, medianDays: 0, p75Days: 0 }],
      ]),
      summary: {
        closedCount: 0,
        medianDays: 0,
        p75Days: 0,
        bandCounts: EMPTY_BANDS,
      },
    });
    expect(res).toMatchObject({
      closedCount: 0,
      medianDays: null,
      p75Days: null,
    });
    expect(res.buckets[0]).toEqual({
      start: '2026-07-01',
      closedCount: 0,
      medianDays: null,
      p75Days: null,
    });
  });
});
