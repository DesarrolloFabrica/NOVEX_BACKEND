import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ImpactLevel } from '../../common/enums/situation-impact.enums';
import { Coordination } from '../../coordinations/entities/coordination.entity';
import { SituationImpactAssessment } from './situation-impact-assessment.entity';

@Entity({ name: 'situation_affected_coordinations' })
@Unique('uq_situation_affected_coordination', [
  'impactAssessmentId',
  'coordinationId',
])
export class SituationAffectedCoordination {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => SituationImpactAssessment, (assessment) => assessment.affectedCoordinations, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'impact_assessment_id' })
  impactAssessment!: SituationImpactAssessment;

  @Index()
  @Column({ type: 'uuid', name: 'impact_assessment_id' })
  impactAssessmentId!: string;

  @ManyToOne(() => Coordination, { nullable: false, eager: true })
  @JoinColumn({ name: 'coordination_id' })
  coordination!: Coordination;

  @Index()
  @Column({ type: 'uuid', name: 'coordination_id' })
  coordinationId!: string;

  @Column({
    type: 'enum',
    enum: ImpactLevel,
    name: 'impact_level',
  })
  impactLevel!: ImpactLevel;

  @Column({ type: 'text' })
  description!: string;
}
