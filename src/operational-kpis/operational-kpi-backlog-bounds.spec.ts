import { OperationalKpiBreakdownRepository } from './operational-kpi-breakdown.repository';
import { OperationalKpiRelationsRepository } from './operational-kpi-relations.repository';
import { OperationalKpiHistoryMetric } from './dto/operational-kpi-history-query.dto';

/**
 * Backlog con corte semiabierto en breakdown (INTERNOS) y relations
 * (DEPENDENCIAS): stock en T = created_at < T AND (closed_at IS NULL OR
 * closed_at >= T), con T = 00:00 Bogotá del día siguiente a `to`.
 *
 * No hay Postgres en la suite unitaria: se fija el SQL y los parámetros, y el
 * borde se comprueba con instantes en microsegundos (precisión de
 * timestamptz) contra el mismo predicado.
 */

const AREA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function captureQuery() {
  const query = jest.fn().mockResolvedValue([]);
  return { query, manager: { manager: { query } } as never };
}

/** Epoch en microsegundos a partir de un ISO con hasta 6 decimales. */
function micros(iso: string): bigint {
  const match =
    /^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(iso);
  if (!match) throw new Error(`ISO inválido: ${iso}`);
  const [, base, fraction = '', zone] = match;
  const seconds = BigInt(Date.parse(`${base}${zone}`)) / 1000n;
  return seconds * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}

/** Mismo predicado que el SQL: stock en el corte exclusivo T. */
function inBacklogAt(
  cutIso: string,
  createdIso: string,
  closedIso: string | null,
): boolean {
  const cut = micros(cutIso);
  return (
    micros(createdIso) < cut && (closedIso === null || micros(closedIso) >= cut)
  );
}

describe('backlog semiabierto · breakdown (INTERNOS)', () => {
  it('usa created_at < T y closed_at >= T con T = medianoche Bogotá del día siguiente', async () => {
    const { query, manager } = captureQuery();
    const repository = new OperationalKpiBreakdownRepository(manager);

    await repository.aggregateByCategory(
      AREA,
      OperationalKpiHistoryMetric.BACKLOG,
      '2026-10-01',
      '2026-10-05',
    );

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('s.created_at < $3');
    expect(sql).toContain('(s.closed_at IS NULL OR s.closed_at >= $3)');
    expect(sql).not.toMatch(/<=\s*\$3|>\s*\$3/);
    expect(params[2]).toBe('2026-10-06T05:00:00.000Z');
  });
});

describe('backlog semiabierto · relations (DEPENDENCIAS)', () => {
  it.each([
    ['aggregateCommitments' as const],
    ['aggregateDependencies' as const],
  ])('%s usa el mismo corte exclusivo', async (method) => {
    const { query, manager } = captureQuery();
    const repository = new OperationalKpiRelationsRepository(manager);

    await repository[method](
      AREA,
      OperationalKpiHistoryMetric.BACKLOG,
      '2026-10-01',
      '2026-10-05',
    );

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('s.created_at < $3');
    expect(sql).toContain('(s.closed_at IS NULL OR s.closed_at >= $3)');
    expect(params[2]).toBe('2026-10-06T05:00:00.000Z');
    expect(params[1]).toBe('INTER_COORDINATION');
  });

  it('created/closed siguen en [inicio de from, inicio del día siguiente a to)', async () => {
    const { query, manager } = captureQuery();
    const repository = new OperationalKpiRelationsRepository(manager);

    await repository.aggregateCommitments(
      AREA,
      OperationalKpiHistoryMetric.CREATED,
      '2026-10-01',
      '2026-10-05',
    );

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('s.created_at >= $3');
    expect(sql).toContain('s.created_at < $4');
    expect(params.slice(2, 4)).toEqual([
      '2026-10-01T05:00:00.000Z',
      '2026-10-06T05:00:00.000Z',
    ]);
  });
});

describe('borde temporal del corte (precisión de microsegundos)', () => {
  // Backlog al cierre del 5 oct 2026 (Bogotá): T = 6 oct 00:00 -05:00.
  const CUT = '2026-10-06T05:00:00.000Z';
  const CREATED = '2026-10-01T10:00:00-05:00';

  it('cerrado a las 23:59:59.999500 del día 5 ya no está en el backlog del 5', () => {
    // Con el corte viejo «23:59:59.999» este caso quedaba cerrado y en stock a la vez.
    expect(inBacklogAt(CUT, CREATED, '2026-10-05T23:59:59.999500-05:00')).toBe(
      false,
    );
  });

  it('cerrado exactamente a medianoche sigue en el backlog del 5', () => {
    expect(inBacklogAt(CUT, CREATED, '2026-10-06T00:00:00.000000-05:00')).toBe(
      true,
    );
  });

  it('creado a las 23:59:59.999999 del día 5 entra en el backlog del 5', () => {
    expect(inBacklogAt(CUT, '2026-10-05T23:59:59.999999-05:00', null)).toBe(
      true,
    );
  });

  it('creado a medianoche del 6 pertenece al día siguiente', () => {
    expect(inBacklogAt(CUT, '2026-10-06T00:00:00.000000-05:00', null)).toBe(
      false,
    );
  });

  it('el corte es la medianoche de Bogotá, no la de UTC', () => {
    // 23:30 Bogotá del 5 = 04:30Z del 6: aún pertenece al día 5.
    expect(inBacklogAt(CUT, '2026-10-06T04:30:00.000000Z', null)).toBe(true);
  });
});
