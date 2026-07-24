/**
 * Contratos de respuesta del tablero — espejo de DashboardMetrics del frontend.
 * Sprint 6: estructura lista; el cálculo real se implementará en Sprint siguiente.
 */

export class CategoryMetricBreakdownDto {
  categoryId!: string;
  categoryName!: string;
  count!: number;
  activeCount!: number;
  criticalCount!: number;
}

export class AreaMetricBreakdownDto {
  areaId!: string;
  areaName!: string;
  openCount!: number;
  eventCount!: number;
  criticalCount!: number;
  averageRiskScore!: number;
}

export class ConsolidatedIndicatorDto {
  code!: string;
  label!: string;
  value!: number;
  unit?: string;
  direction?: 'higher_is_worse' | 'higher_is_better';
  source!: 'engine' | 'ai_suggested';
}

export class DashboardMetricsDto {
  totalEvents!: number;
  openCount!: number;
  monitoringCount!: number;
  resolvedCount!: number;
  archivedCount!: number;
  averageAffectationPercentage!: number;
  averageRiskScore!: number;
  criticalCount!: number;
  highRiskCount!: number;
  averageImpactInternal!: number;
  averageImpactExternal!: number;
  averageImpactStudents!: number;
  operationalRiskLevel!: string;
  trend!: string;
  byCategory!: CategoryMetricBreakdownDto[];
  byArea!: AreaMetricBreakdownDto[];
  consolidatedIndicators!: ConsolidatedIndicatorDto[];
  executiveNarrative!: string;
  dominantAreaName!: string | null;
  dominantCategoryName!: string | null;
  environment!: string;
  generatedAt!: string;
}
