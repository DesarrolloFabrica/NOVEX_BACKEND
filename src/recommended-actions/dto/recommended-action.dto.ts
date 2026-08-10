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
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListRecommendedActionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  areaId?: string;

  @IsOptional()
  @IsEnum(RecommendedActionExecutionStatus)
  status?: RecommendedActionExecutionStatus;

  @IsOptional()
  @IsUUID()
  eventId?: string;

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
