import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Coordination } from '../entities/coordination.entity';

@Injectable()
export class CoordinationsRepository extends Repository<Coordination> {
  constructor(private readonly dataSource: DataSource) {
    super(Coordination, dataSource.createEntityManager());
  }

  findCatalog(includeInactive = false): Promise<Coordination[]> {
    const qb = this.createQueryBuilder('coordination').orderBy(
      'coordination.displayOrder',
      'ASC',
    );

    if (!includeInactive) {
      qb.andWhere('coordination.isActive = :isActive', { isActive: true });
    }

    return qb.addOrderBy('coordination.name', 'ASC').getMany();
  }
}
