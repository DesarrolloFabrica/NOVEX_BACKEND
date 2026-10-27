import type {
  SituationSeverity,
  SituationStatus,
} from '../../common/enums/situation.enums';
import type { InternalProblemSlaAtCut } from '../domain/kpi-internal-problems';
import type { OperationalKpiScopeType } from './operational-kpi-query.dto';

/** Periodo resuelto de INTERNOS (mismo de /state). */
export interface OperationalKpiInternosPeriodDto {
  kind: string;
  from: string;
  to: string;
  calendarEnd: string;
  dataTo: string;
  isCurrent: boolean;
  isPartial: boolean;
  /** Corte T exclusivo (ISO). */
  cutAt: string;
}

/**
 * Problema INTERNAL ACTIVO al corte. Solo agregados: sin severityHistory[]
 * ni consequences[] (eso es del detalle).
 */
export interface OperationalKpiInternalProblemRowDto {
  id: string;
  title: string;
  category: { id: string; code: string; name: string } | null;
  createdAt: string;
  createdByName: string | null;
  /** Días desde el alta al corte (fórmula de Antigüedad). */
  ageDays: number;
  statusAtCut: SituationStatus;
  reportedSeverity: SituationSeverity;
  /** Vigente en T. */
  severityAtCut: SituationSeverity;
  /** Afectaciones registradas (created_at) antes de T. */
  consequenceCountAtCut: number;
  /** Entre las conocidas al corte, la de ocurrencia más reciente. */
  latestConsequence: {
    occurredAt: string;
    createdAt: string;
    /** ≤ 140 caracteres. */
    preview: string;
    truncated: boolean;
  } | null;
  dueAt: string | null;
  /** Por severidad REPORTADA, medido a min(ahora, T). */
  slaAtCut: InternalProblemSlaAtCut;
  /** false = creado antes de INTERNAL vivo: sin historial de afectaciones. */
  historyReliable: boolean;
  /**
   * Afectaciones conocidas al corte (created_at < T), por occurred_at ↑:
   * posición en la línea de vida = ocurrencia; inclusión = registro. Mismo
   * conjunto que consequenceCountAtCut. Vacío si historyReliable = false.
   */
  consequenceTimeline: Array<{
    id: string;
    occurredAt: string;
    createdAt: string;
    /** ≤ 140 caracteres. */
    preview: string;
    truncated: boolean;
    severityAtOccurrence: SituationSeverity;
  }>;
}

export interface OperationalKpiInternalProblemsResponseDto {
  scope: { type: OperationalKpiScopeType; coordinationId: string };
  timezone: string;
  period: OperationalKpiInternosPeriodDto;
  /** = Carga.active.internal del mismo corte. */
  total: number;
  truncated: boolean;
  /** Afectaciones ↓ · severidad al corte ↓ · días abierto ↓ · id. */
  items: OperationalKpiInternalProblemRowDto[];
}

/** INTERNOS · RECURRENCIA DE CATEGORÍAS (flujo por created_at). */
export interface OperationalKpiInternalRecurrenceResponseDto {
  scope: { type: OperationalKpiScopeType; coordinationId: string };
  timezone: string;
  period: OperationalKpiInternosPeriodDto;
  bucket: 'day' | 'week' | 'month';
  buckets: Array<{
    /** Ventana contada (semana recortada al mes). */
    start: string;
    end: string;
    /** Ventana calendario que abre el drill-down. */
    calendarStart: string;
    calendarEnd: string;
    /** null = futuro. */
    dataEnd: string | null;
    label: string;
    current: boolean;
    future: boolean;
    /** INTERNAL creados en el bucket; null = futuro. */
    total: number | null;
  }>;
  /** Buckets con dataEnd (no futuros). */
  eligibleBuckets: number;
  /** INTERNAL creados en el periodo. */
  total: number;
  /** Solo categorías con actividad: presencia ↓ · total ↓ · nombre. */
  categories: Array<{
    id: string;
    code: string;
    name: string;
    selectable: boolean;
    totalCreated: number;
    bucketsWithOccurrences: number;
    values: Array<number | null>;
  }>;
}
