import type { AIAnalysisResult } from './ai-analysis-result.contract';

export interface AIProviderAnalyzeInput {
  situationId: string;
  title: string;
  description: string;
}

export interface AIProviderHealthStatus {
  ok: boolean;
  message?: string;
}

export interface AIProvider {
  readonly name: string;
  health(): Promise<AIProviderHealthStatus>;
  analyzeSituation(input: AIProviderAnalyzeInput): Promise<AIAnalysisResult>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');
