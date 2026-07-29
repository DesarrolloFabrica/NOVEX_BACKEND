import { Injectable } from '@nestjs/common';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { Situation } from '../entities/situation.entity';
import { ListSituationsQueryDto } from '../dto/situation.dto';

@Injectable()
export class SituationsRepository extends Repository<Situation> {
  constructor(private readonly dataSource: DataSource) {
    super(Situation, dataSource.createEntityManager());
  }

  async search(
    query: ListSituationsQueryDto,
  ): Promise<[Situation[], number]> {
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
      },
    });
  }

  private createFilteredQuery(
    query: ListSituationsQueryDto,
  ): SelectQueryBuilder<Situation> {
    const qb = this.createQueryBuilder('situation')
      .leftJoinAndSelect('situation.coordination', 'coordination')
      .leftJoinAndSelect('situation.createdByUser', 'createdByUser')
      .leftJoinAndSelect('situation.assignedUser', 'assignedUser')
      .leftJoinAndSelect('situation.category', 'category');

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
