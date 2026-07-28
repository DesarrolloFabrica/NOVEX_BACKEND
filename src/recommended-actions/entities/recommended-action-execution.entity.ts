import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { RecommendedActionExecutionStatus } from '../../common/enums/operational.enums';
import { AIInterpretation } from '../../intelligence/entities/ai-interpretation.entity';
import { OperationalArea } from '../../operational-areas/entities/operational-area.entity';
import { OperationalEvent } from '../../operational-events/entities/operational-event.entity';

/**
 * Acción recomendada materializada desde ExecutiveIntelligenceReport.
 * Ciclo de vida operativo independiente del snapshot IA (v2 intacto).
 */
@Entity({ name: 'recommended_action_executions' })
@Unique('uq_recommended_action_interpretation_index', [
  'interpretationId',
  'actionIndex',
])
export class RecommendedActionExecution extends BaseEntity {
  @ManyToOne(() => OperationalEvent, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'event_id' })
  event!: OperationalEvent;

  @Index()
  @Column({ type: 'uuid', name: 'event_id' })
  eventId!: string;

  @ManyToOne(() => AIInterpretation, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'interpretation_id' })
  interpretation!: AIInterpretation;

  @Index()
  @Column({ type: 'uuid', name: 'interpretation_id' })
  interpretationId!: string;

  @Column({ type: 'smallint', name: 'action_index' })
  actionIndex!: number;

  /** immediate | high | medium | scheduled */
  @Column({ type: 'varchar', length: 32 })
  priority!: 'immediate' | 'high' | 'medium' | 'scheduled';

  @Column({ type: 'text', name: 'action_text' })
  actionText!: string;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'varchar', length: 180, name: 'suggested_area_name' })
  suggestedAreaName!: string;

  @ManyToOne(() => OperationalArea, { nullable: true, eager: true })
  @JoinColumn({ name: 'suggested_area_id' })
  suggestedArea!: OperationalArea | null;

  @Index()
  @Column({ type: 'uuid', name: 'suggested_area_id', nullable: true })
  suggestedAreaId!: string | null;

  @Column({ type: 'varchar', length: 80, name: 'recommended_time' })
  recommendedTime!: string;

  @Column({
    type: 'enum',
    enum: RecommendedActionExecutionStatus,
    name: 'execution_status',
    default: RecommendedActionExecutionStatus.PENDING,
  })
  executionStatus!: RecommendedActionExecutionStatus;

  /** Motivo obligatorio cuando no fue posible ejecutar. */
  @Column({ type: 'text', name: 'status_note', nullable: true })
  statusNote!: string | null;

  /** Observación opcional al marcar como ejecutada. */
  @Column({ type: 'text', nullable: true })
  observation!: string | null;

  @Column({
    type: 'varchar',
    length: 64,
    name: 'assigned_to_user_id',
    nullable: true,
  })
  assignedToUserId!: string | null;

  @Column({
    type: 'varchar',
    length: 160,
    name: 'assigned_to_user_name',
    nullable: true,
  })
  assignedToUserName!: string | null;

  @Column({ type: 'timestamptz', name: 'started_at', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt!: Date | null;
}
