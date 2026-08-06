import { Injectable } from '@nestjs/common';
import type { AIAnalysisResult } from './contracts/ai-analysis-result.contract';
import type { AIRecommendationInput } from '../situation-recommendations/dto/situation-recommendation.dto';
import type { SaveImpactAssessmentInput } from '../situation-impact/dto/situation-impact.dto';
import { SituationImpactRepository } from '../situation-impact/repositories/situation-impact.repository';
import { SituationImpactService } from '../situation-impact/situation-impact.service';
import { SituationRecommendationsService } from '../situation-recommendations/situation-recommendations.service';
import type { CreateTimelineEntryInput } from '../situation-timeline/dto/situation-timeline.dto';
import { SituationTimelineService } from '../situation-timeline/situation-timeline.service';
import { AIAnalysisMapper } from './mappers/ai-analysis.mapper';
import { AIAnalysisParser } from './parsers/ai-analysis.parser';

export interface PersistAIAnalysisResult {
  situationId: string;
  impactAssessmentId: string;
  recommendationIds: string[];
  timelineEntryIds: string[];
}

@Injectable()
export class AIAnalysisService {
  constructor(
    private readonly parser: AIAnalysisParser,
    private readonly mapper: AIAnalysisMapper,
    private readonly impactService: SituationImpactService,
    private readonly impactRepository: SituationImpactRepository,
    private readonly recommendationsService: SituationRecommendationsService,
    private readonly timelineService: SituationTimelineService,
  ) {}

  parseAnalysis(payload: string | Record<string, unknown>): AIAnalysisResult {
    return this.parser.parseAnalysis(payload);
  }

  validateAnalysis(payload: unknown): AIAnalysisResult {
    return this.parser.validateAnalysis(payload);
  }

  async normalizeCoordinationReferences(
    analysis: AIAnalysisResult,
  ): Promise<AIAnalysisResult> {
    return this.mapper.normalizeCoordinationReferences(analysis);
  }

  async mapImpact(
    situationId: string,
    analysis: AIAnalysisResult,
  ): Promise<SaveImpactAssessmentInput> {
    return this.mapper.mapImpact(situationId, analysis);
  }

  mapRecommendations(analysis: AIAnalysisResult): AIRecommendationInput[] {
    return this.mapper.mapRecommendations(analysis);
  }

  mapTimeline(
    situationId: string,
    analysis: AIAnalysisResult,
    actorUserId?: string | null,
  ): CreateTimelineEntryInput[] {
    return this.mapper.mapTimeline(situationId, analysis, actorUserId);
  }

  async persistAnalysis(
    situationId: string,
    analysis: AIAnalysisResult,
    actorUserId?: string | null,
  ): Promise<PersistAIAnalysisResult> {
    const mapped = await this.mapper.mapAnalysis(
      situationId,
      analysis,
      actorUserId,
    );

    const existing = await this.impactRepository.findBySituationId(situationId);
    const impact = existing
      ? await this.impactService.replaceAssessment(mapped.impactInput)
      : await this.impactService.saveAssessment(mapped.impactInput);

    const recommendations =
      mapped.recommendationInputs.length > 0
        ? await this.recommendationsService.createAIRecommendations(
            situationId,
            mapped.recommendationInputs,
            actorUserId,
          )
        : [];

    const timelineEntries = await Promise.all(
      mapped.timelineEntries.map((entry) =>
        this.timelineService.createEntry(entry),
      ),
    );

    return {
      situationId,
      impactAssessmentId: impact.id,
      recommendationIds: recommendations.map((item) => item.id),
      timelineEntryIds: timelineEntries.map((item) => item.id),
    };
  }
}
