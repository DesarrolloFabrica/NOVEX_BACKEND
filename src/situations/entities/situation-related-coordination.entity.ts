import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Coordination } from '../../coordinations/entities/coordination.entity';
import { Situation } from './situation.entity';

@Entity({ name: 'situation_related_coordinations' })
@Unique('uq_situation_related_coordination', ['situationId', 'coordinationId'])
export class SituationRelatedCoordination {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Situation, (situation) => situation.relatedCoordinations, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'situation_id' })
  situation!: Situation;

  @Index()
  @Column({ type: 'uuid', name: 'situation_id' })
  situationId!: string;

  @ManyToOne(() => Coordination, { nullable: false, eager: true })
  @JoinColumn({ name: 'coordination_id' })
  coordination!: Coordination;

  @Index()
  @Column({ type: 'uuid', name: 'coordination_id' })
  coordinationId!: string;

  @Column({ type: 'int', name: 'display_order', default: 0 })
  displayOrder!: number;
}
