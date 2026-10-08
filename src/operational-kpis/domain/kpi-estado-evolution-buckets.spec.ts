import { BadRequestException } from '@nestjs/common';
import {
  assertEstadoPeriodShape,
  buildEstadoEvolutionBuckets,
} from './kpi-estado-evolution-buckets';

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
    });
    const last = buckets[buckets.length - 1];
    expect(last.start).toBe('2026-10-26');
    expect(last.end).toBe('2026-10-31');
  });

  it('month → el label describe la ventana contada, no la semana calendario', () => {
    const buckets = buildEstadoEvolutionBuckets(
      'month',
      '2026-10-01',
      '2026-10-31',
    );
    expect(buckets.map((bucket) => bucket.label)).toEqual([
      '1–4 oct',
      '5–11 oct',
      '12–18 oct',
      '19–25 oct',
      '26–31 oct',
    ]);
    expect(buckets[0].label).not.toMatch(/sep/i);
  });

  it('month parcial → el último bucket se recorta a dataTo y su label también', () => {
    const buckets = buildEstadoEvolutionBuckets(
      'month',
      '2026-10-01',
      '2026-10-07',
    );
    expect(buckets).toEqual([
      expect.objectContaining({
        start: '2026-10-01',
        end: '2026-10-04',
        label: '1–4 oct',
      }),
      expect.objectContaining({
        start: '2026-10-05',
        end: '2026-10-07',
        label: '5–7 oct',
      }),
    ]);
  });

  it('month → una semana que cruza de mes conserva ambos meses en el label', () => {
    // Rango no alineado a mes: solo para el formateador del bucket.
    const buckets = buildEstadoEvolutionBuckets(
      'month',
      '2026-09-30',
      '2026-10-02',
    );
    expect(buckets[0].label).toBe('30 sep – 2 oct');
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

  it('expone fin exclusivo 00:00 Bogotá del día siguiente', () => {
    const [bucket] = buildEstadoEvolutionBuckets(
      'week',
      '2026-10-05',
      '2026-10-05',
    );
    expect(bucket.endExclusiveIso).toBe('2026-10-06T05:00:00.000Z');
  });
});

describe('assertEstadoPeriodShape', () => {
  const TODAY = '2026-10-07'; // miércoles

  const expectBadRequest = (fn: () => void, message: RegExp) => {
    expect(fn).toThrow(BadRequestException);
    expect(fn).toThrow(message);
  };

  it('acepta semana en curso recortada a hoy', () => {
    expect(() =>
      assertEstadoPeriodShape(
        'week',
        '2026-10-05',
        '2026-10-07',
        '2026-10-11',
        TODAY,
      ),
    ).not.toThrow();
  });

  it('acepta semana, mes y ciclos completos', () => {
    expect(() =>
      assertEstadoPeriodShape(
        'week',
        '2026-09-28',
        '2026-10-04',
        '2026-10-04',
        TODAY,
      ),
    ).not.toThrow();
    expect(() =>
      assertEstadoPeriodShape(
        'month',
        '2026-09-01',
        '2026-09-30',
        '2026-09-30',
        TODAY,
      ),
    ).not.toThrow();
    expect(() =>
      assertEstadoPeriodShape(
        'cycle',
        '2026-01-01',
        '2026-06-30',
        '2026-06-30',
        TODAY,
      ),
    ).not.toThrow();
    expect(() =>
      assertEstadoPeriodShape(
        'cycle',
        '2026-07-01',
        '2026-10-07',
        '2026-12-31',
        TODAY,
      ),
    ).not.toThrow();
  });

  it('rechaza from > to', () => {
    expectBadRequest(
      () =>
        assertEstadoPeriodShape(
          'week',
          '2026-10-05',
          '2026-10-04',
          '2026-10-11',
          TODAY,
        ),
      /from no puede ser posterior a to/,
    );
  });

  it('rechaza to > calendarEnd', () => {
    expectBadRequest(
      () =>
        assertEstadoPeriodShape(
          'week',
          '2026-09-28',
          '2026-10-05',
          '2026-10-04',
          TODAY,
        ),
      /to no puede ser posterior a calendarEnd/,
    );
  });

  it('rechaza kind=week con rango que no es una semana lun→dom', () => {
    expectBadRequest(
      () =>
        assertEstadoPeriodShape(
          'week',
          '2026-10-03',
          '2026-10-07',
          '2026-10-20',
          TODAY,
        ),
      /kind=week/,
    );
    expectBadRequest(
      () =>
        assertEstadoPeriodShape(
          'week',
          '2026-09-28',
          '2026-10-04',
          '2026-10-05',
          TODAY,
        ),
      /kind=week/,
    );
  });

  it('rechaza kind=month que no es un mes calendario', () => {
    expectBadRequest(
      () =>
        assertEstadoPeriodShape(
          'month',
          '2026-09-02',
          '2026-09-30',
          '2026-09-30',
          TODAY,
        ),
      /kind=month/,
    );
    expectBadRequest(
      () =>
        assertEstadoPeriodShape(
          'month',
          '2026-09-01',
          '2026-09-29',
          '2026-09-29',
          TODAY,
        ),
      /kind=month/,
    );
  });

  it('rechaza kind=cycle que no es H1/H2', () => {
    expectBadRequest(
      () =>
        assertEstadoPeriodShape(
          'cycle',
          '2026-02-01',
          '2026-06-30',
          '2026-06-30',
          TODAY,
        ),
      /kind=cycle/,
    );
    expectBadRequest(
      () =>
        assertEstadoPeriodShape(
          'cycle',
          '2026-01-01',
          '2026-06-29',
          '2026-06-29',
          TODAY,
        ),
      /kind=cycle/,
    );
  });

  it('periodo futuro → mensaje propio, no «from posterior a to»', () => {
    const future = () =>
      assertEstadoPeriodShape(
        'week',
        '2026-10-12',
        '2026-10-12',
        '2026-10-18',
        TODAY,
      );
    expectBadRequest(future, /periodo futuro/);
    expect(future).not.toThrow(/from no puede ser posterior a to/);
  });

  it('periodo terminado exige to = calendarEnd', () => {
    expectBadRequest(
      () =>
        assertEstadoPeriodShape(
          'week',
          '2026-09-28',
          '2026-09-30',
          '2026-10-04',
          TODAY,
        ),
      /to = calendarEnd/,
    );
  });
});
