import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIAnalysisComparisonService } from './ai-analysis-comparison.service';
import { AIAnalysisSessionsController } from './ai-analysis-sessions.controller';
import { AIAnalysisSessionsService } from './ai-analysis-sessions.service';
import { SituationAnalysisSession } from './entities/situation-analysis-session.entity';
import { SituationAnalysisSessionRepository } from './repositories/situation-analysis-session.repository';

@Module({
  imports: [TypeOrmModule.forFeature([SituationAnalysisSession])],
  controllers: [AIAnalysisSessionsController],
  providers: [
    AIAnalysisSessionsService,
    AIAnalysisComparisonService,
    SituationAnalysisSessionRepository,
  ],
  exports: [
    AIAnalysisSessionsService,
    AIAnalysisComparisonService,
    SituationAnalysisSessionRepository,
  ],
})
export class AIAnalysisSessionsModule {}
