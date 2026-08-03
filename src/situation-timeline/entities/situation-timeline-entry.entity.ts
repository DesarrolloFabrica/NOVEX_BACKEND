import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TimelineEventType } from '../../common/enums/situation-timeline.enums';
import { Situation } from '../../situations/entities/situation.entity';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'situation_timeline_entries' })
@Index('idx_situation_timeline_situation_created', ['situationId', 'createdAt'])
export class SituationTimelineEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Situation, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'situation_id' })
  situation!: Situation;

  @Index()
  @Column({ type: 'uuid', name: 'situation_id' })
  situationId!: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @Index()
  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId!: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: TimelineEventType,
    name: 'event_type',
  })
  eventType!: TimelineEventType;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
