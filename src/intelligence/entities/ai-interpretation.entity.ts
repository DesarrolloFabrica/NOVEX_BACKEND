import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { RiskLevel } from '../../common/enums/operational.enums';
import { ExecutiveIntelligenceReport } from '../contracts/executive-intelligence-report.contract';
import { OperationalArea } from '../../operational-areas/entities/operational-area.entity';
import { OperationalEvent } from '../../operational-events/entities/operational-event.entity';
import { IncidentCategory } from './incident-category.entity';
import { OperationalIndicator } from './operational-indicator.entity';

/**
 * AIInterpretation — resultado estructurado de la capa de inteligencia.
 * En Sprint 6 almacena interpretaciones mock (sin Gemini).
 */
@Entity({ name: 'ai_interpretations' })
export class AIInterpretation extends BaseEntity {
  @ManyToOne(() => OperationalEvent, (event) => event.interpretations, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'event_id' })
  event!: OperationalEvent;

  @Column({ type: 'uuid', name: 'event_id' })
  eventId!: string;

  @ManyToOne(() => IncidentCategory, (category) => category.interpretations, {
    nullable: false,
    eager: true,
  })
  @JoinColumn({ name: 'category_id' })
  category!: IncidentCategory;

  @Column({ type: 'uuid', name: 'category_id' })
  categoryId!: string;

  /** Nombre denormalizado para lectura sin join adicional. */
  @Column({ type: 'varchar', length: 160, name: 'category_name' })
  categoryName!: string;

  @ManyToMany(() => OperationalArea, { eager: true })
  @JoinTable({
    name: 'ai_interpretation_affected_areas',
    joinColumn: { name: 'interpretation_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'area_id', referencedColumnName: 'id' },
  })
  affectedAreas!: OperationalArea[];

  @Column({ type: 'smallint', name: 'impact_severity' })
  impactSeverity!: number;

  @Column({ type: 'smallint', name: 'affectation_percentage' })
  affectationPercentage!: number;

  @Column({ type: 'smallint', name: 'impact_internal' })
  impactInternal!: number;

  @Column({ type: 'smallint', name: 'impact_external' })
  impactExternal!: number;

  @Column({ type: 'smallint', name: 'impact_students' })
  impactStudents!: number;

  @Column({
    type: 'enum',
    enum: RiskLevel,
    name: 'risk_level',
  })
  riskLevel!: RiskLevel;

  @Column({ type: 'smallint', name: 'risk_score' })
  riskScore!: number;

  @Column({ type: 'text', name: 'executive_summary' })
  executiveSummary!: string;

  @Column({ type: 'text' })
  narrative!: string;

  @Column({ type: 'jsonb', name: 'detected_patterns', default: [] })
  detectedPatterns!: string[];

  @Column({ type: 'jsonb', default: [] })
  recommendations!: string[];

  @Column({
    type: 'varchar',
    length: 64,
    name: 'model_label',
    default: 'gemini-mock',
  })
  modelLabel!: string;

  @Column({ type: 'timestamptz', name: 'interpreted_at' })
  interpretedAt!: Date;

  @Column({ type: 'real', nullable: true })
  confidence!: number | null;

  /**
   * Reporte ejecutivo definitivo (contrato cunmark.intelligence.v2).
   * Nullable por compatibilidad con interpretaciones previas al Sprint 12.
   */
  @Column({
    type: 'jsonb',
    name: 'executive_report',
    nullable: true,
    default: null,
  })
  executiveReport!: ExecutiveIntelligenceReport | null;

  @OneToMany(
    () => OperationalIndicator,
    (indicator) => indicator.interpretation,
    { cascade: true, eager: true },
  )
  suggestedIndicators!: OperationalIndicator[];
}
