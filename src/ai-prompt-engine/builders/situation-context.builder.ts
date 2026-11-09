import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoordinationsRepository } from '../../coordinations/repositories/coordinations.repository';
import { IncidentCategory } from '../../intelligence/entities/incident-category.entity';
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
import { redactPersonalData } from '../privacy/prompt-privacy';

@Injectable()
export class SituationContextBuilder {
  constructor(
    private readonly situationsRepository: SituationsRepository,
    private readonly timelineRepository: SituationTimelineRepository,
    private readonly evidenceRepository: SituationEvidenceRepository,
    private readonly recommendationsRepository: SituationRecommendationsRepository,
    private readonly impactRepository: SituationImpactRepository,
    private readonly coordinationsRepository: CoordinationsRepository,
    @InjectRepository(IncidentCategory)
    private readonly categoriesRepository: Repository<IncidentCategory>,
  ) {}

  async buildOperationalContext(
    situationId: string,
  ): Promise<SituationContext> {
    const entity = await this.getSituationEntity(situationId);
    const [
      timeline,
      evidences,
      existingRecommendations,
      previousAssessment,
      availableCoordinations,
      catalogCategories,
    ] = await Promise.all([
      this.buildTimeline(situationId),
      this.buildEvidence(situationId),
      this.buildRecommendations(situationId),
      this.buildImpact(situationId),
      this.coordinationsRepository.findCatalog(false),
      this.categoriesRepository.find({
        where: { isSelectable: true },
        order: { name: 'ASC' },
      }),
    ]);

    const situation = this.mapSituation(entity);
    const relatedCoordinations = this.resolveRelatedCoordinations(entity);

    return {
      situationId,
      builtAt: new Date().toISOString(),
      situation,
      reporter: {
        coordinationCode: this.reporterCoordinationCode(
          entity,
          availableCoordinations,
        ),
      },
      originCoordination: entity.coordination
        ? {
            id: entity.coordination.id,
            code: entity.coordination.code,
            name: entity.coordination.name,
            shortName: entity.coordination.shortName,
          }
        : null,
      availableCoordinations: availableCoordinations.map((coordination) => ({
        id: coordination.id,
        code: coordination.code,
        name: coordination.name,
        shortName: coordination.shortName,
      })),
      category: entity.category
        ? {
            id: entity.category.id,
            code: entity.category.code,
            name: entity.category.name,
            description: entity.category.description,
          }
        : null,
      availableCategories: catalogCategories.map((category) => ({
        id: category.id,
        code: category.code,
        name: category.name,
        description: category.description,
      })),
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
      eventType: entry.eventType,
      title: redactPersonalData(entry.title),
      description: redactPersonalData(entry.description),
      createdAt: entry.createdAt.toISOString(),
    }));
  }

  async buildEvidence(
    situationId: string,
  ): Promise<SituationContextEvidence[]> {
    const items = await this.evidenceRepository.findBySituationId(situationId);
    return items.map((item) => ({
      type: item.type,
      title: redactPersonalData(item.title),
      description: redactPersonalData(item.description),
      mimeType: item.mimeType,
      fileSize: item.fileSize !== null ? Number(item.fileSize) : null,
      createdAt: item.createdAt.toISOString(),
    }));
  }

  async buildRecommendations(
    situationId: string,
  ): Promise<SituationContextRecommendation[]> {
    const items =
      await this.recommendationsRepository.findBySituationId(situationId);
    return items.map((item) => ({
      title: redactPersonalData(item.title),
      description: redactPersonalData(item.description),
      priority: item.priority,
      status: item.status,
      generatedBy: item.generatedBy,
      hasAssignee: Boolean(item.assignedUserId),
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
        description: redactPersonalData(item.description),
      }));

    return {
      operationalSeverity: assessment.operationalSeverity,
      confidence: Number(assessment.confidence),
      estimatedDurationMinutes: assessment.estimatedDurationMinutes,
      summary: redactPersonalData(assessment.summary),
      reasoning: redactPersonalData(assessment.reasoning),
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
      title: redactPersonalData(entity.title),
      description: redactPersonalData(entity.description),
      severity: entity.severity,
      status: entity.status,
      occurredAt: entity.occurredAt.toISOString(),
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  /** Coordinación institucional del reportante, por código; nunca la persona. */
  private reporterCoordinationCode(
    entity: Situation,
    catalog: Array<{ id: string; code: string }>,
  ): string | null {
    const coordinationId = entity.createdByUser?.coordinationId ?? null;
    if (!coordinationId) return null;
    return catalog.find((item) => item.id === coordinationId)?.code ?? null;
  }

  /**
   * Solo relaciones confirmadas (Fase 01B.2). Antes se mezclaban aquí las
   * coordinaciones sugeridas por el análisis previo, de modo que una sugerencia
   * reaparecía como "relacionada" en el siguiente análisis.
   */
  private resolveRelatedCoordinations(
    entity: Situation,
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
