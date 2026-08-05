import { Injectable, NotFoundException } from '@nestjs/common';
import { SituationEvidenceRepository } from '../../situation-evidence/repositories/situation-evidence.repository';
import { SituationImpactRepository } from '../../situation-impact/repositories/situation-impact.repository';
import { SituationRecommendationsRepository } from '../../situation-recommendations/repositories/situation-recommendations.repository';
import { SituationTimelineRepository } from '../../situation-timeline/repositories/situation-timeline.repository';
import { Situation } from '../../situations/entities/situation.entity';
import { SituationsRepository } from '../../situations/repositories/situations.repository';
import type {
  SituationContext,
  SituationContextAffectedCoordination,
  SituationContextCoordination,
  SituationContextEvidence,
  SituationContextImpactAssessment,
  SituationContextRecommendation,
  SituationContextSituation,
  SituationContextTimelineEntry,
} from '../contracts/situation-context.contract';

@Injectable()
export class SituationContextBuilder {
  constructor(
    private readonly situationsRepository: SituationsRepository,
    private readonly timelineRepository: SituationTimelineRepository,
    private readonly evidenceRepository: SituationEvidenceRepository,
    private readonly recommendationsRepository: SituationRecommendationsRepository,
    private readonly impactRepository: SituationImpactRepository,
  ) {}

  async buildOperationalContext(
    situationId: string,
  ): Promise<SituationContext> {
    const entity = await this.getSituationEntity(situationId);
    const [timeline, evidences, existingRecommendations, previousAssessment] =
      await Promise.all([
        this.buildTimeline(situationId),
        this.buildEvidence(situationId),
        this.buildRecommendations(situationId),
        this.buildImpact(situationId),
      ]);

    const situation = this.mapSituation(entity);
    const relatedCoordinations = this.resolveRelatedCoordinations(
      entity,
      previousAssessment,
    );

    return {
      situationId,
      builtAt: new Date().toISOString(),
      situation,
      createdBy: {
        id: entity.createdByUser.id,
        fullName: entity.createdByUser.fullName,
        email: entity.createdByUser.email,
        coordinationId: entity.createdByUser.coordinationId,
      },
      originCoordination: {
        id: entity.coordination.id,
        code: entity.coordination.code,
        name: entity.coordination.name,
        shortName: entity.coordination.shortName,
      },
      category: {
        id: entity.category.id,
        code: entity.category.code,
        name: entity.category.name,
        description: entity.category.description,
      },
      evidences,
      timeline,
      relatedCoordinations,
      existingRecommendations,
      previousAssessment,
    };
  }

  async buildSituation(
    situationId: string,
  ): Promise<SituationContextSituation> {
    const entity = await this.getSituationEntity(situationId);
    return this.mapSituation(entity);
  }

  async buildTimeline(
    situationId: string,
  ): Promise<SituationContextTimelineEntry[]> {
    const entries =
      await this.timelineRepository.findBySituationId(situationId);
    return entries.map((entry) => ({
      id: entry.id,
      eventType: entry.eventType,
      title: entry.title,
      description: entry.description,
      userName: entry.user?.fullName ?? null,
      metadata: entry.metadata,
      createdAt: entry.createdAt.toISOString(),
    }));
  }

  async buildEvidence(
    situationId: string,
  ): Promise<SituationContextEvidence[]> {
    const items = await this.evidenceRepository.findBySituationId(situationId);
    return items.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      description: item.description,
      fileName: item.fileName,
      mimeType: item.mimeType,
      fileSize: item.fileSize !== null ? Number(item.fileSize) : null,
      uploadedByUserName: item.uploadedByUser.fullName,
      createdAt: item.createdAt.toISOString(),
    }));
  }

  async buildRecommendations(
    situationId: string,
  ): Promise<SituationContextRecommendation[]> {
    const items =
      await this.recommendationsRepository.findBySituationId(situationId);
    return items.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      priority: item.priority,
      status: item.status,
      generatedBy: item.generatedBy,
      assignedUserName: item.assignedUser?.fullName ?? null,
      dueAt: item.dueAt?.toISOString() ?? null,
      completedAt: item.completedAt?.toISOString() ?? null,
    }));
  }

  async buildImpact(
    situationId: string,
  ): Promise<SituationContextImpactAssessment | null> {
    const assessment =
      await this.impactRepository.findBySituationId(situationId);
    if (!assessment) {
      return null;
    }

    const affectedCoordinations: SituationContextAffectedCoordination[] =
      assessment.affectedCoordinations.map((item) => ({
        coordinationCode: item.coordination.code,
        coordinationName: item.coordination.name,
        impactLevel: item.impactLevel,
        description: item.description,
      }));

    return {
      id: assessment.id,
      operationalSeverity: assessment.operationalSeverity,
      confidence: Number(assessment.confidence),
      estimatedDurationMinutes: assessment.estimatedDurationMinutes,
      summary: assessment.summary,
      reasoning: assessment.reasoning,
      affectedCoordinations,
      updatedAt: assessment.updatedAt.toISOString(),
    };
  }

  private async getSituationEntity(situationId: string): Promise<Situation> {
    const situation =
      await this.situationsRepository.findByIdWithRelations(situationId);
    if (!situation) {
      throw new NotFoundException(`Situación no encontrada: ${situationId}`);
    }
    return situation;
  }

  private mapSituation(entity: Situation): SituationContextSituation {
    return {
      id: entity.id,
      title: entity.title,
      description: entity.description,
      severity: entity.severity,
      status: entity.status,
      occurredAt: entity.occurredAt.toISOString(),
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  private resolveRelatedCoordinations(
    entity: Situation,
    previousAssessment: SituationContextImpactAssessment | null,
  ): SituationContextCoordination[] {
    const related = new Map<string, SituationContextCoordination>();
    const structured = [...(entity.relatedCoordinations ?? [])].sort(
      (a, b) => a.displayOrder - b.displayOrder,
    );

    for (const item of structured) {
      related.set(item.coordination.code, {
        id: item.coordination.id,
        code: item.coordination.code,
        name: item.coordination.name,
        shortName: item.coordination.shortName,
      });
    }

    if (related.size === 0) {
      this.extractLegacyRelatedFromDescription(entity.description, related);
    }

    if (previousAssessment) {
      for (const item of previousAssessment.affectedCoordinations) {
        if (related.has(item.coordinationCode)) continue;
        related.set(item.coordinationCode, {
          id: item.coordinationCode,
          code: item.coordinationCode,
          name: item.coordinationName,
          shortName: item.coordinationCode,
        });
      }
    }

    return [...related.values()];
  }

  private extractLegacyRelatedFromDescription(
    description: string,
    related: Map<string, SituationContextCoordination>,
  ): void {
    const perceptionMatch =
      description.match(
        /Coordinaciones relacionadas \(percepción inicial\): (.+)/i,
      ) ??
      description.match(/Áreas relacionadas \(percepción inicial\): (.+)/i);
    if (!perceptionMatch?.[1]) {
      return;
    }

    for (const label of perceptionMatch[1].split(',')) {
      const trimmed = label.trim();
      const code = trimmed.split('·')[0]?.trim();
      if (!code) continue;
      related.set(code, {
        id: code,
        code,
        name: trimmed,
        shortName: code,
      });
    }
  }
}
