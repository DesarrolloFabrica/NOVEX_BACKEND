import type { AIAnalysisResult } from '../../ai-analysis/contracts/ai-analysis-result.contract';
import type { CompletePrompt } from '../../ai-prompt-engine/contracts/prompt.contract';

export interface CreateAnalysisSessionInput {
  situationId: string;
  provider: string;
  model: string;
  promptVersion: string;
  analysisResult: AIAnalysisResult;
  prompt: CompletePrompt;
  executionTimeMs: number;
  tokenEstimate: number;
}

export class AnalysisSessionSummaryDto {
  sessionId!: string;
  situationId!: string;
  analysisVersion!: number;
  isLatest!: boolean;
  provider!: string;
  model!: string;
  promptVersion!: string;
  confidence!: number;
  executionTimeMs!: number;
  tokenEstimate!: number;
  createdAt!: Date;
}

export class AnalysisSessionDetailDto extends AnalysisSessionSummaryDto {
  analysis!: AIAnalysisResult;
  /**
   * Prompt completo enviado al proveedor. Solo para ADMIN (Fase 01B.2): para
   * cualquier otro rol es null y `promptSnapshotWithheld` es true.
   */
  promptSnapshot!: string | null;
  promptSnapshotWithheld!: boolean;
}

export class AnalysisHistoryResponseDto {
  situationId!: string;
  items!: AnalysisSessionSummaryDto[];
  total!: number;
  latestVersion!: number | null;
}

export class CompareAnalysisQueryDto {
  fromVersion!: number;
  toVersion!: number;
}

export class AnalysisVersionComparisonDto {
  situationId!: string;
  fromVersion!: number;
  toVersion!: number;
  differences!: Record<string, unknown>;
}
