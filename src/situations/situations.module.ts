import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { IncidentCategory } from '../intelligence/entities/incident-category.entity';
import { SituationTimelineModule } from '../situation-timeline/situation-timeline.module';
import { User } from '../users/entities/user.entity';
import { Situation } from './entities/situation.entity';
import { SituationRelatedCoordination } from './entities/situation-related-coordination.entity';
import { SituationsRepository } from './repositories/situations.repository';
import { SituationsController } from './situations.controller';
import { SituationAccessService } from './situation-access.service';
import { SituationSlaScheduler } from './situation-sla.scheduler';
import { SituationsService } from './situations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Situation,
      SituationRelatedCoordination,
      Coordination,
      IncidentCategory,
      User,
    ]),
    AuthModule,
    forwardRef(() => SituationTimelineModule),
  ],
  controllers: [SituationsController],
  providers: [
    SituationsService,
    SituationsRepository,
    SituationAccessService,
    SituationSlaScheduler,
  ],
  exports: [
    SituationsService,
    SituationsRepository,
    SituationAccessService,
    TypeOrmModule,
  ],
})
export class SituationsModule {}
