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
@Index(
  'uq_situations_creator_client_request',
  ['createdByUserId', 'clientRequestId'],
  { unique: true, where: '"client_request_id" IS NOT NULL' },
)
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

  // Nullable en BD desde la release (los INTER no tienen categoría). El tipo se
  // mantiene: el contexto IA sigue asumiendo categoría. Ver situations.service.ts.
  @ManyToOne(() => IncidentCategory, { nullable: true, eager: true })
  @JoinColumn({ name: 'category_id' })
  category!: IncidentCategory;

  @Index()
  @Column({ type: 'uuid', name: 'category_id', nullable: true })
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

  /** Clave de idempotencia del intento de registro (UUID v4 enviado por el cliente). */
  @Column({ type: 'uuid', name: 'client_request_id', nullable: true })
  clientRequestId!: string | null;

  /** SHA-256 del contenido registrado; detecta reutilización de la clave con otro payload. */
  @Column({
    type: 'varchar',
    length: 64,
    name: 'request_fingerprint',
    nullable: true,
  })
  requestFingerprint!: string | null;

  /**
   * Token del intento que tiene el reclamo de análisis IA. Solo ese intento puede
   * confirmar el análisis o eliminar la fila. Ver AIOrchestrator.
   */
  @Column({ type: 'uuid', name: 'analysis_claim_token', nullable: true })
  analysisClaimToken!: string | null;

  /** Vencimiento del reclamo: permite a otro intento tomar el control si quedó interrumpido. */
  @Column({
    type: 'timestamptz',
    name: 'analysis_claim_expires_at',
    nullable: true,
  })
  analysisClaimExpiresAt!: Date | null;

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
