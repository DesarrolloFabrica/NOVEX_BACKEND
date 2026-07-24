import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  IndicatorDirection,
  RiskLevel,
} from '../../common/enums/operational.enums';

export class SuggestedIndicatorDto {
  @IsString()
  @MaxLength(64)
  code!: string;

  @IsString()
  @MaxLength(180)
  label!: string;

  @IsNumber()
  value!: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string;

  @IsOptional()
  @IsEnum(IndicatorDirection)
  direction?: IndicatorDirection;
}

/**
 * Persistencia de interpretación mock (sin Gemini).
 * El frontend actual ya produce este shape vía simulateAIInterpretation.
 */
export class CreateAIInterpretationDto {
  @IsUUID()
  eventId!: string;

  @IsUUID()
  categoryId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  affectedAreaIds!: string[];

  @IsNumber()
  @Min(1)
  @Max(5)
  impactSeverity!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  affectationPercentage!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  impactInternal!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  impactExternal!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  impactStudents!: number;

  @IsEnum(RiskLevel)
  riskLevel!: RiskLevel;

  @IsNumber()
  @Min(0)
  @Max(100)
  riskScore!: number;

  @IsString()
  executiveSummary!: string;

  @IsString()
  narrative!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  detectedPatterns?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recommendations?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  modelLabel?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SuggestedIndicatorDto)
  suggestedIndicators?: SuggestedIndicatorDto[];
}
