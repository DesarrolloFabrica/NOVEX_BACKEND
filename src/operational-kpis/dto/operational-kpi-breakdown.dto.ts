import { OperationalKpiHistoryMetric } from './operational-kpi-history-query.dto';
import { OperationalKpiScopeType } from './operational-kpi-query.dto';
import { OperationalKpiBreakdownDimension } from './operational-kpi-breakdown-query.dto';

export class OperationalKpiBreakdownCategoryDto {
  id!: string;
  code!: string;
  name!: string;
  selectable!: boolean;
}

export class OperationalKpiBreakdownItemDto {
  category!: OperationalKpiBreakdownCategoryDto;
  value!: number;
}

export class OperationalKpiBreakdownResponseDto {
  scope!: {
    type: OperationalKpiScopeType;
    coordinationId: string;
  };
  dimension!: OperationalKpiBreakdownDimension;
  metric!: OperationalKpiHistoryMetric;
  range!: { from: string; to: string };
  timezone!: 'America/Bogota';
  /**
   * Solo report_kind=INTERNAL. Orden: value DESC, name ASC.
   * Sin categoría → id estable UNCATEGORIZED.
   */
  items!: OperationalKpiBreakdownItemDto[];
}
