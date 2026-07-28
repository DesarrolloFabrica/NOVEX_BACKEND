import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import {
  RecommendationPriority,
  RecommendationSource,
  RecommendationStatus,
} from '../../common/enums/situation-recommendation.enums';
import { Situation } from '../../situations/entities/situation.entity';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'situation_recommendations' })
export class SituationRecommendation extends BaseEntity {
  @ManyToOne(() => Situation, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'situation_id' })
  situation!: Situation;

  @Index()
  @Column({ type: 'uuid', name: 'situation_id' })
  situationId!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Index()
  @Column({
    type: 'enum',
    enum: RecommendationPriority,
  })
  priority!: RecommendationPriority;

  @Index()
  @Column({
    type: 'enum',
    enum: RecommendationStatus,
    default: RecommendationStatus.PENDING,
  })
  status!: RecommendationStatus;

  @Index()
  @Column({
    type: 'enum',
    enum: RecommendationSource,
    name: 'generated_by',
  })
  generatedBy!: RecommendationSource;

  @ManyToOne(() => User, { nullable: true, eager: true })
  @JoinColumn({ name: 'assigned_user_id' })
  assignedUser!: User | null;

  @Index()
  @Column({ type: 'uuid', name: 'assigned_user_id', nullable: true })
  assignedUserId!: string | null;

  @Column({ type: 'timestamptz', name: 'due_at', nullable: true })
  dueAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'text', name: 'execution_notes', nullable: true })
  executionNotes!: string | null;
}
