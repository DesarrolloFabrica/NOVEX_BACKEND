import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { RbacModule } from '../rbac/rbac.module';
import { Role } from '../roles/entities/role.entity';
import { User } from './entities/user.entity';
import { UsersRepository } from './repositories/users.repository';
import { DevelopmentUserSeedService } from './seeds/development-user-seed.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Role, Coordination]), RbacModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository, DevelopmentUserSeedService],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
