import {
  OperationalKpiHistoryGranularity,
  OperationalKpiHistoryMetric,
} from './operational-kpi-history-query.dto';
import { OperationalKpiScopeType } from './operational-kpi-query.dto';

export class OperationalKpiHistoryScopeDto {
  type!: OperationalKpiScopeType;
  coordinationId!: string;
}

export class OperationalKpiHistoryRangeDto {
  from!: string;
  to!: string;
}

export class OperationalKpiHistoryPointDto {
  /** Inicio inclusive del bucket (YYYY-MM-DD, Bogotá). */
  start!: string;
  /** Fin inclusive del bucket (YYYY-MM-DD, Bogotá). */
  end!: string;
  label!: string;
  value!: number;
}

export class OperationalKpiHistoryResponseDto {
  scope!: OperationalKpiHistoryScopeDto;
  metric!: OperationalKpiHistoryMetric;
  granularity!: OperationalKpiHistoryGranularity;
  range!: OperationalKpiHistoryRangeDto;
  timezone!: 'America/Bogota';
  /** Presente cuando la serie filtra por categoría INTERNAL. */
  categoryId?: string;
  /**
   * Backlog: cuenta por created_at/closed_at al final del bucket.
   * RESOLVED sin closed_at sigue en backlog (sin cierre registrado).
   * No usa status OPEN/IN_PROGRESS: el snapshot temporal es de vida útil.
   * Con categoryId: usa la categoría actual (sin historial de ediciones).
   */
  series!: OperationalKpiHistoryPointDto[];
}
