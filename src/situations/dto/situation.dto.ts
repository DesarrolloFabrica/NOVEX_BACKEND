import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  SituationSeverity,
  SituationStatus,
} from '../../common/enums/situation.enums';

export class CreateSituationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  description!: string;

  @IsUUID()
  coordinationId!: string;

  @IsUUID()
  categoryId!: string;

  @IsEnum(SituationSeverity)
  severity!: SituationSeverity;

  @IsDateString()
  occurredAt!: string;
}

export class UpdateSituationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @IsOptional()
  @IsUUID()
  coordinationId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsEnum(SituationSeverity)
  severity?: SituationSeverity;

  @IsOptional()
  @IsEnum(SituationStatus)
  status?: SituationStatus;

  /** Motivo de resolución o comentario de cierre (obligatorio según el estado). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  statusComment?: string;

  /**
   * Estructura preparada para adjuntar evidencias en futuras iteraciones.
   * Hoy solo se registra en el historial operacional; no valida ni asocia archivos.
   */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  evidenceIds?: string[];

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

export class ListSituationsQueryDto {
  @IsOptional()
  @IsEnum(SituationStatus)
  status?: SituationStatus;

  @IsOptional()
  @IsEnum(SituationSeverity)
  severity?: SituationSeverity;

  @IsOptional()
  @IsUUID()
  coordinationId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsDateString()
  occurredFrom?: string;

  @IsOptional()
  @IsDateString()
  occurredTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;
}

export class SituationResponseDto {
  id!: string;
  title!: string;
  description!: string;
  coordinationId!: string;
  coordinationCode!: string;
  coordinationName!: string;
  createdByUserId!: string;
  createdByUserName!: string;
  assignedUserId!: string | null;
  assignedUserName!: string | null;
  categoryId!: string;
  categoryCode!: string;
  categoryName!: string;
  severity!: SituationSeverity;
  status!: SituationStatus;
  lastStatusComment!: string | null;
  resolvedAt!: Date | null;
  closedAt!: Date | null;
  occurredAt!: Date;
  createdAt!: Date;
  updatedAt!: Date;
}

export class SituationsListResponseDto {
  items!: SituationResponseDto[];
  total!: number;
  page!: number;
  limit!: number;
}
