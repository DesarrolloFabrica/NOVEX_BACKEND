import { Module } from '@nestjs/common';
import { SituationEvidenceModule } from '../situation-evidence/situation-evidence.module';
import { SituationImpactModule } from '../situation-impact/situation-impact.module';
import { SituationRecommendationsModule } from '../situation-recommendations/situation-recommendations.module';
import { SituationTimelineModule } from '../situation-timeline/situation-timeline.module';
import { SituationsModule } from '../situations/situations.module';
import { AIPromptEngineService } from './ai-prompt-engine.service';
import { PromptBuilder } from './builders/prompt.builder';
import { SituationContextBuilder } from './builders/situation-context.builder';
import { PromptMetricsCalculator } from './metrics/prompt.metrics';
import { PromptValidator } from './validators/prompt.validator';

@Module({
  imports: [
    SituationsModule,
    SituationTimelineModule,
    SituationEvidenceModule,
    SituationRecommendationsModule,
    SituationImpactModule,
  ],
  providers: [
    AIPromptEngineService,
    SituationContextBuilder,
    PromptBuilder,
    PromptValidator,
    PromptMetricsCalculator,
  ],
  exports: [
    AIPromptEngineService,
    SituationContextBuilder,
    PromptBuilder,
    PromptValidator,
    PromptMetricsCalculator,
  ],
})
export class AIPromptEngineModule {}
