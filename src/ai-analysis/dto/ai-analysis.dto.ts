import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { RecommendationPriority } from '../../common/enums/situation-recommendation.enums';
import {
  ImpactLevel,
  OperationalSeverity,
} from '../../common/enums/situation-impact.enums';
import {
  AIAnalysisSchemaVersion,
  ExecutivePriorityLevel,
  HypothesisLikelihood,
  MissingInformationPriority,
} from '../enums/ai-analysis.enums';

export class ExecutiveSummaryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  headline!: string;

  @IsString()
  @MinLength(1)
  summary!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  keyPoints!: string[];
}

export class IncidentClassificationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  categoryCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  categoryName!: string;

  @IsEnum(OperationalSeverity)
  operationalSeverity!: OperationalSeverity;

  @IsArray()
  @IsString({ each: true })
  tags!: string[];
}

export class HypothesisDto {
  @IsString()
  @MinLength(1)
  statement!: string;

  @IsEnum(HypothesisLikelihood)
  likelihood!: HypothesisLikelihood;

  @IsArray()
  @IsString({ each: true })
  supportingEvidence!: string[];
}

export class RootCauseAnalysisDto {
  @IsString()
  @MinLength(1)
  summary!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HypothesisDto)
  hypotheses!: HypothesisDto[];
}

export class AffectedCoordinationResultDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  coordinationCode!: string;

  @IsEnum(ImpactLevel)
  impactLevel!: ImpactLevel;

  @IsString()
  @MinLength(1)
  description!: string;
}

export class PropagationNodeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  coordinationCode!: string;

  @IsInt()
  @Min(0)
  depth!: number;

  @IsEnum(ImpactLevel)
  impactLevel!: ImpactLevel;

  @IsString()
  @MinLength(1)
  description!: string;
}

export class ImpactAssessmentResultDto {
  @IsEnum(OperationalSeverity)
  operationalSeverity!: OperationalSeverity;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence!: number;

  @IsInt()
  @Min(0)
  estimatedDurationMinutes!: number;

  @IsString()
  @MinLength(1)
  summary!: string;

  @IsString()
  @MinLength(1)
  reasoning!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AffectedCoordinationResultDto)
  affectedCoordinations!: AffectedCoordinationResultDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PropagationNodeDto)
  propagation!: PropagationNodeDto[];
}

export class RecommendationResultDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsEnum(RecommendationPriority)
  priority!: RecommendationPriority;
}

export class ImmediateRiskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsEnum(OperationalSeverity)
  severity!: OperationalSeverity;
}

export class FutureRiskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsEnum(HypothesisLikelihood)
  likelihood!: HypothesisLikelihood;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  timeframe!: string;
}

export class MissingInformationItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  topic!: string;

  @IsString()
  @MinLength(1)
  question!: string;

  @IsEnum(MissingInformationPriority)
  priority!: MissingInformationPriority;
}

export class ExecutiveConclusionDto {
  @IsString()
  @MinLength(1)
  conclusion!: string;

  @IsString()
  @MinLength(1)
  recommendedNextStep!: string;
}

export class ConfidenceFactorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  score!: number;
}

export class ConfidenceAssessmentDto {
  @IsNumber()
  @Min(0)
  @Max(1)
  overall!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConfidenceFactorDto)
  factors!: ConfidenceFactorDto[];
}

export class ExecutiveDecisionDto {
  @IsString()
  @MinLength(1)
  decision!: string;

  @IsEnum(OperationalSeverity)
  urgencyLevel!: OperationalSeverity;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  recommendedActionTime!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  initialResponsible!: string;
}

export class ExecutivePriorityDto {
  @IsEnum(ExecutivePriorityLevel)
  level!: ExecutivePriorityLevel;

  @IsString()
  @MinLength(1)
  justification!: string;
}

export class CriticalWindowDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  timeBeforeEscalation!: string;

  @IsString()
  @MinLength(1)
  explanation!: string;
}

export class RiskBreakdownComponentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  score!: number;

  @IsString()
  @MinLength(1)
  explanation!: string;
}

export class RiskBreakdownDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  totalScore!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RiskBreakdownComponentDto)
  components!: RiskBreakdownComponentDto[];
}

export class ProbableCauseDto {
  @IsString()
  @MinLength(1)
  hypothesis!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  probability!: number;

  @IsString()
  @MinLength(1)
  justification!: string;
}

export class PropagationChainStepDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  stage!: string;

  @IsString()
  @MinLength(1)
  description!: string;
}

export class OperationalPropagationDto {
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => PropagationChainStepDto)
  chain!: PropagationChainStepDto[];
}

export class DecisionMatrixItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  action!: string;

  @IsString()
  @MinLength(1)
  reason!: string;
}

export class DecisionMatrixDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DecisionMatrixItemDto)
  resolveNow!: DecisionMatrixItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DecisionMatrixItemDto)
  resolveToday!: DecisionMatrixItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DecisionMatrixItemDto)
  monitor!: DecisionMatrixItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DecisionMatrixItemDto)
  escalate!: DecisionMatrixItemDto[];
}

export class ConfidenceExplanationDto {
  @IsArray()
  @IsString({ each: true })
  supportingFactors!: string[];

  @IsArray()
  @IsString({ each: true })
  reducingFactors!: string[];
}

export class AIAnalysisResultDto {
  @IsEnum(AIAnalysisSchemaVersion)
  schemaVersion!: AIAnalysisSchemaVersion;

  @IsString()
  analyzedAt!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  provider!: string;

  @ValidateNested()
  @Type(() => ExecutiveSummaryDto)
  executiveSummary!: ExecutiveSummaryDto;

  @ValidateNested()
  @Type(() => IncidentClassificationDto)
  incidentClassification!: IncidentClassificationDto;

  @ValidateNested()
  @Type(() => RootCauseAnalysisDto)
  rootCause!: RootCauseAnalysisDto;

  @ValidateNested()
  @Type(() => ImpactAssessmentResultDto)
  impactAssessment!: ImpactAssessmentResultDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecommendationResultDto)
  recommendations!: RecommendationResultDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImmediateRiskDto)
  immediateRisks!: ImmediateRiskDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FutureRiskDto)
  futureRisks!: FutureRiskDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MissingInformationItemDto)
  missingInformation!: MissingInformationItemDto[];

  @ValidateNested()
  @Type(() => ExecutiveConclusionDto)
  executiveConclusion!: ExecutiveConclusionDto;

  @ValidateNested()
  @Type(() => ConfidenceAssessmentDto)
  confidence!: ConfidenceAssessmentDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ExecutiveDecisionDto)
  executiveDecision?: ExecutiveDecisionDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ExecutivePriorityDto)
  executivePriority?: ExecutivePriorityDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CriticalWindowDto)
  criticalWindow?: CriticalWindowDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RiskBreakdownDto)
  riskBreakdown?: RiskBreakdownDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProbableCauseDto)
  probableCauses?: ProbableCauseDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => OperationalPropagationDto)
  operationalPropagation?: OperationalPropagationDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DecisionMatrixDto)
  decisionMatrix?: DecisionMatrixDto;

  @IsOptional()
  @IsString()
  @MinLength(1)
  executiveNarrative?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConfidenceExplanationDto)
  confidenceExplanation?: ConfidenceExplanationDto;
}
