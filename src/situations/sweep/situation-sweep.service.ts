import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { TimelineEventType } from '../../common/enums/situation-timeline.enums';
import {
  SituationSeverity,
  SituationStatus,
} from '../../common/enums/situation.enums';
import { SituationTimelineService } from '../../situation-timeline/situation-timeline.service';
import { Situation } from '../entities/situation.entity';
import { SLA_WINDOWS_BY_SEVERITY } from '../situation-sla.policy';
import {
  SeverityEscalationService,
  type MaterializedEscalation,
} from '../severity-escalation/severity-escalation.service';

/** Clave fija del lock advisory del barrido (arbitraria, estable). */
export const SITUATION_SWEEP_LOCK_KEY = 726_100_417;

/** Mínimo entre avisos SLA de la misma situación. */
export const SLA_REMINDER_COOLDOWN_MS = 12 * 60 * 60 * 1000;

const SLA_ACTIVE_STATUSES = [
  SituationStatus.OPEN,
  SituationStatus.IN_PROGRESS,
  SituationStatus.RESOLVED,
];
const ESCALATION_ACTIVE_STATUSES = [
  SituationStatus.OPEN,
  SituationStatus.IN_PROGRESS,
];

export interface SituationSweepResult {
  /** false = otra instancia tenía el lock; esta llamada no hizo nada. */
  acquired: boolean;
  breached: number;
  warned: number;
  escalated: number;
}

export interface SituationSweepOptions {
  pageSize?: number;
  maxPages?: number;
}

/**
 * Ventana de aviso por severidad REPORTADA, como expresión SQL. Se genera desde
 * la misma tabla de la política para que el SQL y `computeSlaHealth` no puedan
 * divergir.
 */
function warningLeadSql(column: string): string {
  const cases = (Object.keys(SLA_WINDOWS_BY_SEVERITY) as SituationSeverity[])
    .map(
      (severity) =>
        `WHEN '${severity}' THEN interval '${SLA_WINDOWS_BY_SEVERITY[severity].warningMs} milliseconds'`,
    )
    .join(' ');
  return `CASE ${column} ${cases} END`;
}

/**
 * BARRIDO DE SITUACIONES: avisos SLA, vencimientos SLA y escalamientos.
 *
 * Fuente confiable en producción: Cloud Scheduler → `POST /internal/jobs/
 * situation-sweep` (cada 15 min). El `@Cron` en proceso es solo respaldo:
 * Cloud Run con `min-instances=0` no garantiza que corra.
 *
 * Seguro ante repetición y concurrencia:
 *   - cada página es una transacción que primero toma
 *     `pg_try_advisory_xact_lock`; si otra instancia lo tiene, se sale;
 *   - las filas se toman con `FOR UPDATE SKIP LOCKED`, por páginas;
 *   - vencimiento: `UPDATE … WHERE sla_breached_at IS NULL` (condicional);
 *   - aviso: `UPDATE` condicionado al enfriamiento de 12 h;
 *   - escalamiento: índice único (situation_id, policy_code, rule_key).
 * Las escrituras SQL directas no disparan el subscriber del timeline ni tocan
 * `updated_at`; los eventos los escribe este servicio.
 *
 * SLA: todo se calcula con `due_at` y `reported_severity`. El barrido nunca
 * escribe `due_at`.
 */
@Injectable()
export class SituationSweepService {
  private readonly logger = new Logger(SituationSweepService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly timelineService: SituationTimelineService,
    private readonly severityEscalationService: SeverityEscalationService,
  ) {}

  async run(
    now: Date = new Date(),
    options: SituationSweepOptions = {},
  ): Promise<SituationSweepResult> {
    const pageSize = options.pageSize ?? 100;
    const maxPages = options.maxPages ?? 50;
    const result: SituationSweepResult = {
      acquired: true,
      breached: 0,
      warned: 0,
      escalated: 0,
    };

    const phases: Array<{
      key: 'breached' | 'warned' | 'escalated';
      page: (
        manager: EntityManager,
        cursor: string | null,
      ) => Promise<PageOutcome>;
    }> = [
      { key: 'breached', page: (m) => this.breachPage(m, now, pageSize) },
      { key: 'warned', page: (m) => this.warningPage(m, now, pageSize) },
      {
        key: 'escalated',
        page: (m, c) => this.escalationPage(m, now, pageSize, c),
      },
    ];

    for (const phase of phases) {
      let cursor: string | null = null;
      for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
        const outcome = await this.inLockedTransaction((manager) =>
          phase.page(manager, cursor),
        );
        if (outcome === null) {
          // Otra instancia barre ahora mismo. En la primera página: no se hizo
          // nada; más tarde: lo que queda lo termina ella.
          if (result.breached + result.warned + result.escalated === 0) {
            result.acquired = false;
          }
          return result;
        }
        result[phase.key] += outcome.processed;
        await this.severityEscalationService.recordAudit(outcome.escalations);
        if (!outcome.hasMore) break;
        cursor = outcome.cursor;
      }
    }

    if (result.breached + result.warned + result.escalated > 0) {
      this.logger.log(
        `Barrido: ${result.breached} vencidas, ${result.warned} avisos, ${result.escalated} escalamientos`,
      );
    }
    return result;
  }

  /** null = el lock lo tenía otra instancia. */
  private inLockedTransaction<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T | null> {
    return this.dataSource.transaction(async (manager) => {
      const [{ locked }] = await manager.query<Array<{ locked: boolean }>>(
        'SELECT pg_try_advisory_xact_lock($1) AS locked',
        [SITUATION_SWEEP_LOCK_KEY],
      );
      if (!locked) return null;
      return work(manager);
    });
  }

  private async breachPage(
    manager: EntityManager,
    now: Date,
    pageSize: number,
  ): Promise<PageOutcome> {
    const rows = await manager.query<unknown>(
      `
      UPDATE situations s
      SET sla_breached_at = s.due_at
      FROM (
        SELECT id FROM situations
        WHERE status = ANY($1::situations_status_enum[])
          AND due_at IS NOT NULL
          AND due_at < $2
          AND sla_breached_at IS NULL
        ORDER BY due_at, id
        LIMIT $3
        FOR UPDATE SKIP LOCKED
      ) picked
      WHERE s.id = picked.id AND s.sla_breached_at IS NULL
      RETURNING s.id, s.due_at, s.severity, s.reported_severity, s.status
      `,
      [SLA_ACTIVE_STATUSES, now.toISOString(), pageSize],
    );
    const updated = unwrapReturning(rows);

    for (const row of updated) {
      await this.timelineService.createEntry(
        {
          situationId: row.id,
          userId: null,
          eventType: TimelineEventType.SLA_BREACHED,
          title: 'Plazo operativo vencido',
          description:
            'La situación superó su fecha límite de resolución. Se requiere actualización de estado o cierre documentado.',
          metadata: {
            dueAt: new Date(row.due_at).toISOString(),
            severity: row.severity,
            reportedSeverity: row.reported_severity,
            status: row.status,
            slaHealth: 'overdue',
          },
        },
        manager,
      );
    }

    return {
      processed: updated.length,
      hasMore: updated.length === pageSize,
      cursor: null,
      escalations: [],
    };
  }

  private async warningPage(
    manager: EntityManager,
    now: Date,
    pageSize: number,
  ): Promise<PageOutcome> {
    const cooldownStart = new Date(now.getTime() - SLA_REMINDER_COOLDOWN_MS);
    const rows = await manager.query<unknown>(
      `
      UPDATE situations s
      SET last_sla_reminder_at = $2
      FROM (
        SELECT id FROM situations
        WHERE status = ANY($1::situations_status_enum[])
          AND due_at IS NOT NULL
          AND sla_breached_at IS NULL
          AND due_at >= $2
          AND $2 >= due_at - ${warningLeadSql('reported_severity')}
          AND (last_sla_reminder_at IS NULL OR last_sla_reminder_at <= $3)
        ORDER BY due_at, id
        LIMIT $4
        FOR UPDATE SKIP LOCKED
      ) picked
      WHERE s.id = picked.id
        AND (s.last_sla_reminder_at IS NULL OR s.last_sla_reminder_at <= $3)
      RETURNING s.id, s.due_at, s.severity, s.reported_severity, s.status
      `,
      [
        SLA_ACTIVE_STATUSES,
        now.toISOString(),
        cooldownStart.toISOString(),
        pageSize,
      ],
    );
    const updated = unwrapReturning(rows);

    for (const row of updated) {
      await this.timelineService.createEntry(
        {
          situationId: row.id,
          userId: null,
          eventType: TimelineEventType.SLA_WARNING,
          title: 'Plazo próximo a vencer',
          description:
            'El plazo operativo de esta situación está por vencer. Se recomienda avanzar el estado o documentar el cierre.',
          metadata: {
            dueAt: new Date(row.due_at).toISOString(),
            severity: row.severity,
            reportedSeverity: row.reported_severity,
            status: row.status,
            slaHealth: 'at_risk',
          },
        },
        manager,
      );
    }

    return {
      processed: updated.length,
      hasMore: updated.length === pageSize,
      cursor: null,
      escalations: [],
    };
  }

  /**
   * Solo situaciones con política: con `severity_escalation_policy_code` nulo
   * (hoy, todas) la consulta no devuelve filas y la fase termina al instante.
   * Paginación por cursor (`id >`), porque una fila procesada puede seguir
   * cumpliendo el filtro si le quedan pasos futuros.
   */
  private async escalationPage(
    manager: EntityManager,
    now: Date,
    pageSize: number,
    cursor: string | null,
  ): Promise<PageOutcome> {
    const picked = await manager.query<Array<{ id: string }>>(
      `
      SELECT id FROM situations
      WHERE status = ANY($1::situations_status_enum[])
        AND severity_escalation_policy_code IS NOT NULL
        AND ($2::uuid IS NULL OR id > $2::uuid)
      ORDER BY id
      LIMIT $3
      FOR UPDATE SKIP LOCKED
      `,
      [ESCALATION_ACTIVE_STATUSES, cursor, pageSize],
    );

    const escalations: MaterializedEscalation[] = [];
    for (const { id } of picked) {
      const situation = await manager.findOne(Situation, {
        where: { id },
        loadEagerRelations: false,
      });
      if (!situation) continue;
      escalations.push(
        ...(await this.severityEscalationService.materializeDueEscalations({
          manager,
          situation,
          now,
        })),
      );
    }

    return {
      processed: escalations.length,
      hasMore: picked.length === pageSize,
      cursor: picked.length > 0 ? picked[picked.length - 1].id : cursor,
      escalations,
    };
  }
}

interface PageOutcome {
  processed: number;
  hasMore: boolean;
  cursor: string | null;
  escalations: MaterializedEscalation[];
}

interface SlaRow {
  id: string;
  due_at: Date | string;
  severity: SituationSeverity;
  reported_severity: SituationSeverity;
  status: SituationStatus;
}

/**
 * `manager.query` con UPDATE … RETURNING devuelve `[rows, count]` en el driver
 * de PostgreSQL de TypeORM; con SELECT, solo `rows`. Se aceptan ambas formas.
 */
function unwrapReturning(raw: unknown): SlaRow[] {
  if (
    Array.isArray(raw) &&
    raw.length === 2 &&
    Array.isArray(raw[0]) &&
    typeof raw[1] === 'number'
  ) {
    return raw[0] as SlaRow[];
  }
  return (raw as SlaRow[]) ?? [];
}
