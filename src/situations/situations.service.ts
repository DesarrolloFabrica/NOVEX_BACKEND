import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TimelineEventType } from '../common/enums/situation-timeline.enums';
import { SituationStatus } from '../common/enums/situation.enums';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { IncidentCategory } from '../intelligence/entities/incident-category.entity';
import { SituationTimelineService } from '../situation-timeline/situation-timeline.service';
import { User } from '../users/entities/user.entity';
import {
  CreateSituationDto,
  ListSituationsQueryDto,
  SituationResponseDto,
  SituationsListResponseDto,
  UpdateSituationDto,
} from './dto/situation.dto';
import { Situation } from './entities/situation.entity';
import { SituationsRepository } from './repositories/situations.repository';
import {
  isForwardSituationTransition,
  requiresStatusComment,
  SITUATION_STATUS_LABEL_ES,
} from './situation-status.transitions';

@Injectable()
export class SituationsService {
  constructor(
    private readonly situationsRepository: SituationsRepository,
    @InjectRepository(Coordination)
    private readonly coordinationsRepository: Repository<Coordination>,
    @InjectRepository(IncidentCategory)
    private readonly categoriesRepository: Repository<IncidentCategory>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly timelineService: SituationTimelineService,
  ) {}

  async create(
    dto: CreateSituationDto,
    createdByUserId: string,
  ): Promise<SituationResponseDto> {
    const [coordination, category] = await Promise.all([
      this.ensureCoordination(dto.coordinationId),
      this.ensureCategory(dto.categoryId),
    ]);

    const situation = this.situationsRepository.create({
      title: dto.title.trim(),
      description: dto.description.trim(),
      coordinationId: coordination.id,
      coordination,
      createdByUserId,
      categoryId: category.id,
      category,
      severity: dto.severity,
      status: SituationStatus.OPEN,
      assignedUserId: null,
      lastStatusComment: null,
      resolvedAt: null,
      closedAt: null,
      occurredAt: new Date(dto.occurredAt),
    });

    const saved = await this.situationsRepository.save(situation);
    const withRelations = await this.situationsRepository.findByIdWithRelations(
      saved.id,
    );
    if (!withRelations) {
      throw new NotFoundException('No fue posible cargar la situación creada.');
    }

    return this.toResponse(withRelations);
  }

  async list(query: ListSituationsQueryDto): Promise<SituationsListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const [items, total] = await this.situationsRepository.search(query);

    return {
      items: items.map((item) => this.toResponse(item)),
      total,
      page,
      limit,
    };
  }

  async getById(id: string): Promise<SituationResponseDto> {
    const situation = await this.situationsRepository.findByIdWithRelations(id);
    if (!situation) {
      throw new NotFoundException(`Situación no encontrada: ${id}`);
    }
    return this.toResponse(situation);
  }

  async update(
    id: string,
    dto: UpdateSituationDto,
    actorUserId?: string | null,
  ): Promise<SituationResponseDto> {
    const situation = await this.situationsRepository.findByIdWithRelations(id);
    if (!situation) {
      throw new NotFoundException(`Situación no encontrada: ${id}`);
    }

    if (situation.status === SituationStatus.CLOSED && dto.status !== undefined) {
      throw new BadRequestException(
        'La situación está cerrada y no admite nuevas modificaciones de estado.',
      );
    }

    if (dto.coordinationId !== undefined) {
      const coordination = await this.ensureCoordination(dto.coordinationId);
      situation.coordinationId = coordination.id;
      situation.coordination = coordination;
    }

    if (dto.categoryId !== undefined) {
      const category = await this.ensureCategory(dto.categoryId);
      situation.categoryId = category.id;
      situation.category = category;
    }

    if (dto.title !== undefined) {
      situation.title = dto.title.trim();
    }
    if (dto.description !== undefined) {
      situation.description = dto.description.trim();
    }
    if (dto.severity !== undefined) {
      situation.severity = dto.severity;
    }
    if (dto.occurredAt !== undefined) {
      situation.occurredAt = new Date(dto.occurredAt);
    }

    const previousStatus = situation.status;
    let statusTransitionApplied = false;
    let statusComment: string | null = null;

    if (dto.status !== undefined && dto.status !== previousStatus) {
      this.assertValidStatusTransition(previousStatus, dto.status);
      statusComment = this.resolveStatusComment(dto.status, dto.statusComment);
      await this.applyStatusTransition(
        situation,
        dto.status,
        statusComment,
        actorUserId,
      );
      statusTransitionApplied = true;
    } else if (dto.statusComment !== undefined) {
      situation.lastStatusComment = dto.statusComment.trim();
    }

    await this.situationsRepository.save(situation);

    if (statusTransitionApplied) {
      await this.recordStatusTransitionTimeline({
        situationId: situation.id,
        actorUserId: actorUserId ?? null,
        previousStatus,
        nextStatus: situation.status,
        statusComment,
        assignedUserName: situation.assignedUser?.fullName ?? null,
        evidenceIds: dto.evidenceIds ?? [],
      });
    }

    return this.getById(id);
  }

  private assertValidStatusTransition(
    from: SituationStatus,
    to: SituationStatus,
  ): void {
    if (!isForwardSituationTransition(from, to)) {
      throw new BadRequestException(
        `Transición no permitida: ${SITUATION_STATUS_LABEL_ES[from]} → ${SITUATION_STATUS_LABEL_ES[to]}. Solo se admite el siguiente estado del ciclo operativo.`,
      );
    }
  }

  private resolveStatusComment(
    nextStatus: SituationStatus,
    rawComment?: string,
  ): string | null {
    const trimmed = rawComment?.trim() ?? '';
    if (requiresStatusComment(nextStatus) && trimmed.length === 0) {
      const label =
        nextStatus === SituationStatus.RESOLVED
          ? 'Motivo de resolución'
          : 'Comentario de cierre';
      throw new BadRequestException(`${label} es obligatorio.`);
    }
    return trimmed.length > 0 ? trimmed : null;
  }

  private async applyStatusTransition(
    situation: Situation,
    nextStatus: SituationStatus,
    statusComment: string | null,
    actorUserId?: string | null,
  ): Promise<void> {
    situation.status = nextStatus;
    situation.lastStatusComment = statusComment;

    if (nextStatus === SituationStatus.IN_PROGRESS) {
      if (!actorUserId) {
        throw new BadRequestException(
          'Se requiere un usuario autenticado para pasar la situación a En atención.',
        );
      }
      const assignedUser = await this.usersRepository.findOne({
        where: { id: actorUserId },
      });
      if (!assignedUser) {
        throw new NotFoundException(`Usuario no encontrado: ${actorUserId}`);
      }
      situation.assignedUserId = assignedUser.id;
      situation.assignedUser = assignedUser;
    }

    if (nextStatus === SituationStatus.RESOLVED) {
      situation.resolvedAt = new Date();
    }

    if (nextStatus === SituationStatus.CLOSED) {
      situation.closedAt = new Date();
      if (!situation.resolvedAt) {
        situation.resolvedAt = situation.closedAt;
      }
    }
  }

  private async recordStatusTransitionTimeline(input: {
    situationId: string;
    actorUserId: string | null;
    previousStatus: SituationStatus;
    nextStatus: SituationStatus;
    statusComment: string | null;
    assignedUserName: string | null;
    evidenceIds: string[];
  }): Promise<void> {
    const fromLabel = SITUATION_STATUS_LABEL_ES[input.previousStatus];
    const toLabel = SITUATION_STATUS_LABEL_ES[input.nextStatus];
    const eventType =
      input.nextStatus === SituationStatus.CLOSED
        ? TimelineEventType.CLOSED
        : TimelineEventType.STATUS_CHANGED;

    const title =
      input.nextStatus === SituationStatus.CLOSED
        ? 'Situación cerrada'
        : 'Estado actualizado';

    const descriptionParts = [
      `El estado cambió de ${fromLabel} a ${toLabel}.`,
    ];
    if (
      input.nextStatus === SituationStatus.IN_PROGRESS &&
      input.assignedUserName
    ) {
      descriptionParts.push(`Responsable: ${input.assignedUserName}.`);
    }
    if (input.statusComment) {
      const commentLabel =
        input.nextStatus === SituationStatus.RESOLVED
          ? 'Motivo'
          : input.nextStatus === SituationStatus.CLOSED
            ? 'Comentario'
            : 'Nota';
      descriptionParts.push(`${commentLabel}: ${input.statusComment}`);
    }

    await this.timelineService.createEntry({
      situationId: input.situationId,
      userId: input.actorUserId,
      eventType,
      title,
      description: descriptionParts.join(' '),
      metadata: {
        field: 'status',
        previousValue: input.previousStatus,
        newValue: input.nextStatus,
        previousLabel: fromLabel,
        newLabel: toLabel,
        statusComment: input.statusComment,
        commentKind:
          input.nextStatus === SituationStatus.RESOLVED
            ? 'resolution'
            : input.nextStatus === SituationStatus.CLOSED
              ? 'closure'
              : 'note',
        assignedUserName: input.assignedUserName,
        /** Estructura preparada para evidencias futuras. */
        evidenceIds: input.evidenceIds,
        evidencesAttached: false,
      },
    });
  }

  private async ensureCoordination(id: string): Promise<Coordination> {
    const coordination = await this.coordinationsRepository.findOne({
      where: { id },
    });
    if (!coordination) {
      throw new NotFoundException(`Coordinación no encontrada: ${id}`);
    }
    return coordination;
  }

  private async ensureCategory(id: string): Promise<IncidentCategory> {
    const category = await this.categoriesRepository.findOne({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException(`Categoría no encontrada: ${id}`);
    }
    return category;
  }

  private toResponse(situation: Situation): SituationResponseDto {
    return {
      id: situation.id,
      title: situation.title,
      description: situation.description,
      coordinationId: situation.coordinationId,
      coordinationCode: situation.coordination.code,
      coordinationName: situation.coordination.name,
      createdByUserId: situation.createdByUserId,
      createdByUserName: situation.createdByUser.fullName,
      assignedUserId: situation.assignedUserId ?? null,
      assignedUserName: situation.assignedUser?.fullName ?? null,
      categoryId: situation.categoryId,
      categoryCode: situation.category.code,
      categoryName: situation.category.name,
      severity: situation.severity,
      status: situation.status,
      lastStatusComment: situation.lastStatusComment ?? null,
      resolvedAt: situation.resolvedAt ?? null,
      closedAt: situation.closedAt ?? null,
      occurredAt: situation.occurredAt,
      createdAt: situation.createdAt,
      updatedAt: situation.updatedAt,
    };
  }
}
