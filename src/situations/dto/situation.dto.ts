import { Type } from 'class-transformer';
import {
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
  categoryId!: string;
  categoryCode!: string;
  categoryName!: string;
  severity!: SituationSeverity;
  status!: SituationStatus;
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
