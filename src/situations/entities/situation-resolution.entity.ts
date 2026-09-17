import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { Situation } from './situation.entity';
import { User } from '../../users/entities/user.entity';

/**
 * APRENDIZAJE DE LA RESOLUCIÓN: almacenamiento propio y persistente.
 *
 * Existe como tabla aparte —y no como una columna más de `situations`— por tres
 * razones de dominio:
 *
 *   1. SEMÁNTICA PROPIA. `situations.last_status_comment` es el comentario de la
 *      ÚLTIMA transición y se sobrescribe en cada cambio de estado; el
 *      aprendizaje es un registro definitivo del cierre. Guardarlos en el mismo
 *      campo haría que la siguiente transición lo destruyera.
 *   2. AUSENCIA LEGÍTIMA. Las situaciones cerradas antes de esta fase no tienen
 *      aprendizaje y deben seguir siendo válidas. Una fila ausente expresa eso
 *      sin inventar texto; una columna NOT NULL habría obligado a rellenarlas.
 *   3. CONCURRENCIA. `situation_id` es la CLAVE PRIMARIA, de modo que la propia
 *      base de datos garantiza que una situación tenga como máximo una
 *      resolución. Dos peticiones simultáneas no pueden producir dos filas: la
 *      segunda viola la clave y se rechaza.
 *
 * `resolvedByUserId` es la identidad de QUIEN RESOLVIÓ, que no existía en el
 * dominio: `situations.created_by_user_id` es el autor del reporte y
 * `assigned_user_id` es el responsable de atención. La FECHA en cambio no se
 * duplica: se reutiliza `situations.resolved_at` / `closed_at`, que ya tienen
 * esa semántica.
 */
@Entity({ name: 'situation_resolutions' })
export class SituationResolution {
  /** 1:1 con la situación. Es PK: la unicidad la impone la base, no el código. */
  @PrimaryColumn({ type: 'uuid', name: 'situation_id' })
  situationId!: string;

  @OneToOne(() => Situation, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'situation_id' })
  situation!: Situation;

  /** Qué se aprendió. Nunca vacío: se valida recortado en el DTO y el servicio. */
  @Column({ type: 'text' })
  learning!: string;

  /** Quién resolvió. No es necesariamente el autor del reporte. */
  @ManyToOne(() => User, { nullable: false, eager: true })
  @JoinColumn({ name: 'resolved_by_user_id' })
  resolvedByUser!: User;

  @Index()
  @Column({ type: 'uuid', name: 'resolved_by_user_id' })
  resolvedByUserId!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
