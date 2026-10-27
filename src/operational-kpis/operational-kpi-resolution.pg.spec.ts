import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { DataSource, type QueryRunner } from 'typeorm';
import {
  buildEstadoEvolutionBuckets,
  buildEstadoFlowSlots,
  type EstadoPeriodKind,
} from './domain/kpi-estado-evolution-buckets';
import { buildEstadoResolution } from './domain/kpi-estado-resolution';
import { OperationalKpiHistoryMetric } from './dto/operational-kpi-history-query.dto';
import { OperationalKpiHistoryRepository } from './operational-kpi-history.repository';
import { OperationalKpiResolutionRepository } from './operational-kpi-resolution.repository';

/**
 * RESOLUCIÓN contra PostgreSQL REAL (opt-in: NOVEX_PG_IT=1).
 * Fixtures dentro de una transacción que SIEMPRE se revierte; BD local de
 * .env (DB_*), nunca la de nube. Verifica duración exacta, fronteras de
 * periodo y de rango, universo y la cuadratura con «Solucionados»
 * (aggregateEventMetric CLOSED, el mismo SQL de Movimiento).
 *
 *   NOVEX_PG_IT=1 npx jest src/operational-kpis/operational-kpi-resolution.pg.spec.ts
 */

loadEnv({ path: join(__dirname, '../../.env'), override: false, quiet: true });

const RUN = process.env.NOVEX_PG_IT === '1';
const suite = RUN ? describe : describe.skip;

/** X: casos de producto · Y: fronteras de rango · Z: dato corrupto. */
const X = '7b000000-0000-4000-8000-0000000000aa';
const Y = '7b000000-0000-4000-8000-0000000000bb';
const Z = '7b000000-0000-4000-8000-0000000000cc';
const CAT = '7b000000-0000-4000-8000-0000000000dd';
const TODAY = '2026-10-07';
const HOUR = 3_600_000;

const P = (n: number) =>
  `7b000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;

suite('Resolución · SQL real (Postgres)', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;
  let resolution: OperationalKpiResolutionRepository;
  let history: OperationalKpiHistoryRepository;

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
    resolution = new OperationalKpiResolutionRepository(repo);
    history = new OperationalKpiHistoryRepository(repo);

    for (const [id, code] of [
      [X, 'it-res-x'],
      [Y, 'it-res-y'],
      [Z, 'it-res-z'],
    ]) {
      await runner.query(
        `INSERT INTO coordinations (id, code, name, short_name, color, icon, image_asset)
         VALUES ($1, $2, $2, $2, '#000000', 'x', 'x')`,
        [id, code],
      );
    }
    await runner.query(
      `INSERT INTO incident_categories (id, code, name) VALUES ($1, 'it-res-cat', 'Res IT')`,
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
      closedAt: string | null,
      extra: Partial<{
        kind: string;
        coordination: string;
        affected: string;
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
          CAT,
          closedAt ? 'CLOSED' : 'OPEN',
          closedAt,
        ],
      );

    // ── X: casos de producto ──────────────────────────────────────────
    // Mismo día, 4 h (OCT).
    await insert(
      P(1),
      '2026-10-02T10:00:00-05:00',
      '2026-10-02T14:00:00-05:00',
    );
    // Cruza medianoche Bogotá: 1 h (OCT).
    await insert(
      P(2),
      '2026-10-01T23:30:00-05:00',
      '2026-10-02T00:30:00-05:00',
    );
    // Creado JUL, cerrado SEP → Resolución de SEP (≈ 62 d).
    await insert(
      P(3),
      '2026-07-10T09:00:00-05:00',
      '2026-09-10T09:00:00-05:00',
    );
    // Creado SEP, cerrado OCT → OCT, no SEP.
    await insert(
      P(4),
      '2026-09-20T09:00:00-05:00',
      '2026-10-05T09:00:00-05:00',
    );
    // Cierre EXACTO 1 OCT 00:00 Bogotá → OCT (semiabierto).
    await insert(
      P(5),
      '2026-09-26T00:00:00-05:00',
      '2026-10-01T00:00:00-05:00',
    );
    // INTER con X responsable → incluido (SEP, 2 d).
    await insert(
      P(6),
      '2026-09-15T09:00:00-05:00',
      '2026-09-17T09:00:00-05:00',
      {
        kind: 'INTER_COORDINATION',
        affected: Y,
      },
    );
    // INTER donde X solo es la afectada → excluido (pertenece a Y).
    await insert(
      P(7),
      '2026-09-15T09:00:00-05:00',
      '2026-09-16T09:00:00-05:00',
      {
        kind: 'INTER_COORDINATION',
        coordination: Y,
        affected: X,
      },
    );
    // Abierto (120+ días): nunca entra en Resolución.
    await insert(P(8), '2026-06-01T09:00:00-05:00', null);
    // Cerrado en AGO (7 d) y otro en SEP (10 d) para mediana/P75.
    await insert(
      P(9),
      '2026-08-01T09:00:00-05:00',
      '2026-08-08T09:00:00-05:00',
    );
    await insert(
      P(10),
      '2026-09-01T09:00:00-05:00',
      '2026-09-11T09:00:00-05:00',
    );

    // ── Y: fronteras exactas de rango (todas cerradas el 25 SEP 12:00) ──
    const closedAt = Date.parse('2026-09-25T12:00:00-05:00');
    const boundaries = [
      23 + 59 / 60,
      24,
      71 + 59 / 60,
      72,
      167 + 59 / 60,
      168,
      335 + 59 / 60,
      336,
      719 + 59 / 60,
      720,
    ];
    for (const [i, hours] of boundaries.entries()) {
      await insert(
        P(20 + i),
        new Date(closedAt - Math.round(hours * HOUR)).toISOString(),
        new Date(closedAt).toISOString(),
        { coordination: Y },
      );
    }

    // ── Z: dato corrupto (closed_at < created_at) ─────────────────────
    await insert(
      P(40),
      '2026-09-10T12:00:00-05:00',
      '2026-09-10T09:00:00-05:00',
      {
        coordination: Z,
      },
    );
  });

  afterEach(async () => {
    await runner.rollbackTransaction();
    await runner.release();
  });

  /** /state completo de Resolución + «Solucionados» con la MISMA geometría. */
  async function stateOf(
    coordinationId: string,
    kind: EstadoPeriodKind,
    from: string,
    calendarEnd: string,
  ) {
    const dataTo = calendarEnd < TODAY ? calendarEnd : TODAY;
    const buckets = buildEstadoEvolutionBuckets(kind, from, dataTo);
    const slots = buildEstadoFlowSlots(kind, from, calendarEnd, dataTo, TODAY);
    const [byBucket, summary, closed] = await Promise.all([
      resolution.aggregateByBucket(coordinationId, buckets),
      resolution.aggregateSummary(coordinationId, from, dataTo),
      history.aggregateEventMetric(
        coordinationId,
        OperationalKpiHistoryMetric.CLOSED,
        buckets,
      ),
    ]);
    const solved = slots.map((slot) =>
      slot.dataEnd ? (closed.get(slot.dataEnd) ?? 0) : null,
    );
    return {
      res: buildEstadoResolution({ slots, byBucket, summary }),
      solved,
      slots,
    };
  }

  const days = (hours: number) => hours / 24;

  it('duración exacta: mismo día 4 h y cruce de medianoche 1 h (no días calendario)', async () => {
    const { res } = await stateOf(X, 'week', '2026-09-28', '2026-10-04');
    const byStart = new Map(res.buckets.map((b) => [b.start, b]));
    // 1 OCT: solo el cierre de las 00:00 (P5); 2 OCT: 1 h y 4 h.
    const oct2 = byStart.get('2026-10-02')!;
    expect(oct2.closedCount).toBe(2);
    // Mediana de 1 h y 4 h = 2,5 h; P75 = 3,25 h (en días decimales).
    expect(oct2.medianDays).toBeCloseTo(days(2.5), 6);
    expect(oct2.p75Days).toBeCloseTo(days(3.25), 6);
    expect(res.distribution.find((b) => b.key === 'lt-1d')?.count).toBe(2);
  });

  it('creado JUL / cerrado SEP pertenece a SEP; creado SEP / cerrado OCT no está en SEP', async () => {
    const sep = await stateOf(X, 'month', '2026-09-01', '2026-09-30');
    // SEP: P3 (62 d), P6 (2 d), P10 (10 d). P4 y P5 cerraron en OCT.
    expect(sep.res.closedCount).toBe(3);
    expect(sep.res.medianDays).toBeCloseTo(10, 6);
    const oct = await stateOf(X, 'month', '2026-10-01', '2026-10-31');
    // OCT: P1, P2, P4 (15 d) y P5 (cierre exacto 1 OCT 00:00).
    expect(oct.res.closedCount).toBe(4);
    expect(oct.res.buckets[0]).toMatchObject({
      start: '2026-10-01',
      closedCount: 3,
    });
  });

  it('universo: INTERNAL e INTER responsable entran; INTER solo afectada y abiertos no', async () => {
    const h2 = await stateOf(X, 'cycle', '2026-07-01', '2026-12-31');
    // P1, P2, P3, P4, P5, P6, P9, P10 = 8 (P7 es de Y, P8 sigue abierto).
    expect(h2.res.closedCount).toBe(8);
    const y = await stateOf(Y, 'month', '2026-09-01', '2026-09-30');
    // Y: 10 fronteras + P7 (Y responsable).
    expect(y.res.closedCount).toBe(11);
  });

  it('bucket pasado sin cierres = 0 / null / null; bucket futuro = null (nunca 0)', async () => {
    const { res } = await stateOf(X, 'cycle', '2026-07-01', '2026-12-31');
    const [jul, ago, sep, oct, nov, dic] = res.buckets;
    expect(jul).toEqual({
      start: '2026-07-01',
      closedCount: 0,
      medianDays: null,
      p75Days: null,
    });
    expect(ago.closedCount).toBe(1);
    expect(ago.medianDays).toBeCloseTo(7, 6);
    expect(sep.closedCount).toBe(3);
    expect(oct.closedCount).toBe(4);
    for (const future of [nov, dic]) {
      expect(future).toMatchObject({
        closedCount: null,
        medianDays: null,
        p75Days: null,
      });
    }
  });

  it('mediana y P75 con percentile_cont (no media)', async () => {
    const { res } = await stateOf(X, 'month', '2026-09-01', '2026-09-30');
    // SEP: 2 d, 10 d, 62 d → mediana 10; P75 = 10 + 0,5·(62−10) = 36.
    expect(res.medianDays).toBeCloseTo(10, 6);
    expect(res.p75Days).toBeCloseTo(36, 6);
  });

  it('rangos semiabiertos: cada frontera cae en exactamente un rango', async () => {
    const { res } = await stateOf(Y, 'month', '2026-09-01', '2026-09-30');
    expect(res.distribution).toEqual([
      // 23:59 h → < 1 d; 24 h y P7 (exactamente 24 h) → 1–3 d.
      { key: 'lt-1d', fromHours: 0, toHours: 24, count: 1 },
      { key: '1-3d', fromHours: 24, toHours: 72, count: 3 },
      { key: '3-7d', fromHours: 72, toHours: 168, count: 2 },
      { key: '7-14d', fromHours: 168, toHours: 336, count: 2 },
      { key: '14-30d', fromHours: 336, toHours: 720, count: 2 },
      { key: '30d+', fromHours: 720, toHours: null, count: 1 },
    ]);
  });

  it('sin duraciones negativas: closed_at < created_at se acota a 0 y se sigue contando', async () => {
    const { res, solved } = await stateOf(
      Z,
      'month',
      '2026-09-01',
      '2026-09-30',
    );
    expect(res.closedCount).toBe(1);
    expect(res.medianDays).toBe(0);
    expect(res.distribution[0].count).toBe(1);
    expect(solved.reduce<number>((a, b) => a + (b ?? 0), 0)).toBe(1);
  });

  it('INVARIANTE con Movimiento: por bucket y en el periodo (ciclo, mes, semana)', async () => {
    const cases: Array<[string, EstadoPeriodKind, string, string]> = [
      [X, 'cycle', '2026-07-01', '2026-12-31'],
      [X, 'month', '2026-09-01', '2026-09-30'],
      [X, 'month', '2026-10-01', '2026-10-31'],
      [X, 'week', '2026-09-28', '2026-10-04'],
      [X, 'week', '2026-10-05', '2026-10-11'],
      [Y, 'month', '2026-09-01', '2026-09-30'],
    ];
    for (const [id, kind, from, calendarEnd] of cases) {
      const { res, solved, slots } = await stateOf(id, kind, from, calendarEnd);
      expect(res.buckets.map((b) => b.start)).toEqual(
        slots.map((s) => s.bucket.start),
      );
      expect(res.buckets.map((b) => b.closedCount)).toEqual(solved);
      const sum = (values: Array<number | null>) =>
        values.reduce<number>((a, b) => a + (b ?? 0), 0);
      expect(res.closedCount).toBe(sum(res.buckets.map((b) => b.closedCount)));
      expect(res.closedCount).toBe(sum(res.distribution.map((b) => b.count)));
      expect(res.closedCount).toBe(sum(solved));
      for (const b of res.buckets) {
        if (b.medianDays !== null) {
          expect(b.medianDays).toBeGreaterThanOrEqual(0);
          expect(b.p75Days!).toBeGreaterThanOrEqual(b.medianDays);
        }
      }
    }
  });
});
