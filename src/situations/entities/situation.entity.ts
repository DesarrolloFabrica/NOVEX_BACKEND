import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import {
  SituationSeverity,
  SituationStatus,
} from '../../common/enums/situation.enums';
import { Coordination } from '../../coordinations/entities/coordination.entity';
import { IncidentCategory } from '../../intelligence/entities/incident-category.entity';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'situations' })
export class Situation extends BaseEntity {
  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @ManyToOne(() => Coordination, { nullable: false, eager: true })
  @JoinColumn({ name: 'coordination_id' })
  coordination!: Coordination;

  @Index()
  @Column({ type: 'uuid', name: 'coordination_id' })
  coordinationId!: string;

  @ManyToOne(() => User, { nullable: false, eager: true })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser!: User;

  @Index()
  @Column({ type: 'uuid', name: 'created_by_user_id' })
  createdByUserId!: string;

  @ManyToOne(() => IncidentCategory, { nullable: false, eager: true })
  @JoinColumn({ name: 'category_id' })
  category!: IncidentCategory;

  @Index()
  @Column({ type: 'uuid', name: 'category_id' })
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

  @Index()
  @Column({ type: 'timestamptz', name: 'occurred_at' })
  occurredAt!: Date;
}
