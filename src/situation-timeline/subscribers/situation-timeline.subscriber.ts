import { Injectable } from '@nestjs/common';
import {
  DataSource,
  EntitySubscriberInterface,
  InsertEvent,
  UpdateEvent,
} from 'typeorm';
import { TimelineEventType } from '../../common/enums/situation-timeline.enums';
import { SituationStatus } from '../../common/enums/situation.enums';
import { Situation } from '../../situations/entities/situation.entity';
import { CreateTimelineEntryInput } from '../dto/situation-timeline.dto';
import { SituationTimelineService } from '../situation-timeline.service';

@Injectable()
export class SituationTimelineSubscriber
  implements EntitySubscriberInterface<Situation>
{
  constructor(
    dataSource: DataSource,
    private readonly timelineService: SituationTimelineService,
  ) {
    dataSource.subscribers.push(this);
  }

  listenTo(): typeof Situation {
    return Situation;
  }

  async afterInsert(event: InsertEvent<Situation>): Promise<void> {
    const situation = event.entity;
    if (!situation?.id) {
      return;
    }

    await this.timelineService.createEntry(
      {
        situationId: situation.id,
        userId: situation.createdByUserId,
        eventType: TimelineEventType.SITUATION_CREATED,
        title: 'Situación registrada',
        description: `Se registró la situación "${situation.title}".`,
        metadata: {
          status: situation.status,
          severity: situation.severity,
          coordinationId: situation.coordinationId,
          categoryId: situation.categoryId,
          occurredAt: situation.occurredAt,
        },
      },
      event.manager,
    );
  }

  async afterUpdate(event: UpdateEvent<Situation>): Promise<void> {
    const before = event.databaseEntity as Situation | undefined;
    const after = event.entity as Situation | undefined;
    if (!before?.id || !after?.id) {
      return;
    }

    const entries = this.buildUpdateEntries(before, after);
    for (const entry of entries) {
      await this.timelineService.createEntry(entry, event.manager);
    }
  }

  private buildUpdateEntries(
    before: Situation,
    after: Situation,
  ): CreateTimelineEntryInput[] {
    const entries: CreateTimelineEntryInput[] = [];
    const base = {
      situationId: after.id,
      userId: null,
    };

    if (before.status !== after.status) {
      const eventType = this.resolveStatusEventType(before.status, after.status);
      entries.push({
        ...base,
        eventType,
        title: this.statusEventTitle(eventType),
        description: `El estado cambió de ${before.status} a ${after.status}.`,
        metadata: {
          field: 'status',
          previousValue: before.status,
          newValue: after.status,
        },
      });
    }

    if (before.severity !== after.severity) {
      entries.push({
        ...base,
        eventType: TimelineEventType.SEVERITY_CHANGED,
        title: 'Severidad actualizada',
        description: `La severidad cambió de ${before.severity} a ${after.severity}.`,
        metadata: {
          field: 'severity',
          previousValue: before.severity,
          newValue: after.severity,
        },
      });
    }

    const updatedFields = this.collectUpdatedFields(before, after);
    if (updatedFields.length > 0) {
      entries.push({
        ...base,
        eventType: TimelineEventType.UPDATED,
        title: 'Situación actualizada',
        description: 'Se actualizaron datos de la situación.',
        metadata: {
          fields: updatedFields,
        },
      });
    }

    return entries;
  }

  private resolveStatusEventType(
    previousStatus: SituationStatus,
    nextStatus: SituationStatus,
  ): TimelineEventType {
    if (nextStatus === SituationStatus.CLOSED) {
      return TimelineEventType.CLOSED;
    }

    if (
      previousStatus === SituationStatus.CLOSED &&
      (nextStatus === SituationStatus.OPEN ||
        nextStatus === SituationStatus.IN_PROGRESS)
    ) {
      return TimelineEventType.REOPENED;
    }

    return TimelineEventType.STATUS_CHANGED;
  }

  private statusEventTitle(eventType: TimelineEventType): string {
    switch (eventType) {
      case TimelineEventType.CLOSED:
        return 'Situación cerrada';
      case TimelineEventType.REOPENED:
        return 'Situación reabierta';
      default:
        return 'Estado actualizado';
    }
  }

  private collectUpdatedFields(
    before: Situation,
    after: Situation,
  ): Array<{ field: string; previousValue: unknown; newValue: unknown }> {
    const fields: Array<{
      field: string;
      previousValue: unknown;
      newValue: unknown;
    }> = [];

    if (before.title !== after.title) {
      fields.push({
        field: 'title',
        previousValue: before.title,
        newValue: after.title,
      });
    }

    if (before.description !== after.description) {
      fields.push({
        field: 'description',
        previousValue: before.description,
        newValue: after.description,
      });
    }

    if (before.coordinationId !== after.coordinationId) {
      fields.push({
        field: 'coordinationId',
        previousValue: before.coordinationId,
        newValue: after.coordinationId,
      });
    }

    if (before.categoryId !== after.categoryId) {
      fields.push({
        field: 'categoryId',
        previousValue: before.categoryId,
        newValue: after.categoryId,
      });
    }

    if (before.occurredAt.getTime() !== after.occurredAt.getTime()) {
      fields.push({
        field: 'occurredAt',
        previousValue: before.occurredAt,
        newValue: after.occurredAt,
      });
    }

    return fields;
  }
}
