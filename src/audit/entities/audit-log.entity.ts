import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Registro append-only de trazabilidad institucional (sin UPDATE/DELETE desde la app). */
@Entity({ name: 'audit_logs' })
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'actor_user_id', nullable: true })
  actorUserId!: string | null;

  @Column({ type: 'varchar', length: 64, name: 'actor_role', nullable: true })
  actorRole!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 80 })
  action!: string;

  @Index()
  @Column({ type: 'varchar', length: 80, name: 'resource_type' })
  resourceType!: string;

  @Index()
  @Column({ type: 'varchar', length: 128, name: 'resource_id', nullable: true })
  resourceId!: string | null;

  @Column({ type: 'varchar', length: 64, name: 'request_id', nullable: true })
  requestId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Index()
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
