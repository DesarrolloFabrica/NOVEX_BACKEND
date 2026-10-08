import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SituationReportKind,
  SituationSeverity,
  SituationStatus,
} from '../common/enums/situation.enums';
import { Situation } from '../situations/entities/situation.entity';
import { activeAtCutCondition } from './domain/kpi-active-at-cut';
import { KPI_HISTORY_TIMEZONE } from './domain/kpi-history-buckets';
import {
  KPI_HISTORY_RELIABLE_TOLERANCE_SECONDS,
  KPI_INTERNAL_PROBLEMS_LIMIT,
  KPI_INTERNAL_PROBLEMS_PREVIEW_CHARS,
} from './domain/kpi-internal-problems';

export type KpiInternalProblemRow = {
  id: string;
  title: string;
  categoryId: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  createdAt: string;
  createdByName: string | null;
  /** refDate − día de alta (fórmula de Antigüedad). */
  ageDays: number;
  statusAtCut: SituationStatus;
  reportedSeverity: SituationSeverity;
  severityAtCut: SituationSeverity;
  consequenceCountAtCut: number;
  latestConsequence: {
    occurredAt: string;
    createdAt: string;
    preview: string;
    truncated: boolean;
  } | null;
  dueAt: string | null;
  historyReliable: boolean;
  /**
   * Afectaciones CONOCIDAS al corte (created_at < T), por ocurrencia ↑. Vacío
   * si el historial no es fiable (legacy). Extracto ≤ 140 caracteres.
   */
  consequenceTimeline: KpiConsequenceTimelineItem[];
};

export type KpiConsequenceTimelineItem = {
  id: string;
  occurredAt: string;
  createdAt: string;
  preview: string;
  truncated: boolean;
  /** Severidad vigente al ocurrir (último cambio con effective_at ≤ occurred_at). */
  severityAtOccurrence: SituationSeverity;
};

/* ─────────────────────────────────────────────────────────────────────
 * INTERNOS · AFECTACIONES DE PROBLEMAS ACTIVOS. UNA consulta: universo
 * ACTIVE_AT_CUT ∩ INTERNAL + un LEFT JOIN LATERAL por agregado (sin N+1, sin
 * historiales completos). Corte T = fin exclusivo de dataTo.
 *
 *   severityAtCut       último cambio con effective_at < T
 *   consequenceCount    afectaciones con created_at < T  (conocidas al corte)
 *   latestConsequence   entre esas, la de occurred_at más reciente
 *   consequenceTimeline esas mismas, compactas (json_agg), para la línea de vida
 *   statusAtCut         periodo en curso: status actual; pasado: timeline
 *   historyReliable     fila REPORTED escrita junto con el alta (no backfill)
 * ───────────────────────────────────────────────────────────────────── */
@Injectable()
export class OperationalKpiInternalProblemsRepository {
  constructor(
    @InjectRepository(Situation)
    private readonly situationsRepository: Repository<Situation>,
  ) {}

  async findRows(input: {
    coordinationId: string;
    /** Corte T exclusivo (ISO). */
    cutIso: string;
    /** dataTo (YYYY-MM-DD, Bogotá): refDate de la antigüedad. */
    refDate: string;
    /** Periodo en curso: el estado al corte es el estado actual. */
    isCurrent: boolean;
  }): Promise<{ rows: KpiInternalProblemRow[]; truncated: boolean }> {
    const tz = KPI_HISTORY_TIMEZONE;
    const sql = `
      SELECT
        s.id AS id,
        s.title AS title,
        s.category_id AS "categoryId",
        cat.code AS "categoryCode",
        cat.name AS "categoryName",
        s.created_at AS "createdAt",
        u.full_name AS "createdByName",
        ($3::date - (s.created_at AT TIME ZONE '${tz}')::date) AS "ageDays",
        s.status AS "currentStatus",
        st.status AS "timelineStatus",
        st.any_event AS "hasStatusEvents",
        s.reported_severity AS "reportedSeverity",
        COALESCE(sev.new_severity, s.reported_severity) AS "severityAtCut",
        COALESCE(rep.reliable, false) AS "historyReliable",
        cq.n AS "consequenceCount",
        lq.occurred_at AS "latestOccurredAt",
        lq.created_at AS "latestCreatedAt",
        lq.description AS "latestDescription",
        ct.items AS "timeline",
        s.due_at AS "dueAt"
      FROM situations s
      LEFT JOIN incident_categories cat ON cat.id = s.category_id
      LEFT JOIN users u ON u.id = s.created_by_user_id
      LEFT JOIN LATERAL (
        SELECT h.new_severity
        FROM situation_severity_changes h
        WHERE h.situation_id = s.id AND h.effective_at < $2::timestamptz
        ORDER BY h.effective_at DESC, h.created_at DESC
        LIMIT 1
      ) sev ON true
      LEFT JOIN LATERAL (
        SELECT abs(extract(epoch FROM (h.created_at - s.created_at)))
                 <= $6::numeric AS reliable
        FROM situation_severity_changes h
        WHERE h.situation_id = s.id AND h.source = 'REPORTED'
      ) rep ON true
      LEFT JOIN LATERAL (
        SELECT
          (SELECT t.metadata->>'newValue'
             FROM situation_timeline_entries t
            WHERE t.situation_id = s.id
              AND t.event_type = 'STATUS_CHANGED'
              AND t.created_at < $2::timestamptz
            ORDER BY t.created_at DESC
            LIMIT 1) AS status,
          EXISTS (
            SELECT 1 FROM situation_timeline_entries t
             WHERE t.situation_id = s.id AND t.event_type = 'STATUS_CHANGED'
          ) AS any_event
      ) st ON NOT $7::boolean
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS n
        FROM situation_consequences q
        WHERE q.situation_id = s.id AND q.created_at < $2::timestamptz
      ) cq ON true
      LEFT JOIN LATERAL (
        SELECT q.occurred_at, q.created_at,
               left(q.description, $8::int + 1) AS description
        FROM situation_consequences q
        WHERE q.situation_id = s.id AND q.created_at < $2::timestamptz
        ORDER BY q.occurred_at DESC, q.created_at DESC
        LIMIT 1
      ) lq ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          json_agg(
            json_build_object(
              'id', q.id,
              'occurredAt', q.occurred_at,
              'createdAt', q.created_at,
              'description', left(q.description, $8::int + 1),
              'severityAtOccurrence', COALESCE(
                (SELECT h.new_severity
                   FROM situation_severity_changes h
                  WHERE h.situation_id = s.id AND h.effective_at <= q.occurred_at
                  ORDER BY h.effective_at DESC, h.created_at DESC
                  LIMIT 1),
                s.reported_severity
              )
            )
            ORDER BY q.occurred_at ASC, q.created_at ASC
          ),
          '[]'::json
        ) AS items
        FROM situation_consequences q
        WHERE q.situation_id = s.id AND q.created_at < $2::timestamptz
      ) ct ON true
      WHERE ${activeAtCutCondition({
        alias: 's',
        owner: '$1',
        cut: '$2::timestamptz',
        internal: '$4',
        inter: '$5',
      })}
        AND s.report_kind = $4
      ORDER BY s.created_at ASC, s.id ASC
      LIMIT $9
    `;

    const raw = await this.situationsRepository.manager.query<
      Array<{
        id: string;
        title: string;
        categoryId: string | null;
        categoryCode: string | null;
        categoryName: string | null;
        createdAt: Date | string;
        createdByName: string | null;
        ageDays: string | number;
        currentStatus: SituationStatus;
        timelineStatus: string | null;
        hasStatusEvents: boolean | null;
        reportedSeverity: SituationSeverity;
        severityAtCut: SituationSeverity;
        historyReliable: boolean;
        consequenceCount: string | number | null;
        latestOccurredAt: Date | string | null;
        latestCreatedAt: Date | string | null;
        latestDescription: string | null;
        timeline: Array<{
          id: string;
          occurredAt: string;
          createdAt: string;
          description: string;
          severityAtOccurrence: SituationSeverity;
        }> | null;
        dueAt: Date | string | null;
      }>
    >(sql, [
      input.coordinationId,
      input.cutIso,
      input.refDate,
      SituationReportKind.INTERNAL,
      SituationReportKind.INTER_COORDINATION,
      KPI_HISTORY_RELIABLE_TOLERANCE_SECONDS,
      input.isCurrent,
      KPI_INTERNAL_PROBLEMS_PREVIEW_CHARS,
      KPI_INTERNAL_PROBLEMS_LIMIT + 1,
    ]);

    const iso = (value: Date | string) => new Date(value).toISOString();
    const truncated = raw.length > KPI_INTERNAL_PROBLEMS_LIMIT;
    const rows = raw.slice(0, KPI_INTERNAL_PROBLEMS_LIMIT).map((row) => {
      const description = row.latestDescription;
      const longer =
        description !== null &&
        description.length > KPI_INTERNAL_PROBLEMS_PREVIEW_CHARS;
      return {
        id: row.id,
        title: row.title,
        categoryId: row.categoryId,
        categoryCode: row.categoryCode,
        categoryName: row.categoryName,
        createdAt: iso(row.createdAt),
        createdByName: row.createdByName,
        ageDays: Number(row.ageDays),
        statusAtCut: this.statusAtCut(input.isCurrent, row),
        reportedSeverity: row.reportedSeverity,
        severityAtCut: row.severityAtCut,
        consequenceCountAtCut: Number(row.consequenceCount ?? 0),
        latestConsequence:
          row.latestOccurredAt === null ||
          row.latestCreatedAt === null ||
          description === null
            ? null
            : {
                occurredAt: iso(row.latestOccurredAt),
                createdAt: iso(row.latestCreatedAt),
                preview: longer
                  ? description.slice(0, KPI_INTERNAL_PROBLEMS_PREVIEW_CHARS)
                  : description,
                truncated: longer,
              },
        dueAt: row.dueAt === null ? null : iso(row.dueAt),
        historyReliable: row.historyReliable === true,
        consequenceTimeline:
          row.historyReliable === true
            ? (row.timeline ?? []).map((item) => {
                const cut =
                  item.description.length > KPI_INTERNAL_PROBLEMS_PREVIEW_CHARS;
                return {
                  id: item.id,
                  occurredAt: iso(item.occurredAt),
                  createdAt: iso(item.createdAt),
                  preview: cut
                    ? item.description.slice(
                        0,
                        KPI_INTERNAL_PROBLEMS_PREVIEW_CHARS,
                      )
                    : item.description,
                  truncated: cut,
                  severityAtOccurrence: item.severityAtOccurrence,
                };
              })
            : [],
      };
    });
    return { rows, truncated };
  }

  /**
   * Estado al corte. En el periodo en curso, el estado actual. En un corte
   * pasado, el último STATUS_CHANGED anterior al corte; sin eventos de estado
   * se usa el actual. Nunca CLOSED: el caso estaba activo en el corte.
   */
  private statusAtCut(
    isCurrent: boolean,
    row: {
      currentStatus: SituationStatus;
      timelineStatus: string | null;
      hasStatusEvents: boolean | null;
    },
  ): SituationStatus {
    const notClosed = (status: SituationStatus) =>
      status === SituationStatus.CLOSED ? SituationStatus.OPEN : status;
    if (isCurrent) return notClosed(row.currentStatus);
    const known = Object.values(SituationStatus).find(
      (status) => status === row.timelineStatus,
    );
    if (known) return notClosed(known);
    return row.hasStatusEvents
      ? SituationStatus.OPEN
      : notClosed(row.currentStatus);
  }
}
