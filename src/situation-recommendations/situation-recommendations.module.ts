import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SituationsModule } from '../situations/situations.module';
import { Situation } from '../situations/entities/situation.entity';
import { SituationTimelineModule } from '../situation-timeline/situation-timeline.module';
import { User } from '../users/entities/user.entity';
import { SituationRecommendation } from './entities/situation-recommendation.entity';
import { SituationRecommendationsRepository } from './repositories/situation-recommendations.repository';
import {
  SituationRecommendationsBySituationController,
  SituationRecommendationsController,
} from './situation-recommendations.controller';
import { SituationRecommendationsService } from './situation-recommendations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SituationRecommendation, Situation, User]),
    AuthModule,
    SituationsModule,
    SituationTimelineModule,
  ],
  controllers: [
    SituationRecommendationsBySituationController,
    SituationRecommendationsController,
  ],
  providers: [SituationRecommendationsService, SituationRecommendationsRepository],
  exports: [SituationRecommendationsService, SituationRecommendationsRepository],
})
export class SituationRecommendationsModule {}
