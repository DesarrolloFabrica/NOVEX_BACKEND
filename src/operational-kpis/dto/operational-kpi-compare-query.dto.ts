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

/**
 * Un valor que no es texto (p. ej. un objeto por `coordinationIds[x]=…`) no se
 * descarta en silencio: se conserva como un id inválido para que `@IsUUID`
 * rechace la petición, igual que cuando se convertía en '[object Object]'.
 */
const NON_TEXT_COORDINATION_ID = '[invalid]';

function toIdText(part: unknown): string {
  if (typeof part === 'string') return part;
  if (typeof part === 'number') return String(part);
  return NON_TEXT_COORDINATION_ID;
}

function parseCoordinationIds(value: unknown): string[] {
  if (value === undefined || value === null || value === '') {
    return [];
  }
  const parts: unknown[] = Array.isArray(value) ? value : [value];
  return parts
    .flatMap((part) => toIdText(part).split(','))
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
