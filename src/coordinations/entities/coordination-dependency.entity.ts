import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { CoordinationDependencyType } from '../../common/enums/coordination.enums';
import { Coordination } from './coordination.entity';

@Entity({ name: 'coordination_dependencies' })
@Unique('uq_coordination_dependency_edge', [
  'sourceCoordinationId',
  'targetCoordinationId',
])
export class CoordinationDependency extends BaseEntity {
  @ManyToOne(
    () => Coordination,
    (coordination) => coordination.outgoingDependencies,
    {
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'source_coordination_id' })
  sourceCoordination!: Coordination;

  @Index()
  @Column({ type: 'uuid', name: 'source_coordination_id' })
  sourceCoordinationId!: string;

  @ManyToOne(
    () => Coordination,
    (coordination) => coordination.incomingDependencies,
    {
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'target_coordination_id' })
  targetCoordination!: Coordination;

  @Index()
  @Column({ type: 'uuid', name: 'target_coordination_id' })
  targetCoordinationId!: string;

  @Column({ type: 'smallint', name: 'dependency_weight', default: 3 })
  dependencyWeight!: number;

  @Column({
    type: 'enum',
    enum: CoordinationDependencyType,
    name: 'dependency_type',
    default: CoordinationDependencyType.OPERATIONAL,
  })
  dependencyType!: CoordinationDependencyType;

  @Column({ type: 'boolean', default: false })
  bidirectional!: boolean;
}
