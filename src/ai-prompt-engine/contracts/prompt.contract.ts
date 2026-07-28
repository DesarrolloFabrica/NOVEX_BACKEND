import type { PromptVersion } from '../enums/prompt-version.enum';

export interface PromptTemplateSection {
  key: string;
  title: string;
  body: string;
}

export interface PromptTemplate {
  id: string;
  version: PromptVersion;
  description: string;
  isActive: boolean;
  system: PromptTemplateSection[];
  context: PromptTemplateSection[];
  instructions: PromptTemplateSection[];
  outputFormat: PromptTemplateSection[];
}

export interface CompletePrompt {
  templateId: string;
  templateVersion: PromptVersion;
  systemPrompt: string;
  userPrompt: string;
  expectedSchema: string;
}

export interface PromptValidationResult {
  valid: boolean;
  warnings: string[];
}

export interface PromptMetrics {
  characters: number;
  estimatedTokens: number;
  evidenceCount: number;
  timelineCount: number;
  recommendationCount: number;
}

export interface PromptEngineResult {
  context: import('./situation-context.contract').SituationContext;
  prompt: CompletePrompt;
  metrics: PromptMetrics;
  validation: PromptValidationResult;
}
