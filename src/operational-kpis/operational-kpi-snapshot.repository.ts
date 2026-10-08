import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Situation } from '../situations/entities/situation.entity';
import { activeAtCutCte, activeAtCutParams } from './domain/kpi-active-at-cut';
import { KPI_HISTORY_TIMEZONE } from './domain/kpi-history-buckets';

export type KpiSnapshotCompositionRow = {
  activeCount: number;
  severity: { low: number; medium: number; high: number; critical: number };
  /**
   * Clasificación por el status ACTUAL de cada problema de la población:
   *   open / inProgress: siguen activos hoy (RESOLVED legado → inProgress).
   *   closedAfterCut: activos al corte pero ya cerrados hoy (su status al
   *     corte no se conoce con fiabilidad).
   *   unclassified: dato inconsistente (p. ej. CLOSED sin closed_at); se
   *     cuenta para no perder problemas en silencio.
   */
  attention: {
    open: number;
    inProgress: number;
    closedAfterCut: number;
    unclassified: number;
  };
};

/**
 * Composición (severidad + atención) de la población ACTIVE_AT_CUT:
 * misma CTE que Antigüedad y mismo predicado que Carga. Una sola consulta.
 */
@Injectable()
export class OperationalKpiSnapshotRepository {
  constructor(
    @InjectRepository(Situation)
    private readonly situationsRepository: Repository<Situation>,
  ) {}

  async aggregateComposition(
    coordinationId: string,
    refDate: string,
  ): Promise<KpiSnapshotCompositionRow> {
    const sql = `
      ${activeAtCutCte(KPI_HISTORY_TIMEZONE)}
      SELECT
        COUNT(*)::int AS active_count,
        COUNT(*) FILTER (WHERE severity = 'LOW')::int AS sev_low,
        COUNT(*) FILTER (WHERE severity = 'MEDIUM')::int AS sev_medium,
        COUNT(*) FILTER (WHERE severity = 'HIGH')::int AS sev_high,
        COUNT(*) FILTER (WHERE severity = 'CRITICAL')::int AS sev_critical,
        COUNT(*) FILTER (WHERE closed_at IS NULL AND status = 'OPEN')::int AS att_open,
        COUNT(*) FILTER (
          WHERE closed_at IS NULL AND status IN ('IN_PROGRESS', 'RESOLVED')
        )::int AS att_in_progress,
        COUNT(*) FILTER (WHERE closed_at IS NOT NULL)::int AS att_closed_after_cut,
        COUNT(*) FILTER (
          WHERE closed_at IS NULL AND status NOT IN ('OPEN', 'IN_PROGRESS', 'RESOLVED')
        )::int AS att_unclassified
      FROM universe
    `;
    const rows = await this.situationsRepository.manager.query<
      Array<Record<string, string | number | null>>
    >(sql, activeAtCutParams(coordinationId, refDate));
    const row = rows[0] ?? {};
    const n = (key: string) => Number(row[key] ?? 0);
    return {
      activeCount: n('active_count'),
      severity: {
        low: n('sev_low'),
        medium: n('sev_medium'),
        high: n('sev_high'),
        critical: n('sev_critical'),
      },
      attention: {
        open: n('att_open'),
        inProgress: n('att_in_progress'),
        closedAfterCut: n('att_closed_after_cut'),
        unclassified: n('att_unclassified'),
      },
    };
  }
}
