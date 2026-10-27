import {
  SituationReportKind,
  SituationStatus,
} from '../../common/enums/situation.enums';
import { computeSlaHealth } from '../../situations/situation-sla.policy';
import type {
  OperationalKpiStateAgingDto,
  OperationalKpiStateAgingItemDto,
} from '../dto/operational-kpi-state.dto';
import type {
  KpiAgingOldestRow,
  KpiAgingSummaryRow,
} from '../operational-kpi-aging.repository';
import { KPI_UNCATEGORIZED_CATEGORY_NAME } from './kpi-uncategorized-category';

/**
 * Status vivo para la UI: RESOLVED es legado y se presenta como «En atención».
 * CLOSED no debería llegar (sería dato inconsistente): no se afirma.
 */
function liveStatus(status: SituationStatus): 'OPEN' | 'IN_PROGRESS' | null {
  if (status === SituationStatus.OPEN) return 'OPEN';
  if (
    status === SituationStatus.IN_PROGRESS ||
    status === SituationStatus.RESOLVED
  ) {
    return 'IN_PROGRESS';
  }
  return null;
}

/**
 * Compone la sección `aging` de ESTADO.
 * En un corte histórico (isNow = false) NO se afirma status ni SLA: ambos son
 * valores actuales sin historial fiable (due_at se recalcula con la severidad).
 */
export function buildEstadoAging(input: {
  at: string;
  isNow: boolean;
  summary: KpiAgingSummaryRow;
  oldest: readonly KpiAgingOldestRow[];
  now?: Date;
}): OperationalKpiStateAgingDto {
  const { at, isNow, summary } = input;
  const now = input.now ?? new Date();

  const oldest: OperationalKpiStateAgingItemDto[] = input.oldest.map((row) => {
    const internal = row.reportKind === SituationReportKind.INTERNAL;
    return {
      id: row.id,
      title: row.title,
      createdAt: row.createdAt,
      ageDays: row.ageDays,
      severity: row.severity,
      reportKind: row.reportKind,
      categoryName: internal
        ? (row.categoryName ?? KPI_UNCATEGORIZED_CATEGORY_NAME)
        : null,
      affectedCoordinationName: internal
        ? null
        : (row.affectedCoordinationName ?? null),
      status: isNow ? liveStatus(row.status) : null,
      slaOverdue: isNow
        ? computeSlaHealth(row.dueAt, row.status, now, row.severity) ===
          'overdue'
        : null,
      closedAfterCutAt: !isNow && row.closedAt !== null ? row.closedAt : null,
    };
  });

  return {
    semantics: 'active-at-cut-age-since-created',
    at,
    isNow,
    reliability: {
      status: isNow ? 'current' : 'unavailable',
      sla: isNow ? 'current' : 'unavailable',
    },
    severitySemantics: 'current-severity',
    activeCount: summary.activeCount,
    medianAgeDays: summary.medianAgeDays,
    bands: summary.bands.map((band) => ({ ...band })),
    oldest,
  };
}
