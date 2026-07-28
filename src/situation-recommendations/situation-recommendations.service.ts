import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RecommendationSource,
  RecommendationStatus,
} from '../common/enums/situation-recommendation.enums';
import { TimelineEventType } from '../common/enums/situation-timeline.enums';
import { Situation } from '../situations/entities/situation.entity';
import { SituationTimelineService } from '../situation-timeline/situation-timeline.service';
import { User } from '../users/entities/user.entity';
import {
  AIRecommendationInput,
  CompleteSituationRecommendationDto,
  CreateManualRecommendationDto,
  SituationRecommendationResponseDto,
  SituationRecommendationsListResponseDto,
  UpdateSituationRecommendationDto,
} from './dto/situation-recommendation.dto';
import { SituationRecommendation } from './entities/situation-recommendation.entity';
import { SituationRecommendationsRepository } from './repositories/situation-recommendations.repository';

@Injectable()
export class SituationRecommendationsService {
  constructor(
    private readonly recommendationsRepository: SituationRecommendationsRepository,
    @InjectRepository(Situation)
    private readonly situationsRepository: Repository<Situation>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly timelineService: SituationTimelineService,
  ) {}

  async findBySituation(
    situationId: string,
  ): Promise<SituationRecommendationsListResponseDto> {
    await this.ensureSituationExists(situationId);

    const items =
      await this.recommendationsRepository.findBySituationId(situationId);

    return {
      situationId,
      items: items.map((item) => this.toResponse(item)),
      total: items.length,
    };
  }

  async getById(id: string): Promise<SituationRecommendationResponseDto> {
    const recommendation = await this.findRecommendationOrFail(id);
    return this.toResponse(recommendation);
  }

  async createManualRecommendation(
    situationId: string,
    dto: CreateManualRecommendationDto,
    actorUserId?: string | null,
  ): Promise<SituationRecommendationResponseDto> {
    await this.ensureSituationExists(situationId);
    if (dto.assignedUserId) {
      await this.ensureUserExists(dto.assignedUserId);
    }

    const recommendation = this.recommendationsRepository.create({
      situationId,
      title: dto.title.trim(),
      description: dto.description.trim(),
      priority: dto.priority,
      status: RecommendationStatus.PENDING,
      generatedBy: RecommendationSource.MANUAL,
      assignedUserId: dto.assignedUserId ?? null,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      completedAt: null,
      executionNotes: null,
    });

    const saved = await this.recommendationsRepository.save(recommendation);
    const withRelations =
      await this.recommendationsRepository.findByIdWithRelations(saved.id);

    await this.timelineService.createEntry({
      situationId,
      userId: actorUserId ?? null,
      eventType: TimelineEventType.RECOMMENDATION_GENERATED,
      title: 'Recomendación registrada',
      description: `Se registró la recomendación "${saved.title}".`,
      metadata: {
        recommendationId: saved.id,
        priority: saved.priority,
        generatedBy: saved.generatedBy,
      },
    });

    return this.toResponse(withRelations ?? saved);
  }

  async createAIRecommendations(
    situationId: string,
    items: AIRecommendationInput[],
    actorUserId?: string | null,
  ): Promise<SituationRecommendationResponseDto[]> {
    if (!items.length) {
      throw new BadRequestException(
        'Se requiere al menos una recomendación para registrar.',
      );
    }

    await this.ensureSituationExists(situationId);

    const created: SituationRecommendationResponseDto[] = [];

    for (const item of items) {
      const recommendation = this.recommendationsRepository.create({
        situationId,
        title: item.title.trim(),
        description: item.description.trim(),
        priority: item.priority,
        status: RecommendationStatus.PENDING,
        generatedBy: RecommendationSource.AI,
        assignedUserId: null,
        dueAt: null,
        completedAt: null,
        executionNotes: null,
      });

      const saved = await this.recommendationsRepository.save(recommendation);
      const withRelations =
        await this.recommendationsRepository.findByIdWithRelations(saved.id);

      await this.timelineService.createEntry({
        situationId,
        userId: actorUserId ?? null,
        eventType: TimelineEventType.RECOMMENDATION_GENERATED,
        title: 'Recomendación generada por IA',
        description: `Se generó la recomendación "${saved.title}".`,
        metadata: {
          recommendationId: saved.id,
          priority: saved.priority,
          generatedBy: saved.generatedBy,
        },
      });

      created.push(this.toResponse(withRelations ?? saved));
    }

    return created;
  }

  async updateRecommendation(
    id: string,
    dto: UpdateSituationRecommendationDto,
    actorUserId?: string | null,
  ): Promise<SituationRecommendationResponseDto> {
    const recommendation = await this.findRecommendationOrFail(id);
    const previousStatus = recommendation.status;

    if (dto.assignedUserId) {
      await this.ensureUserExists(dto.assignedUserId);
    }

    if (dto.title !== undefined) {
      recommendation.title = dto.title.trim();
    }
    if (dto.description !== undefined) {
      recommendation.description = dto.description.trim();
    }
    if (dto.priority !== undefined) {
      recommendation.priority = dto.priority;
    }
    if (dto.status !== undefined) {
      recommendation.status = dto.status;
      if (dto.status === RecommendationStatus.COMPLETED) {
        recommendation.completedAt = new Date();
      } else if (previousStatus === RecommendationStatus.COMPLETED) {
        recommendation.completedAt = null;
      }
    }
    if (dto.assignedUserId !== undefined) {
      recommendation.assignedUserId = dto.assignedUserId;
    }
    if (dto.dueAt !== undefined) {
      recommendation.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    }
    if (dto.executionNotes !== undefined) {
      recommendation.executionNotes = dto.executionNotes?.trim() ?? null;
    }

    await this.recommendationsRepository.save(recommendation);
    const withRelations =
      await this.recommendationsRepository.findByIdWithRelations(id);

    if (
      dto.status !== undefined &&
      dto.status === RecommendationStatus.COMPLETED &&
      previousStatus !== RecommendationStatus.COMPLETED
    ) {
      await this.timelineService.createEntry({
        situationId: recommendation.situationId,
        userId: actorUserId ?? null,
        eventType: TimelineEventType.RECOMMENDATION_COMPLETED,
        title: 'Recomendación completada',
        description: `La recomendación "${recommendation.title}" fue completada.`,
        metadata: {
          recommendationId: recommendation.id,
          previousStatus,
          newStatus: recommendation.status,
        },
      });
    } else if (
      dto.status !== undefined &&
      dto.status !== previousStatus &&
      dto.status !== RecommendationStatus.COMPLETED
    ) {
      await this.timelineService.createEntry({
        situationId: recommendation.situationId,
        userId: actorUserId ?? null,
        eventType: TimelineEventType.RECOMMENDATION_UPDATED,
        title: 'Recomendación actualizada',
        description: `El estado de la recomendación "${recommendation.title}" cambió de ${previousStatus} a ${recommendation.status}.`,
        metadata: {
          recommendationId: recommendation.id,
          previousStatus,
          newStatus: recommendation.status,
        },
      });
    } else if (
      dto.title !== undefined ||
      dto.description !== undefined ||
      dto.priority !== undefined ||
      dto.assignedUserId !== undefined ||
      dto.dueAt !== undefined ||
      dto.executionNotes !== undefined
    ) {
      await this.timelineService.createEntry({
        situationId: recommendation.situationId,
        userId: actorUserId ?? null,
        eventType: TimelineEventType.RECOMMENDATION_UPDATED,
        title: 'Recomendación actualizada',
        description: `Se actualizó la recomendación "${recommendation.title}".`,
        metadata: {
          recommendationId: recommendation.id,
          fields: Object.keys(dto).filter(
            (key) => dto[key as keyof UpdateSituationRecommendationDto] !== undefined,
          ),
        },
      });
    }

    return this.toResponse(withRelations ?? recommendation);
  }

  async completeRecommendation(
    id: string,
    dto: CompleteSituationRecommendationDto = {},
    actorUserId?: string | null,
  ): Promise<SituationRecommendationResponseDto> {
    const recommendation = await this.findRecommendationOrFail(id);
    const previousStatus = recommendation.status;

    if (previousStatus === RecommendationStatus.COMPLETED) {
      return this.toResponse(recommendation);
    }

    recommendation.status = RecommendationStatus.COMPLETED;
    recommendation.completedAt = new Date();
    if (dto.executionNotes?.trim()) {
      recommendation.executionNotes = dto.executionNotes.trim();
    }

    await this.recommendationsRepository.save(recommendation);
    const withRelations =
      await this.recommendationsRepository.findByIdWithRelations(id);

    await this.timelineService.createEntry({
      situationId: recommendation.situationId,
      userId: actorUserId ?? null,
      eventType: TimelineEventType.RECOMMENDATION_COMPLETED,
      title: 'Recomendación completada',
      description: `La recomendación "${recommendation.title}" fue completada.`,
      metadata: {
        recommendationId: recommendation.id,
        previousStatus,
        newStatus: recommendation.status,
      },
    });

    return this.toResponse(withRelations ?? recommendation);
  }

  private async ensureSituationExists(situationId: string): Promise<void> {
    const exists = await this.situationsRepository.exist({
      where: { id: situationId },
    });
    if (!exists) {
      throw new NotFoundException(`Situación no encontrada: ${situationId}`);
    }
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const exists = await this.usersRepository.exist({ where: { id: userId } });
    if (!exists) {
      throw new NotFoundException(`Usuario no encontrado: ${userId}`);
    }
  }

  private async findRecommendationOrFail(
    id: string,
  ): Promise<SituationRecommendation> {
    const recommendation =
      await this.recommendationsRepository.findByIdWithRelations(id);
    if (!recommendation) {
      throw new NotFoundException(`Recomendación no encontrada: ${id}`);
    }
    return recommendation;
  }

  private toResponse(
    recommendation: SituationRecommendation,
  ): SituationRecommendationResponseDto {
    return {
      id: recommendation.id,
      situationId: recommendation.situationId,
      title: recommendation.title,
      description: recommendation.description,
      priority: recommendation.priority,
      status: recommendation.status,
      generatedBy: recommendation.generatedBy,
      assignedUserId: recommendation.assignedUserId,
      assignedUserName: recommendation.assignedUser?.fullName ?? null,
      dueAt: recommendation.dueAt,
      completedAt: recommendation.completedAt,
      executionNotes: recommendation.executionNotes,
      createdAt: recommendation.createdAt,
      updatedAt: recommendation.updatedAt,
    };
  }
}
