import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { SituationImpactModule } from '../situation-impact/situation-impact.module';
import { SituationRecommendationsModule } from '../situation-recommendations/situation-recommendations.module';
import { SituationTimelineModule } from '../situation-timeline/situation-timeline.module';
import { AIAnalysisService } from './ai-analysis.service';
import { AIAnalysisMapper } from './mappers/ai-analysis.mapper';
import { AIAnalysisParser } from './parsers/ai-analysis.parser';

@Module({
  imports: [
    TypeOrmModule.forFeature([Coordination]),
    SituationImpactModule,
    SituationRecommendationsModule,
    SituationTimelineModule,
  ],
  providers: [AIAnalysisService, AIAnalysisParser, AIAnalysisMapper],
  exports: [AIAnalysisService, AIAnalysisParser, AIAnalysisMapper],
})
export class AIAnalysisModule {}
