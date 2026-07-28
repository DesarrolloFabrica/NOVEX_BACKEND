import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TimelineEventType } from '../../common/enums/situation-timeline.enums';
import { Coordination } from '../../coordinations/entities/coordination.entity';
import type { AIRecommendationInput } from '../../situation-recommendations/dto/situation-recommendation.dto';
import type { SaveImpactAssessmentInput } from '../../situation-impact/dto/situation-impact.dto';
import type { CreateTimelineEntryInput } from '../../situation-timeline/dto/situation-timeline.dto';
import type { AIAnalysisResult } from '../contracts/ai-analysis-result.contract';

export interface AIAnalysisMappedResult {
  impactInput: SaveImpactAssessmentInput;
  recommendationInputs: AIRecommendationInput[];
  timelineEntries: CreateTimelineEntryInput[];
}

@Injectable()
export class AIAnalysisMapper {
  constructor(
    @InjectRepository(Coordination)
    private readonly coordinationsRepository: Repository<Coordination>,
  ) {}

  async mapAnalysis(
    situationId: string,
    analysis: AIAnalysisResult,
    actorUserId?: string | null,
  ): Promise<AIAnalysisMappedResult> {
    const [impactInput, recommendationInputs, timelineEntries] =
      await Promise.all([
        this.mapImpact(situationId, analysis),
        Promise.resolve(this.mapRecommendations(analysis)),
        Promise.resolve(this.mapTimeline(situationId, analysis, actorUserId)),
      ]);

    return {
      impactInput,
      recommendationInputs,
      timelineEntries,
    };
  }

  async mapImpact(
    situationId: string,
    analysis: AIAnalysisResult,
  ): Promise<SaveImpactAssessmentInput> {
    const affectedCoordinations = await Promise.all(
      analysis.impactAssessment.affectedCoordinations.map(async (item) => ({
        coordinationId: await this.resolveCoordinationId(item.coordinationCode),
        impactLevel: item.impactLevel,
        description: item.description,
      })),
    );

    return {
      situationId,
      operationalSeverity: analysis.impactAssessment.operationalSeverity,
      confidence: analysis.impactAssessment.confidence,
      estimatedDurationMinutes:
        analysis.impactAssessment.estimatedDurationMinutes,
      summary: analysis.impactAssessment.summary,
      reasoning: analysis.impactAssessment.reasoning,
      affectedCoordinations,
    };
  }

  mapRecommendations(analysis: AIAnalysisResult): AIRecommendationInput[] {
    return analysis.recommendations.map((item) => ({
      title: item.title,
      description: item.description,
      priority: item.priority,
    }));
  }

  mapTimeline(
    situationId: string,
    analysis: AIAnalysisResult,
    actorUserId?: string | null,
  ): CreateTimelineEntryInput[] {
    const entries: CreateTimelineEntryInput[] = [
      {
        situationId,
        userId: actorUserId ?? null,
        eventType: TimelineEventType.AI_ANALYZED,
        title: 'Análisis IA completado',
        description: analysis.executiveSummary.headline,
        metadata: {
          provider: analysis.provider,
          analyzedAt: analysis.analyzedAt,
          schemaVersion: analysis.schemaVersion,
          operationalSeverity:
            analysis.impactAssessment.operationalSeverity,
          confidence: analysis.confidence.overall,
          categoryCode: analysis.incidentClassification.categoryCode,
          recommendationCount: analysis.recommendations.length,
        },
      },
    ];

    return entries;
  }

  private async resolveCoordinationId(code: string): Promise<string> {
    const coordination = await this.coordinationsRepository.findOne({
      where: { code },
    });
    if (!coordination) {
      throw new NotFoundException(`Coordinación no encontrada: ${code}`);
    }
    return coordination.id;
  }
}
