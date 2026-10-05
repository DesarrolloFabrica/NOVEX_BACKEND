import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsUUID,
} from 'class-validator';
import {
  OPERATIONAL_KPI_COMPARE_MAX,
  OPERATIONAL_KPI_COMPARE_MIN,
} from '../operational-kpi.constants';

function parseCoordinationIds(value: unknown): string[] {
  if (value === undefined || value === null || value === '') {
    return [];
  }
  const parts = Array.isArray(value) ? value : String(value).split(',');
  return parts
    .flatMap((part) => String(part).split(','))
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * GET /operational-kpis/compare?coordinationIds=uuid,uuid
 * También admite el mismo nombre repetido en query.
 * El orden del array ES el orden de la respuesta.
 */
export class OperationalKpiCompareQueryDto {
  @Transform(({ value }) => parseCoordinationIds(value))
  @IsArray()
  @ArrayMinSize(OPERATIONAL_KPI_COMPARE_MIN)
  @ArrayMaxSize(OPERATIONAL_KPI_COMPARE_MAX)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  coordinationIds!: string[];
}
