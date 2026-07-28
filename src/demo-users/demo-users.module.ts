import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DemoUsersController } from './demo-users.controller';
import { DemoUsersService } from './demo-users.service';
import { DemoUser } from './entities/demo-user.entity';
import { DemoUsersRepository } from './repositories/demo-users.repository';

@Module({
  imports: [TypeOrmModule.forFeature([DemoUser])],
  controllers: [DemoUsersController],
  providers: [DemoUsersService, DemoUsersRepository],
  exports: [DemoUsersService],
})
export class DemoUsersModule {}
