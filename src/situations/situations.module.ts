import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { IncidentCategory } from '../intelligence/entities/incident-category.entity';
import { Situation } from './entities/situation.entity';
import { SituationsRepository } from './repositories/situations.repository';
import { SituationsController } from './situations.controller';
import { SituationsService } from './situations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Situation, Coordination, IncidentCategory]),
    AuthModule,
  ],
  controllers: [SituationsController],
  providers: [SituationsService, SituationsRepository],
  exports: [SituationsService, SituationsRepository],
})
export class SituationsModule {}
