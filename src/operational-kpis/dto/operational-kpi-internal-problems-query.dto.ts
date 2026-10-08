import { IsEnum, IsUUID, Matches, ValidateIf } from 'class-validator';
import { OperationalKpiScopeType } from './operational-kpi-query.dto';
import { OperationalKpiEstadoPeriodKind } from './operational-kpi-state-query.dto';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * INTERNOS (recurrencia y afectaciones activas) de UNA coordinación
 * responsable. Mismo periodo que /state (from · to · kind · calendarEnd): el
 * corte T es el fin exclusivo de dataTo = min(fin del periodo, hoy), Bogotá.
 */
export class OperationalKpiInternosQueryDto {
  @IsEnum(OperationalKpiScopeType)
  scope!: OperationalKpiScopeType;

  @ValidateIf(
    (dto: OperationalKpiInternosQueryDto) =>
      dto.scope === OperationalKpiScopeType.COORDINATION,
  )
  @IsUUID('4')
  coordinationId?: string;

  @Matches(YMD, { message: 'from debe ser YYYY-MM-DD' })
  from!: string;

  @Matches(YMD, { message: 'to debe ser YYYY-MM-DD' })
  to!: string;

  @IsEnum(OperationalKpiEstadoPeriodKind)
  kind!: OperationalKpiEstadoPeriodKind;

  @ValidateIf((dto: OperationalKpiInternosQueryDto) => dto.calendarEnd != null)
  @Matches(YMD, { message: 'calendarEnd debe ser YYYY-MM-DD' })
  calendarEnd?: string;
}
