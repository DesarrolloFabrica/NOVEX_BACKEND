import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIAnalysisSessionsModule } from '../ai-analysis-sessions/ai-analysis-sessions.module';
import { AIAnalysisModule } from '../ai-analysis/ai-analysis.module';
import { AIPromptEngineModule } from '../ai-prompt-engine/ai-prompt-engine.module';
import { AuthModule } from '../auth/auth.module';
import { SituationImpactModule } from '../situation-impact/situation-impact.module';
import { SituationRecommendationsModule } from '../situation-recommendations/situation-recommendations.module';
import { SituationTimelineModule } from '../situation-timeline/situation-timeline.module';
import { SituationsModule } from '../situations/situations.module';
import { AIOrchestrationController } from './ai-orchestration.controller';
import { AIOrchestrator } from './ai-orchestrator.service';
import { SituationAIAnalysisRecord } from './entities/situation-ai-analysis-record.entity';
import { GeminiProvider, geminiProviderBinding } from './providers/gemini.provider';
import { SituationAIAnalysisRecordRepository } from './repositories/situation-ai-analysis-record.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([SituationAIAnalysisRecord]),
    AuthModule,
    SituationsModule,
    AIPromptEngineModule,
    AIAnalysisModule,
    AIAnalysisSessionsModule,
    SituationImpactModule,
    SituationRecommendationsModule,
    SituationTimelineModule,
  ],
  controllers: [AIOrchestrationController],
  providers: [
    AIOrchestrator,
    GeminiProvider,
    geminiProviderBinding,
    SituationAIAnalysisRecordRepository,
  ],
  exports: [AIOrchestrator, GeminiProvider, geminiProviderBinding],
})
export class AIOrchestrationModule {}
