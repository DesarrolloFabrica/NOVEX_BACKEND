import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Permission } from '../entities/permission.entity';

@Injectable()
export class PermissionsRepository extends Repository<Permission> {
  constructor(private readonly dataSource: DataSource) {
    super(Permission, dataSource.createEntityManager());
  }

  findCatalog(): Promise<Permission[]> {
    return this.find({
      order: { module: 'ASC', code: 'ASC' },
    });
  }

  findByCode(code: string): Promise<Permission | null> {
    return this.findOne({ where: { code } });
  }

  findByCodes(codes: readonly string[]): Promise<Permission[]> {
    if (codes.length === 0) {
      return Promise.resolve([]);
    }

    return this.createQueryBuilder('permission')
      .where('permission.code IN (:...codes)', { codes })
      .orderBy('permission.module', 'ASC')
      .addOrderBy('permission.code', 'ASC')
      .getMany();
  }
}
