import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  RecommendedActionExecutionStatus,
  TimelineEntryType,
} from '../common/enums/operational.enums';
import {
  ExecutiveIntelligenceReport,
  RecommendedAction,
} from '../intelligence/contracts/executive-intelligence-report.contract';
import { AIInterpretation } from '../intelligence/entities/ai-interpretation.entity';
import { OperationalAreasRepository } from '../operational-areas/repositories/operational-areas.repository';
import { OperationalTimelineEntry } from '../operational-events/entities/operational-timeline-entry.entity';
import { OperationalEventsRepository } from '../operational-events/repositories/operational-events.repository';
import {
  ExecutionActionImpactView,
  ExecutionActionTimelineItemView,
  ExecutionActionView,
  ExecutionActionsListResponse,
} from './contracts/execution-action.contract';
import {
  ListRecommendedActionsQueryDto,
  UpdateRecommendedActionStatusDto,
} from './dto/recommended-action.dto';
import { RecommendedActionExecution } from './entities/recommended-action-execution.entity';
import { RecommendedActionsRepository } from './repositories/recommended-actions.repository';

export interface MaterializeActionSeedOverride {
  actionIndex: number;
  status: RecommendedActionExecutionStatus;
  statusNote?: string | null;
  observation?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  assignedToUserId?: string | null;
  assignedToUserName?: string | null;
}

const STATUS_LABELS: Record<RecommendedActionExecutionStatus, string> = {
  [RecommendedActionExecutionStatus.PENDING]: 'Pendiente',
  [RecommendedActionExecutionStatus.IN_PROGRESS]: 'En ejecución',
  [RecommendedActionExecutionStatus.EXECUTED]: 'Ejecutada',
  [RecommendedActionExecutionStatus.NOT_EXECUTABLE]: 'No fue posible ejecutar',
};

const ALLOWED_TRANSITIONS: Record<
  RecommendedActionExecutionStatus,
  RecommendedActionExecutionStatus[]
> = {
  [RecommendedActionExecutionStatus.PENDING]: [
    RecommendedActionExecutionStatus.IN_PROGRESS,
    RecommendedActionExecutionStatus.EXECUTED,
    RecommendedActionExecutionStatus.NOT_EXECUTABLE,
  ],
  [RecommendedActionExecutionStatus.IN_PROGRESS]: [
    RecommendedActionExecutionStatus.EXECUTED,
    RecommendedActionExecutionStatus.NOT_EXECUTABLE,
    RecommendedActionExecutionStatus.PENDING,
  ],
  [RecommendedActionExecutionStatus.EXECUTED]: [
    RecommendedActionExecutionStatus.IN_PROGRESS,
  ],
  [RecommendedActionExecutionStatus.NOT_EXECUTABLE]: [
    RecommendedActionExecutionStatus.PENDING,
    RecommendedActionExecutionStatus.IN_PROGRESS,
  ],
};

@Injectable()
export class RecommendedActionsService {
  constructor(
    private readonly actionsRepository: RecommendedActionsRepository,
    private readonly eventsRepository: OperationalEventsRepository,
    private readonly areasRepository: OperationalAreasRepository,
  ) {}

  async list(
    query: ListRecommendedActionsQueryDto,
  ): Promise<ExecutionActionsListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 100;
    const [items, total] = await this.actionsRepository.search(query);
    const statusCounts = await this.actionsRepository.countByStatuses(
      query.areaId,
    );
    const executed =
      Number(
        statusCounts.find(
          (row) => row.status === RecommendedActionExecutionStatus.EXECUTED,
        )?.count ?? 0,
      ) || 0;
    const allTotal = statusCounts.reduce(
      (sum, row) => sum + (Number(row.count) || 0),
      0,
    );

    return {
      items: items.map((item) => this.toView(item)),
      total,
      page,
      limit,
      progress: {
        executed,
        total: allTotal,
      },
    };
  }

  async getById(id: string): Promise<ExecutionActionView> {
    const action = await this.actionsRepository.findByIdWithRelations(id);
    if (!action) {
      throw new NotFoundException(`Acción recomendada no encontrada: ${id}`);
    }
    return this.toView(action);
  }

  /**
   * Materializa acciones desde el reporte ejecutivo.
   * Idempotente por (interpretationId, actionIndex).
   */
  async materializeFromInterpretation(
    interpretation: AIInterpretation,
    overrides: MaterializeActionSeedOverride[] = [],
  ): Promise<RecommendedActionExecution[]> {
    const report = interpretation.executiveReport;
    const recommendedActions = report?.recommendedActions ?? [];
    if (recommendedActions.length === 0) {
      return [];
    }

    const areas = await this.areasRepository.findCatalog(true);
    const areaByName = new Map(
      areas.map((area) => [normalizeAreaKey(area.name), area]),
    );
    const overrideByIndex = new Map(
      overrides.map((item) => [item.actionIndex, item]),
    );

    const created: RecommendedActionExecution[] = [];

    for (let index = 0; index < recommendedActions.length; index += 1) {
      const existing = await this.actionsRepository.findOne({
        where: {
          interpretationId: interpretation.id,
          actionIndex: index,
        },
      });
      if (existing) {
        created.push(existing);
        continue;
      }

      const recommended = recommendedActions[index];
      const matchedArea =
        areaByName.get(normalizeAreaKey(recommended.suggestedArea)) ?? null;
      const override = overrideByIndex.get(index);
      const status =
        override?.status ?? RecommendedActionExecutionStatus.PENDING;

      const entity = this.actionsRepository.create({
        eventId: interpretation.eventId,
        interpretationId: interpretation.id,
        actionIndex: index,
        priority: recommended.priority,
        actionText: recommended.action,
        reason: recommended.reason,
        suggestedAreaName: recommended.suggestedArea,
        suggestedAreaId: matchedArea?.id ?? null,
        recommendedTime: recommended.recommendedTime,
        executionStatus: status,
        statusNote: override?.statusNote ?? null,
        observation: override?.observation ?? null,
        assignedToUserId: override?.assignedToUserId ?? null,
        assignedToUserName: override?.assignedToUserName ?? null,
        startedAt: override?.startedAt
          ? new Date(override.startedAt)
          : status === RecommendedActionExecutionStatus.IN_PROGRESS ||
              status === RecommendedActionExecutionStatus.EXECUTED
            ? new Date()
            : null,
        completedAt: override?.completedAt
          ? new Date(override.completedAt)
          : status === RecommendedActionExecutionStatus.EXECUTED ||
              status === RecommendedActionExecutionStatus.NOT_EXECUTABLE
            ? new Date()
            : null,
      });

      created.push(await this.actionsRepository.save(entity));
    }

    return created;
  }

  async updateStatus(
    id: string,
    dto: UpdateRecommendedActionStatusDto,
  ): Promise<ExecutionActionView> {
    const action = await this.actionsRepository.findByIdWithRelations(id);
    if (!action) {
      throw new NotFoundException(`Acción recomendada no encontrada: ${id}`);
    }

    const nextStatus = dto.status;
    this.assertTransitionAllowed(action.executionStatus, nextStatus);
    this.assertNoteRequirements(nextStatus, dto.note, dto.observation);

    const previousStatus = action.executionStatus;
    const now = new Date();
    const actorName = dto.byUserName?.trim() || 'Usuario operacional';
    const actorId = dto.byUserId?.trim() || null;
    const note = dto.note?.trim() || null;
    const observation = dto.observation?.trim() || null;

    action.executionStatus = nextStatus;
    action.assignedToUserId = actorId;
    action.assignedToUserName = actorName;

    if (nextStatus === RecommendedActionExecutionStatus.IN_PROGRESS) {
      action.startedAt = action.startedAt ?? now;
      action.completedAt = null;
      action.statusNote = null;
      if (note) {
        action.observation = note;
      }
    }

    if (nextStatus === RecommendedActionExecutionStatus.PENDING) {
      action.startedAt = null;
      action.completedAt = null;
      action.statusNote = null;
      action.observation = null;
    }

    if (nextStatus === RecommendedActionExecutionStatus.EXECUTED) {
      action.startedAt = action.startedAt ?? now;
      action.completedAt = now;
      action.observation = observation;
      action.statusNote = null;
    }

    if (nextStatus === RecommendedActionExecutionStatus.NOT_EXECUTABLE) {
      action.completedAt = now;
      action.statusNote = note;
      action.observation = observation;
    }

    const saved = await this.actionsRepository.save(action);

    await this.appendTimelineEntry(action.eventId, {
      type: TimelineEntryType.STATUS_CHANGE,
      at: now,
      byUserId: actorId,
      byUserName: actorName,
      description: buildStatusChangeDescription(
        action.actionText,
        previousStatus,
        nextStatus,
        note,
      ),
    });

    if (
      nextStatus === RecommendedActionExecutionStatus.NOT_EXECUTABLE &&
      note
    ) {
      await this.appendTimelineEntry(action.eventId, {
        type: TimelineEntryType.NOTE,
        at: now,
        byUserId: actorId,
        byUserName: actorName,
        description: `Acción «${shortenAction(action.actionText)}» · Motivo de no ejecución: ${note}`,
      });
    }

    if (
      (nextStatus === RecommendedActionExecutionStatus.EXECUTED ||
        nextStatus === RecommendedActionExecutionStatus.NOT_EXECUTABLE) &&
      observation
    ) {
      await this.appendTimelineEntry(action.eventId, {
        type: TimelineEntryType.NOTE,
        at: now,
        byUserId: actorId,
        byUserName: actorName,
        description: `Acción «${shortenAction(action.actionText)}» · Observación de ejecución: ${observation}`,
      });
    }

    const refreshed = await this.actionsRepository.findByIdWithRelations(
      saved.id,
    );
    if (!refreshed) {
      throw new NotFoundException(`Acción recomendada no encontrada: ${id}`);
    }
    return this.toView(refreshed);
  }

  private assertTransitionAllowed(
    from: RecommendedActionExecutionStatus,
    to: RecommendedActionExecutionStatus,
  ): void {
    if (from === to) {
      return;
    }
    const allowed = ALLOWED_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(
        `Transición no permitida: ${STATUS_LABELS[from]} → ${STATUS_LABELS[to]}`,
      );
    }
  }

  private assertNoteRequirements(
    status: RecommendedActionExecutionStatus,
    note?: string,
    observation?: string,
  ): void {
    if (
      status === RecommendedActionExecutionStatus.NOT_EXECUTABLE &&
      !note?.trim()
    ) {
      throw new BadRequestException(
        'Debe indicar el motivo cuando no fue posible ejecutar la acción.',
      );
    }
    if (
      status === RecommendedActionExecutionStatus.NOT_EXECUTABLE &&
      !observation?.trim()
    ) {
      throw new BadRequestException(
        'Debe registrar una observación cuando no fue posible ejecutar la acción.',
      );
    }
  }

  private async appendTimelineEntry(
    eventId: string,
    entry: Pick<
      OperationalTimelineEntry,
      'type' | 'at' | 'byUserId' | 'byUserName' | 'description'
    >,
  ): Promise<void> {
    const event = await this.eventsRepository.findWithRelations(eventId);
    if (!event) {
      return;
    }

    event.timelineEntries = [
      ...(event.timelineEntries ?? []),
      Object.assign(new OperationalTimelineEntry(), entry),
    ];
    event.lastUpdateAt = entry.at;
    await this.eventsRepository.save(event);
  }

  private toView(action: RecommendedActionExecution): ExecutionActionView {
    const report = action.interpretation?.executiveReport ?? null;
    const recommended =
      report?.recommendedActions?.[action.actionIndex] ??
      ({
        priority: action.priority,
        action: action.actionText,
        reason: action.reason,
        suggestedArea: action.suggestedAreaName,
        recommendedTime: action.recommendedTime,
      } satisfies RecommendedAction);

    return {
      id: action.id,
      action: action.actionText,
      reason: action.reason,
      whyRecommended: buildWhyRecommended(recommended, report),
      priority: action.priority,
      recommendedTime: action.recommendedTime,
      executionStatus: action.executionStatus,
      statusNote: action.statusNote,
      observation: action.observation,
      suggestedAreaId: action.suggestedAreaId,
      suggestedAreaCode: action.suggestedArea?.code ?? null,
      suggestedAreaName: action.suggestedAreaName,
      eventId: action.eventId,
      eventTitle: action.event?.title ?? 'Situación operacional',
      sourceAreaId: action.event?.sourceAreaId ?? '',
      sourceAreaName: action.event?.sourceAreaName ?? '',
      interpretationId: action.interpretationId,
      generatedByAi: true,
      suggestedAt: buildSuggestedAt(action.createdAt, action.recommendedTime),
      riskIfNotExecuted:
        report?.operationalConsequences?.[0] ??
        'El riesgo operacional asociado podría mantenerse.',
      executiveSummary:
        report?.incidentSummary?.executiveSummary ?? action.reason,
      expectedImpact: buildExpectedImpact(report, action),
      timeline: buildActionTimeline(action),
      createdAt: action.createdAt.toISOString(),
      updatedAt: action.updatedAt.toISOString(),
      startedAt: action.startedAt?.toISOString() ?? null,
      completedAt: action.completedAt?.toISOString() ?? null,
    };
  }
}

function normalizeAreaKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function buildWhyRecommended(
  recommended: RecommendedAction,
  report: ExecutiveIntelligenceReport | null,
): string {
  const fragments = [recommended.reason];
  if (report?.executiveConclusion?.recommendation) {
    fragments.push(report.executiveConclusion.recommendation);
  }
  return fragments.filter(Boolean).join(' ').slice(0, 420);
}

function buildExpectedImpact(
  report: ExecutiveIntelligenceReport | null,
  action: RecommendedActionExecution,
): ExecutionActionImpactView {
  const currentIndex = action.actionIndex;
  return {
    benefitExpected:
      report?.executiveConclusion?.recommendation ?? action.reason,
    indicatorToImprove:
      report?.operationalIndicators?.[0]?.name ??
      report?.impactAnalysis?.affectedProcesses?.[0] ??
      'Continuidad operacional',
    estimatedTime: action.recommendedTime,
    dependency:
      report?.rootCause?.dependencies?.[0] ?? 'Sin dependencia declarada',
    nextSuggestedAction:
      report?.recommendedActions?.[currentIndex + 1]?.action ??
      report?.timelineSuggestions?.[0]?.checkpoint ??
      'Verificar el resultado y mantener seguimiento.',
  };
}

function buildSuggestedAt(createdAt: Date, recommendedTime: string): string {
  const normalized = recommendedTime.toLowerCase();
  const amount = Number.parseInt(normalized.match(/\d+/)?.[0] ?? '0', 10);
  const suggestedAt = new Date(createdAt);

  if (normalized.includes('minuto')) {
    suggestedAt.setMinutes(suggestedAt.getMinutes() + amount);
  } else if (normalized.includes('hora')) {
    suggestedAt.setHours(suggestedAt.getHours() + amount);
  } else if (normalized.includes('día') || normalized.includes('dia')) {
    suggestedAt.setDate(suggestedAt.getDate() + amount);
  } else if (normalized.includes('semana')) {
    suggestedAt.setDate(suggestedAt.getDate() + amount * 7);
  }

  return suggestedAt.toISOString();
}

function buildActionTimeline(
  action: RecommendedActionExecution,
): ExecutionActionTimelineItemView[] {
  const items: ExecutionActionTimelineItemView[] = [
    {
      type: 'ai_generated',
      at: action.createdAt.toISOString(),
      description: 'IA generó la recomendación',
      byUserName: 'Inteligencia Operacional',
    },
    {
      type: 'assigned',
      at: action.createdAt.toISOString(),
      description: `Asignada al área ${action.suggestedAreaName}`,
      byUserName: null,
    },
  ];

  if (action.executionStatus === RecommendedActionExecutionStatus.PENDING) {
    items.push({
      type: 'pending',
      at: action.updatedAt.toISOString(),
      description: 'Pendiente de ejecución',
      byUserName: null,
    });
  }

  if (action.startedAt) {
    items.push({
      type: 'in_progress',
      at: action.startedAt.toISOString(),
      description: 'En ejecución por el área responsable',
      byUserName: action.assignedToUserName,
    });
  }

  if (
    action.completedAt &&
    action.executionStatus === RecommendedActionExecutionStatus.EXECUTED
  ) {
    items.push({
      type: 'executed',
      at: action.completedAt.toISOString(),
      description: 'Acción ejecutada',
      byUserName: action.assignedToUserName,
    });
  }

  if (
    action.completedAt &&
    action.executionStatus === RecommendedActionExecutionStatus.NOT_EXECUTABLE
  ) {
    items.push({
      type: 'not_executable',
      at: action.completedAt.toISOString(),
      description: 'No fue posible ejecutar',
      byUserName: action.assignedToUserName,
    });
  }

  items.push({
    type: 'last_update',
    at: action.updatedAt.toISOString(),
    description: 'Última actualización',
    byUserName: action.assignedToUserName,
  });

  const eventTimeline = (action.event?.timelineEntries ?? [])
    .filter(
      (entry) =>
        entry.type === TimelineEntryType.STATUS_CHANGE ||
        entry.type === TimelineEntryType.NOTE,
    )
    .filter((entry) =>
      entry.description.includes(
        `Acción «${shortenAction(action.actionText)}»`,
      ),
    )
    .map((entry) => ({
      type: entry.type,
      at: entry.at.toISOString(),
      description: entry.description,
      byUserName: entry.byUserName,
    }));

  return [...items, ...eventTimeline]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-8);
}

function buildStatusChangeDescription(
  actionText: string,
  from: RecommendedActionExecutionStatus,
  to: RecommendedActionExecutionStatus,
  note: string | null,
): string {
  const shortAction = shortenAction(actionText);
  const base = `Acción «${shortAction}»: ${STATUS_LABELS[from]} → ${STATUS_LABELS[to]}`;
  return note ? `${base}. ${note}` : base;
}

function shortenAction(actionText: string): string {
  return actionText.length > 80 ? `${actionText.slice(0, 77)}...` : actionText;
}
