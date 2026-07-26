import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { OperationalEvent } from '../entities/operational-event.entity';
import { ListOperationalEventsQueryDto } from '../dto/operational-event.dto';

@Injectable()
export class OperationalEventsRepository extends Repository<OperationalEvent> {
  constructor(private readonly dataSource: DataSource) {
    super(OperationalEvent, dataSource.createEntityManager());
  }

  findWithRelations(id: string): Promise<OperationalEvent | null> {
    return this.findOne({
      where: { id },
      relations: {
        sourceArea: true,
        timelineEntries: true,
        interpretations: {
          category: true,
          affectedAreas: true,
          suggestedIndicators: true,
        },
      },
      order: {
        timelineEntries: { at: 'ASC' },
      },
    });
  }

  /**
   * Listado base. Filtros avanzados se completarán al integrar el frontend.
   */
  async search(
    query: ListOperationalEventsQueryDto,
  ): Promise<[OperationalEvent[], number]> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const qb = this.createQueryBuilder('event')
      .leftJoinAndSelect('event.sourceArea', 'sourceArea')
      .leftJoinAndSelect('event.timelineEntries', 'timelineEntries')
      .leftJoinAndSelect('event.interpretations', 'interpretations')
      .leftJoinAndSelect('interpretations.category', 'category')
      .leftJoinAndSelect('interpretations.affectedAreas', 'affectedAreas')
      .leftJoinAndSelect(
        'interpretations.suggestedIndicators',
        'suggestedIndicators',
      )
      .orderBy('event.reportedAt', 'DESC')
      .addOrderBy('timelineEntries.at', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere('event.status = :status', { status: query.status });
    }
    if (query.sourceAreaId) {
      qb.andWhere('event.sourceAreaId = :sourceAreaId', {
        sourceAreaId: query.sourceAreaId,
      });
    }
    if (query.search?.trim()) {
      qb.andWhere(
        '(event.title ILIKE :q OR event.description ILIKE :q)',
        { q: `%${query.search.trim()}%` },
      );
    }

    return qb.getManyAndCount();
  }
}
