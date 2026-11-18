import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';
import {
  SituationReportKind,
  SituationSeverity,
  SituationStatus,
} from '../../common/enums/situation.enums';

/** Estados que cuentan como «situación activa» (igual que overview y KPIs). */
export const EXPORTABLE_ACTIVE_STATUSES = [
  SituationStatus.OPEN,
  SituationStatus.IN_PROGRESS,
] as const;

export type ExportableActiveStatus =
  (typeof EXPORTABLE_ACTIVE_STATUSES)[number];

/**
 * Hojas del libro. «situations» va siempre (se acepta para que el cliente
 * pueda pedir solo esa hoja); el resto son opcionales.
 */
export const SITUATIONS_EXPORT_SHEETS = [
  'situations',
  'summary',
  'consequences',
  'related',
] as const;

export type SituationsExportSheet = (typeof SITUATIONS_EXPORT_SHEETS)[number];

/** Roles que ven el registro institucional completo y pueden exportarlo. */
export const SITUATIONS_EXPORT_ROLES = ['ADMIN', 'DIRECTOR', 'ANALISTA'];

/** Tope duro de filas: protege memoria y tiempo de respuesta de Cloud Run. */
export const SITUATIONS_EXPORT_MAX_ROWS = 5000;

/**
 * Acepta `a,b,c` o parámetros repetidos (`?x=a&x=b`). Cadena vacía = sin filtro.
 */
function toList({ value }: { value: unknown }): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = Array.isArray(value) ? value : [value];
  const items = raw
    .flatMap((item) => String(item).split(','))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? Array.from(new Set(items)) : undefined;
}

/**
 * Opciones de la exportación a Excel de situaciones ACTIVAS. Todos los filtros
 * son opcionales: sin ellos se exporta todo lo activo de todas las
 * coordinaciones con todas las hojas.
 */
export class ExportSituationsQueryDto {
  /** Coordinaciones RESPONSABLES a incluir. Vacío = todas. */
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  coordinationIds?: string[];

  /** Subconjunto de estados activos. Vacío = abiertas y en atención. */
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(EXPORTABLE_ACTIVE_STATUSES, { each: true })
  statuses?: ExportableActiveStatus[];

  /** Severidad EFECTIVA. Vacío = todas. */
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @IsEnum(SituationSeverity, { each: true })
  severities?: SituationSeverity[];

  /** Tipo de registro. Vacío = internas y dependencias. */
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @IsEnum(SituationReportKind, { each: true })
  reportKinds?: SituationReportKind[];

  /** Hojas a incluir. Ausente = todas; «situations» se incluye siempre. */
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @IsIn(SITUATIONS_EXPORT_SHEETS, { each: true })
  sheets?: SituationsExportSheet[];
}
