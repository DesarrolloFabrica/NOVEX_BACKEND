import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { KPI_LEARNINGS_PAGE_MAX } from '../domain/kpi-learnings';
import { OperationalKpiInternosQueryDto } from './operational-kpi-internal-problems-query.dto';

/**
 * APRENDIZAJES · resumen. Mismo periodo y scope que INTERNOS
 * (from · to · kind · calendarEnd, Bogotá). `coordinationId` es SIEMPRE la
 * coordinación RESPONSABLE; nunca la afectada.
 */
export class OperationalKpiLearningsQueryDto extends OperationalKpiInternosQueryDto {}

/** APRENDIZAJES · fichas paginadas, con filtro opcional de categoría. */
export class OperationalKpiLearningItemsQueryDto extends OperationalKpiInternosQueryDto {
  /**
   * Id de `incident_categories`, o `KPI_UNCATEGORIZED_CATEGORY_ID` para los
   * problemas sin categoría. Ausente = todas.
   */
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(KPI_LEARNINGS_PAGE_MAX)
  limit?: number;
}
