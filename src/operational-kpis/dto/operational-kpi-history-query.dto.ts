import {
  IsEnum,
  IsOptional,
  IsUUID,
  Matches,
  ValidateIf,
} from 'class-validator';
import { OperationalKpiScopeType } from './operational-kpi-query.dto';

export enum OperationalKpiHistoryMetric {
  BACKLOG = 'backlog',
  CREATED = 'created',
  CLOSED = 'closed',
}

export enum OperationalKpiHistoryGranularity {
  WEEK = 'week',
  MONTH = 'month',
  CYCLE = 'cycle',
}

export enum OperationalKpiDependencySide {
  COMMITMENT = 'commitment',
  DEPENDENCY = 'dependency',
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Histórico por coordinación. `direction` y compare llegan en fases posteriores.
 * `from`/`to` son fechas civiles YYYY-MM-DD en America/Bogota (inclusive).
 *
 * `categoryId` opcional: filtra report_kind=INTERNAL y esa categoría
 * (o Sin categoría con el id estable UNCATEGORIZED).
 *
 * `partnerCoordinationId` + `dependencySide`: filtra INTER con esa pareja
 * (excluye categoryId).
 */
export class OperationalKpiHistoryQueryDto {
  @IsEnum(OperationalKpiScopeType)
  scope!: OperationalKpiScopeType;

  @ValidateIf(
    (dto: OperationalKpiHistoryQueryDto) =>
      dto.scope === OperationalKpiScopeType.COORDINATION,
  )
  @IsUUID('4')
  coordinationId?: string;

  @IsEnum(OperationalKpiHistoryMetric)
  metric!: OperationalKpiHistoryMetric;

  @IsEnum(OperationalKpiHistoryGranularity)
  granularity!: OperationalKpiHistoryGranularity;

  @Matches(YMD, { message: 'from debe ser YYYY-MM-DD' })
  from!: string;

  @Matches(YMD, { message: 'to debe ser YYYY-MM-DD' })
  to!: string;

  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @IsOptional()
  @IsUUID('4')
  partnerCoordinationId?: string;

  @ValidateIf(
    (dto: OperationalKpiHistoryQueryDto) =>
      Boolean(dto.partnerCoordinationId),
  )
  @IsEnum(OperationalKpiDependencySide)
  dependencySide?: OperationalKpiDependencySide;
}
