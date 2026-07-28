import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EvidenceType } from '../../common/enums/situation-evidence.enums';
import { Situation } from '../../situations/entities/situation.entity';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'situation_evidences' })
export class SituationEvidence {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Situation, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'situation_id' })
  situation!: Situation;

  @Index()
  @Column({ type: 'uuid', name: 'situation_id' })
  situationId!: string;

  @ManyToOne(() => User, { nullable: false, eager: true })
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploadedByUser!: User;

  @Index()
  @Column({ type: 'uuid', name: 'uploaded_by_user_id' })
  uploadedByUserId!: string;

  @Index()
  @Column({
    type: 'enum',
    enum: EvidenceType,
  })
  type!: EvidenceType;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'varchar', length: 255, name: 'file_name', nullable: true })
  fileName!: string | null;

  @Column({ type: 'varchar', length: 500, name: 'storage_path', nullable: true })
  storagePath!: string | null;

  @Column({ type: 'varchar', length: 127, name: 'mime_type', nullable: true })
  mimeType!: string | null;

  @Column({ type: 'bigint', name: 'file_size', nullable: true })
  fileSize!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
