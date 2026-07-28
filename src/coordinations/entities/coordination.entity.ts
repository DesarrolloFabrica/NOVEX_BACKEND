import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { CoordinationDependency } from './coordination-dependency.entity';

@Entity({ name: 'coordinations' })
export class Coordination extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 180 })
  name!: string;

  @Column({ type: 'varchar', length: 80, name: 'short_name' })
  shortName!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 16 })
  color!: string;

  @Column({ type: 'varchar', length: 64 })
  icon!: string;

  @Column({ type: 'varchar', length: 120, name: 'image_asset' })
  imageAsset!: string;

  @Index()
  @Column({ type: 'smallint', name: 'display_order', default: 0 })
  displayOrder!: number;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @OneToMany(
    () => CoordinationDependency,
    (dependency) => dependency.sourceCoordination,
  )
  outgoingDependencies!: CoordinationDependency[];

  @OneToMany(
    () => CoordinationDependency,
    (dependency) => dependency.targetCoordination,
  )
  incomingDependencies!: CoordinationDependency[];
}
