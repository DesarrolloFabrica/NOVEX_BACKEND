import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Preferencias de usuario para demo/onboarding.
 * PK varchar alineada a IDs mock del frontend (user-supervisor, user-ejecutor-*).
 */
@Entity({ name: 'users' })
export class User {
  @PrimaryColumn({ type: 'varchar', length: 120 })
  id!: string;

  @Column({ type: 'varchar', length: 180 })
  name!: string;

  @Column({ type: 'varchar', length: 32 })
  role!: 'supervisor' | 'ejecutor';

  @Column({
    type: 'varchar',
    length: 120,
    name: 'selected_area_id',
    nullable: true,
  })
  selectedAreaId!: string | null;

  @Column({ type: 'boolean', name: 'onboarding_completed', default: false })
  onboardingCompleted!: boolean;

  @Column({
    type: 'timestamptz',
    name: 'onboarding_seen_at',
    nullable: true,
  })
  onboardingSeenAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
