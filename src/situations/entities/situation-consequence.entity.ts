import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Situation } from './situation.entity';

/**
 * AFECTACIÓN de un problema INTERNAL: una consecuencia concreta que fue
 * produciendo mientras seguía sin resolver («No fue posible cargar archivos
 * pesados al repositorio»). En la interfaz se llaman «Afectaciones».
 *
 * Append-only: no hay `updated_at`, `deleted_at`, PATCH ni DELETE, y la base
 * rechaza cualquier UPDATE (trigger de la migración 1787900000000). Cerrar el
 * problema congela la colección.
 *
 * `description` es QUÉ CONSECUENCIA produjo; `situations.description` sigue
 * siendo QUÉ ES el problema. No se mezclan.
 *
 * La severidad vigente al ocurrir NO se guarda aquí: se deriva del historial
 * (`situation_severity_changes`, último `effective_at <= occurred_at`).
 */
@Entity({ name: 'situation_consequences' })
@Index('idx_situation_consequences_situation_occurred', [
  'situationId',
  'occurredAt',
])
export class SituationConsequence {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Situation, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'situation_id' })
  situation!: Situation;

  @Column({ type: 'uuid', name: 'situation_id' })
  situationId!: string;

  @Column({ type: 'text' })
  description!: string;

  /** Cuándo ocurrió la afectación; la declara el usuario. */
  @Column({ type: 'timestamptz', name: 'occurred_at' })
  occurredAt!: Date;

  /** Cuándo se registró en NOVEX. */
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser!: User;

  @Index()
  @Column({ type: 'uuid', name: 'created_by_user_id' })
  createdByUserId!: string;
}
