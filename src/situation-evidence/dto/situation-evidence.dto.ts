import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { EvidenceType } from '../../common/enums/situation-evidence.enums';

export class CreateSituationEvidenceDto {
  @IsEnum(EvidenceType)
  type!: EvidenceType;

  /**
   * Identidad estable de la nota (p. ej. `capture:detection`). Si ya existe una
   * evidencia con la misma clave en la situación, se devuelve esa y no se duplica.
   * Opcional: sin clave, cada envío crea una evidencia nueva.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9:_.-]+$/)
  clientKey?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @ValidateIf(
    (dto: CreateSituationEvidenceDto) => dto.type !== EvidenceType.NOTE,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName?: string;

  @ValidateIf(
    (dto: CreateSituationEvidenceDto) => dto.type !== EvidenceType.NOTE,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  storagePath?: string;

  @ValidateIf(
    (dto: CreateSituationEvidenceDto) => dto.type !== EvidenceType.NOTE,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(127)
  mimeType?: string;

  @ValidateIf(
    (dto: CreateSituationEvidenceDto) => dto.type !== EvidenceType.NOTE,
  )
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fileSize?: number;
}

/** Retiro de una evidencia (Fase 01B.2): motivo obligatorio. */
export class RetireSituationEvidenceDto {
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}

export class ListSituationEvidencesQueryDto {
  /** Historial completo, incluidas las retiradas (acceso controlado). */
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === 'true' || value === true,
  )
  @IsBoolean()
  includeRetired?: boolean;
}

export class SituationEvidenceRetirementDto {
  retiredAt!: Date;
  retiredByUserId!: string;
  reason!: string;
}

export class SituationEvidenceResponseDto {
  id!: string;
  situationId!: string;
  uploadedByUserId!: string;
  uploadedByUserName!: string;
  type!: EvidenceType;
  title!: string;
  description!: string;
  fileName!: string | null;
  storagePath!: string | null;
  mimeType!: string | null;
  fileSize!: number | null;
  createdAt!: Date;
  /** Fase 01B.2: ACTIVE o RETIRED (aditivo). */
  status!: 'ACTIVE' | 'RETIRED';
  /** Solo en evidencias retiradas; null en las activas. */
  retirement!: SituationEvidenceRetirementDto | null;
}

export class SituationEvidencesListResponseDto {
  situationId!: string;
  items!: SituationEvidenceResponseDto[];
  total!: number;
}
