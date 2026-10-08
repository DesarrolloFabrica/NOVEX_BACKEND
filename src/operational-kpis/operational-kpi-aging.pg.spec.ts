import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { DataSource, type QueryRunner } from 'typeorm';
import {
  bogotaDayEndExclusiveIso,
  bogotaDayEndInclusiveIso,
  type KpiHistoryBucket,
} from './domain/kpi-history-buckets';
import { OperationalKpiAgingRepository } from './operational-kpi-aging.repository';
import { OperationalKpiHistoryRepository } from './operational-kpi-history.repository';
import { OperationalKpiSnapshotRepository } from './operational-kpi-snapshot.repository';

/**
 * ANTIGÜEDAD contra PostgreSQL REAL (opt-in: NOVEX_PG_IT=1).
 * Ejecuta el SQL de Antigüedad y el de Carga (aggregateActiveByKind) sobre
 * fixtures insertados dentro de una transacción que SIEMPRE se revierte: no
 * deja datos. Usa la BD local de .env (DB_*), nunca la de nube.
 *
 *   NOVEX_PG_IT=1 npx jest src/operational-kpis/operational-kpi-aging.pg.spec.ts
 */

loadEnv({ path: join(__dirname, '../../.env'), override: false, quiet: true });

const RUN = process.env.NOVEX_PG_IT === '1';
const suite = RUN ? describe : describe.skip;

const X = '7a000000-0000-4000-8000-0000000000aa';
const Y = '7a000000-0000-4000-8000-0000000000bb';
const CAT = '7a000000-0000-4000-8000-0000000000cc';

function bucket(ymd: string): KpiHistoryBucket {
  return {
    start: ymd,
    end: ymd,
    label: ymd,
    endExclusiveIso: bogotaDayEndExclusiveIso(ymd),
    endInclusiveIso: bogotaDayEndInclusiveIso(ymd),
  };
}

suite('Antigüedad · SQL real (Postgres)', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;
  let aging: OperationalKpiAgingRepository;
  let history: OperationalKpiHistoryRepository;
  let snapshot: OperationalKpiSnapshotRepository;

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
    const repo = { manager: runner.manager } as never;
    aging = new OperationalKpiAgingRepository(repo);
    history = new OperationalKpiHistoryRepository(repo);
    snapshot = new OperationalKpiSnapshotRepository(repo);

    for (const [id, code, name] of [
      [X, 'it-aging-x', 'IT Aging X'],
      [Y, 'it-aging-y', 'IT Aging Y'],
    ]) {
      await runner.query(
        `INSERT INTO coordinations (id, code, name, short_name, color, icon, image_asset)
         VALUES ($1, $2, $3, $3, '#000000', 'x', 'x')`,
        [id, code, name],
      );
    }
    await runner.query(
      `INSERT INTO incident_categories (id, code, name) VALUES ($1, 'it-aging-cat', 'Admisiones IT')`,
      [CAT],
    );

    const [user] = (await runner.query(
      `SELECT id FROM users LIMIT 1`,
    )) as Array<{
      id: string;
    }>;
    const insert = (
      id: string,
      createdAt: string,
      extra: Partial<{
        closedAt: string;
        status: string;
        kind: string;
        coordination: string;
        affected: string;
        category: string;
      }> = {},
    ) =>
      runner.query(
        `INSERT INTO situations (id, created_at, title, description, coordination_id,
           affected_coordination_id, report_kind, created_by_user_id, category_id,
           severity, reported_severity, status, closed_at, occurred_at)
         VALUES ($1, $2, $3, 'it', $4, $5, $6, $7, $8, 'MEDIUM', 'MEDIUM', $9, $10, $2)`,
        [
          id,
          createdAt,
          `T ${id}`,
          extra.coordination ?? X,
          extra.affected ?? extra.coordination ?? X,
          extra.kind ?? 'INTERNAL',
          user.id,
          extra.category ?? null,
          extra.status ?? (extra.closedAt ? 'CLOSED' : 'OPEN'),
          extra.closedAt ?? null,
        ],
      );

    const P = (n: number) =>
      `7a000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
    // 63 d al 7 oct
    await insert(P(1), '2026-08-05T09:00:00-05:00', { category: CAT });
    // cerrado antes del corte de septiembre
    await insert(P(2), '2026-08-20T09:00:00-05:00', {
      closedAt: '2026-09-25T09:00:00-05:00',
    });
    // cerrado después del 30 sep (activo en septiembre)
    await insert(P(3), '2026-09-02T09:00:00-05:00', {
      closedAt: '2026-10-03T09:00:00-05:00',
    });
    // RESOLVED heredado sin closed_at
    await insert(P(4), '2026-09-05T09:00:00-05:00', { status: 'RESOLVED' });
    // INTER: X responsable (compromiso) → incluido
    await insert(P(5), '2026-09-20T09:00:00-05:00', {
      kind: 'INTER_COORDINATION',
      affected: Y,
    });
    // INTER: X solo afectada → excluido
    await insert(P(6), '2026-09-21T09:00:00-05:00', {
      kind: 'INTER_COORDINATION',
      coordination: Y,
      affected: X,
    });
    // 6 oct 23:30 Bogotá (= 7 oct 04:30 UTC) → edad 1 al 7 oct
    await insert(P(7), '2026-10-06T23:30:00-05:00');
    // 7 oct 00:10 Bogotá → edad 0
    await insert(P(8), '2026-10-07T00:10:00-05:00');
  });

  afterEach(async () => {
    await runner.rollbackTransaction();
    await runner.release();
  });

  it('corte 7 oct: universo, edades Bogotá, orden y límite', async () => {
    const oldest = await aging.findOldest(X, '2026-10-07');
    expect(oldest.map((row) => [row.title, row.ageDays])).toEqual([
      ['T 7a000000-0000-4000-8000-000000000001', 63],
      ['T 7a000000-0000-4000-8000-000000000004', 32],
      ['T 7a000000-0000-4000-8000-000000000005', 17],
      ['T 7a000000-0000-4000-8000-000000000007', 1],
      ['T 7a000000-0000-4000-8000-000000000008', 0],
    ]);
    expect(oldest[0].categoryName).toBe('Admisiones IT');
    expect(oldest[2].affectedCoordinationName).toBe('IT Aging Y');
  });

  it('corte 30 sep: cerrado después aparece; cerrado antes no', async () => {
    const oldest = await aging.findOldest(X, '2026-09-30');
    const titles = oldest.map((row) => row.title.slice(-2));
    expect(titles).toEqual(['01', '03', '04', '05']);
    expect(oldest[1].closedAt).toBe('2026-10-03T14:00:00.000Z');
  });

  it('mediana (percentile_cont) y rangos', async () => {
    const summary = await aging.aggregateSummary(X, '2026-10-07');
    // edades: 63, 32, 17, 1, 0 → mediana 17
    expect(summary).toEqual({
      activeCount: 5,
      medianAgeDays: 17,
      bands: [
        { key: '0-7', count: 2 },
        { key: '8-14', count: 0 },
        { key: '15-30', count: 1 },
        { key: '31+', count: 2 },
      ],
    });
  });

  it('cuadratura con Carga (aggregateActiveByKind) en varios cortes', async () => {
    for (const ymd of [
      '2026-09-27',
      '2026-09-30',
      '2026-10-06',
      '2026-10-07',
    ]) {
      const [summary, load, composition] = await Promise.all([
        aging.aggregateSummary(X, ymd),
        history.aggregateActiveByKind(X, [bucket(ymd)]),
        snapshot.aggregateComposition(X, ymd),
      ]);
      const kinds = load.get(ymd)!;
      expect(summary.activeCount).toBe(kinds.internal + kinds.external);
      // Una sola población: Carga = Antigüedad = Severidad = Atención.
      const sev = composition.severity;
      const att = composition.attention;
      expect(composition.activeCount).toBe(summary.activeCount);
      expect(sev.low + sev.medium + sev.high + sev.critical).toBe(
        composition.activeCount,
      );
      expect(
        att.open + att.inProgress + att.closedAfterCut + att.unclassified,
      ).toBe(composition.activeCount);
    }
    // 30 sep: P03 (cerrado 3 oct) estaba activo → «cerrado después del corte».
    const sep = await snapshot.aggregateComposition(X, '2026-09-30');
    expect(sep.attention.closedAfterCut).toBe(1);
    // RESOLVED legado sin closed_at → en atención.
    const today = await snapshot.aggregateComposition(X, '2026-10-07');
    expect(today.attention.closedAfterCut).toBe(0);
    expect(today.attention.inProgress).toBeGreaterThanOrEqual(1);
  });

  it('rangos: límites 7|8, 14|15, 30|31 en Bogotá; cada problema en una sola banda; suma = activos', async () => {
    const Z = '7a000000-0000-4000-8000-0000000000dd';
    await runner.query(
      `INSERT INTO coordinations (id, code, name, short_name, color, icon, image_asset)
       VALUES ($1, 'it-aging-z', 'IT Aging Z', 'IT Aging Z', '#000000', 'x', 'x')`,
      [Z],
    );
    const [user] = (await runner.query(
      'SELECT id FROM users LIMIT 1',
    )) as Array<{ id: string }>;
    const ref = '2026-10-31';
    // Registrados a las 23:50 Bogotá (04:50 UTC del día siguiente): borde real.
    const ages = [0, 7, 8, 14, 15, 30, 31, 90];
    for (const [index, age] of ages.entries()) {
      const day = new Date(
        Date.parse(`${ref}T12:00:00-05:00`) - age * 86_400_000,
      )
        .toISOString()
        .slice(0, 10);
      await runner.query(
        `INSERT INTO situations (id, created_at, title, description, coordination_id,
           affected_coordination_id, report_kind, created_by_user_id, severity, reported_severity, status, occurred_at)
         VALUES ($1, $2, $3, 'it', $4, $4, 'INTERNAL', $5, 'LOW', 'LOW', 'OPEN', $2)`,
        [
          `7a000000-0000-4000-8000-0000000001${String(index).padStart(2, '0')}`,
          `${day}T23:50:00-05:00`,
          `edad ${age}`,
          Z,
          user.id,
        ],
      );
    }
    const summary = await aging.aggregateSummary(Z, ref);
    expect(summary.activeCount).toBe(ages.length);
    expect(summary.bands).toEqual([
      { key: '0-7', count: 2 }, // 0, 7
      { key: '8-14', count: 2 }, // 8, 14
      { key: '15-30', count: 2 }, // 15, 30
      { key: '31+', count: 2 }, // 31, 90
    ]);
    expect(summary.bands.reduce((sum, band) => sum + band.count, 0)).toBe(
      summary.activeCount,
    );
    // La edad del ranking coincide con el rango (misma expresión SQL).
    const oldest = await aging.findOldest(Z, ref);
    expect(oldest.map((row) => row.ageDays)).toEqual([90, 31, 30, 15, 14]);
  });

  it('suma de rangos = activeCount en todos los cortes del fixture', async () => {
    for (const ymd of [
      '2026-09-27',
      '2026-09-30',
      '2026-10-06',
      '2026-10-07',
    ]) {
      const summary = await aging.aggregateSummary(X, ymd);
      expect(summary.bands.reduce((sum, band) => sum + band.count, 0)).toBe(
        summary.activeCount,
      );
    }
  });

  it('scope coordinación: X e Y dan lecturas distintas en el mismo corte; INTER Y→X solo cuenta para Y', async () => {
    const [x, y] = await Promise.all([
      aging.aggregateSummary(X, '2026-10-07'),
      aging.aggregateSummary(Y, '2026-10-07'),
    ]);
    const [xOldest, yOldest] = await Promise.all([
      aging.findOldest(X, '2026-10-07'),
      aging.findOldest(Y, '2026-10-07'),
    ]);
    expect(x.activeCount).not.toBe(y.activeCount);
    // P06 (responsable Y, afectada X) pertenece a Y, nunca a X.
    expect(yOldest.map((row) => row.title)).toContain(
      'T 7a000000-0000-4000-8000-000000000006',
    );
    expect(xOldest.map((row) => row.title)).not.toContain(
      'T 7a000000-0000-4000-8000-000000000006',
    );
    for (const summary of [x, y]) {
      expect(summary.bands.reduce((a, b) => a + b.count, 0)).toBe(
        summary.activeCount,
      );
    }
  });
});
