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
import { OperationalEventStatus } from '../../common/enums/operational.enums';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/** Captura cruda del evento (equivalente a OperationalEventDraft del frontend). */
export class CreateOperationalEventDto {
  @IsString()
  @MinLength(4)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(12)
  description!: string;

  @IsUUID()
  sourceAreaId!: string;

  @IsDateString()
  reportedAt!: string;

  @IsOptional()
  @IsString()
  observations?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  attachmentNames?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  reportedById?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  reportedByName?: string;
}

export class UpdateOperationalEventStatusDto {
  @IsEnum(OperationalEventStatus)
  status!: OperationalEventStatus;
}

export class ListOperationalEventsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(OperationalEventStatus)
  status?: OperationalEventStatus;

  @IsOptional()
  @IsUUID()
  sourceAreaId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
