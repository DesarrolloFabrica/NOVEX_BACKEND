import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { AIInterpretation } from '../../intelligence/entities/ai-interpretation.entity';

/**
 * IncidentCategory — taxonomía de problemas operacionales.
 * isSelectable=false conserva códigos históricos fuera del formulario.
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

  @Column({ name: 'is_selectable', type: 'boolean', default: true })
  isSelectable!: boolean;

  @Column({ type: 'varchar', length: 32, default: 'apps' })
  icon!: string;

  @OneToMany(
    () => AIInterpretation,
    (interpretation) => interpretation.category,
  )
  interpretations!: AIInterpretation[];
}
