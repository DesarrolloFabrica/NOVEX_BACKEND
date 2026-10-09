import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { DataSource, type QueryRunner } from 'typeorm';
import {
  bogotaDayEndExclusiveIso,
  bogotaDayStartIso,
} from './domain/kpi-history-buckets';
import { buildLearningsSummary } from './domain/kpi-learnings';
import { KPI_UNCATEGORIZED_CATEGORY_ID } from './domain/kpi-uncategorized-category';
import { OperationalKpiLearningsRepository } from './operational-kpi-learnings.repository';

/**
 * APRENDIZAJES contra PostgreSQL REAL (opt-in: NOVEX_PG_IT=1).
 * Fixtures dentro de una transacción que SIEMPRE se revierte; BD local de
 * .env (DB_*), nunca la de nube. Verifica atribución por coordinación
 * RESPONSABLE, cierres sin aprendizaje, fronteras del periodo, categorías y
 * paginación estable.
 *
 *   NOVEX_PG_IT=1 npx jest src/operational-kpis/operational-kpi-learnings.pg.spec.ts
 */

loadEnv({ path: join(__dirname, '../../.env'), override: false, quiet: true });

const RUN = process.env.NOVEX_PG_IT === '1';
const suite = RUN ? describe : describe.skip;

/** X: coordinación observada · Y: otra coordinación. */
const X = '7c000000-0000-4000-8000-0000000000aa';
const Y = '7c000000-0000-4000-8000-0000000000bb';
const NET = '7c000000-0000-4000-8000-0000000000c1';
const OLD = '7c000000-0000-4000-8000-0000000000c2';

const P = (n: number) =>
  `7c000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;

/** Octubre 2026 completo, Bogotá. */
const OCT = {
  coordinationId: X,
  startIso: bogotaDayStartIso('2026-10-01'),
  endExclusiveIso: bogotaDayEndExclusiveIso('2026-10-31'),
};

suite('Aprendizajes · SQL real (Postgres)', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;
  let repository: OperationalKpiLearningsRepository;

  beforeAll(async () => {
    if ((process.env.DB_CLOUD ?? 'false') === 'true') {
      throw new Error('Esta suite solo corre contra la BD local.');
    }
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST_LOCAL ?? process.env.DB_HOST,
      port: Number(process.env.DB_PORT_LOCAL ?? process.env.DB_PORT),
      username: process.env.DB_USERNAME_LOCAL ?? process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD_LOCAL ?? process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE_LOCAL ?? process.env.DB_DATABASE,
      entities: [],
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  beforeEach(async () => {
    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    repository = new OperationalKpiLearningsRepository({
      manager: runner.manager,
    } as never);

    for (const [id, code] of [
      [X, 'it-learn-x'],
      [Y, 'it-learn-y'],
    ]) {
      await runner.query(
        `INSERT INTO coordinations (id, code, name, short_name, color, icon, image_asset)
         VALUES ($1, $2, $2, $2, '#000000', 'x', 'x')`,
        [id, code],
      );
    }
    await runner.query(
      `INSERT INTO incident_categories (id, code, name, is_selectable)
       VALUES ($1, 'it-learn-net', 'Internet IT', true),
              ($2, 'it-learn-old', 'Legado IT', false)`,
      [NET, OLD],
    );
    const [user] = (await runner.query(
      `SELECT id FROM users LIMIT 1`,
    )) as Array<{
      id: string;
    }>;

    const insert = async (
      id: string,
      closedAt: string | null,
      extra: Partial<{
        kind: string;
        coordination: string;
        affected: string;
        category: string | null;
        learning: string | null;
      }> = {},
    ) => {
      await runner.query(
        `INSERT INTO situations (id, created_at, title, description, coordination_id,
           affected_coordination_id, report_kind, created_by_user_id, category_id,
           severity, reported_severity, status, closed_at, resolved_at, occurred_at)
         VALUES ($1, '2026-09-01T09:00:00-05:00', $2, 'it', $3, $4, $5, $6, $7,
           'MEDIUM', 'MEDIUM', $8, $9, $9, '2026-09-01T09:00:00-05:00')`,
        [
          id,
          `T ${id}`,
          extra.coordination ?? X,
          extra.affected ?? extra.coordination ?? X,
          extra.kind ?? 'INTERNAL',
          user.id,
          extra.category === undefined ? NET : extra.category,
          closedAt ? 'CLOSED' : 'OPEN',
          closedAt,
        ],
      );
      if (extra.learning) {
        await runner.query(
          `INSERT INTO situation_resolutions (situation_id, learning, resolved_by_user_id)
           VALUES ($1, $2, $3)`,
          [id, extra.learning, user.id],
        );
      }
    };

    // X · OCT · con aprendizaje (Internet).
    await insert(P(1), '2026-10-02T14:00:00-05:00', { learning: 'Uno' });
    await insert(P(2), '2026-10-05T09:00:00-05:00', { learning: 'Dos' });
    // Frontera exacta: 1 OCT 00:00 Bogotá entra; 1 NOV 00:00 no.
    await insert(P(3), '2026-10-01T00:00:00-05:00', { learning: 'Tres' });
    await insert(P(4), '2026-11-01T00:00:00-05:00', { learning: 'Fuera' });
    // 30 SEP 23:59 Bogotá (= 1 OCT 04:59 UTC): SEPTIEMBRE, no octubre.
    await insert(P(5), '2026-09-30T23:59:00-05:00', { learning: 'Sep' });
    // Histórico cerrado SIN fila de resolución: cierre, no aprendizaje.
    await insert(P(6), '2026-10-10T10:00:00-05:00');
    // Sin categoría y categoría histórica no seleccionable.
    await insert(P(7), '2026-10-11T10:00:00-05:00', {
      category: null,
      learning: 'Sin cat',
    });
    await insert(P(8), '2026-10-12T10:00:00-05:00', {
      category: OLD,
      learning: 'Legado',
    });
    // INTER con X responsable → de X.
    await insert(P(9), '2026-10-13T10:00:00-05:00', {
      kind: 'INTER_COORDINATION',
      affected: Y,
      learning: 'Inter propio',
    });
    // INTER donde X solo es la AFECTADA → de Y, nunca de X.
    await insert(P(10), '2026-10-14T10:00:00-05:00', {
      kind: 'INTER_COORDINATION',
      coordination: Y,
      affected: X,
      learning: 'Inter ajeno',
    });
    // Otra coordinación.
    await insert(P(11), '2026-10-15T10:00:00-05:00', {
      coordination: Y,
      learning: 'De Y',
    });
    // Activo: nunca entra.
    await insert(P(12), null);
    // Dos cierres en el MISMO instante: el desempate por id da orden total.
    await insert(P(13), '2026-10-20T10:00:00-05:00', { learning: 'A' });
    await insert(P(14), '2026-10-20T10:00:00-05:00', { learning: 'B' });
  });

  afterEach(async () => {
    await runner.rollbackTransaction();
    await runner.release();
  });

  it('resumen: universo de la coordinación RESPONSABLE en el periodo', async () => {
    const summary = buildLearningsSummary(
      await repository.countByCategory(OCT),
    );
    // P1 P2 P3 P6 P7 P8 P9 P13 P14 → 9 cierres; P6 sin aprendizaje → 8.
    expect(summary.closedCount).toBe(9);
    expect(summary.learningCount).toBe(8);
    expect(summary.coverage).toBe(89);
    expect(
      summary.categories.map((c) => [c.id, c.count, c.selectable]),
    ).toEqual([
      [NET, 6, true],
      [OLD, 1, false],
      [KPI_UNCATEGORIZED_CATEGORY_ID, 1, false],
    ]);
  });

  it('fichas: excluye afectada, otra coordinación, sin aprendizaje, activos y fuera de periodo', async () => {
    const { rows, total } = await repository.findItems(OCT, {
      categoryId: null,
      limit: 50,
      offset: 0,
    });
    expect(total).toBe(8);
    const ids = rows.map((row) => row.situationId);
    expect(ids).toEqual(
      expect.arrayContaining([
        P(1),
        P(2),
        P(3),
        P(7),
        P(8),
        P(9),
        P(13),
        P(14),
      ]),
    );
    for (const excluded of [P(4), P(5), P(6), P(10), P(11), P(12)]) {
      expect(ids).not.toContain(excluded);
    }
    // closedAt ↓ · id ↓
    expect(ids.slice(0, 2)).toEqual([P(14), P(13)]);
    expect(ids.at(-1)).toBe(P(3));
  });

  it('paginación: páginas disjuntas que suman el total, sin duplicados', async () => {
    const seen: string[] = [];
    for (let offset = 0; offset < 8; offset += 3) {
      const { rows, total } = await repository.findItems(OCT, {
        categoryId: null,
        limit: 3,
        offset,
      });
      expect(total).toBe(8);
      seen.push(...rows.map((row) => row.situationId));
    }
    expect(seen).toHaveLength(8);
    expect(new Set(seen).size).toBe(8);
  });

  it('filtro de categoría: real, histórica y «Sin categoría»', async () => {
    const byCategory = async (categoryId: string) =>
      (
        await repository.findItems(OCT, { categoryId, limit: 50, offset: 0 })
      ).rows.map((row) => row.situationId);
    expect(await byCategory(OLD)).toEqual([P(8)]);
    expect(await byCategory(KPI_UNCATEGORIZED_CATEGORY_ID)).toEqual([P(7)]);
    expect(await byCategory(NET)).toHaveLength(6);
  });

  it('semana que cruza meses (28 SEP – 4 OCT) incluye el 30 SEP y el 2 OCT', async () => {
    const { rows } = await repository.findItems(
      {
        coordinationId: X,
        startIso: bogotaDayStartIso('2026-09-28'),
        endExclusiveIso: bogotaDayEndExclusiveIso('2026-10-04'),
      },
      { categoryId: null, limit: 50, offset: 0 },
    );
    expect(rows.map((row) => row.situationId).sort()).toEqual(
      [P(1), P(3), P(5)].sort(),
    );
  });
});
