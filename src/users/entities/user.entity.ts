import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { UserStatus } from '../../common/enums/identity.enums';
import { Coordination } from '../../coordinations/entities/coordination.entity';
import { Role } from '../../roles/entities/role.entity';

@Entity({ name: 'users' })
export class User extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128, name: 'google_sub', nullable: true })
  googleSub!: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ type: 'varchar', length: 200, name: 'full_name' })
  fullName!: string;

  @Column({ type: 'varchar', length: 500, name: 'photo_url', nullable: true })
  photoUrl!: string | null;

  @ManyToOne(() => Role, (role) => role.users, { nullable: false, eager: true })
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @Index()
  @Column({ type: 'uuid', name: 'role_id' })
  roleId!: string;

  @ManyToOne(() => Coordination, { nullable: true, eager: true })
  @JoinColumn({ name: 'coordination_id' })
  coordination!: Coordination | null;

  @Index()
  @Column({ type: 'uuid', name: 'coordination_id', nullable: true })
  coordinationId!: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status!: UserStatus;

  @Column({ type: 'timestamptz', name: 'last_login_at', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ type: 'integer', name: 'onboarding_step', default: 0 })
  onboardingStep!: number;

  @Column({ type: 'boolean', name: 'onboarding_completed', default: false })
  onboardingCompleted!: boolean;

  @Column({ type: 'timestamptz', name: 'onboarding_seen_at', nullable: true })
  onboardingSeenAt!: Date | null;
}
