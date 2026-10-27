import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import {
  SituationSeverity,
  SituationStatus,
} from '../common/enums/situation.enums';
import { buildEstadoFlowSlots } from './domain/kpi-estado-evolution-buckets';
import {
  compareInternalProblems,
  internalProblemFolio,
  severityDrift,
  slaAtCut,
} from './domain/kpi-internal-problems';
import {
  buildRecurrenceMatrix,
  type KpiRecurrenceCountRow,
} from './domain/kpi-internal-recurrence';
import { KPI_UNCATEGORIZED_CATEGORY_ID } from './domain/kpi-uncategorized-category';
import { OperationalKpiScopeType } from './dto/operational-kpi-query.dto';
import { OperationalKpiInternosQueryDto } from './dto/operational-kpi-internal-problems-query.dto';
import { OperationalKpiEstadoPeriodKind } from './dto/operational-kpi-state-query.dto';
import type { KpiInternalProblemRow } from './operational-kpi-internal-problems.repository';
import { OperationalKpiInternalProblemsService } from './operational-kpi-internal-problems.service';

const { LOW, MEDIUM, HIGH, CRITICAL } = SituationSeverity;

describe('INTERNOS · afectaciones activas · reglas', () => {
  it('slaAtCut: en plazo · en riesgo (aviso de la REPORTADA) · vencido · sin plazo', () => {
    const due = '2026-10-08T14:00:00.000Z';
    const at = (iso: string, reportedSeverity = HIGH) =>
      slaAtCut({ dueAt: due, reportedSeverity, asOf: new Date(iso) });
    expect(at('2026-10-07T13:59:59.000Z')).toBe('on_track');
    expect(at('2026-10-07T14:00:00.000Z')).toBe('at_risk');
    expect(at('2026-10-08T14:00:00.001Z')).toBe('overdue');
    expect(at('2026-10-05T15:00:00.000Z', LOW)).toBe('at_risk');
    expect(
      slaAtCut({ dueAt: null, reportedSeverity: MEDIUM, asOf: new Date() }),
    ).toBe('none');
  });

  it('severityDrift y folio', () => {
    expect(
      severityDrift({ reportedSeverity: MEDIUM, severityAtCut: CRITICAL }),
    ).toBe(2);
    expect(severityDrift({ reportedSeverity: HIGH, severityAtCut: HIGH })).toBe(
      0,
    );
    expect(internalProblemFolio('5eedc0de-0e1f-4000-8000-00000000a5f0')).toBe(
      'A5F0',
    );
  });

  it('orden Top 5: afectaciones ↓ · severidad ↓ · días abierto ↓ · id', () => {
    const row = (
      id: string,
      consequenceCountAtCut: number,
      severityAtCut: SituationSeverity,
      ageDays: number,
    ) => ({ id, consequenceCountAtCut, severityAtCut, ageDays });
    const rows = [
      row('f', 1, MEDIUM, 0),
      row('d', 0, LOW, 2),
      row('a', 5, CRITICAL, 8),
      row('h', 1, HIGH, 2),
      row('z', 1, HIGH, 2),
      row('b', 2, MEDIUM, 12),
    ];
    expect(rows.sort(compareInternalProblems).map((r) => r.id)).toEqual([
      'a',
      'b',
      'h',
      'z',
      'f',
      'd',
    ]);
  });
});

describe('INTERNOS · recurrencia · matriz', () => {
  // H2 al 7 OCT: JUL–OCT observados, NOV–DIC futuros.
  const slots = buildEstadoFlowSlots(
    'cycle',
    '2026-07-01',
    '2026-12-31',
    '2026-10-07',
    '2026-10-07',
  );
  const r = (
    key: string,
    categoryId: string | null,
    name: string | null,
    count: number,
  ): KpiRecurrenceCountRow => ({
    key,
    categoryId,
    code: name?.toUpperCase() ?? null,
    name,
    selectable: true,
    count,
  });
  const rows = [
    // Infraestructura: 4/4 meses, 6 registros.
    r('2026-07-31', 'infra', 'Infraestructura', 2),
    r('2026-08-31', 'infra', 'Infraestructura', 2),
    r('2026-09-30', 'infra', 'Infraestructura', 1),
    r('2026-10-07', 'infra', 'Infraestructura', 1),
    // Aplicativos: 3/4 meses, 7 registros (más volumen, menos constancia).
    r('2026-08-31', 'apps', 'Aplicativos', 2),
    r('2026-09-30', 'apps', 'Aplicativos', 2),
    r('2026-10-07', 'apps', 'Aplicativos', 3),
    // Equipos e Internet: 4/4, 4 registros cada una → nombre.
    ...['2026-07-31', '2026-08-31', '2026-09-30', '2026-10-07'].flatMap(
      (key) => [
        r(key, 'internet', 'Internet', 1),
        r(key, 'equipos', 'Equipos', 1),
      ],
    ),
    // Sin categoría: id sintético.
    r('2026-09-30', null, null, 1),
  ];
  const matrix = buildRecurrenceMatrix(slots, rows);

  it('ranking: presencia ↓ · total ↓ · nombre', () => {
    expect(
      matrix.categories.map((c) => [
        c.name,
        c.totalCreated,
        c.bucketsWithOccurrences,
      ]),
    ).toEqual([
      ['Infraestructura', 6, 4],
      ['Equipos', 4, 4],
      ['Internet', 4, 4],
      ['Aplicativos', 7, 3],
      ['Sin categoría', 1, 1],
    ]);
    expect(matrix.categories.at(-1)?.id).toBe(KPI_UNCATEGORIZED_CATEGORY_ID);
  });

  it('futuros → null (nunca 0); elegibles = observados (4 de 6)', () => {
    expect(matrix.eligibleBuckets).toBe(4);
    expect(matrix.categories[0].values).toEqual([2, 2, 1, 1, null, null]);
    // Aplicativos: julio observado sin registros = 0.
    expect(matrix.categories[3].values).toEqual([0, 2, 2, 3, null, null]);
    expect(matrix.bucketTotals).toEqual([4, 6, 6, 6, null, null]);
  });

  it('invariantes: Σ categorías por bucket = total del bucket; Σ totales = total', () => {
    matrix.bucketTotals.forEach((total, i) => {
      const sum = matrix.categories.reduce(
        (acc, c) => acc + (c.values.at(i) ?? 0),
        0,
      );
      expect(total === null ? null : sum).toBe(total);
    });
    expect(matrix.categories.reduce((a, c) => a + c.totalCreated, 0)).toBe(
      matrix.total,
    );
    expect(matrix.total).toBe(22);
    for (const c of matrix.categories) {
      expect(c.bucketsWithOccurrences).toBeLessThanOrEqual(
        matrix.eligibleBuckets,
      );
    }
  });

  it('una fila de un bucket futuro o desconocido no cuenta', () => {
    const m = buildRecurrenceMatrix(slots, [
      r('2026-11-30', 'x', 'X', 3),
      r('nope', 'x', 'X', 3),
    ]);
    expect(m.total).toBe(0);
    expect(m.categories).toEqual([]);
  });
});

describe('OperationalKpiInternalProblemsService', () => {
  const COORD = '11111111-1111-4111-8111-111111111111';
  const actor = { sub: 'u', permissions: ['KPIS_VIEW'] } as AuthPayload;
  const NOW = new Date('2026-10-07T15:00:00.000Z'); // 10:00 Bogotá

  const row = (
    over: Partial<KpiInternalProblemRow> = {},
  ): KpiInternalProblemRow => ({
    id: 'r',
    title: 'Problema',
    categoryId: 'c',
    categoryCode: 'internet',
    categoryName: 'Internet',
    createdAt: '2026-09-29T14:00:00.000Z',
    createdByName: 'Autor',
    ageDays: 8,
    statusAtCut: SituationStatus.IN_PROGRESS,
    reportedSeverity: MEDIUM,
    severityAtCut: MEDIUM,
    consequenceCountAtCut: 0,
    latestConsequence: null,
    dueAt: '2026-10-08T15:00:00.000Z',
    historyReliable: true,
    consequenceTimeline: [],
    ...over,
  });

  function build(rows: KpiInternalProblemRow[] = []) {
    const repository = {
      findRows: jest.fn().mockResolvedValue({ rows, truncated: false }),
    };
    const recurrence = {
      countByBucketAndCategory: jest.fn().mockResolvedValue([]),
    };
    const coordinations = {
      findActiveById: jest.fn((id: string) =>
        Promise.resolve(id === COORD ? { id: COORD } : null),
      ),
    };
    const scope = { assertPermission: jest.fn() };
    const service = new OperationalKpiInternalProblemsService(
      scope as never,
      coordinations as never,
      repository as never,
      recurrence as never,
    );
    return { service, repository, recurrence, scope };
  }

  const query = (
    over: Partial<OperationalKpiInternosQueryDto> = {},
  ): OperationalKpiInternosQueryDto => ({
    scope: OperationalKpiScopeType.COORDINATION,
    coordinationId: COORD,
    from: '2026-07-01',
    to: '2026-12-31',
    kind: OperationalKpiEstadoPeriodKind.CYCLE,
    ...over,
  });

  it('afectaciones: corte = fin de hoy; plazo a «ahora»; orden Top 5', async () => {
    const { service, repository } = build([
      row({ id: 'risk', reportedSeverity: HIGH, consequenceCountAtCut: 1 }),
      row({ id: 'late', dueAt: '2026-10-05T15:00:00.000Z' }),
      row({ id: 'top', consequenceCountAtCut: 5 }),
    ]);
    const response = await service.getInternalProblems(query(), actor, NOW);
    expect(repository.findRows).toHaveBeenCalledWith({
      coordinationId: COORD,
      cutIso: '2026-10-08T05:00:00.000Z',
      refDate: '2026-10-07',
      isCurrent: true,
    });
    expect(response.period).toMatchObject({
      dataTo: '2026-10-07',
      cutAt: '2026-10-08T05:00:00.000Z',
    });
    expect(response.items.map((i) => [i.id, i.slaAtCut])).toEqual([
      // MEDIUM avisa 48 h antes: vence mañana → en riesgo.
      ['top', 'at_risk'],
      ['risk', 'at_risk'],
      ['late', 'overdue'],
    ]);
    expect(response.total).toBe(3);
    expect(response).not.toHaveProperty('view');
  });

  it('afectaciones: periodo pasado → corte = fin del periodo', async () => {
    const { service, repository } = build();
    await service.getInternalProblems(
      query({
        from: '2026-09-01',
        to: '2026-09-30',
        kind: OperationalKpiEstadoPeriodKind.MONTH,
      }),
      actor,
      NOW,
    );
    expect(repository.findRows).toHaveBeenCalledWith(
      expect.objectContaining({
        cutIso: '2026-10-01T05:00:00.000Z',
        refDate: '2026-09-30',
        isCurrent: false,
      }),
    );
  });

  it('recurrencia: misma geometría que el Flujo (6 meses, 2 futuros) y bucket mensual', async () => {
    const { service, recurrence } = build();
    recurrence.countByBucketAndCategory.mockResolvedValue([
      {
        key: '2026-09-30',
        categoryId: 'i',
        code: 'INTERNET',
        name: 'Internet',
        selectable: true,
        count: 4,
      },
    ]);
    const response = await service.getInternalRecurrence(query(), actor, NOW);
    expect(response.bucket).toBe('month');
    expect(response.buckets.map((b) => [b.label, b.future, b.total])).toEqual([
      [expect.any(String), false, 0],
      [expect.any(String), false, 0],
      [expect.any(String), false, 4],
      [expect.any(String), false, 0],
      [expect.any(String), true, null],
      [expect.any(String), true, null],
    ]);
    expect(response.buckets[2]).toMatchObject({
      calendarStart: '2026-09-01',
      calendarEnd: '2026-09-30',
    });
    expect(response.buckets[3]).toMatchObject({
      dataEnd: '2026-10-07',
      current: true,
    });
    expect(response.eligibleBuckets).toBe(4);
    expect(response.total).toBe(4);
    expect(response.categories[0]).toMatchObject({
      name: 'Internet',
      totalCreated: 4,
      bucketsWithOccurrences: 1,
      values: [0, 0, 4, 0, null, null],
    });
  });

  it('recurrencia mensual: semanas recortadas al mes; la semana abre completa', async () => {
    const { service, recurrence } = build();
    const response = await service.getInternalRecurrence(
      query({
        from: '2026-09-01',
        to: '2026-09-30',
        kind: OperationalKpiEstadoPeriodKind.MONTH,
      }),
      actor,
      NOW,
    );
    expect(response.bucket).toBe('week');
    expect(response.buckets[0]).toMatchObject({
      start: '2026-09-01',
      calendarStart: '2026-08-31',
    });
    expect(response.eligibleBuckets).toBe(response.buckets.length);
    const [, slots] = recurrence.countByBucketAndCategory.mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(slots).toHaveLength(response.buckets.length);
  });

  it('exige permiso, scope coordinación y coordinación existente', async () => {
    const { service, scope } = build();
    await service.getInternalRecurrence(query(), actor, NOW);
    expect(scope.assertPermission).toHaveBeenCalledWith(actor, 'KPIS_VIEW');
    await expect(
      service.getInternalProblems(
        query({ scope: OperationalKpiScopeType.DIRECTION }),
        actor,
        NOW,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getInternalRecurrence(
        query({ coordinationId: '22222222-2222-4222-8222-222222222222' }),
        actor,
        NOW,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
