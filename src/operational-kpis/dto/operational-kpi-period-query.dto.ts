import {
  IsEnum,
  IsOptional,
  IsUUID,
  Matches,
  ValidateIf,
} from 'class-validator';
import { OperationalKpiHistoryGranularity } from './operational-kpi-history-query.dto';
import { OperationalKpiScopeType } from './operational-kpi-query.dto';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Composición de ESTADO.
 * Preferido: from + to explícitos.
 * Legacy: granularity → periodo actual (buildCurrentAnalysisPeriod).
 */
export class OperationalKpiPeriodQueryDto {
  @IsEnum(OperationalKpiScopeType)
  scope!: OperationalKpiScopeType;

  @ValidateIf(
    (dto: OperationalKpiPeriodQueryDto) =>
      dto.scope === OperationalKpiScopeType.COORDINATION,
  )
  @IsUUID('4')
  coordinationId?: string;

  @IsOptional()
  @Matches(YMD, { message: 'from debe ser YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(YMD, { message: 'to debe ser YYYY-MM-DD' })
  to?: string;

  /** @deprecated Preferir from/to. Conservado para compat. */
  @IsOptional()
  @IsEnum(OperationalKpiHistoryGranularity)
  granularity?: OperationalKpiHistoryGranularity;
}
