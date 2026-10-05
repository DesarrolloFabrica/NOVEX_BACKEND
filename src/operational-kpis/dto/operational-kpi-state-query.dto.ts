import { IsEnum, IsUUID, Matches, ValidateIf } from 'class-validator';
import { OperationalKpiScopeType } from './operational-kpi-query.dto';

export enum OperationalKpiEstadoPeriodKind {
  WEEK = 'week',
  MONTH = 'month',
  CYCLE = 'cycle',
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fotografía coherente de ESTADO para un periodo explícito (from/to).
 */
export class OperationalKpiStateQueryDto {
  @IsEnum(OperationalKpiScopeType)
  scope!: OperationalKpiScopeType;

  @ValidateIf(
    (dto: OperationalKpiStateQueryDto) =>
      dto.scope === OperationalKpiScopeType.COORDINATION,
  )
  @IsUUID('4')
  coordinationId?: string;

  @Matches(YMD, { message: 'from debe ser YYYY-MM-DD' })
  from!: string;

  @Matches(YMD, { message: 'to debe ser YYYY-MM-DD' })
  to!: string;

  /**
   * Kind del periodo analizado: determina resolución de buckets de evolución.
   * week→day, month→week (clip), cycle→month.
   */
  @IsEnum(OperationalKpiEstadoPeriodKind)
  kind!: OperationalKpiEstadoPeriodKind;

  /** Fin calendario del periodo (opcional; default = to). Para flags isPartial. */
  @ValidateIf((dto: OperationalKpiStateQueryDto) => dto.calendarEnd != null)
  @Matches(YMD, { message: 'calendarEnd debe ser YYYY-MM-DD' })
  calendarEnd?: string;
}
