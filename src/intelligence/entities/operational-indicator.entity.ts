import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import {
  IndicatorDirection,
  IndicatorSource,
} from '../../common/enums/operational.enums';
import { AIInterpretation } from './ai-interpretation.entity';

/**
 * OperationalIndicator — KPI sugerido o materializado.
 * En esta fase se persiste como sugerencia ligada a una interpretación.
 */
@Entity({ name: 'operational_indicators' })
export class OperationalIndicator extends BaseEntity {
  @ManyToOne(
    () => AIInterpretation,
    (interpretation) => interpretation.suggestedIndicators,
    { onDelete: 'CASCADE', nullable: true },
  )
  @JoinColumn({ name: 'interpretation_id' })
  interpretation!: AIInterpretation | null;

  @Index()
  @Column({ type: 'uuid', name: 'interpretation_id', nullable: true })
  interpretationId!: string | null;

  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 180 })
  label!: string;

  @Column({ type: 'double precision' })
  value!: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  unit!: string | null;

  @Column({
    type: 'enum',
    enum: IndicatorDirection,
    nullable: true,
  })
  direction!: IndicatorDirection | null;

  @Column({ type: 'boolean', name: 'suggested_by_ai', default: true })
  suggestedByAI!: boolean;

  @Column({
    type: 'enum',
    enum: IndicatorSource,
    default: IndicatorSource.AI_SUGGESTED,
  })
  source!: IndicatorSource;
}
