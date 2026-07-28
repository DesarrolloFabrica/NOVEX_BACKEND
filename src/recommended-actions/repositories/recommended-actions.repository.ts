import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { RecommendedActionExecutionStatus } from '../../common/enums/operational.enums';
import { RecommendedActionExecution } from '../entities/recommended-action-execution.entity';
import { ListRecommendedActionsQueryDto } from '../dto/recommended-action.dto';

@Injectable()
export class RecommendedActionsRepository extends Repository<RecommendedActionExecution> {
  constructor(private readonly dataSource: DataSource) {
    super(RecommendedActionExecution, dataSource.createEntityManager());
  }

  findByIdWithRelations(
    id: string,
  ): Promise<RecommendedActionExecution | null> {
    return this.findOne({
      where: { id },
      relations: {
        event: { sourceArea: true, timelineEntries: true },
        interpretation: { affectedAreas: true },
        suggestedArea: true,
      },
      order: {
        event: { timelineEntries: { at: 'ASC' } },
      },
    });
  }

  async search(
    query: ListRecommendedActionsQueryDto,
  ): Promise<[RecommendedActionExecution[], number]> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 100;

    const qb = this.createQueryBuilder('action')
      .leftJoinAndSelect('action.event', 'event')
      .leftJoinAndSelect('event.sourceArea', 'sourceArea')
      .leftJoinAndSelect('event.timelineEntries', 'timelineEntries')
      .leftJoinAndSelect('action.interpretation', 'interpretation')
      .leftJoinAndSelect('interpretation.affectedAreas', 'affectedAreas')
      .leftJoinAndSelect('action.suggestedArea', 'suggestedArea')
      .orderBy('action.createdAt', 'DESC')
      .addOrderBy('action.actionIndex', 'ASC')
      .addOrderBy('timelineEntries.at', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.areaId) {
      qb.andWhere('action.suggestedAreaId = :areaId', { areaId: query.areaId });
    }
    if (query.status) {
      qb.andWhere('action.executionStatus = :status', { status: query.status });
    }
    if (query.eventId) {
      qb.andWhere('action.eventId = :eventId', { eventId: query.eventId });
    }

    return qb.getManyAndCount();
  }

  countByStatuses(
    areaId?: string,
  ): Promise<
    Array<{ status: RecommendedActionExecutionStatus; count: string }>
  > {
    const qb = this.createQueryBuilder('action')
      .select('action.executionStatus', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('action.executionStatus');

    if (areaId) {
      qb.andWhere('action.suggestedAreaId = :areaId', { areaId });
    }

    return qb.getRawMany();
  }
}
