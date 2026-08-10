import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OperationalAreasModule } from '../operational-areas/operational-areas.module';
import { OperationalEventsModule } from '../operational-events/operational-events.module';
import { RecommendedActionExecution } from './entities/recommended-action-execution.entity';
import { RecommendedActionsService } from './recommended-actions.service';
import { RecommendedActionsRepository } from './repositories/recommended-actions.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([RecommendedActionExecution]),
    OperationalEventsModule,
    OperationalAreasModule,
  ],
  controllers: [],
  providers: [RecommendedActionsService, RecommendedActionsRepository],
  exports: [RecommendedActionsService, RecommendedActionsRepository],
})
export class RecommendedActionsModule {}
