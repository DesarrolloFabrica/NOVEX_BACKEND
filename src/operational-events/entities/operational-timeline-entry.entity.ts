import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { TimelineEntryType } from '../../common/enums/operational.enums';
import { OperationalEvent } from '../../operational-events/entities/operational-event.entity';

/**
 * OperationalTimelineEntry — unidad de memoria del evento.
 * Equivale a las entradas de OperationalTimeline del frontend.
 */
@Entity({ name: 'operational_timeline_entries' })
export class OperationalTimelineEntry extends BaseEntity {
  @ManyToOne(() => OperationalEvent, (event) => event.timelineEntries, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'event_id' })
  event!: OperationalEvent;

  @Column({ type: 'uuid', name: 'event_id' })
  eventId!: string;

  @Column({
    type: 'enum',
    enum: TimelineEntryType,
  })
  type!: TimelineEntryType;

  @Column({ type: 'timestamptz' })
  at!: Date;

  @Column({ type: 'varchar', length: 64, name: 'by_user_id', nullable: true })
  byUserId!: string | null;

  @Column({
    type: 'varchar',
    length: 160,
    name: 'by_user_name',
    nullable: true,
  })
  byUserName!: string | null;

  @Column({ type: 'text' })
  description!: string;
}
