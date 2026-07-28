import { Injectable } from '@nestjs/common';
import type { PromptVersion } from './enums/prompt-version.enum';
import type { PromptEngineResult } from './contracts/prompt.contract';
import { SituationContextBuilder } from './builders/situation-context.builder';
import { PromptBuilder } from './builders/prompt.builder';
import { PromptValidator } from './validators/prompt.validator';
import { PromptMetricsCalculator } from './metrics/prompt.metrics';
import {
  getActivePromptTemplate,
  getPromptTemplateByVersion,
} from './templates/prompt-template.registry';

@Injectable()
export class AIPromptEngineService {
  constructor(
    private readonly contextBuilder: SituationContextBuilder,
    private readonly promptBuilder: PromptBuilder,
    private readonly promptValidator: PromptValidator,
    private readonly promptMetrics: PromptMetricsCalculator,
  ) {}

  async buildForSituation(
    situationId: string,
    version?: PromptVersion,
  ): Promise<PromptEngineResult> {
    const context = await this.contextBuilder.buildOperationalContext(situationId);
    const template = version
      ? (getPromptTemplateByVersion(version) ?? getActivePromptTemplate())
      : getActivePromptTemplate();

    const prompt = this.promptBuilder.buildCompletePrompt(context, template);
    const metrics = this.promptMetrics.calculate(context, prompt);
    const validation = this.promptValidator.validate(context, prompt, template);

    return {
      context,
      prompt,
      metrics,
      validation,
    };
  }
}
