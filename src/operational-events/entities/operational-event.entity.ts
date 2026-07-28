import { Column, Entity, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { OperationalEventStatus } from '../../common/enums/operational.enums';
import { AIInterpretation } from '../../intelligence/entities/ai-interpretation.entity';
import { OperationalArea } from '../../operational-areas/entities/operational-area.entity';
import { OperationalTimelineEntry } from './operational-timeline-entry.entity';

/**
 * OperationalEvent — unidad atómica reportada por el usuario.
 * Relaciona área origen, interpretación vigente, timeline y adjuntos placeholder.
 */
@Entity({ name: 'operational_events' })
export class OperationalEvent extends BaseEntity {
  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'varchar', length: 64, name: 'reported_by_id' })
  reportedById!: string;

  @Column({ type: 'varchar', length: 160, name: 'reported_by_name' })
  reportedByName!: string;

  @Column({ type: 'timestamptz', name: 'reported_at' })
  reportedAt!: Date;

  @ManyToOne(() => OperationalArea, (area) => area.sourcedEvents, {
    nullable: false,
    eager: true,
  })
  @JoinColumn({ name: 'source_area_id' })
  sourceArea!: OperationalArea;

  @Column({ type: 'uuid', name: 'source_area_id' })
  sourceAreaId!: string;

  /** Nombre denormalizado del área origen (lectura alineada al frontend). */
  @Column({ type: 'varchar', length: 180, name: 'source_area_name' })
  sourceAreaName!: string;

  @Column({
    type: 'enum',
    enum: OperationalEventStatus,
    default: OperationalEventStatus.OPEN,
  })
  status!: OperationalEventStatus;

  @Column({ type: 'text', nullable: true })
  observations!: string | null;

  @Column({ type: 'jsonb', name: 'attachment_names', default: [] })
  attachmentNames!: string[];

  @Column({ type: 'boolean', name: 'is_mock', default: false })
  isMock!: boolean;

  @Column({ type: 'varchar', length: 40, default: 'production' })
  source!: string;

  @Column({ type: 'timestamptz', name: 'last_update_at', nullable: true })
  lastUpdateAt!: Date | null;

  /**
   * Id de la interpretación vigente (nullable mientras se genera).
   * La relación completa vive en `interpretations` (1:N).
   */
  @Column({ type: 'uuid', name: 'current_interpretation_id', nullable: true })
  currentInterpretationId!: string | null;

  @OneToMany(() => AIInterpretation, (interpretation) => interpretation.event)
  interpretations!: AIInterpretation[];

  @OneToMany(() => OperationalTimelineEntry, (entry) => entry.event, {
    cascade: true,
  })
  timelineEntries!: OperationalTimelineEntry[];
}
