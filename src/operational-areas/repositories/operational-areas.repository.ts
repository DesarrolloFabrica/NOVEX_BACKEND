import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { OperationalArea } from '../entities/operational-area.entity';

@Injectable()
export class OperationalAreasRepository extends Repository<OperationalArea> {
  constructor(private readonly dataSource: DataSource) {
    super(OperationalArea, dataSource.createEntityManager());
  }

  findCatalog(includeGlobal = true): Promise<OperationalArea[]> {
    const qb = this.createQueryBuilder('area').orderBy('area.name', 'ASC');
    if (!includeGlobal) {
      qb.andWhere('area.isGlobal = false');
    }
    return qb.getMany();
  }
}
