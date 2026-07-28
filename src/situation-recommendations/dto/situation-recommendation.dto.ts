import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  RecommendationPriority,
  RecommendationSource,
  RecommendationStatus,
} from '../../common/enums/situation-recommendation.enums';

export class CreateManualRecommendationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsEnum(RecommendationPriority)
  priority!: RecommendationPriority;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export interface AIRecommendationInput {
  title: string;
  description: string;
  priority: RecommendationPriority;
}

export class UpdateSituationRecommendationDto {
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
  @IsEnum(RecommendationPriority)
  priority?: RecommendationPriority;

  @IsOptional()
  @IsEnum(RecommendationStatus)
  status?: RecommendationStatus;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  executionNotes?: string | null;
}

export class CompleteSituationRecommendationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  executionNotes?: string;
}

export class SituationRecommendationResponseDto {
  id!: string;
  situationId!: string;
  title!: string;
  description!: string;
  priority!: RecommendationPriority;
  status!: RecommendationStatus;
  generatedBy!: RecommendationSource;
  assignedUserId!: string | null;
  assignedUserName!: string | null;
  dueAt!: Date | null;
  completedAt!: Date | null;
  executionNotes!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class SituationRecommendationsListResponseDto {
  situationId!: string;
  items!: SituationRecommendationResponseDto[];
  total!: number;
}
