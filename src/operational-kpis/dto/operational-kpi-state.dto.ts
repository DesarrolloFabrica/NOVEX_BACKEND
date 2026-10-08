import { OperationalKpiHistoryPointDto } from './operational-kpi-history.dto';

export class OperationalKpiStatePeriodDto {
  kind!: string;
  from!: string;
  to!: string;
  calendarEnd!: string;
  label!: string;
  isCurrent!: boolean;
  isPartial!: boolean;
  dataTo!: string;
}

export class OperationalKpiStateSeverityDto {
  low!: number;
  medium!: number;
  high!: number;
  critical!: number;
}

/**
 * Atención de la población al corte, por status ACTUAL (NOVEX no reconstruye
 * el status histórico de forma fiable). open + inProgress + closedAfterCut +
 * unclassified = activeCount.
 */
export class OperationalKpiStateAttentionDto {
  open!: number;
  inProgress!: number;
  /** Activos al corte que hoy ya están cerrados (solo en cortes históricos). */
  closedAfterCut!: number;
  /** Datos inconsistentes (p. ej. CLOSED sin closed_at): visibles, no perdidos. */
  unclassified!: number;
}

/**
 * SNAPSHOT AT CUT: composición de la población ACTIVE_AT_CUT (misma que
 * Carga y Antigüedad) al corte `at` = period.dataTo.
 * Invariantes: activeCount = Σ severidad = Σ atención = aging.activeCount =
 * active.total del último bucket no futuro.
 */
export class OperationalKpiStateSnapshotDto {
  semantics!: 'active-at-cut';
  at!: string;
  isNow!: boolean;
  activeCount!: number;
  severity!: OperationalKpiStateSeverityDto;
  attention!: OperationalKpiStateAttentionDto;
  /**
   * exact: el corte es hoy (valor vigente = valor al corte).
   * current-value: corte histórico; se aplica el valor ACTUAL a la población
   * que estaba activa entonces (sin snapshot histórico de severidad/status).
   */
  reliability!: {
    severity: 'exact' | 'current-value';
    attention: 'exact' | 'current-value';
  };
}

export class OperationalKpiStateRelationsDto {
  dependencies!: number;
  commitments!: number;
}

/**
 * Casilla del flujo (drill-down). Cubre el periodo calendario completo.
 * - created  (REPORTADOS): evento, created_at ∈ [start, dataEnd].
 * - closed   (SOLUCIONADOS): evento, closed_at ∈ [start, dataEnd].
 * - backlog  (PENDIENTES): stock al cierre de dataEnd
 *   (created_at < T AND (closed_at IS NULL OR closed_at >= T)); un mismo
 *   problema aparece en todas las casillas hasta su cierre real.
 * Futuras: los tres valores son null (no hay datos, no son ceros).
 */
export class OperationalKpiStateActiveCategoryDto {
  categoryId!: string;
  categoryCode!: string;
  categoryName!: string;
  selectable!: boolean;
  count!: number;
}

export class OperationalKpiStateActiveCoordinationDto {
  /** Coordinación AFECTADA (no implica autoría de quien registró el caso). */
  coordinationId!: string | null;
  coordinationCode!: string | null;
  coordinationName!: string;
  count!: number;
}

/**
 * STOCK al cierre del bucket (o ahora si está en curso) de la coordinación
 * RESPONSABLE: total = internal + external. Breakdowns del MISMO universo
 * (activos al cierre), ordenados count DESC, nombre ASC.
 */
export class OperationalKpiStateActiveDto {
  total!: number;
  internal!: number;
  external!: number;
  internalBreakdown!: OperationalKpiStateActiveCategoryDto[];
  externalBreakdown!: OperationalKpiStateActiveCoordinationDto[];
}

/** EVENTO: closed_at dentro del bucket, coordination_id = responsable. */
export class OperationalKpiStateSolvedDto {
  total!: number;
}

export class OperationalKpiStateFlowBucketDto {
  /** Ventana del bucket dentro del periodo (p. ej. 1–4 oct en octubre). */
  start!: string;
  end!: string;
  /** Fin realmente contado (≤ end; recortado a hoy). null si futuro. */
  dataEnd!: string | null;
  /** Unidad completa para el drill-down (semana 28 sep – 4 oct). */
  calendarStart!: string;
  calendarEnd!: string;
  label!: string;
  current!: boolean;
  future!: boolean;
  created!: number | null;
  closed!: number | null;
  backlog!: number | null;
  /** Carga activa al cierre (stock). null si futuro. */
  active!: OperationalKpiStateActiveDto | null;
  /** Solucionados dentro del bucket (evento). null si futuro. */
  solved!: OperationalKpiStateSolvedDto | null;
}

export class OperationalKpiStateEvolutionDto {
  bucket!: 'day' | 'week' | 'month';
  backlog!: OperationalKpiHistoryPointDto[];
  created!: OperationalKpiHistoryPointDto[];
  closed!: OperationalKpiHistoryPointDto[];
  buckets!: OperationalKpiStateFlowBucketDto[];
}

/**
 * Problemas pendientes al cierre del periodo (T = fin de dataTo, o ahora si el
 * periodo está en curso): created_at < T AND (closed_at IS NULL OR
 * closed_at >= T). Incluye casos creados ANTES del periodo que siguen
 * abiertos: no depende de created_at ∈ periodo.
 */
export class OperationalKpiStateActiveAtPeriodEndDto {
  count!: number;
  at!: string;
  isNow!: boolean;
}

export class OperationalKpiStateAgingBandDto {
  key!: '0-7' | '8-14' | '15-30' | '31+';
  count!: number;
}

/**
 * Problema activo al corte, en el ranking de antigüedad.
 * - severity: valor ACTUAL (sin historial fiable).
 * - status: solo si el corte es hoy (reliability.status = 'current'); null en
 *   periodos históricos. RESOLVED legado se presenta como IN_PROGRESS.
 * - slaOverdue: regla de SLA actual, solo si el corte es hoy; null en
 *   históricos (due_at cambia con la severidad: no es afirmable al pasado).
 * - closedAfterCutAt: solo en históricos, si el problema se cerró después
 *   del corte. null si sigue activo hoy o si el corte es hoy.
 */
export class OperationalKpiStateAgingItemDto {
  id!: string;
  title!: string;
  createdAt!: string;
  ageDays!: number;
  severity!: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reportKind!: 'INTERNAL' | 'INTER_COORDINATION';
  /** INTERNAL: categoría actual o «Sin categoría». INTER: null. */
  categoryName!: string | null;
  /** INTER: coordinación afectada (compromiso). INTERNAL: null. */
  affectedCoordinationName!: string | null;
  status!: 'OPEN' | 'IN_PROGRESS' | null;
  slaOverdue!: boolean | null;
  closedAfterCutAt!: string | null;
}

/**
 * ANTIGÜEDAD (SNAPSHOT AT CUT · scope COORDINATION): problemas activos al
 * corte T de la coordinación seleccionada, edad en días calendario Bogotá
 * desde created_at hasta `at`.
 * Invariantes: activeCount = active.total del último bucket no futuro =
 * snapshot.activeCount = Σ bands.
 */
export class OperationalKpiStateAgingDto {
  semantics!: 'active-at-cut-age-since-created';
  /** refDate = period.dataTo (YYYY-MM-DD). */
  at!: string;
  isNow!: boolean;
  /** Qué atributos de estado vivo son afirmables en este corte. */
  reliability!: {
    status: 'current' | 'unavailable';
    sla: 'current' | 'unavailable';
  };
  severitySemantics!: 'current-severity';
  activeCount!: number;
  medianAgeDays!: number | null;
  /** Preparado para la futura distribución; aún no se renderiza. */
  bands!: OperationalKpiStateAgingBandDto[];
  /** Top 5: created_at ASC, id ASC. */
  oldest!: OperationalKpiStateAgingItemDto[];
}

/**
 * RESOLUCIÓN (FLOW OUTCOME · scope COORDINATION): duración EXACTA
 * (closed_at − created_at, en días decimales) de los problemas atribuidos HOY
 * a la coordinación y cerrados dentro de cada bucket / del periodo.
 * Mismo universo y mismos buckets que «Solucionados» de Movimiento:
 *   buckets[i].closedCount === evolution.buckets[i].solved.total
 *   closedCount === Σ buckets.closedCount === Σ distribution.count
 * closedCount = 0 ⇒ medianDays = p75Days = null (nunca 0: sería instantáneo).
 */
export type OperationalKpiResolutionBandKey =
  'lt-1d' | '1-3d' | '3-7d' | '7-14d' | '14-30d' | '30d+';

export class OperationalKpiStateResolutionBucketDto {
  /** = evolution.buckets[i].start (misma geometría, mismo orden). */
  start!: string;
  /** null solo en buckets futuros. */
  closedCount!: number | null;
  medianDays!: number | null;
  p75Days!: number | null;
}

export class OperationalKpiStateResolutionBandDto {
  key!: OperationalKpiResolutionBandKey;
  /** Intervalo semiabierto [fromHours, toHours) sobre la duración exacta. */
  fromHours!: number;
  toHours!: number | null;
  count!: number;
}

export class OperationalKpiStateResolutionDto {
  semantics!: 'closed-in-period-duration-since-created';
  closedCount!: number;
  medianDays!: number | null;
  p75Days!: number | null;
  buckets!: OperationalKpiStateResolutionBucketDto[];
  distribution!: OperationalKpiStateResolutionBandDto[];
}

export class OperationalKpiStateResponseDto {
  scope!: { type: 'coordination'; coordinationId: string };
  timezone!: string;
  period!: OperationalKpiStatePeriodDto;
  /** FLUJO: INTER creados en el periodo (no es stock). */
  relations!: OperationalKpiStateRelationsDto;
  evolution!: OperationalKpiStateEvolutionDto;
  activeAtPeriodEnd!: OperationalKpiStateActiveAtPeriodEndDto;
  aging!: OperationalKpiStateAgingDto;
  snapshot!: OperationalKpiStateSnapshotDto;
  resolution!: OperationalKpiStateResolutionDto;
}
