import { Injectable, NotFoundException } from '@nestjs/common';
import { OperationalEventStatus } from '../common/enums/operational.enums';
import { TimelineEntryType } from '../common/enums/operational.enums';
import { OperationalAreasService } from '../operational-areas/operational-areas.service';
import {
  CreateOperationalEventDto,
  ListOperationalEventsQueryDto,
  UpdateOperationalEventStatusDto,
} from './dto/operational-event.dto';
import { OperationalEvent } from './entities/operational-event.entity';
import { OperationalTimelineEntry } from './entities/operational-timeline-entry.entity';
import { OperationalEventsRepository } from './repositories/operational-events.repository';

/**
 * Servicio de eventos operacionales.
 * Sprint 6: alta y consulta estructurales; sin Gemini.
 */
@Injectable()
export class OperationalEventsService {
  constructor(
    private readonly eventsRepository: OperationalEventsRepository,
    private readonly areasService: OperationalAreasService,
  ) {}

  async list(query: ListOperationalEventsQueryDto) {
    const [items, total] = await this.eventsRepository.search(query);
    return {
      items,
      total,
      page: query.page ?? 1,
      limit: query.limit ?? 50,
    };
  }

  async getById(id: string): Promise<OperationalEvent> {
    const event = await this.eventsRepository.findWithRelations(id);
    if (!event) {
      throw new NotFoundException(`Evento operacional no encontrado: ${id}`);
    }
    return event;
  }

  async create(dto: CreateOperationalEventDto): Promise<OperationalEvent> {
    const area = await this.areasService.getById(dto.sourceAreaId);
    const reportedAt = new Date(dto.reportedAt);
    const reportedById = dto.reportedById ?? 'user-capture-operator';
    const reportedByName = dto.reportedByName ?? 'Operador de captura';

    const event = this.eventsRepository.create({
      title: dto.title.trim(),
      description: dto.description.trim(),
      sourceAreaId: area.id,
      sourceAreaName: area.name,
      sourceArea: area,
      reportedAt,
      reportedById,
      reportedByName,
      status: OperationalEventStatus.OPEN,
      observations: dto.observations?.trim() || null,
      attachmentNames: dto.attachmentNames ?? [],
      lastUpdateAt: new Date(),
      currentInterpretationId: null,
      timelineEntries: [
        Object.assign(new OperationalTimelineEntry(), {
          type: TimelineEntryType.EVENT_REGISTERED,
          at: reportedAt,
          byUserId: reportedById,
          byUserName: reportedByName,
          description: `Evento registrado por ${reportedByName}.`,
        }),
      ],
    });

    return this.eventsRepository.save(event);
  }

  async updateStatus(
    id: string,
    dto: UpdateOperationalEventStatusDto,
  ): Promise<OperationalEvent> {
    const event = await this.getById(id);
    const previous = event.status;
    event.status = dto.status;
    event.lastUpdateAt = new Date();
    event.timelineEntries = [
      ...(event.timelineEntries ?? []),
      Object.assign(new OperationalTimelineEntry(), {
        type: TimelineEntryType.STATUS_CHANGE,
        at: new Date(),
        description: `Estado actualizado de ${previous} a ${dto.status}.`,
      }),
    ];
    return this.eventsRepository.save(event);
  }
}
