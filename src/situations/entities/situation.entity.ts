import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import {
  SituationSeverity,
  SituationStatus,
} from '../../common/enums/situation.enums';
import { Coordination } from '../../coordinations/entities/coordination.entity';
import { IncidentCategory } from '../../intelligence/entities/incident-category.entity';
import { User } from '../../users/entities/user.entity';
import { SituationRelatedCoordination } from './situation-related-coordination.entity';

@Entity({ name: 'situations' })
@Index('idx_situations_status_occurred_at', ['status', 'occurredAt'])
@Index('idx_situations_coordination_status', ['coordinationId', 'status'])
export class Situation extends BaseEntity {
  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  /** Nula cuando el caso lo registra un analista, que no representa área. */
  @ManyToOne(() => Coordination, { nullable: true, eager: true })
  @JoinColumn({ name: 'coordination_id' })
  coordination!: Coordination | null;

  @Index()
  @Column({ type: 'uuid', name: 'coordination_id', nullable: true })
  coordinationId!: string | null;

  @ManyToOne(() => User, { nullable: false, eager: true })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser!: User;

  @Index()
  @Column({ type: 'uuid', name: 'created_by_user_id' })
  createdByUserId!: string;

  @ManyToOne(() => User, { nullable: true, eager: true })
  @JoinColumn({ name: 'assigned_user_id' })
  assignedUser!: User | null;

  @Index()
  @Column({ type: 'uuid', name: 'assigned_user_id', nullable: true })
  assignedUserId!: string | null;

  @ManyToOne(() => IncidentCategory, { nullable: false, eager: true })
  @JoinColumn({ name: 'category_id' })
  category!: IncidentCategory;

  @Index()
  @Column({ type: 'uuid', name: 'category_id' })
  categoryId!: string;

  @Index()
  @Column({
    type: 'enum',
    enum: SituationSeverity,
  })
  severity!: SituationSeverity;

  @Index()
  @Column({
    type: 'enum',
    enum: SituationStatus,
    default: SituationStatus.OPEN,
  })
  status!: SituationStatus;

  @Column({ type: 'text', name: 'last_status_comment', nullable: true })
  lastStatusComment!: string | null;

  @Column({ type: 'timestamptz', name: 'resolved_at', nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'closed_at', nullable: true })
  closedAt!: Date | null;

  /** Fecha límite operativa (SLA suave). No implica cierre automático. */
  @Index()
  @Column({ type: 'timestamptz', name: 'due_at', nullable: true })
  dueAt!: Date | null;

  @Column({
    type: 'varchar',
    length: 40,
    name: 'sla_policy_code',
    nullable: true,
  })
  slaPolicyCode!: string | null;

  /** Primera detección de vencimiento; inmutable una vez seteado. */
  @Column({ type: 'timestamptz', name: 'sla_breached_at', nullable: true })
  slaBreachedAt!: Date | null;

  @Column({
    type: 'timestamptz',
    name: 'last_sla_reminder_at',
    nullable: true,
  })
  lastSlaReminderAt!: Date | null;

  @Index()
  @Column({ type: 'timestamptz', name: 'occurred_at' })
  occurredAt!: Date;

  @OneToMany(
    () => SituationRelatedCoordination,
    (related) => related.situation,
    { cascade: true },
  )
  relatedCoordinations!: SituationRelatedCoordination[];
}
