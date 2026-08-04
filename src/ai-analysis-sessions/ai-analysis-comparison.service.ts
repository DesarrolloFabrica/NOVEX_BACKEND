import { Injectable, NotFoundException } from '@nestjs/common';
import type { AIAnalysisResult } from '../ai-analysis/contracts/ai-analysis-result.contract';
import type { AnalysisVersionComparisonDto } from './dto/ai-analysis-session.dto';
import { SituationAnalysisSessionRepository } from './repositories/situation-analysis-session.repository';

export interface RecommendationComparison {
  added: Array<{ title: string; priority: string }>;
  removed: Array<{ title: string; priority: string }>;
  changed: Array<{
    title: string;
    fromPriority: string;
    toPriority: string;
  }>;
}

export interface ImpactComparison {
  operationalSeverityChanged: boolean;
  fromOperationalSeverity: string;
  toOperationalSeverity: string;
  confidenceDelta: number;
  estimatedDurationDeltaMinutes: number;
  summaryChanged: boolean;
}

export interface AffectedAreasComparison {
  added: string[];
  removed: string[];
  changed: Array<{
    coordinationCode: string;
    fromImpactLevel: string;
    toImpactLevel: string;
  }>;
}

export interface ConfidenceComparison {
  fromOverall: number;
  toOverall: number;
  delta: number;
  factorChanges: Array<{
    name: string;
    fromScore: number;
    toScore: number;
    delta: number;
  }>;
}

@Injectable()
export class AIAnalysisComparisonService {
  constructor(
    private readonly sessionsRepository: SituationAnalysisSessionRepository,
  ) {}

  async compareVersions(
    situationId: string,
    fromVersion: number,
    toVersion: number,
  ): Promise<AnalysisVersionComparisonDto> {
    const [fromSession, toSession] = await Promise.all([
      this.sessionsRepository.findBySituationIdAndVersion(
        situationId,
        fromVersion,
      ),
      this.sessionsRepository.findBySituationIdAndVersion(
        situationId,
        toVersion,
      ),
    ]);

    if (!fromSession || !toSession) {
      throw new NotFoundException(
        `No fue posible comparar las versiones ${fromVersion} y ${toVersion}.`,
      );
    }

    return {
      situationId,
      fromVersion,
      toVersion,
      differences: {
        recommendations: this.compareRecommendations(
          fromSession.analysisResult,
          toSession.analysisResult,
        ),
        impact: this.compareImpact(
          fromSession.analysisResult,
          toSession.analysisResult,
        ),
        affectedAreas: this.compareAffectedAreas(
          fromSession.analysisResult,
          toSession.analysisResult,
        ),
        confidence: this.compareConfidence(
          fromSession.analysisResult,
          toSession.analysisResult,
        ),
        executiveSummaryChanged:
          fromSession.analysisResult.executiveSummary.summary !==
          toSession.analysisResult.executiveSummary.summary,
        classificationChanged:
          fromSession.analysisResult.incidentClassification.categoryCode !==
          toSession.analysisResult.incidentClassification.categoryCode,
      },
    };
  }

  compareRecommendations(
    from: AIAnalysisResult,
    to: AIAnalysisResult,
  ): RecommendationComparison {
    const fromMap = new Map(
      from.recommendations.map((item) => [item.title, item.priority]),
    );
    const toMap = new Map(
      to.recommendations.map((item) => [item.title, item.priority]),
    );

    const added = [...toMap.entries()]
      .filter(([title]) => !fromMap.has(title))
      .map(([title, priority]) => ({ title, priority }));

    const removed = [...fromMap.entries()]
      .filter(([title]) => !toMap.has(title))
      .map(([title, priority]) => ({ title, priority }));

    const changed = [...toMap.entries()]
      .filter(([title, priority]) => {
        const previous = fromMap.get(title);
        return previous !== undefined && previous !== priority;
      })
      .map(([title, priority]) => ({
        title,
        fromPriority: fromMap.get(title)!,
        toPriority: priority,
      }));

    return { added, removed, changed };
  }

  compareImpact(
    from: AIAnalysisResult,
    to: AIAnalysisResult,
  ): ImpactComparison {
    return {
      operationalSeverityChanged:
        from.impactAssessment.operationalSeverity !==
        to.impactAssessment.operationalSeverity,
      fromOperationalSeverity: from.impactAssessment.operationalSeverity,
      toOperationalSeverity: to.impactAssessment.operationalSeverity,
      confidenceDelta:
        to.impactAssessment.confidence - from.impactAssessment.confidence,
      estimatedDurationDeltaMinutes:
        to.impactAssessment.estimatedDurationMinutes -
        from.impactAssessment.estimatedDurationMinutes,
      summaryChanged:
        from.impactAssessment.summary !== to.impactAssessment.summary,
    };
  }

  compareAffectedAreas(
    from: AIAnalysisResult,
    to: AIAnalysisResult,
  ): AffectedAreasComparison {
    const fromMap = new Map(
      from.impactAssessment.affectedCoordinations.map((item) => [
        item.coordinationCode,
        item.impactLevel,
      ]),
    );
    const toMap = new Map(
      to.impactAssessment.affectedCoordinations.map((item) => [
        item.coordinationCode,
        item.impactLevel,
      ]),
    );

    const added = [...toMap.keys()].filter((code) => !fromMap.has(code));
    const removed = [...fromMap.keys()].filter((code) => !toMap.has(code));
    const changed = [...toMap.entries()]
      .filter(([code, level]) => {
        const previous = fromMap.get(code);
        return previous !== undefined && previous !== level;
      })
      .map(([coordinationCode, toImpactLevel]) => ({
        coordinationCode,
        fromImpactLevel: fromMap.get(coordinationCode)!,
        toImpactLevel,
      }));

    return { added, removed, changed };
  }

  compareConfidence(
    from: AIAnalysisResult,
    to: AIAnalysisResult,
  ): ConfidenceComparison {
    const fromFactors = new Map(
      from.confidence.factors.map((factor) => [factor.name, factor.score]),
    );

    const factorChanges = to.confidence.factors
      .map((factor) => {
        const fromScore = fromFactors.get(factor.name);
        if (fromScore === undefined || fromScore === factor.score) {
          return null;
        }
        return {
          name: factor.name,
          fromScore,
          toScore: factor.score,
          delta: factor.score - fromScore,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return {
      fromOverall: from.confidence.overall,
      toOverall: to.confidence.overall,
      delta: to.confidence.overall - from.confidence.overall,
      factorChanges,
    };
  }
}
