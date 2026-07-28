import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { CoordinationDependency } from '../entities/coordination-dependency.entity';

@Injectable()
export class CoordinationDependenciesRepository extends Repository<CoordinationDependency> {
  constructor(private readonly dataSource: DataSource) {
    super(CoordinationDependency, dataSource.createEntityManager());
  }

  findCatalog(): Promise<CoordinationDependency[]> {
    return this.find({
      order: {
        sourceCoordinationId: 'ASC',
        targetCoordinationId: 'ASC',
      },
    });
  }
}
