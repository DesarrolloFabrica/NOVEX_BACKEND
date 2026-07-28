import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Role } from '../entities/role.entity';

@Injectable()
export class RolesRepository extends Repository<Role> {
  constructor(private readonly dataSource: DataSource) {
    super(Role, dataSource.createEntityManager());
  }

  findCatalog(includeInactive = false): Promise<Role[]> {
    const qb = this.createQueryBuilder('role').orderBy('role.name', 'ASC');

    if (!includeInactive) {
      qb.andWhere('role.isActive = :isActive', { isActive: true });
    }

    return qb.getMany();
  }
}
