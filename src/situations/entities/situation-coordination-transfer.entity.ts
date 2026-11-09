import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  SituationReportKind,
  SituationStatus,
} from '../../common/enums/situation.enums';
import { Coordination } from '../../coordinations/entities/coordination.entity';
import { User } from '../../users/entities/user.entity';
import { Situation } from './situation.entity';

/**
 * TRASLADO ADMINISTRATIVO de la coordinación responsable (Fase 01B.1).
 * Append-only; una situación puede tener varios traslados en su historia.
 */
@Entity({ name: 'situation_coordination_transfers' })
@Index('idx_situation_coordination_transfers_situation', [
  'situationId',
  'transferredAt',
])
export class SituationCoordinationTransfer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Situation, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'situation_id' })
  situation!: Situation;

  @Column({ type: 'uuid', name: 'situation_id' })
  situationId!: string;

  /** Responsable anterior. Nulo solo en registros históricos sin responsable. */
  @ManyToOne(() => Coordination, { nullable: true })
  @JoinColumn({ name: 'from_coordination_id' })
  fromCoordination!: Coordination | null;

  @Column({ type: 'uuid', name: 'from_coordination_id', nullable: true })
  fromCoordinationId!: string | null;

  @ManyToOne(() => Coordination, { nullable: false })
  @JoinColumn({ name: 'to_coordination_id' })
  toCoordination!: Coordination;

  @Column({ type: 'uuid', name: 'to_coordination_id' })
  toCoordinationId!: string;

  @Column({ type: 'uuid', name: 'previous_assigned_user_id', nullable: true })
  previousAssignedUserId!: string | null;

  @Column({ type: 'uuid', name: 'next_assigned_user_id', nullable: true })
  nextAssignedUserId!: string | null;

  @Column({ type: 'text' })
  reason!: string;

  @Column({
    type: 'enum',
    enum: SituationStatus,
    enumName: 'situations_status_enum',
    name: 'status_at_transfer',
  })
  statusAtTransfer!: SituationStatus;

  @Column({
    type: 'enum',
    enum: SituationReportKind,
    enumName: 'situations_report_kind_enum',
    name: 'report_kind',
  })
  reportKind!: SituationReportKind;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'transferred_by_user_id' })
  transferredByUser!: User;

  @Column({ type: 'uuid', name: 'transferred_by_user_id' })
  transferredByUserId!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'transferred_at' })
  transferredAt!: Date;
}
