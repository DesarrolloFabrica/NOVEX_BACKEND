import { DataSource, type QueryRunner } from 'typeorm';
import { SituationStatus } from '../../common/enums/situation.enums';
import { TimelineEventType } from '../../common/enums/situation-timeline.enums';
import { resolveDatabaseEnv } from '../../configuration/resolve-database-env';
import { OperationalKpiAgingRepository } from '../../operational-kpis/operational-kpi-aging.repository';
import {
  computeDueAt,
  SLA_POLICY_CODE,
  wasClosedOnTime,
} from '../../situations/situation-sla.policy';
import {
  buildQaDirectorH2Records,
  QA_ANCHOR,
  QA_DIRECTOR_H2_SCENARIO,
  QA_ID_PREFIX,
  QA_SCOPE,
  qaId,
  qaMonthlyFlow,
  type QaScopeKey,
  type QaSituationRecord,
} from './qa-director-h2.scenario';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Protección explícita: este seed SOLO corre contra la Postgres local.
 * Más estricta que `assertLocalDatabaseProfile`: aquí no existe
 * ALLOW_CLOUD_SEED. Rechaza perfil cloud, hosts no locales, SSL y
 * NODE_ENV=production.
 */
export function assertQaLocalDatabase(env: NodeJS.ProcessEnv = process.env): {
  host: string;
  database: string;
} {
  const resolved = resolveDatabaseEnv(env);
  const problems: string[] = [];
  if (resolved.profile !== 'local')
    problems.push('DB_CLOUD=true (perfil cloud)');
  if (!LOCAL_HOSTS.has(resolved.host))
    problems.push(`host no local: ${resolved.host}`);
  if (resolved.ssl) problems.push('SSL activo (típico de Cloud SQL)');
  if (env.NODE_ENV === 'production') problems.push('NODE_ENV=production');
  if (problems.length > 0) {
    throw new Error(
      `seed QA DIRECTOR H2 abortado: solo se permite contra la base LOCAL. ${problems.join('; ')}.`,
    );
  }
  return { host: resolved.host, database: resolved.database };
}

/** El escenario termina el 7 oct 06:30 (Bogotá): nunca sembrar futuro. */
export function assertNoFuture(
  records: readonly QaSituationRecord[],
  now: Date,
): void {
  const latest = Math.max(
    ...records.flatMap((r) =>
      [r.createdAt, r.closedAt, r.inProgressAt]
        .filter((d): d is Date => d !== null)
        .map((d) => d.getTime()),
    ),
  );
  if (latest > now.getTime()) {
    throw new Error(
      `seed QA DIRECTOR H2 abortado: el escenario llega hasta ${new Date(latest).toISOString()} y ahora es ${now.toISOString()}. No se siembran eventos futuros.`,
    );
  }
}

type Resolved = {
  coordinationId: Record<QaScopeKey, string>;
  coordinatorId: Record<QaScopeKey, string>;
  categoryId: Record<string, string>;
};

async function resolveReferences(runner: QueryRunner): Promise<Resolved> {
  const scopeKeys = Object.keys(QA_SCOPE) as QaScopeKey[];
  const coordinationId = {} as Record<QaScopeKey, string>;
  const coordinatorId = {} as Record<QaScopeKey, string>;
  for (const key of scopeKeys) {
    const rows = (await runner.query(
      `SELECT id FROM coordinations WHERE code = $1 AND is_active = true`,
      [QA_SCOPE[key].code],
    )) as Array<{ id: string }>;
    if (!rows[0]) {
      throw new Error(
        `Coordinación no encontrada en el catálogo: ${QA_SCOPE[key].code}`,
      );
    }
    coordinationId[key] = rows[0].id;
    // Usuario real y activo de la coordinación (COORDINADOR primero).
    const users = (await runner.query(
      `SELECT u.id FROM users u LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.coordination_id = $1 AND u.status = 'ACTIVE'
       ORDER BY (r.code = 'COORDINADOR') DESC, u.email ASC LIMIT 1`,
      [rows[0].id],
    )) as Array<{ id: string }>;
    if (!users[0]) {
      throw new Error(
        `Sin usuario activo en ${QA_SCOPE[key].code}: no se inventan autores.`,
      );
    }
    coordinatorId[key] = users[0].id;
  }
  const codes = [
    ...new Set(
      buildQaDirectorH2Records()
        .map((r) => r.categoryCode)
        .filter((c): c is NonNullable<typeof c> => c !== null),
    ),
  ];
  const categoryRows = (await runner.query(
    `SELECT id, code FROM incident_categories WHERE code = ANY($1)`,
    [codes],
  )) as Array<{ id: string; code: string }>;
  const categoryId: Record<string, string> = {};
  for (const row of categoryRows) categoryId[row.code] = row.id;
  const missing = codes.filter((code) => !categoryId[code]);
  if (missing.length > 0) {
    throw new Error(
      `Categorías inexistentes en el catálogo: ${missing.join(', ')}`,
    );
  }
  return { coordinationId, coordinatorId, categoryId };
}

/** Borra SOLO filas del escenario (prefijo de id), verificando su alcance. */
async function deleteScenarioRows(
  runner: QueryRunner,
  scopeIds: string[],
): Promise<number> {
  const rows = (await runner.query(
    `SELECT id, coordination_id AS "coordinationId" FROM situations WHERE id::text LIKE $1`,
    [`${QA_ID_PREFIX}%`],
  )) as Array<{ id: string; coordinationId: string | null }>;
  const outside = rows.filter(
    (r) => !r.coordinationId || !scopeIds.includes(r.coordinationId),
  );
  if (outside.length > 0) {
    throw new Error(
      `Limpieza abortada: ${outside.length} fila(s) con prefijo QA fuera del alcance. Revisar manualmente.`,
    );
  }
  if (rows.length === 0) return 0;
  // Timeline, resolución, evidencias e impacto caen por ON DELETE CASCADE.
  await runner.query(`DELETE FROM situations WHERE id = ANY($1::uuid[])`, [
    rows.map((r) => r.id),
  ]);
  return rows.length;
}

export type QaSeedResult = {
  replaced: number;
  inserted: number;
  resolutions: number;
  timeline: number;
};

/**
 * Siembra (o re-siembra) el escenario en UNA transacción. Idempotente:
 * reemplaza las filas del escenario por id determinista; nunca toca otras.
 * SQL directo (sin subscribers): conserva created_at / closed_at históricos y
 * escribe una timeline coherente con esas fechas.
 */
export async function applyQaDirectorH2(
  dataSource: DataSource,
  now: Date = new Date(),
): Promise<QaSeedResult> {
  const records = buildQaDirectorH2Records();
  assertNoFuture(records, now);
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const ref = await resolveReferences(runner);
    const scopeIds = Object.values(ref.coordinationId);
    const replaced = await deleteScenarioRows(runner, scopeIds);
    let resolutions = 0;
    let timeline = 0;

    for (const r of records) {
      const owner = r.scope;
      const responsibleUser = ref.coordinatorId[owner];
      // INTER: lo registra la afectada; INTERNAL: la propia coordinación.
      const reporter = ref.coordinatorId[r.affectedScope];
      const dueAt = computeDueAt(r.severity, r.createdAt);
      const endForSla = r.closedAt ?? now;
      const slaBreachedAt =
        dueAt.getTime() < endForSla.getTime() ? dueAt : null;
      const updatedAt = r.closedAt ?? r.inProgressAt ?? r.createdAt;

      // Sin escalamiento: reported = efectiva y una sola fila REPORTED. El
      // carácter macro del escenario no cambia.
      await runner.query(
        `INSERT INTO situations (
           id, created_at, updated_at, title, description, coordination_id,
           affected_coordination_id, report_kind, affected_process, pending_delivery,
           created_by_user_id, assigned_user_id, category_id, severity, status,
           last_status_comment, resolved_at, closed_at, due_at, sla_policy_code,
           sla_breached_at, occurred_at, reported_severity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NULL,$16,$17,$18,$19,$20,$21,$14)`,
        [
          r.id,
          r.createdAt,
          updatedAt,
          r.title,
          r.description,
          ref.coordinationId[owner],
          ref.coordinationId[r.affectedScope],
          r.reportKind,
          r.affectedProcess,
          r.pendingDelivery,
          reporter,
          r.inProgressAt ? responsibleUser : null,
          r.categoryCode ? ref.categoryId[r.categoryCode] : null,
          r.severity,
          r.status,
          r.closedAt,
          r.closedAt,
          dueAt,
          SLA_POLICY_CODE,
          slaBreachedAt,
          r.occurredAt,
        ],
      );
      await runner.query(
        `INSERT INTO situation_severity_changes
           (situation_id, previous_severity, new_severity, source, effective_at, actor_user_id, created_at)
         VALUES ($1, NULL, $2, 'REPORTED', $3, $4, $3)`,
        [r.id, r.severity, r.createdAt, reporter],
      );

      const entries: Array<
        [string, string, TimelineEventType, string, string, Date, object]
      > = [
        [
          qaId(`timeline:${r.key}:created`),
          reporter,
          TimelineEventType.SITUATION_CREATED,
          'Situación registrada',
          `Se registró la situación "${r.title}".`,
          r.createdAt,
          { status: 'OPEN', severity: r.severity, occurredAt: r.occurredAt },
        ],
      ];
      if (r.inProgressAt) {
        entries.push([
          qaId(`timeline:${r.key}:in-progress`),
          responsibleUser,
          TimelineEventType.STATUS_CHANGED,
          'Estado actualizado',
          'El estado cambió de Abierto a En atención.',
          r.inProgressAt,
          { field: 'status', previousValue: 'OPEN', newValue: 'IN_PROGRESS' },
        ]);
      }
      if (r.closedAt && r.learning) {
        entries.push([
          qaId(`timeline:${r.key}:closed`),
          responsibleUser,
          TimelineEventType.CLOSED,
          'Situación cerrada',
          'El estado cambió de En atención a Cerrado.',
          r.closedAt,
          {
            field: 'status',
            previousValue: 'IN_PROGRESS',
            newValue: 'CLOSED',
            dueAt,
            closedOnTime: wasClosedOnTime(dueAt, r.closedAt),
            slaBreachedAt,
          },
        ]);
        await runner.query(
          `INSERT INTO situation_resolutions (situation_id, learning, resolved_by_user_id, created_at)
           VALUES ($1, $2, $3, $4)`,
          [r.id, r.learning, responsibleUser, r.closedAt],
        );
        resolutions += 1;
      }
      for (const [
        id,
        userId,
        type,
        title,
        description,
        at,
        metadata,
      ] of entries) {
        await runner.query(
          `INSERT INTO situation_timeline_entries (id, situation_id, user_id, event_type, title, description, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            id,
            r.id,
            userId,
            type,
            title,
            description,
            JSON.stringify(metadata),
            at,
          ],
        );
        timeline += 1;
      }
    }

    await runner.commitTransaction();
    return { replaced, inserted: records.length, resolutions, timeline };
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}

/** Elimina ÚNICAMENTE el escenario (prefijo de id), nunca otras situaciones. */
export async function cleanQaDirectorH2(
  dataSource: DataSource,
): Promise<number> {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const ref = await resolveReferences(runner);
    const removed = await deleteScenarioRows(
      runner,
      Object.values(ref.coordinationId),
    );
    await runner.commitTransaction();
    return removed;
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}

/* ═══════════════════════════ Informe de validación ═══════════════════════ */

function bogotaToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Imprime lo sembrado y lo que REALMENTE hay en la base (incluye situaciones
 * previas de esas coordinaciones). Antigüedad con el repositorio de producción.
 */
export async function reportQaDirectorH2(
  dataSource: DataSource,
  now: Date = new Date(),
): Promise<string> {
  const lines: string[] = ['QA Director H2 · escenario sembrado', ''];
  const records = buildQaDirectorH2Records();
  const aging = new OperationalKpiAgingRepository({
    manager: dataSource.manager,
  } as never);
  const today = bogotaToday(now);

  for (const coordination of QA_DIRECTOR_H2_SCENARIO) {
    const scope = QA_SCOPE[coordination.scope];
    const mine = records.filter((r) => r.scope === coordination.scope);
    const active = mine.filter((r) => r.closedAt === null);
    const [{ id }] = await dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM coordinations WHERE code = $1`,
      [scope.code],
    );
    const db = await dataSource.query<
      Array<{ createdAt: Date; closedAt: Date | null; qa: boolean }>
    >(
      `SELECT created_at AS "createdAt", closed_at AS "closedAt", id::text LIKE $2 AS qa
       FROM situations WHERE coordination_id = $1`,
      [id, `${QA_ID_PREFIX}%`],
    );
    const preexisting = db.filter((row) => !row.qa).length;

    lines.push(`${scope.label} (${scope.code})`);
    lines.push(`  patrón: ${coordination.pattern}`);
    lines.push(
      `  escenario: ${mine.length} situaciones · ${mine.filter((r) => r.reportKind === 'INTERNAL').length} internas · ${mine.filter((r) => r.reportKind !== 'INTERNAL').length} externas · ${active.length} activas (${active.filter((r) => r.status === SituationStatus.OPEN).length} OPEN / ${active.filter((r) => r.status === SituationStatus.IN_PROGRESS).length} IN_PROGRESS) · ${mine.length - active.length} cerradas`,
    );
    lines.push(
      `  en la base: ${db.length} (${preexisting} previas ajenas al escenario)`,
    );
    lines.push(
      '  mes   escenario: creados/cerrados/activos   ·   base real: creados/cerrados/activos',
    );
    const scenarioFlow = qaMonthlyFlow(mine);
    const dbFlow = qaMonthlyFlow(
      db.map((row) => ({
        createdAt: new Date(row.createdAt),
        closedAt: row.closedAt ? new Date(row.closedAt) : null,
      })),
    );
    scenarioFlow.forEach((s, i) => {
      const d = dbFlow[i];
      lines.push(
        `  ${s.month}   ${String(s.created).padStart(3)} / ${String(s.closed).padStart(2)} / ${String(s.active).padStart(2)}                   ·   ${String(d.created).padStart(3)} / ${String(d.closed).padStart(2)} / ${String(d.active).padStart(2)}`,
      );
    });

    const summary = await aging.aggregateSummary(id, today);
    const oldest = await aging.findOldest(id, today);
    lines.push(
      `  antigüedad hoy (${today}): ${summary.bands.map((b) => `${b.key}: ${b.count}`).join(' · ')} · activos ${summary.activeCount} · mediana ${summary.medianAgeDays ?? '—'}`,
    );
    oldest.forEach((row, i) =>
      lines.push(`    ${i + 1}. ${row.ageDays} d · ${row.title}`),
    );

    const split = await dataSource.query<
      Array<{ internal: number; external: number }>
    >(
      `SELECT
         COUNT(*) FILTER (WHERE s.report_kind = 'INTERNAL')::int AS internal,
         COUNT(*) FILTER (WHERE s.report_kind = 'INTER_COORDINATION' AND s.affected_coordination_id IS DISTINCT FROM s.coordination_id)::int AS external
       FROM situations s WHERE s.coordination_id = $1 AND s.closed_at IS NULL`,
      [id],
    );
    const cats = await dataSource.query<Array<{ name: string; n: number }>>(
      `SELECT c.name, COUNT(*)::int AS n FROM situations s JOIN incident_categories c ON c.id = s.category_id
       WHERE s.coordination_id = $1 AND s.closed_at IS NULL AND s.report_kind = 'INTERNAL'
       GROUP BY c.name ORDER BY n DESC, c.name`,
      [id],
    );
    const affected = await dataSource.query<Array<{ name: string; n: number }>>(
      `SELECT a.short_name AS name, COUNT(*)::int AS n FROM situations s JOIN coordinations a ON a.id = s.affected_coordination_id
       WHERE s.coordination_id = $1 AND s.closed_at IS NULL AND s.report_kind = 'INTER_COORDINATION'
       GROUP BY a.short_name ORDER BY n DESC, a.short_name`,
      [id],
    );
    lines.push(
      `  activos hoy: internos ${split[0].internal} [${cats.map((c) => `${c.name} ${c.n}`).join(', ') || '—'}] · externos ${split[0].external} [${affected.map((a) => `${a.name} ${a.n}`).join(', ') || '—'}]`,
    );
    lines.push('');
  }
  lines.push(
    `Ancla del escenario: ${QA_ANCHOR.toISOString()} (7 oct 06:30 Bogotá).`,
  );
  return lines.join('\n');
}
