import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { UserStatus } from '../../common/enums/identity.enums';
import { User } from '../entities/user.entity';

@Injectable()
export class UsersRepository extends Repository<User> {
  constructor(private readonly dataSource: DataSource) {
    super(User, dataSource.createEntityManager());
  }

  findCatalog(includeInactive = false, status?: UserStatus): Promise<User[]> {
    const qb = this.createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('user.coordination', 'coordination')
      .orderBy('user.fullName', 'ASC');

    if (status) {
      qb.andWhere('user.status = :status', { status });
    } else if (!includeInactive) {
      qb.andWhere('user.status = :status', { status: UserStatus.ACTIVE });
    }

    return qb.getMany();
  }

  findByIdWithRelations(id: string): Promise<User | null> {
    return this.findOne({
      where: { id },
      relations: { role: true, coordination: true },
    });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('user.coordination', 'coordination')
      .where('LOWER(user.email) = :email', {
        email: email.trim().toLowerCase(),
      })
      .getOne();
  }
}
