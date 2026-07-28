import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { DemoUser } from '../entities/demo-user.entity';

@Injectable()
export class DemoUsersRepository extends Repository<DemoUser> {
  constructor(private readonly dataSource: DataSource) {
    super(DemoUser, dataSource.createEntityManager());
  }
}
