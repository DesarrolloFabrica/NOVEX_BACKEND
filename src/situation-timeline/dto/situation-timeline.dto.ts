import { TimelineEventType } from '../../common/enums/situation-timeline.enums';

export interface CreateTimelineEntryInput {
  situationId: string;
  userId?: string | null;
  eventType: TimelineEventType;
  title: string;
  description: string;
  metadata?: Record<string, unknown> | null;
}

export class SituationTimelineEntryResponseDto {
  id!: string;
  situationId!: string;
  userId!: string | null;
  userName!: string | null;
  eventType!: TimelineEventType;
  title!: string;
  description!: string;
  metadata!: Record<string, unknown> | null;
  createdAt!: Date;
}

export class SituationTimelineResponseDto {
  situationId!: string;
  items!: SituationTimelineEntryResponseDto[];
  total!: number;
}
