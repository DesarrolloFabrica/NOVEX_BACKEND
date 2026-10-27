import { IsEnum, IsUUID, Matches, ValidateIf } from 'class-validator';
import { OperationalKpiHistoryMetric } from './operational-kpi-history-query.dto';
import { OperationalKpiScopeType } from './operational-kpi-query.dto';

export enum OperationalKpiBreakdownDimension {
  CATEGORY = 'category',
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Breakdown INTERNAL por categoría. Solo scope=coordination en esta fase.
 * Reloj: created_at / closed_at. Zona implícita America/Bogota en from/to.
 *
 * Limitación backlog: usa la categoría actual de la situación; no hay
 * historial de cambios de category_id.
 */
export class OperationalKpiBreakdownQueryDto {
  @IsEnum(OperationalKpiScopeType)
  scope!: OperationalKpiScopeType;

  @ValidateIf(
    (dto: OperationalKpiBreakdownQueryDto) =>
      dto.scope === OperationalKpiScopeType.COORDINATION,
  )
  @IsUUID('4')
  coordinationId?: string;

  @IsEnum(OperationalKpiBreakdownDimension)
  dimension!: OperationalKpiBreakdownDimension;

  @IsEnum(OperationalKpiHistoryMetric)
  metric!: OperationalKpiHistoryMetric;

  @Matches(YMD, { message: 'from debe ser YYYY-MM-DD' })
  from!: string;

  @Matches(YMD, { message: 'to debe ser YYYY-MM-DD' })
  to!: string;
}
