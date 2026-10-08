import { DataSource, type QueryRunner } from 'typeorm';
import {
  SituationSeverity,
  SituationSeverityChangeSource,
} from '../../common/enums/situation.enums';
import { TimelineEventType } from '../../common/enums/situation-timeline.enums';
import {
  computeDueAt,
  SLA_POLICY_CODE,
  wasClosedOnTime,
} from '../../situations/situation-sla.policy';
import {
  checkSeverityHistoryInvariants,
  severityAt,
  type SeverityHistoryRow,
} from '../../situations/severity-escalation/severity-history';
import {
  assertQaVivoRecordsCoherent,
  buildQaVivoRecords,
  QA_VIVO_ID_PREFIX,
  QA_VIVO_MOCK_POLICY_CODE,
  qaVivoAnchor,
  qaVivoId,
  type QaVivoRecord,
} from './qa-internal-vivo.scenario';

export { assertQaLocalDatabase } from './seed-qa-director-h2';

interface References {
  coordinationId: Record<string, string>;
  categoryId: Record<string, string>;
  userId: Record<string, string>;
}

async function resolveReferences(
  runner: QueryRunner,
  records: readonly QaVivoRecord[],
): Promise<References> {
  const coordinationCodes = [
    ...new Set(records.map((r) => r.spec.coordinationCode)),
  ];
  const categoryCodes = [...new Set(records.map((r) => r.spec.categoryCode))];
  const emails = [
    ...new Set(
      records.flatMap((r) => [
        r.spec.author,
        r.spec.responsible,
        ...r.consequences.map((c) => c.by),
      ]),
    ),
  ];

  const coordinations = (await runner.query(
    `SELECT id, code FROM coordinations WHERE code = ANY($1) AND is_active = true`,
    [coordinationCodes],
  )) as Array<{ id: string; code: string }>;
  const categories = (await runner.query(
    `SELECT id, code FROM incident_categories WHERE code = ANY($1) AND is_selectable = true`,
    [categoryCodes],
  )) as Array<{ id: string; code: string }>;
  const users = (await runner.query(
    `SELECT id, email FROM users WHERE email = ANY($1) AND status = 'ACTIVE'`,
    [emails],
  )) as Array<{ id: string; email: string }>;

  const missing = [
    ...coordinationCodes.filter(
      (c) => !coordinations.some((x) => x.code === c),
    ),
    ...categoryCodes.filter((c) => !categories.some((x) => x.code === c)),
    ...emails.filter((e) => !users.some((x) => x.email === e)),
  ];
  if (missing.length > 0) {
    throw new Error(
      `Referencias inexistentes (no se inventan autores ni catálogos): ${missing.join(', ')}`,
    );
  }

  return {
    coordinationId: Object.fromEntries(
      coordinations.map((c) => [c.code, c.id]),
    ),
    categoryId: Object.fromEntries(categories.map((c) => [c.code, c.id])),
    userId: Object.fromEntries(users.map((u) => [u.email, u.id])),
  };
}

async function deleteScenarioRows(runner: QueryRunner): Promise<number> {
  const rows = (await runner.query(
    `SELECT id FROM situations WHERE id::text LIKE $1`,
    [`${QA_VIVO_ID_PREFIX}%`],
  )) as Array<{ id: string }>;
  if (rows.length === 0) return 0;
  // Historial, afectaciones, timeline y resolución caen por ON DELETE CASCADE.
  await runner.query(`DELETE FROM situations WHERE id = ANY($1::uuid[])`, [
    rows.map((r) => r.id),
  ]);
  return rows.length;
}

export interface QaVivoSeedResult {
  anchor: Date;
  replaced: number;
  inserted: number;
  consequences: number;
  escalations: number;
}

/**
 * Siembra (o re-siembra) el escenario en UNA transacción, por SQL directo
 * (sin subscribers) para conservar instantes históricos coherentes.
 */
export async function applyQaInternalVivo(
  dataSource: DataSource,
  now: Date = new Date(),
): Promise<QaVivoSeedResult> {
  const anchor = qaVivoAnchor(now);
  const records = buildQaVivoRecords(anchor);
  assertQaVivoRecordsCoherent(records, now);

  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const ref = await resolveReferences(runner, records);
    const replaced = await deleteScenarioRows(runner);
    let consequences = 0;
    let escalations = 0;

    for (const r of records) {
      const author = ref.userId[r.spec.author];
      const responsible = ref.userId[r.spec.responsible];
      const coordinationId = ref.coordinationId[r.spec.coordinationCode];
      // SLA = promesa original: sale de la severidad REPORTADA.
      const dueAt = computeDueAt(r.spec.reportedSeverity, r.createdAt);
      const slaBreachedAt =
        dueAt.getTime() < (r.closedAt ?? now).getTime() ? dueAt : null;
      const lastTouch = [
        r.createdAt,
        r.inProgressAt,
        r.closedAt,
        ...r.escalations.map((e) => e.recordedAt),
      ]
        .filter((d): d is Date => d !== null)
        .reduce((a, b) => (a > b ? a : b));

      await runner.query(
        `INSERT INTO situations (
           id, created_at, updated_at, title, description, coordination_id,
           affected_coordination_id, report_kind, created_by_user_id, assigned_user_id,
           category_id, severity, reported_severity, severity_escalation_policy_code,
           status, resolved_at, closed_at, due_at, sla_policy_code, sla_breached_at, occurred_at)
         VALUES ($1,$2,$3,$4,$5,$6,$6,'INTERNAL',$7,$8,$9,$10,$11,NULL,$12,$13,$13,$14,$15,$16,$17)`,
        [
          r.id,
          r.createdAt,
          lastTouch,
          r.spec.title,
          r.spec.description,
          coordinationId,
          author,
          r.inProgressAt ? responsible : null,
          ref.categoryId[r.spec.categoryCode],
          r.severity,
          r.spec.reportedSeverity,
          r.status,
          r.closedAt,
          dueAt,
          SLA_POLICY_CODE,
          slaBreachedAt,
          r.occurredAt,
        ],
      );

      // Historial: REPORTED + historia mock QA (AUTO_TIME marcada).
      await runner.query(
        `INSERT INTO situation_severity_changes
           (id, situation_id, previous_severity, new_severity, source, effective_at, created_at, actor_user_id)
         VALUES ($1, $2, NULL, $3, 'REPORTED', $4, $5, $6)`,
        [
          qaVivoId(`severity:${r.key}:reported`),
          r.id,
          r.spec.reportedSeverity,
          r.createdAt,
          // LEGACY (G): escrita después, como el backfill de la migración.
          r.reportedRecordedAt,
          author,
        ],
      );
      for (const e of r.escalations) {
        await runner.query(
          `INSERT INTO situation_severity_changes
             (id, situation_id, previous_severity, new_severity, source, effective_at, created_at,
              actor_user_id, policy_code, rule_key)
           VALUES ($1, $2, $3, $4, 'AUTO_TIME', $5, $6, NULL, $7, $8)`,
          [
            e.id,
            r.id,
            e.from,
            e.to,
            e.effectiveAt,
            e.recordedAt,
            QA_VIVO_MOCK_POLICY_CODE,
            e.ruleKey,
          ],
        );
        escalations += 1;
      }

      for (const c of r.consequences) {
        await runner.query(
          `INSERT INTO situation_consequences (id, situation_id, description, occurred_at, created_at, created_by_user_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            c.id,
            r.id,
            c.description,
            c.occurredAt,
            c.createdAt,
            ref.userId[c.by],
          ],
        );
        consequences += 1;
      }

      if (r.closedAt && r.spec.learning) {
        await runner.query(
          `INSERT INTO situation_resolutions (situation_id, learning, resolved_by_user_id, created_at)
           VALUES ($1, $2, $3, $4)`,
          [r.id, r.spec.learning, responsible, r.closedAt],
        );
      }

      const timeline: Array<{
        name: string;
        userId: string | null;
        type: TimelineEventType;
        title: string;
        description: string;
        at: Date;
        metadata: object;
      }> = [
        {
          name: 'created',
          userId: author,
          type: TimelineEventType.SITUATION_CREATED,
          title: 'Situación registrada',
          description: `Se registró la situación "${r.spec.title}".`,
          at: r.createdAt,
          metadata: {
            status: 'OPEN',
            severity: r.spec.reportedSeverity,
            coordinationId,
            categoryId: ref.categoryId[r.spec.categoryCode],
            occurredAt: r.occurredAt,
          },
        },
        ...r.consequences.map((c, i) => ({
          name: `consequence:${i + 1}`,
          userId: ref.userId[c.by],
          type: TimelineEventType.CONSEQUENCE_ADDED,
          title: 'Afectación registrada',
          description: 'Se registró una nueva afectación del problema.',
          at: c.createdAt,
          metadata: {
            consequenceId: c.id,
            occurredAt: c.occurredAt.toISOString(),
          },
        })),
        ...r.escalations.map((e) => ({
          name: `escalated:${e.ruleKey}`,
          userId: null,
          type: TimelineEventType.SEVERITY_ESCALATED,
          title: 'Severidad escalada',
          description: `La severidad subió de ${e.from} a ${e.to} por permanencia sin resolver (historia QA simulada).`,
          at: e.recordedAt,
          metadata: {
            severityChangeId: e.id,
            previousValue: e.from,
            newValue: e.to,
            source: SituationSeverityChangeSource.AUTO_TIME,
            policyCode: QA_VIVO_MOCK_POLICY_CODE,
            ruleKey: e.ruleKey,
            effectiveAt: e.effectiveAt.toISOString(),
            qaMock: true,
          },
        })),
      ];
      if (r.inProgressAt) {
        timeline.push({
          name: 'in-progress',
          userId: responsible,
          type: TimelineEventType.STATUS_CHANGED,
          title: 'Estado actualizado',
          description: 'El estado cambió de Abierto a En atención.',
          at: r.inProgressAt,
          metadata: {
            field: 'status',
            previousValue: 'OPEN',
            newValue: 'IN_PROGRESS',
          },
        });
      }
      if (r.closedAt) {
        timeline.push({
          name: 'closed',
          userId: responsible,
          type: TimelineEventType.CLOSED,
          title: 'Problema solucionado',
          description:
            'El estado cambió de En atención a Cerrado. Aprendizaje registrado.',
          at: r.closedAt,
          metadata: {
            field: 'status',
            previousValue: r.inProgressAt ? 'IN_PROGRESS' : 'OPEN',
            newValue: 'CLOSED',
            commentKind: 'learning',
            dueAt,
            closedOnTime: wasClosedOnTime(dueAt, r.closedAt),
            slaBreachedAt,
          },
        });
      }
      for (const entry of timeline) {
        await runner.query(
          `INSERT INTO situation_timeline_entries (id, situation_id, user_id, event_type, title, description, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            qaVivoId(`timeline:${r.key}:${entry.name}`),
            r.id,
            entry.userId,
            entry.type,
            entry.title,
            entry.description,
            JSON.stringify(entry.metadata),
            entry.at,
          ],
        );
      }
    }

    await runner.commitTransaction();
    return {
      anchor,
      replaced,
      inserted: records.length,
      consequences,
      escalations,
    };
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}

export async function cleanQaInternalVivo(
  dataSource: DataSource,
): Promise<number> {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const removed = await deleteScenarioRows(runner);
    await runner.commitTransaction();
    return removed;
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}

/**
 * Valida contra LA BASE (no contra el escenario) los invariantes del dominio
 * para cada situación sembrada, y devuelve un informe legible.
 */
export async function reportQaInternalVivo(dataSource: DataSource): Promise<{
  text: string;
  violations: string[];
}> {
  const situations = await dataSource.query<
    Array<{
      id: string;
      title: string;
      code: string;
      status: string;
      severity: SituationSeverity;
      reported_severity: SituationSeverity;
      occurred_at: Date;
      created_at: Date;
      closed_at: Date | null;
      due_at: Date;
      policy: string | null;
    }>
  >(
    `SELECT s.id, s.title, c.code, s.status, s.severity, s.reported_severity, s.occurred_at,
            s.created_at, s.closed_at, s.due_at, s.severity_escalation_policy_code AS policy
     FROM situations s JOIN coordinations c ON c.id = s.coordination_id
     WHERE s.id::text LIKE $1 ORDER BY s.created_at`,
    [`${QA_VIVO_ID_PREFIX}%`],
  );

  const lines = ['QA INTERNAL vivo · validación contra la base', ''];
  const violations: string[] = [];

  for (const s of situations) {
    const history = await dataSource.query<
      Array<SeverityHistoryRow & { policyCode: string | null }>
    >(
      `SELECT id, previous_severity AS "previousSeverity", new_severity AS "newSeverity",
              source, effective_at AS "effectiveAt", created_at AS "createdAt", policy_code AS "policyCode"
       FROM situation_severity_changes WHERE situation_id = $1 ORDER BY effective_at`,
      [s.id],
    );
    const consequences = await dataSource.query<
      Array<{ occurred_at: Date; created_at: Date; description: string }>
    >(
      `SELECT occurred_at, created_at, description FROM situation_consequences
       WHERE situation_id = $1 ORDER BY occurred_at, created_at, id`,
      [s.id],
    );

    const found = checkSeverityHistoryInvariants({
      reportedSeverity: s.reported_severity,
      severity: s.severity,
      closedAt: s.closed_at,
      history,
    });
    if (s.policy !== null) found.push('POLICY_ASSIGNED' as never);
    if (
      history.some(
        (h) =>
          h.source === SituationSeverityChangeSource.AUTO_TIME &&
          h.policyCode !== QA_VIVO_MOCK_POLICY_CODE,
      )
    ) {
      found.push('AUTO_TIME_NOT_MARKED_AS_MOCK' as never);
    }
    for (const c of consequences) {
      if (c.occurred_at < s.occurred_at)
        found.push('CONSEQUENCE_BEFORE_PROBLEM' as never);
      if (s.closed_at && c.created_at > s.closed_at) {
        found.push('CONSEQUENCE_AFTER_CLOSE' as never);
      }
    }
    for (const v of found) violations.push(`${s.title}: ${v}`);

    const days = (b: Date, a: Date) =>
      ((b.getTime() - a.getTime()) / 86_400_000).toFixed(1);
    lines.push(
      `${s.title} [${s.code}] · ${s.status} · reportado ${s.reported_severity} → actual ${s.severity} · plazo ${days(s.due_at, s.created_at)} d`,
    );
    lines.push(
      `  historial: ${history.map((h) => `${h.newSeverity}@d+${days(h.effectiveAt, s.created_at)}${h.source === SituationSeverityChangeSource.AUTO_TIME ? ' (QA)' : ''}`).join(' → ')}`,
    );
    for (const c of consequences) {
      lines.push(
        `  · d+${days(c.occurred_at, s.created_at)} [${severityAt(history, c.occurred_at)}] ${c.description}`,
      );
    }
    lines.push(
      `  invariantes: ${found.length === 0 ? 'OK' : found.join(', ')}`,
    );
    lines.push('');
  }

  lines.push(
    violations.length === 0
      ? `Todas las situaciones (${situations.length}) cumplen los invariantes.`
      : `VIOLACIONES: ${violations.length}`,
  );
  return { text: lines.join('\n'), violations };
}
