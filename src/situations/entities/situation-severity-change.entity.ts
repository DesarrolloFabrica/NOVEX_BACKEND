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
  SituationSeverity,
  SituationSeverityChangeSource,
} from '../../common/enums/situation.enums';
import { User } from '../../users/entities/user.entity';
import { Situation } from './situation.entity';

/**
 * HISTORIAL DE SEVERIDAD, append-only.
 *
 * Cada fila es un nivel que tuvo el problema y DESDE CUÁNDO rigió
 * (`effectiveAt`). `situations.severity` es solo la caché de la última fila;
 * `situations.reported_severity` es la primera (`REPORTED`).
 *
 * `effectiveAt` y `createdAt` son instantes distintos a propósito:
 *   effectiveAt  cuándo empieza a regir el nivel. En `AUTO_TIME` lo fija la
 *                regla de la política, no el momento en que el barrido lo vio.
 *   createdAt    cuándo lo registró el sistema. Puede ir por detrás de
 *                `effectiveAt` si el barrido se retrasó.
 *
 * La base garantiza (migración 1787700000000): una sola fila `REPORTED` por
 * situación, idempotencia de `AUTO_TIME` por `(situation_id, policy_code,
 * rule_key)`, que un escalamiento siempre sube y que ninguna fila se actualiza.
 */
@Entity({ name: 'situation_severity_changes' })
@Index('idx_situation_severity_changes_situation_effective', [
  'situationId',
  'effectiveAt',
])
export class SituationSeverityChange {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Situation, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'situation_id' })
  situation!: Situation;

  @Column({ type: 'uuid', name: 'situation_id' })
  situationId!: string;

  /** Nulo solo en la fila `REPORTED`. */
  @Column({
    type: 'enum',
    enum: SituationSeverity,
    enumName: 'situations_severity_enum',
    name: 'previous_severity',
    nullable: true,
  })
  previousSeverity!: SituationSeverity | null;

  @Column({
    type: 'enum',
    enum: SituationSeverity,
    enumName: 'situations_severity_enum',
    name: 'new_severity',
  })
  newSeverity!: SituationSeverity;

  @Column({
    type: 'enum',
    enum: SituationSeverityChangeSource,
    enumName: 'situation_severity_change_source_enum',
  })
  source!: SituationSeverityChangeSource;

  @Column({ type: 'timestamptz', name: 'effective_at' })
  effectiveAt!: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  /** Quien reportó en `REPORTED`; nulo en `AUTO_TIME` (lo hizo el sistema). */
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'actor_user_id' })
  actorUser!: User | null;

  @Column({ type: 'uuid', name: 'actor_user_id', nullable: true })
  actorUserId!: string | null;

  /** Política que produjo el paso. Obligatoria en `AUTO_TIME`. */
  @Column({ type: 'varchar', length: 40, name: 'policy_code', nullable: true })
  policyCode!: string | null;

  /** Paso de la política (`step-1`, `step-2`…). Obligatorio en `AUTO_TIME`. */
  @Column({ type: 'varchar', length: 40, name: 'rule_key', nullable: true })
  ruleKey!: string | null;
}
