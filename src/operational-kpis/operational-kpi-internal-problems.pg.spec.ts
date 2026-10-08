import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { DataSource, type QueryRunner } from 'typeorm';
import {
  bogotaDayEndExclusiveIso,
  bogotaDayEndInclusiveIso,
  type KpiHistoryBucket,
} from './domain/kpi-history-buckets';
import { OperationalKpiHistoryRepository } from './operational-kpi-history.repository';
import { OperationalKpiInternalProblemsRepository } from './operational-kpi-internal-problems.repository';
import { OperationalKpiInternalRecurrenceRepository } from './operational-kpi-internal-recurrence.repository';
import {
  buildEstadoEvolutionBuckets,
  buildEstadoFlowSlots,
  type EstadoPeriodKind,
} from './domain/kpi-estado-evolution-buckets';
import { buildRecurrenceMatrix } from './domain/kpi-internal-recurrence';
import { SituationReportKind } from '../common/enums/situation.enums';
import { OperationalKpiHistoryMetric } from './dto/operational-kpi-history-query.dto';

/**
 * INTERNOS · tabla del Director contra PostgreSQL REAL (opt-in: NOVEX_PG_IT=1).
 * Fixtures dentro de una transacción que SIEMPRE se revierte. BD local de .env.
 *
 *   NOVEX_PG_IT=1 npx jest src/operational-kpis/operational-kpi-internal-problems.pg.spec.ts
 */

loadEnv({ path: join(__dirname, '../../.env'), override: false, quiet: true });

const RUN = process.env.NOVEX_PG_IT === '1';
const suite = RUN ? describe : describe.skip;

const X = '7b000000-0000-4000-8000-0000000000aa';
const Y = '7b000000-0000-4000-8000-0000000000bb';
const CAT = '7b000000-0000-4000-8000-0000000000cc';
const P = (n: number) =>
  `7b000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;

function bucket(ymd: string): KpiHistoryBucket {
  return {
    start: ymd,
    end: ymd,
    label: ymd,
    endExclusiveIso: bogotaDayEndExclusiveIso(ymd),
    endInclusiveIso: bogotaDayEndInclusiveIso(ymd),
  };
}

suite('INTERNOS · tabla del Director · SQL real (Postgres)', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;
  let repo: OperationalKpiInternalProblemsRepository;
  let history: OperationalKpiHistoryRepository;
  let recurrence: OperationalKpiInternalRecurrenceRepository;
  let insertSituation: (
    id: string,
    createdAt: string,
    extra?: {
      kind?: string;
      coordination?: string;
      affected?: string;
      category?: string | null;
    },
  ) => Promise<unknown>;

  const activeAt = (ymd: string, isCurrent = false) =>
    repo.findRows({
      coordinationId: X,
      cutIso: bogotaDayEndExclusiveIso(ymd),
      refDate: ymd,
      isCurrent,
    });

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
    const typeorm = { manager: runner.manager } as never;
    repo = new OperationalKpiInternalProblemsRepository(typeorm);
    history = new OperationalKpiHistoryRepository(typeorm);
    recurrence = new OperationalKpiInternalRecurrenceRepository(typeorm);

    for (const [id, code, name] of [
      [X, 'it-internos-x', 'IT Internos X'],
      [Y, 'it-internos-y', 'IT Internos Y'],
    ]) {
      await runner.query(
        `INSERT INTO coordinations (id, code, name, short_name, color, icon, image_asset)
         VALUES ($1, $2, $3, $3, '#000000', 'x', 'x')`,
        [id, code, name],
      );
    }
    await runner.query(
      `INSERT INTO incident_categories (id, code, name) VALUES ($1, 'it-internos-cat', 'Internet IT')`,
      [CAT],
    );
    const [user] = (await runner.query(
      `SELECT id FROM users LIMIT 1`,
    )) as Array<{ id: string }>;

    const situation = async (
      id: string,
      createdAt: string,
      extra: Partial<{
        reported: string;
        current: string;
        closedAt: string;
        status: string;
        kind: string;
        coordination: string;
        affected: string;
        dueAt: string;
        /** Instante de la fila REPORTED (backfill); default = alta. */
        reportedRecordedAt: string;
        category: string | null;
      }> = {},
    ) => {
      const reported = extra.reported ?? 'MEDIUM';
      await runner.query(
        `INSERT INTO situations (id, created_at, title, description, coordination_id,
           affected_coordination_id, report_kind, created_by_user_id, category_id,
           severity, reported_severity, status, closed_at, occurred_at, due_at)
         VALUES ($1, $2, $3, 'it', $4, $5, $6, $7, $8, $9, $10, $11, $12, $2, $13)`,
        [
          id,
          createdAt,
          `T ${id.slice(-2)}`,
          extra.coordination ?? X,
          extra.affected ?? extra.coordination ?? X,
          extra.kind ?? 'INTERNAL',
          user.id,
          extra.category === undefined ? CAT : extra.category,
          extra.current ?? reported,
          reported,
          extra.status ?? (extra.closedAt ? 'CLOSED' : 'OPEN'),
          extra.closedAt ?? null,
          extra.dueAt ?? null,
        ],
      );
      await runner.query(
        `INSERT INTO situation_severity_changes
           (situation_id, previous_severity, new_severity, source, effective_at, created_at, actor_user_id)
         VALUES ($1, NULL, $2, 'REPORTED', $3, $4, $5)`,
        [
          id,
          reported,
          createdAt,
          extra.reportedRecordedAt ?? createdAt,
          user.id,
        ],
      );
    };
    insertSituation = situation;
    const escalate = (
      id: string,
      from: string,
      to: string,
      effectiveAt: string,
      rule: string,
    ) =>
      runner.query(
        `INSERT INTO situation_severity_changes
           (situation_id, previous_severity, new_severity, source, effective_at, policy_code, rule_key)
         VALUES ($1, $2, $3, 'AUTO_TIME', $4, 'it-policy', $5)`,
        [id, from, to, effectiveAt, rule],
      );
    const consequence = (
      id: string,
      description: string,
      occurredAt: string,
      createdAt: string,
    ) =>
      runner.query(
        `INSERT INTO situation_consequences (situation_id, description, occurred_at, created_at, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, description, occurredAt, createdAt, user.id],
      );
    const statusChange = (id: string, to: string, at: string) =>
      runner.query(
        `INSERT INTO situation_timeline_entries (situation_id, user_id, event_type, title, description, metadata, created_at)
         VALUES ($1, $2, 'STATUS_CHANGED', 'estado', 'estado', $3, $4)`,
        [id, user.id, JSON.stringify({ field: 'status', newValue: to }), at],
      );

    // P01 · el «A»: MEDIUM → HIGH (1 oct) → CRITICAL (4 oct), 3 afectaciones.
    await situation(P(1), '2026-09-28T09:00:00-05:00', {
      current: 'CRITICAL',
      status: 'IN_PROGRESS',
      dueAt: '2026-10-05T09:00:00-05:00',
    });
    await escalate(P(1), 'MEDIUM', 'HIGH', '2026-10-01T09:00:00-05:00', 'r1');
    await escalate(P(1), 'HIGH', 'CRITICAL', '2026-10-04T09:00:00-05:00', 'r2');
    await consequence(
      P(1),
      'primera',
      '2026-09-29T10:00:00-05:00',
      '2026-09-29T10:05:00-05:00',
    );
    // Ocurrió el 30 sep pero se registró el 2 oct: no se conocía el 30 sep.
    await consequence(
      P(1),
      'tardía',
      '2026-09-30T10:00:00-05:00',
      '2026-10-02T08:00:00-05:00',
    );
    await consequence(
      P(1),
      'x'.repeat(200),
      '2026-10-05T16:30:00-05:00',
      '2026-10-05T16:40:00-05:00',
    );
    // Registrada el 6 oct pero ocurrida el 1 oct: no es «la última».
    await consequence(
      P(1),
      'antigua registrada tarde',
      '2026-10-01T09:00:00-05:00',
      '2026-10-06T09:00:00-05:00',
    );
    await statusChange(P(1), 'IN_PROGRESS', '2026-10-02T09:00:00-05:00');

    // P02 · el «F»: recién creado, sin afectaciones.
    await situation(P(2), '2026-10-07T08:00:00-05:00');
    // P03 · legacy: fila REPORTED escrita por el backfill (6 oct).
    await situation(P(3), '2026-08-01T09:00:00-05:00', {
      reportedRecordedAt: '2026-10-06T12:00:00-05:00',
      status: 'IN_PROGRESS',
    });
    // P04 · INTER donde X es responsable: cuenta en Carga.external, NO en la tabla.
    await situation(P(4), '2026-09-20T09:00:00-05:00', {
      kind: 'INTER_COORDINATION',
      affected: Y,
    });
    // P05 · INTERNAL cerrado el 3 oct; LOW → MEDIUM el 1 oct.
    await situation(P(5), '2026-09-25T09:00:00-05:00', {
      reported: 'LOW',
      current: 'MEDIUM',
      closedAt: '2026-10-03T09:00:00-05:00',
      dueAt: '2026-10-09T09:00:00-05:00',
    });
    await escalate(P(5), 'LOW', 'MEDIUM', '2026-10-01T09:00:00-05:00', 'r1');
    await consequence(
      P(5),
      'antes del cierre',
      '2026-10-02T09:00:00-05:00',
      '2026-10-02T09:00:00-05:00',
    );
    // P06 · INTERNAL de Y: fuera.
    await situation(P(6), '2026-09-26T09:00:00-05:00', { coordination: Y });
    // P07 · INTER donde X solo es afectada: fuera de Carga y de la tabla.
    await situation(P(7), '2026-09-26T09:00:00-05:00', {
      kind: 'INTER_COORDINATION',
      coordination: Y,
      affected: X,
    });
  });

  afterEach(async () => {
    await runner.rollbackTransaction();
    await runner.release();
  });

  it('INVARIANTE: total ACTIVOS === Carga.active.internal en varios cortes', async () => {
    for (const ymd of [
      '2026-09-24',
      '2026-09-28',
      '2026-09-30',
      '2026-10-02',
      '2026-10-03',
      '2026-10-07',
    ]) {
      const [{ rows }, load] = await Promise.all([
        activeAt(ymd),
        history.aggregateActiveByKind(X, [bucket(ymd)]),
      ]);
      expect({ ymd, total: rows.length }).toEqual({
        ymd,
        total: load.get(ymd)!.internal,
      });
    }
  });

  it('universo: solo INTERNAL de X activos al corte (sin INTER, sin Y)', async () => {
    const { rows, truncated } = await activeAt('2026-10-07');
    expect(rows.map((row) => row.id).sort()).toEqual([P(1), P(2), P(3)]);
    expect(truncated).toBe(false);
    const sep = await activeAt('2026-09-30');
    // P05 cerró el 3 oct: el 30 sep estaba activo.
    expect(sep.rows.map((row) => row.id).sort()).toEqual([P(1), P(3), P(5)]);
  });

  it('severityAtCut sale del historial (effective_at < T)', async () => {
    const at = async (ymd: string) =>
      (await activeAt(ymd)).rows.find((row) => row.id === P(1))!;
    expect((await at('2026-09-30')).severityAtCut).toBe('MEDIUM');
    expect((await at('2026-10-02')).severityAtCut).toBe('HIGH');
    expect((await at('2026-10-07')).severityAtCut).toBe('CRITICAL');
    expect((await at('2026-10-07')).reportedSeverity).toBe('MEDIUM');
  });

  it('afectaciones conocidas al corte (created_at) y última por occurred_at', async () => {
    const at = async (ymd: string) =>
      (await activeAt(ymd)).rows.find((row) => row.id === P(1))!;

    const sep30 = await at('2026-09-30');
    // «tardía» ocurrió el 30 sep pero se registró el 2 oct.
    expect(sep30.consequenceCountAtCut).toBe(1);
    expect(sep30.latestConsequence?.preview).toBe('primera');

    const oct2 = await at('2026-10-02');
    expect(oct2.consequenceCountAtCut).toBe(2);
    expect(oct2.latestConsequence?.preview).toBe('tardía');

    const oct7 = await at('2026-10-07');
    expect(oct7.consequenceCountAtCut).toBe(4);
    // La de occurred_at más reciente (5 oct), no la registrada más tarde (6 oct).
    expect(oct7.latestConsequence?.occurredAt).toBe('2026-10-05T21:30:00.000Z');
    expect(oct7.latestConsequence?.preview).toHaveLength(140);
    expect(oct7.latestConsequence?.truncated).toBe(true);

    const fresh = (await activeAt('2026-10-07')).rows.find(
      (row) => row.id === P(2),
    )!;
    expect(fresh.consequenceCountAtCut).toBe(0);
    expect(fresh.latestConsequence).toBeNull();
  });

  it('timeline: conocidas al corte (created_at), ubicadas por occurred_at, = consequenceCountAtCut', async () => {
    const at = async (ymd: string) =>
      (await activeAt(ymd)).rows.find((row) => row.id === P(1))!;

    // 30 SEP: «tardía» ocurrió ese día pero se registró el 2 OCT → no aparece.
    const sep30 = await at('2026-09-30');
    expect(sep30.consequenceTimeline.map((c) => c.preview)).toEqual([
      'primera',
    ]);

    // 7 OCT: las cuatro, ordenadas por ocurrencia (la registrada el 6 OCT
    // pero ocurrida el 1 OCT queda en su lugar, antes de la del 5 OCT).
    const oct7 = await at('2026-10-07');
    expect(oct7.consequenceTimeline).toHaveLength(oct7.consequenceCountAtCut);
    expect(oct7.consequenceTimeline.map((c) => c.occurredAt)).toEqual([
      '2026-09-29T15:00:00.000Z',
      '2026-09-30T15:00:00.000Z',
      '2026-10-01T14:00:00.000Z',
      '2026-10-05T21:30:00.000Z',
    ]);
    expect(oct7.consequenceTimeline[1].createdAt).toBe(
      '2026-10-02T13:00:00.000Z',
    );
    // Severidad vigente al ocurrir: MEDIUM → HIGH (1 oct 09:00) → CRITICAL (4 oct).
    expect(oct7.consequenceTimeline.map((c) => c.severityAtOccurrence)).toEqual(
      ['MEDIUM', 'MEDIUM', 'HIGH', 'CRITICAL'],
    );
    // Extracto ≤ 140.
    expect(oct7.consequenceTimeline[3].preview).toHaveLength(140);
    expect(oct7.consequenceTimeline[3].truncated).toBe(true);

    const rows = (await activeAt('2026-10-07')).rows;
    for (const row of rows) {
      if (row.historyReliable) {
        expect(row.consequenceTimeline).toHaveLength(row.consequenceCountAtCut);
      }
    }
    // Sin afectaciones: línea limpia. Legacy: nunca.
    expect(rows.find((row) => row.id === P(2))!.consequenceTimeline).toEqual(
      [],
    );
    expect(rows.find((row) => row.id === P(3))!.consequenceTimeline).toEqual(
      [],
    );
  });

  it('antigüedad con la fórmula de Aging (día Bogotá)', async () => {
    const { rows } = await activeAt('2026-10-07');
    const age = (id: string) => rows.find((row) => row.id === id)!.ageDays;
    expect(age(P(1))).toBe(9);
    expect(age(P(2))).toBe(0);
    expect(age(P(3))).toBe(67);
  });

  it('historyReliable: el backfill no pasa por fiable', async () => {
    const { rows } = await activeAt('2026-10-07');
    const reliable = (id: string) =>
      rows.find((row) => row.id === id)!.historyReliable;
    expect(reliable(P(1))).toBe(true);
    expect(reliable(P(2))).toBe(true);
    expect(reliable(P(3))).toBe(false);
  });

  it('estado al corte: pasado por timeline; en curso, el actual', async () => {
    const status = async (ymd: string, isCurrent: boolean) =>
      (await activeAt(ymd, isCurrent)).rows.find((row) => row.id === P(1))!
        .statusAtCut;
    expect(await status('2026-09-30', false)).toBe('OPEN');
    expect(await status('2026-10-03', false)).toBe('IN_PROGRESS');
    expect(await status('2026-10-07', true)).toBe('IN_PROGRESS');
    // Sin eventos de estado: el actual.
    const legacy = (await activeAt('2026-09-30')).rows.find(
      (row) => row.id === P(3),
    )!;
    expect(legacy.statusAtCut).toBe('IN_PROGRESS');
  });

  /* ───────────── RECURRENCIA (flujo por created_at) ───────────── */

  const recurrenceAt = async (
    kind: EstadoPeriodKind,
    from: string,
    calendarEnd: string,
    dataTo: string,
  ) => {
    const slots = buildEstadoFlowSlots(kind, from, calendarEnd, dataTo, dataTo);
    const rows = await recurrence.countByBucketAndCategory(X, slots);
    return { slots, matrix: buildRecurrenceMatrix(slots, rows) };
  };

  it('INVARIANTES recurrencia: Σ categorías = INTERNAL creados por bucket (Movimiento), Σ = total, sin INTER', async () => {
    const OTHER = '7b000000-0000-4000-8000-0000000000dd';
    await runner.query(
      `INSERT INTO incident_categories (id, code, name) VALUES ($1, 'it-internos-otra', 'Otra IT')`,
      [OTHER],
    );
    await insertSituation(P(20), '2026-08-10T09:00:00-05:00', {
      category: OTHER,
    });
    await insertSituation(P(21), '2026-08-12T09:00:00-05:00', {
      category: null,
    });
    await insertSituation(P(22), '2026-09-02T09:00:00-05:00', {
      kind: 'INTER_COORDINATION',
      affected: Y,
    });

    for (const [kind, from, calendarEnd, dataTo] of [
      ['cycle', '2026-07-01', '2026-12-31', '2026-10-07'],
      ['month', '2026-09-01', '2026-09-30', '2026-09-30'],
      ['week', '2026-09-28', '2026-10-04', '2026-10-04'],
    ] as const) {
      const { slots, matrix } = await recurrenceAt(
        kind,
        from,
        calendarEnd,
        dataTo,
      );
      const movement = await history.aggregateEventMetric(
        X,
        OperationalKpiHistoryMetric.CREATED,
        buildEstadoEvolutionBuckets(kind, from, dataTo),
        { reportKind: SituationReportKind.INTERNAL },
      );
      slots.forEach((slot, idx) => {
        const sum = matrix.categories.reduce(
          (acc, c) => acc + (c.values.at(idx) ?? 0),
          0,
        );
        if (slot.dataEnd === null) {
          expect(matrix.bucketTotals.at(idx)).toBeNull();
          for (const c of matrix.categories)
            expect(c.values.at(idx)).toBeNull();
        } else {
          expect({ kind, bucket: slot.dataEnd, sum }).toEqual({
            kind,
            bucket: slot.dataEnd,
            sum: movement.get(slot.dataEnd),
          });
          expect(matrix.bucketTotals.at(idx)).toBe(sum);
        }
      });
      expect(matrix.categories.reduce((a, c) => a + c.totalCreated, 0)).toBe(
        matrix.total,
      );
      for (const c of matrix.categories) {
        expect(c.bucketsWithOccurrences).toBeLessThanOrEqual(
          matrix.eligibleBuckets,
        );
      }
    }

    // H2 al 7 OCT: 4 meses observados; INTER (P22) nunca suma.
    const { matrix } = await recurrenceAt(
      'cycle',
      '2026-07-01',
      '2026-12-31',
      '2026-10-07',
    );
    expect(matrix.eligibleBuckets).toBe(4);
    // INTERNAL de X en H2: P01, P02, P03 (ago), P05, P20, P21 = 6.
    expect(matrix.total).toBe(6);
    expect(
      matrix.categories.map((c) => [
        c.name,
        c.totalCreated,
        c.bucketsWithOccurrences,
      ]),
    ).toEqual([
      ['Internet IT', 4, 3],
      ['Otra IT', 1, 1],
      ['Sin categoría', 1, 1],
    ]);
  });

  it('recurrencia · borde Bogotá: 23:30 del 30 sep cuenta en septiembre, no en octubre', async () => {
    await insertSituation(P(23), '2026-09-30T23:30:00-05:00');
    const { slots, matrix } = await recurrenceAt(
      'cycle',
      '2026-07-01',
      '2026-12-31',
      '2026-10-07',
    );
    const sep = slots.findIndex(
      (slot) => slot.bucket.calendarStart === '2026-09-01',
    );
    const oct = slots.findIndex(
      (slot) => slot.bucket.calendarStart === '2026-10-01',
    );
    const internet = matrix.categories.find((c) => c.name === 'Internet IT')!;
    // Septiembre: P01 (28 sep), P05 (25 sep) y P23 (30 sep 23:30 Bogotá).
    expect(internet.values.at(sep)).toBe(3);
    // Octubre: P02 (7 oct).
    expect(internet.values.at(oct)).toBe(1);
  });
});
