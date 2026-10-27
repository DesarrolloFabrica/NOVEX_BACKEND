import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { SituationReportKind } from '../common/enums/situation.enums';
import {
  buildLearningsSummary,
  learningCoverage,
  learningExcerpt,
  type KpiLearningCategoryCountRow,
} from './domain/kpi-learnings';
import { KPI_UNCATEGORIZED_CATEGORY_ID } from './domain/kpi-uncategorized-category';
import { OperationalKpiLearningItemsQueryDto } from './dto/operational-kpi-learnings-query.dto';
import { OperationalKpiScopeType } from './dto/operational-kpi-query.dto';
import { OperationalKpiEstadoPeriodKind } from './dto/operational-kpi-state-query.dto';
import type { KpiLearningItemRow } from './operational-kpi-learnings.repository';
import { OperationalKpiLearningsService } from './operational-kpi-learnings.service';

const countRow = (
  over: Partial<KpiLearningCategoryCountRow>,
): KpiLearningCategoryCountRow => ({
  categoryId: 'c-net',
  code: 'internet',
  name: 'Internet',
  selectable: true,
  closed: 0,
  learnings: 0,
  ...over,
});

describe('APRENDIZAJES · agregados', () => {
  it('cobertura = aprendizajes / cierres; los cierres sin aprendizaje entran en el denominador', () => {
    const summary = buildLearningsSummary([
      countRow({ closed: 5, learnings: 4 }),
      // Cierres históricos sin fila de resolución: cuentan como cierres.
      countRow({
        categoryId: 'c-app',
        name: 'Aplicativos',
        closed: 2,
        learnings: 0,
      }),
    ]);
    expect(summary.closedCount).toBe(7);
    expect(summary.learningCount).toBe(4);
    expect(summary.coverage).toBe(57);
    // Una categoría sin aprendizajes no aparece en la distribución.
    expect(summary.categories.map((c) => c.name)).toEqual(['Internet']);
  });

  it('sin cierres → cobertura null (no 0 %, no 100 %)', () => {
    expect(buildLearningsSummary([])).toEqual({
      closedCount: 0,
      learningCount: 0,
      coverage: null,
      categories: [],
    });
    expect(learningCoverage(0, 0)).toBeNull();
    expect(learningCoverage(0, 3)).toBe(0);
    expect(learningCoverage(3, 3)).toBe(100);
  });

  it('orden cantidad ↓ · nombre ↑; «Sin categoría» con id centinela; histórica conservada', () => {
    const summary = buildLearningsSummary([
      countRow({
        categoryId: 'c-b',
        name: 'Biblioteca',
        closed: 2,
        learnings: 2,
      }),
      countRow({
        categoryId: null,
        code: null,
        name: null,
        selectable: null,
        closed: 3,
        learnings: 3,
      }),
      countRow({ categoryId: 'c-a', name: 'Aulas', closed: 2, learnings: 2 }),
      countRow({
        categoryId: 'c-old',
        name: 'Legado',
        selectable: false,
        closed: 1,
        learnings: 1,
      }),
    ]);
    expect(summary.categories.map((c) => [c.id, c.name, c.count])).toEqual([
      [KPI_UNCATEGORIZED_CATEGORY_ID, 'Sin categoría', 3],
      ['c-a', 'Aulas', 2],
      ['c-b', 'Biblioteca', 2],
      ['c-old', 'Legado', 1],
    ]);
    expect(summary.categories.find((c) => c.id === 'c-old')?.selectable).toBe(
      false,
    );
  });

  it('extracto: corta en límite de palabra, colapsa espacios y nunca parte una palabra', () => {
    expect(learningExcerpt('  Corto\n\n y  claro ')).toEqual({
      excerpt: 'Corto y claro',
      truncated: false,
    });
    const long = 'alfa beta gamma delta, epsilon';
    const { excerpt, truncated } = learningExcerpt(long, 18);
    expect(truncated).toBe(true);
    // «alfa beta gamma de|lta» → se corta antes de «delta», sin la coma.
    expect(excerpt).toBe('alfa beta gamma…');
    expect(learningExcerpt('x'.repeat(30), 10).excerpt).toBe(
      `${'x'.repeat(10)}…`,
    );
  });
});

describe('OperationalKpiLearningsService', () => {
  const COORD = '11111111-1111-4111-8111-111111111111';
  const actor = { sub: 'u', permissions: ['KPIS_VIEW'] } as AuthPayload;
  const NOW = new Date('2026-10-07T15:00:00.000Z'); // 10:00 Bogotá

  const itemRow = (
    over: Partial<KpiLearningItemRow> = {},
  ): KpiLearningItemRow => ({
    situationId: 'p1',
    title: 'Caída de notas',
    reportKind: 'INTERNAL',
    categoryId: 'c-net',
    categoryCode: 'internet',
    categoryName: 'Internet',
    categorySelectable: true,
    closedAt: new Date('2026-10-02T19:00:00.000Z'),
    resolvedAt: new Date('2026-10-02T19:00:00.000Z'),
    recordedAt: new Date('2026-10-02T19:00:00.100Z'),
    resolvedByName: 'Coord',
    learning: 'Se documentó el rollback.',
    ...over,
  });

  function build(
    rows: KpiLearningCategoryCountRow[] = [],
    items: KpiLearningItemRow[] = [],
  ) {
    const repository = {
      countByCategory: jest.fn().mockResolvedValue(rows),
      findItems: jest
        .fn()
        .mockResolvedValue({ rows: items, total: items.length }),
    };
    const coordinations = {
      findActiveById: jest.fn((id: string) =>
        Promise.resolve(id === COORD ? { id: COORD } : null),
      ),
    };
    const scope = { assertPermission: jest.fn() };
    const service = new OperationalKpiLearningsService(
      scope as never,
      coordinations as never,
      repository as never,
    );
    return { service, repository, scope };
  }

  const query = (over: Partial<OperationalKpiLearningItemsQueryDto> = {}) =>
    ({
      scope: OperationalKpiScopeType.COORDINATION,
      coordinationId: COORD,
      from: '2026-10-01',
      to: '2026-10-31',
      calendarEnd: '2026-10-31',
      kind: OperationalKpiEstadoPeriodKind.MONTH,
      ...over,
    }) as OperationalKpiLearningItemsQueryDto;

  it('mes en curso: ventana [1 OCT 00:00 Bogotá, fin de HOY) sobre la coordinación RESPONSABLE', async () => {
    const { service, repository, scope } = build([
      countRow({ closed: 4, learnings: 3 }),
    ]);
    const response = await service.getLearnings(query(), actor, NOW);
    expect(scope.assertPermission).toHaveBeenCalledWith(actor, 'KPIS_VIEW');
    expect(repository.countByCategory).toHaveBeenCalledWith({
      coordinationId: COORD,
      startIso: '2026-10-01T05:00:00.000Z',
      endExclusiveIso: '2026-10-08T05:00:00.000Z',
    });
    expect(response).toMatchObject({
      closedCount: 4,
      learningCount: 3,
      withoutLearningCount: 1,
      coverage: 75,
      period: { dataTo: '2026-10-07', isCurrent: true, isPartial: true },
    });
  });

  it('semana que cruza meses (29 SEP – 5 OCT): ventana íntegra, no se recorta al mes', async () => {
    const { service, repository } = build();
    await service.getLearnings(
      query({
        kind: OperationalKpiEstadoPeriodKind.WEEK,
        from: '2026-09-28',
        to: '2026-10-04',
        calendarEnd: '2026-10-04',
      }),
      actor,
      NOW,
    );
    expect(repository.countByCategory).toHaveBeenCalledWith({
      coordinationId: COORD,
      startIso: '2026-09-28T05:00:00.000Z',
      endExclusiveIso: '2026-10-05T05:00:00.000Z',
    });
  });

  it('ciclo H2: desde 1 JUL hasta el fin de hoy', async () => {
    const { service, repository } = build();
    await service.getLearnings(
      query({
        kind: OperationalKpiEstadoPeriodKind.CYCLE,
        from: '2026-07-01',
        to: '2026-12-31',
        calendarEnd: '2026-12-31',
      }),
      actor,
      NOW,
    );
    expect(repository.countByCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        startIso: '2026-07-01T05:00:00.000Z',
        endExclusiveIso: '2026-10-08T05:00:00.000Z',
      }),
    );
  });

  it('fichas: página, desplazamiento, filtro de categoría y fechas diferenciadas', async () => {
    const { service, repository } = build(
      [],
      [
        itemRow({
          reportKind: SituationReportKind.INTER_COORDINATION,
          resolvedAt: new Date('2026-09-30T12:00:00.000Z'),
        }),
        itemRow({
          situationId: 'p2',
          categoryId: null,
          categoryName: null,
          categoryCode: null,
        }),
      ],
    );
    const response = await service.getLearningItems(
      query({ page: 3, limit: 10, categoryId: 'c-net' }),
      actor,
      NOW,
    );
    expect(repository.findItems).toHaveBeenCalledWith(
      expect.objectContaining({ coordinationId: COORD }),
      { categoryId: 'c-net', limit: 10, offset: 20 },
    );
    expect(response).toMatchObject({
      page: 3,
      limit: 10,
      categoryId: 'c-net',
      total: 2,
    });
    expect(response.items[0]).toMatchObject({
      reportKind: SituationReportKind.INTER_COORDINATION,
      closedAt: '2026-10-02T19:00:00.000Z',
      resolvedAt: '2026-09-30T12:00:00.000Z',
      recordedAt: '2026-10-02T19:00:00.100Z',
      learningExcerpt: 'Se documentó el rollback.',
      learningTruncated: false,
    });
    expect(response.items[1].category).toEqual({
      id: KPI_UNCATEGORIZED_CATEGORY_ID,
      code: 'UNCATEGORIZED',
      name: 'Sin categoría',
      selectable: false,
    });
  });

  it('fichas por defecto: página 1 de 20, todas las categorías', async () => {
    const { service, repository } = build();
    await service.getLearningItems(query(), actor, NOW);
    expect(repository.findItems).toHaveBeenCalledWith(expect.anything(), {
      categoryId: null,
      limit: 20,
      offset: 0,
    });
  });

  it('rechaza scope=direction, coordinación ausente o desconocida y periodo futuro', async () => {
    const { service } = build();
    await expect(
      service.getLearnings(
        query({ scope: OperationalKpiScopeType.DIRECTION }),
        actor,
        NOW,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getLearnings(query({ coordinationId: undefined }), actor, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getLearnings(
        query({ coordinationId: '22222222-2222-4222-8222-222222222222' }),
        actor,
        NOW,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.getLearnings(
        query({
          from: '2026-11-01',
          to: '2026-11-30',
          calendarEnd: '2026-11-30',
        }),
        actor,
        NOW,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('DTO de fichas: limit ≤ 50, page ≥ 1, categoryId UUID (o el centinela «Sin categoría»)', async () => {
    const errorsFor = async (over: Record<string, unknown>) =>
      (
        await validate(
          plainToInstance(OperationalKpiLearningItemsQueryDto, {
            scope: 'coordination',
            coordinationId: COORD,
            from: '2026-10-01',
            to: '2026-10-31',
            kind: 'month',
            ...over,
          }),
        )
      ).map((e) => e.property);
    expect(await errorsFor({ limit: '20', page: '2' })).toEqual([]);
    expect(
      await errorsFor({ categoryId: KPI_UNCATEGORIZED_CATEGORY_ID }),
    ).toEqual([]);
    expect(await errorsFor({ limit: '51' })).toEqual(['limit']);
    expect(await errorsFor({ page: '0' })).toEqual(['page']);
    expect(await errorsFor({ categoryId: 'internet' })).toEqual(['categoryId']);
  });
});
