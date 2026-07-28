import { Injectable } from '@nestjs/common';
import type { SituationContext } from '../contracts/situation-context.contract';
import type { CompletePrompt, PromptMetrics } from '../contracts/prompt.contract';

const CHARACTERS_PER_TOKEN_ESTIMATE = 4;

@Injectable()
export class PromptMetricsCalculator {
  calculate(context: SituationContext, prompt: CompletePrompt): PromptMetrics {
    const characters = prompt.systemPrompt.length + prompt.userPrompt.length;

    return {
      characters,
      estimatedTokens: Math.ceil(characters / CHARACTERS_PER_TOKEN_ESTIMATE),
      evidenceCount: context.evidences.length,
      timelineCount: context.timeline.length,
      recommendationCount: context.existingRecommendations.length,
    };
  }
}
