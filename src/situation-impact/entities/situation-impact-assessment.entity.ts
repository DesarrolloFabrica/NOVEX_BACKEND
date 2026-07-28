import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { OperationalSeverity } from '../../common/enums/situation-impact.enums';
import { Situation } from '../../situations/entities/situation.entity';
import { SituationAffectedCoordination } from './situation-affected-coordination.entity';

@Entity({ name: 'situation_impact_assessments' })
export class SituationImpactAssessment extends BaseEntity {
  @OneToOne(() => Situation, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'situation_id' })
  situation!: Situation;

  @Index({ unique: true })
  @Column({ type: 'uuid', name: 'situation_id' })
  situationId!: string;

  @Column({
    type: 'enum',
    enum: OperationalSeverity,
    name: 'operational_severity',
  })
  operationalSeverity!: OperationalSeverity;

  @Column({ type: 'numeric', precision: 5, scale: 4 })
  confidence!: string;

  @Column({ type: 'int', name: 'estimated_duration_minutes' })
  estimatedDurationMinutes!: number;

  @Column({ type: 'text' })
  summary!: string;

  @Column({ type: 'text' })
  reasoning!: string;

  @OneToMany(
    () => SituationAffectedCoordination,
    (affectedCoordination) => affectedCoordination.impactAssessment,
    { cascade: true },
  )
  affectedCoordinations!: SituationAffectedCoordination[];
}
