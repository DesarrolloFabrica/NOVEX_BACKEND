import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { OperationalEvent } from '../../operational-events/entities/operational-event.entity';

/**
 * OperationalArea — catálogo institucional de áreas.
 * Soporta el agregador global (isGlobal) y áreas operativas.
 */
@Entity({ name: 'operational_areas' })
export class OperationalArea extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  code!: string;

  @Column({ type: 'varchar', length: 180 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'boolean', name: 'is_global', default: false })
  isGlobal!: boolean;

  @OneToMany(() => OperationalEvent, (event) => event.sourceArea)
  sourcedEvents!: OperationalEvent[];
}
