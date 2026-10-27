import { IsEnum, IsUUID, Matches, ValidateIf } from 'class-validator';
import { OperationalKpiHistoryMetric } from './operational-kpi-history-query.dto';
import { OperationalKpiScopeType } from './operational-kpi-query.dto';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Relaciones INTER de una coordinación.
 * commitments = responsable soy yo (afectada = otra).
 * dependencies = afectada soy yo (responsable = otra).
 */
export class OperationalKpiRelationsQueryDto {
  @IsEnum(OperationalKpiScopeType)
  scope!: OperationalKpiScopeType;

  @ValidateIf(
    (dto: OperationalKpiRelationsQueryDto) =>
      dto.scope === OperationalKpiScopeType.COORDINATION,
  )
  @IsUUID('4')
  coordinationId?: string;

  @IsEnum(OperationalKpiHistoryMetric)
  metric!: OperationalKpiHistoryMetric;

  @Matches(YMD, { message: 'from debe ser YYYY-MM-DD' })
  from!: string;

  @Matches(YMD, { message: 'to debe ser YYYY-MM-DD' })
  to!: string;
}
