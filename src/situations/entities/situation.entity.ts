import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import {
  SituationReportKind,
  SituationSeverity,
  SituationStatus,
} from '../../common/enums/situation.enums';
import { Coordination } from '../../coordinations/entities/coordination.entity';
import { IncidentCategory } from '../../intelligence/entities/incident-category.entity';
import { User } from '../../users/entities/user.entity';
import { SituationRelatedCoordination } from './situation-related-coordination.entity';
import { SituationResolution } from './situation-resolution.entity';

@Entity({ name: 'situations' })
@Index('idx_situations_status_occurred_at', ['status', 'occurredAt'])
@Index('idx_situations_coordination_status', ['coordinationId', 'status'])
@Index('idx_situations_affected_coordination_status', [
  'affectedCoordinationId',
  'status',
])
@Index('idx_situations_report_kind', ['reportKind'])
export class Situation extends BaseEntity {
  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  /**
   * Coordinación RESPONSABLE: quien atiende y puede resolver.
   * Nula solo en registros históricos de analista sin área.
   */
  @ManyToOne(() => Coordination, { nullable: true, eager: true })
  @JoinColumn({ name: 'coordination_id' })
  coordination!: Coordination | null;

  @Index()
  @Column({ type: 'uuid', name: 'coordination_id', nullable: true })
  coordinationId!: string | null;

  /**
   * Coordinación AFECTADA: la que sufre el impacto (carta desde la que se
   * reportó). En INTERNAL coincide con la responsable; en INTER es distinta.
   */
  @ManyToOne(() => Coordination, { nullable: true, eager: true })
  @JoinColumn({ name: 'affected_coordination_id' })
  affectedCoordination!: Coordination | null;

  @Column({ type: 'uuid', name: 'affected_coordination_id', nullable: true })
  affectedCoordinationId!: string | null;

  @Column({
    type: 'enum',
    enum: SituationReportKind,
    name: 'report_kind',
    default: SituationReportKind.INTERNAL,
  })
  reportKind!: SituationReportKind;

  /** Proceso de la afectada que se retrasa o bloquea (solo INTER). */
  @Column({ type: 'text', name: 'affected_process', nullable: true })
  affectedProcess!: string | null;

  /** Entrega o acción pendiente de la responsable (solo INTER). */
  @Column({ type: 'text', name: 'pending_delivery', nullable: true })
  pendingDelivery!: string | null;

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

  /** Nula en INTER_COORDINATION: el tipo no se simula con una categoría. */
  @ManyToOne(() => IncidentCategory, { nullable: true, eager: true })
  @JoinColumn({ name: 'category_id' })
  category!: IncidentCategory | null;

  @Index()
  @Column({ type: 'uuid', name: 'category_id', nullable: true })
  categoryId!: string | null;

  /**
   * Severidad EFECTIVA: el nivel operacional actual. Es la caché de la última
   * fila de `situation_severity_changes` y la leen listas, overview, integridad
   * y KPI. Solo la cambia el escalamiento del sistema; el PATCH ya no la acepta.
   */
  @Index()
  @Column({
    type: 'enum',
    enum: SituationSeverity,
  })
  severity!: SituationSeverity;

  /**
   * Severidad REPORTADA: la evaluación de quien registró el problema.
   * Inmutable. Es la ÚNICA entrada del SLA (`due_at`, ventana de aviso,
   * `slaHealth`, `closedOnTime`): el plazo es la promesa original y no se
   * reescribe cuando la urgencia cambia.
   */
  @Column({
    type: 'enum',
    enum: SituationSeverity,
    enumName: 'situations_severity_enum',
    name: 'reported_severity',
  })
  reportedSeverity!: SituationSeverity;

  /**
   * Política de escalamiento temporal congelada al crear el caso. NULO = el
   * caso no escala automáticamente. Hoy siempre es nulo: no hay política
   * aprobada (solo fixtures de test usan una).
   */
  @Column({
    type: 'varchar',
    length: 40,
    name: 'severity_escalation_policy_code',
    nullable: true,
  })
  severityEscalationPolicyCode!: string | null;

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

  /**
   * Aprendizaje del cierre. NULO mientras el problema sigue activo y también en
   * los casos cerrados antes de esta fase: la ausencia es un estado legítimo.
   *
   * Sin `cascade`: la fila la escribe la transacción de `SituationsService.resolve`,
   * que necesita controlar el momento exacto del INSERT para que la clave
   * primaria actúe de barrera ante dos resoluciones simultáneas.
   */
  @OneToOne(() => SituationResolution, (resolution) => resolution.situation)
  resolution!: SituationResolution | null;
}
