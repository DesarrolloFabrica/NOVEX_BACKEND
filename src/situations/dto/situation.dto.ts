import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  SituationSeverity,
  SituationStatus,
} from '../../common/enums/situation.enums';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class CreateSituationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  description!: string;

  /** Ausente cuando registra un analista: el caso queda a su nombre. */
  @IsOptional()
  @IsUUID()
  coordinationId?: string;

  @IsUUID()
  categoryId!: string;

  @IsEnum(SituationSeverity)
  severity!: SituationSeverity;

  @IsDateString()
  occurredAt!: string;

  /**
   * Coordinaciones que el usuario declara como potencialmente relacionadas.
   * Opcional; si se envían, tienen prioridad sobre cualquier simulación IA.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsUUID('4', { each: true })
  relatedCoordinationIds?: string[];
}

export class RelatedCoordinationResponseDto {
  id!: string;
  coordinationId!: string;
  coordinationCode!: string;
  coordinationName!: string;
  coordinationShortName!: string;
  displayOrder!: number;
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

export class ListSituationsQueryDto extends PaginationQueryDto {
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
}

export class SituationResponseDto {
  id!: string;
  title!: string;
  description!: string;
  coordinationId!: string | null;
  coordinationCode!: string | null;
  coordinationName!: string | null;
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
  dueAt!: Date | null;
  slaPolicyCode!: string | null;
  slaBreachedAt!: Date | null;
  /** Salud SLA derivada: on_track | at_risk | overdue | closed */
  slaHealth!: 'on_track' | 'at_risk' | 'overdue' | 'closed';
  /** Solo en CLOSED: si closedAt <= dueAt */
  closedOnTime!: boolean | null;
  occurredAt!: Date;
  createdAt!: Date;
  updatedAt!: Date;
  relatedCoordinations!: RelatedCoordinationResponseDto[];
}

export class SituationsListResponseDto {
  items!: SituationResponseDto[];
  total!: number;
  page!: number;
  limit!: number;
}

export class IncidentCategorySummaryDto {
  id!: string;
  code!: string;
  name!: string;
  description!: string | null;
}
