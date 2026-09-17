import { Injectable } from '@nestjs/common';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { Situation } from '../entities/situation.entity';
import { ListSituationsQueryDto } from '../dto/situation.dto';

/**
 * Filtros efectivos de búsqueda. Extiende el DTO público con la autoría, que
 * el SERVICIO resuelve desde el actor autenticado y el cliente no puede enviar.
 */
export type SituationSearchFilters = ListSituationsQueryDto & {
  createdByUserId?: string;
};

@Injectable()
export class SituationsRepository extends Repository<Situation> {
  constructor(private readonly dataSource: DataSource) {
    super(Situation, dataSource.createEntityManager());
  }

  async search(query: SituationSearchFilters): Promise<[Situation[], number]> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const qb = this.createFilteredQuery(query)
      .orderBy('situation.occurredAt', 'DESC')
      .addOrderBy('situation.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    return qb.getManyAndCount();
  }

  findByIdWithRelations(id: string): Promise<Situation | null> {
    return this.findOne({
      where: { id },
      relations: {
        coordination: true,
        createdByUser: true,
        assignedUser: true,
        category: true,
        relatedCoordinations: {
          coordination: true,
        },
        // El aprendizaje viaja con el detalle: la UI no debe pedirlo aparte.
        resolution: true,
      },
      order: {
        relatedCoordinations: {
          displayOrder: 'ASC',
        },
      },
    });
  }

  private createFilteredQuery(
    query: SituationSearchFilters,
  ): SelectQueryBuilder<Situation> {
    const qb = this.createQueryBuilder('situation')
      .leftJoinAndSelect('situation.coordination', 'coordination')
      .leftJoinAndSelect('situation.createdByUser', 'createdByUser')
      .leftJoinAndSelect('situation.assignedUser', 'assignedUser')
      .leftJoinAndSelect('situation.category', 'category')
      .leftJoinAndSelect(
        'situation.relatedCoordinations',
        'relatedCoordinations',
      )
      .leftJoinAndSelect(
        'relatedCoordinations.coordination',
        'relatedCoordination',
      )
      // LEFT JOIN, no INNER: los problemas activos y los cerrados sin
      // aprendizaje deben seguir apareciendo en el listado.
      .leftJoinAndSelect('situation.resolution', 'resolution')
      .leftJoinAndSelect('resolution.resolvedByUser', 'resolvedByUser');

    if (query.status) {
      qb.andWhere('situation.status = :status', { status: query.status });
    }

    if (query.severity) {
      qb.andWhere('situation.severity = :severity', {
        severity: query.severity,
      });
    }

    if (query.coordinationId) {
      qb.andWhere('situation.coordinationId = :coordinationId', {
        coordinationId: query.coordinationId,
      });
    }

    /*
     * AUTORÍA. `createdByUserId` NO viene del DTO de consulta: lo inyecta el
     * servicio a partir de `actor.sub` cuando la petición pide «mis reportes».
     * Por eso el tipo del parámetro lo añade el servicio y no el cliente.
     */
    if (query.createdByUserId) {
      qb.andWhere('situation.createdByUserId = :createdByUserId', {
        createdByUserId: query.createdByUserId,
      });
    }

    if (query.categoryId) {
      qb.andWhere('situation.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }

    if (query.occurredFrom) {
      qb.andWhere('situation.occurredAt >= :occurredFrom', {
        occurredFrom: new Date(query.occurredFrom),
      });
    }

    if (query.occurredTo) {
      qb.andWhere('situation.occurredAt <= :occurredTo', {
        occurredTo: new Date(query.occurredTo),
      });
    }

    return qb;
  }
}
