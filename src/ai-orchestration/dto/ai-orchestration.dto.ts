import type { AIAnalysisResult } from '../../ai-analysis/contracts/ai-analysis-result.contract';

import type { SituationImpactAssessmentResponseDto } from '../../situation-impact/dto/situation-impact.dto';

import type { SituationRecommendationResponseDto } from '../../situation-recommendations/dto/situation-recommendation.dto';

import type { SituationTimelineEntryResponseDto } from '../../situation-timeline/dto/situation-timeline.dto';

export class ExecuteAIAnalysisResponseDto {
  situationId!: string;

  sessionId!: string;

  analysisVersion!: number;

  isLatest!: boolean;

  createdAt!: Date;

  impactAssessment!: SituationImpactAssessmentResponseDto;

  recommendations!: SituationRecommendationResponseDto[];

  timeline!: SituationTimelineEntryResponseDto[];

  confidence!: number;

  analysis!: AIAnalysisResult;
}

export class SituationAIAnalysisResponseDto {
  situationId!: string;

  sessionId!: string;

  analysisVersion!: number;

  isLatest!: boolean;

  provider!: string;

  analysis!: AIAnalysisResult;

  createdAt!: Date;

  updatedAt!: Date;
}
