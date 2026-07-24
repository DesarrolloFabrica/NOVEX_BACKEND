import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { AIInterpretation } from '../../intelligence/entities/ai-interpretation.entity';

/**
 * IncidentCategory — taxonomía cerrada de problemas operacionales.
 * Necesaria para persistir interpretaciones alineadas al frontend.
 */
@Entity({ name: 'incident_categories' })
export class IncidentCategory extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @OneToMany(() => AIInterpretation, (interpretation) => interpretation.category)
  interpretations!: AIInterpretation[];
}
