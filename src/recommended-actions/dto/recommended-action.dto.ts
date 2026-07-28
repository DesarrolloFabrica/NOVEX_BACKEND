import { Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { RecommendedActionExecutionStatus } from '../../common/enums/operational.enums';

export class ListRecommendedActionsQueryDto {
  @IsOptional()
  @IsUUID()
  areaId?: string;

  @IsOptional()
  @IsEnum(RecommendedActionExecutionStatus)
  status?: RecommendedActionExecutionStatus;

  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 100;
}

export class UpdateRecommendedActionStatusDto {
  @IsEnum(RecommendedActionExecutionStatus)
  status!: RecommendedActionExecutionStatus;

  /**
   * Obligatorio cuando status === not_executable.
   * Opcional (observación final) cuando status === executed.
   */
  @ValidateIf(
    (dto: UpdateRecommendedActionStatusDto) =>
      dto.status === RecommendedActionExecutionStatus.NOT_EXECUTABLE ||
      (dto.note != null && String(dto.note).trim().length > 0),
  )
  @IsString()
  @MinLength(4)
  @MaxLength(2000)
  note?: string;

  @ValidateIf(
    (dto: UpdateRecommendedActionStatusDto) =>
      dto.status === RecommendedActionExecutionStatus.NOT_EXECUTABLE ||
      (dto.observation != null && String(dto.observation).trim().length > 0),
  )
  @IsString()
  @MinLength(4)
  @MaxLength(2000)
  observation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  byUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  byUserName?: string;
}
