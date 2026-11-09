import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryColumn,
} from 'typeorm';
import { SituationStatus } from '../../common/enums/situation.enums';
import { User } from '../../users/entities/user.entity';
import { Situation } from './situation.entity';

/**
 * ANULACIÓN de una situación (Fase 01B.1). Registro administrativo
 * append-only: una fila por situación (la clave primaria es la situación, así
 * que una segunda anulación es imposible incluso ante una carrera). La
 * situación, su autor, su historial y sus registros vinculados se conservan.
 */
@Entity({ name: 'situation_cancellations' })
export class SituationCancellation {
  @PrimaryColumn({ type: 'uuid', name: 'situation_id' })
  situationId!: string;

  @OneToOne(() => Situation, (situation) => situation.cancellation, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'situation_id' })
  situation!: Situation;

  /** Motivo obligatorio (10..1000 caracteres tras recortar). */
  @Column({ type: 'text' })
  reason!: string;

  /** Estado del caso justo antes de anularlo. */
  @Column({
    type: 'enum',
    enum: SituationStatus,
    enumName: 'situations_status_enum',
    name: 'previous_status',
  })
  previousStatus!: SituationStatus;

  @ManyToOne(() => User, { nullable: false, eager: true })
  @JoinColumn({ name: 'cancelled_by_user_id' })
  cancelledByUser!: User;

  @Index()
  @Column({ type: 'uuid', name: 'cancelled_by_user_id' })
  cancelledByUserId!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'cancelled_at' })
  cancelledAt!: Date;
}
