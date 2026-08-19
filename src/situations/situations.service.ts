import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuditAction, AuditResourceType } from '../audit/audit-action.enum';
import { AuditLogService } from '../audit/audit-log.service';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { TimelineEventType } from '../common/enums/situation-timeline.enums';
import { SituationStatus } from '../common/enums/situation.enums';
import {
  computeDueAt,
  computeSlaHealth,
  resolveDueAtOnSeverityChange,
  SLA_POLICY_CODE,
  wasClosedOnTime,
} from './situation-sla.policy';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { IncidentCategory } from '../intelligence/entities/incident-category.entity';
import { SituationTimelineService } from '../situation-timeline/situation-timeline.service';
import { User } from '../users/entities/user.entity';
import {
  CreateSituationDto,
  IncidentCategorySummaryDto,
  ListSituationsQueryDto,
  RelatedCoordinationResponseDto,
  SituationResponseDto,
  SituationsListResponseDto,
  UpdateSituationDto,
} from './dto/situation.dto';
import { Situation } from './entities/situation.entity';
import { SituationRelatedCoordination } from './entities/situation-related-coordination.entity';
import { SituationsRepository } from './repositories/situations.repository';
import { isFutureOccurredAt } from './occurred-at.validation';
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
    @InjectRepository(SituationRelatedCoordination)
    private readonly relatedCoordinationsRepository: Repository<SituationRelatedCoordination>,
    private readonly timelineService: SituationTimelineService,
    private readonly scopeService: OperationalScopeService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async listIncidentCategories(): Promise<IncidentCategorySummaryDto[]> {
    const categories = await this.categoriesRepository.find({
      order: { isSelectable: 'DESC', name: 'ASC' },
    });

    return categories.map((category) => ({
      id: category.id,
      code: category.code,
      name: category.name,
      description: category.description,
      isSelectable: category.isSelectable,
      icon: category.icon,
    }));
  }

  async create(
    dto: CreateSituationDto,
    actor: AuthPayload,
  ): Promise<SituationResponseDto> {
    const coordinationId = this.scopeService.resolveCreateCoordinationId(
      actor,
      dto.coordinationId,
    );

    const [coordination, category, relatedCoordinations] = await Promise.all([
      coordinationId ? this.ensureCoordination(coordinationId) : null,
      this.ensureCategory(dto.categoryId),
      this.resolveRelatedCoordinations(
        dto.relatedCoordinationIds ?? [],
        coordinationId,
      ),
    ]);

    const occurredAt = new Date(dto.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException('La fecha de ocurrencia no es válida.');
    }
    if (isFutureOccurredAt(occurredAt)) {
      throw new BadRequestException(
        'La fecha de ocurrencia no puede ser futura.',
      );
    }

    const createdAt = new Date();
    const situation = this.situationsRepository.create({
      title: dto.title.trim(),
      description: dto.description.trim(),
      coordinationId: coordination?.id ?? null,
      coordination,
      createdByUserId: actor.sub,
      categoryId: category.id,
      category,
      severity: dto.severity,
      status: SituationStatus.OPEN,
      assignedUserId: null,
      lastStatusComment: null,
      resolvedAt: null,
      closedAt: null,
      dueAt: computeDueAt(dto.severity, createdAt),
      slaPolicyCode: SLA_POLICY_CODE,
      slaBreachedAt: null,
      lastSlaReminderAt: null,
      occurredAt: occurredAt,
      relatedCoordinations: relatedCoordinations.map((item, index) =>
        this.relatedCoordinationsRepository.create({
          coordinationId: item.id,
          coordination: item,
          displayOrder: index,
        }),
      ),
    });

    const saved = await this.situationsRepository.save(situation);
    const withRelations = await this.situationsRepository.findByIdWithRelations(
      saved.id,
    );
    if (!withRelations) {
      throw new NotFoundException('No fue posible cargar la situación creada.');
    }

    await this.auditLogService.record({
      actor,
      action: AuditAction.SITUATION_CREATED,
      resourceType: AuditResourceType.SITUATION,
      resourceId: withRelations.id,
      metadata: {
        status: withRelations.status,
        severity: withRelations.severity,
        categoryId: withRelations.categoryId,
        dueAt: withRelations.dueAt,
        slaPolicyCode: withRelations.slaPolicyCode,
      },
    });

    return this.toResponse(withRelations);
  }

  async list(
    query: ListSituationsQueryDto,
    actor: AuthPayload,
  ): Promise<SituationsListResponseDto> {
    this.scopeService.assertPermission(actor, 'SITUATIONS_VIEW');

    const scopedQuery: ListSituationsQueryDto = {
      ...query,
      coordinationId: this.scopeService.resolveSituationListCoordinationId(
        actor,
        query.coordinationId,
      ),
    };

    const page = scopedQuery.page ?? 1;
    const limit = scopedQuery.limit ?? 50;
    const [items, total] = await this.situationsRepository.search(scopedQuery);

    return {
      items: items.map((item) => this.toResponse(item)),
      total,
      page,
      limit,
    };
  }

  async getById(id: string, actor: AuthPayload): Promise<SituationResponseDto> {
    const situation = await this.situationsRepository.findByIdWithRelations(id);
    if (!situation) {
      throw new NotFoundException(`Situación no encontrada: ${id}`);
    }

    this.scopeService.assertSituationInScope(actor, situation);
    return this.toResponse(situation);
  }

  async update(
    id: string,
    dto: UpdateSituationDto,
    actor: AuthPayload,
  ): Promise<SituationResponseDto> {
    const situation = await this.situationsRepository.findByIdWithRelations(id);
    if (!situation) {
      throw new NotFoundException(`Situación no encontrada: ${id}`);
    }

    this.scopeService.assertCanUpdateSituation(actor, situation);

    if (
      situation.status === SituationStatus.CLOSED &&
      dto.status !== undefined
    ) {
      throw new BadRequestException(
        'La situación está cerrada y no admite nuevas modificaciones de estado.',
      );
    }

    if (dto.coordinationId !== undefined) {
      if (this.scopeService.isCoordinationScoped(actor)) {
        throw new ForbiddenException(
          'No puede reasignar la coordinación de la situación.',
        );
      }

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
      const previousSeverity = situation.severity;
      situation.severity = dto.severity;
      if (dto.severity !== previousSeverity) {
        situation.dueAt = resolveDueAtOnSeverityChange({
          previousSeverity,
          nextSeverity: dto.severity,
          status: situation.status,
          createdAt: situation.createdAt,
          currentDueAt: situation.dueAt,
        });
        situation.slaPolicyCode = SLA_POLICY_CODE;
      }
    }
    if (dto.occurredAt !== undefined) {
      const occurredAt = new Date(dto.occurredAt);
      if (Number.isNaN(occurredAt.getTime())) {
        throw new BadRequestException('La fecha de ocurrencia no es válida.');
      }
      if (isFutureOccurredAt(occurredAt)) {
        throw new BadRequestException(
          'La fecha de ocurrencia no puede ser futura.',
        );
      }
      situation.occurredAt = occurredAt;
    }

    const previousStatus = situation.status;
    const changedFields = this.collectChangedFields(dto);
    let statusTransitionApplied = false;
    let statusComment: string | null = null;

    if (dto.status !== undefined && dto.status !== previousStatus) {
      this.assertValidStatusTransition(previousStatus, dto.status);
      statusComment = this.resolveStatusComment(dto.status, dto.statusComment);
      await this.applyStatusTransition(
        situation,
        dto.status,
        statusComment,
        actor.sub,
      );
      statusTransitionApplied = true;
    } else if (dto.statusComment !== undefined) {
      situation.lastStatusComment = dto.statusComment.trim();
    }

    await this.situationsRepository.save(situation);

    if (statusTransitionApplied) {
      await this.recordStatusTransitionTimeline({
        situationId: situation.id,
        actorUserId: actor.sub,
        previousStatus,
        nextStatus: situation.status,
        statusComment,
        assignedUserName: situation.assignedUser?.fullName ?? null,
        evidenceIds: dto.evidenceIds ?? [],
        dueAt: situation.dueAt,
        slaBreachedAt: situation.slaBreachedAt,
        closedOnTime:
          situation.status === SituationStatus.CLOSED
            ? wasClosedOnTime(situation.dueAt, situation.closedAt)
            : null,
      });

      await this.auditLogService.record({
        actor,
        action: AuditAction.SITUATION_STATUS_CHANGED,
        resourceType: AuditResourceType.SITUATION,
        resourceId: situation.id,
        metadata: {
          previousStatus,
          nextStatus: situation.status,
          statusComment,
          dueAt: situation.dueAt,
          slaBreachedAt: situation.slaBreachedAt,
          closedOnTime:
            situation.status === SituationStatus.CLOSED
              ? wasClosedOnTime(situation.dueAt, situation.closedAt)
              : null,
        },
      });
    } else if (changedFields.length > 0) {
      await this.auditLogService.record({
        actor,
        action: AuditAction.SITUATION_UPDATED,
        resourceType: AuditResourceType.SITUATION,
        resourceId: situation.id,
        metadata: { changedFields },
      });
    }

    return this.getById(id, actor);
  }

  private collectChangedFields(dto: UpdateSituationDto): string[] {
    const fields: string[] = [];
    if (dto.title !== undefined) fields.push('title');
    if (dto.description !== undefined) fields.push('description');
    if (dto.severity !== undefined) fields.push('severity');
    if (dto.categoryId !== undefined) fields.push('categoryId');
    if (dto.coordinationId !== undefined) fields.push('coordinationId');
    if (dto.occurredAt !== undefined) fields.push('occurredAt');
    if (dto.statusComment !== undefined) fields.push('statusComment');
    return fields;
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
      throw new BadRequestException('Motivo de cierre es obligatorio.');
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
    dueAt: Date | null;
    slaBreachedAt: Date | null;
    closedOnTime: boolean | null;
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

    const descriptionParts = [`El estado cambió de ${fromLabel} a ${toLabel}.`];
    if (
      input.nextStatus === SituationStatus.IN_PROGRESS &&
      input.assignedUserName
    ) {
      descriptionParts.push(`Responsable: ${input.assignedUserName}.`);
    }
    if (input.statusComment) {
      const commentLabel =
        input.nextStatus === SituationStatus.CLOSED ? 'Motivo' : 'Nota';
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
          input.nextStatus === SituationStatus.CLOSED ? 'closure' : 'note',
        assignedUserName: input.assignedUserName,
        /** Estructura preparada para evidencias futuras. */
        evidenceIds: input.evidenceIds,
        evidencesAttached: false,
        dueAt: input.dueAt,
        closedOnTime: input.closedOnTime,
        slaBreachedAt: input.slaBreachedAt,
      },
    });
  }

  private async ensureCoordination(id: string): Promise<Coordination> {
    const coordination = await this.coordinationsRepository.findOne({
      where: { id, isActive: true },
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

  private async resolveRelatedCoordinations(
    relatedCoordinationIds: string[],
    originCoordinationId: string | null,
  ): Promise<Coordination[]> {
    const uniqueIds = [
      ...new Set(relatedCoordinationIds.map((id) => id.trim())),
    ]
      .filter((id) => id.length > 0)
      .filter((id) => id !== originCoordinationId);

    if (uniqueIds.length === 0) {
      return [];
    }

    const found = await this.coordinationsRepository.find({
      where: { id: In(uniqueIds), isActive: true },
    });

    if (found.length !== uniqueIds.length) {
      const foundIds = new Set(found.map((item) => item.id));
      const missing = uniqueIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException(
        `Coordinación relacionada no encontrada: ${missing.join(', ')}`,
      );
    }

    const byId = new Map(found.map((item) => [item.id, item]));
    return uniqueIds.map((id) => byId.get(id)!);
  }

  private toRelatedCoordinationResponse(
    item: SituationRelatedCoordination,
  ): RelatedCoordinationResponseDto {
    return {
      id: item.id,
      coordinationId: item.coordinationId,
      coordinationCode: item.coordination.code,
      coordinationName: item.coordination.name,
      coordinationShortName: item.coordination.shortName,
      displayOrder: item.displayOrder,
    };
  }

  private toResponse(situation: Situation): SituationResponseDto {
    const related = [...(situation.relatedCoordinations ?? [])].sort(
      (a, b) => a.displayOrder - b.displayOrder,
    );

    return {
      id: situation.id,
      title: situation.title,
      description: situation.description,
      coordinationId: situation.coordinationId,
      coordinationCode: situation.coordination?.code ?? null,
      coordinationName: situation.coordination?.name ?? null,
      createdByUserId: situation.createdByUserId,
      createdByUserName: situation.createdByUser.fullName,
      assignedUserId: situation.assignedUserId ?? null,
      assignedUserName: situation.assignedUser?.fullName ?? null,
      categoryId: situation.categoryId,
      categoryCode: situation.category.code,
      categoryName: situation.category.name,
      categoryIcon: situation.category.icon,
      severity: situation.severity,
      status: situation.status,
      lastStatusComment: situation.lastStatusComment ?? null,
      resolvedAt: situation.resolvedAt ?? null,
      closedAt: situation.closedAt ?? null,
      dueAt: situation.dueAt ?? null,
      slaPolicyCode: situation.slaPolicyCode ?? null,
      slaBreachedAt: situation.slaBreachedAt ?? null,
      slaHealth: computeSlaHealth(
        situation.dueAt,
        situation.status,
        new Date(),
        situation.severity,
      ),
      closedOnTime:
        situation.status === SituationStatus.CLOSED
          ? wasClosedOnTime(situation.dueAt, situation.closedAt)
          : null,
      occurredAt: situation.occurredAt,
      createdAt: situation.createdAt,
      updatedAt: situation.updatedAt,
      relatedCoordinations: related.map((item) =>
        this.toRelatedCoordinationResponse(item),
      ),
    };
  }
}
