import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import type { AIAnalysisResult } from '../../ai-analysis/contracts/ai-analysis-result.contract';
import {
  AI_PROVIDER,
  type AIProvider,
  type AIProviderAnalyzeInput,
  type AIProviderHealthStatus,
} from '../../ai-analysis/contracts/ai-provider.contract';
import { AIAnalysisParser } from '../../ai-analysis/parsers/ai-analysis.parser';
import type { SituationContext } from '../../ai-prompt-engine/contracts/situation-context.contract';
import type { CompletePrompt } from '../../ai-prompt-engine/contracts/prompt.contract';
import { AIPromptEngineService } from '../../ai-prompt-engine/ai-prompt-engine.service';
import { AI_ANALYSIS_RESPONSE_JSON_SCHEMA } from '../../ai-analysis/schemas/ai-analysis-response.schema';

@Injectable()
export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';

  private readonly logger = new Logger(GeminiProvider.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly parser: AIAnalysisParser,
    private readonly promptEngine: AIPromptEngineService,
  ) {}

  async health(): Promise<AIProviderHealthStatus> {
    const apiKey = this.getApiKey();
    const model = this.getModel();

    if (!apiKey) {
      return {
        ok: false,
        message: 'GEMINI_API_KEY no está configurada.',
      };
    }

    return {
      ok: true,
      message: `Gemini configurado (modelo: ${model}).`,
    };
  }

  async analyzeSituation(
    input: AIProviderAnalyzeInput,
  ): Promise<AIAnalysisResult> {
    const built = await this.promptEngine.buildForSituation(input.situationId);
    return this.executeAnalysis(built.context, built.prompt);
  }

  async executeAnalysis(
    context: SituationContext,
    prompt: CompletePrompt,
  ): Promise<AIAnalysisResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'GEMINI_API_KEY no está configurada.',
      );
    }

    const model = this.getModel();
    const client = new GoogleGenAI({ apiKey });

    this.logger.debug(
      `Invocando Gemini model=${model} situationId=${context.situationId}`,
    );

    const response = await client.models.generateContent({
      model,
      contents: prompt.userPrompt,
      config: {
        systemInstruction: prompt.systemPrompt,
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseJsonSchema: AI_ANALYSIS_RESPONSE_JSON_SCHEMA,
      },
    });

    const rawText = response.text?.trim();
    if (!rawText) {
      throw new ServiceUnavailableException(
        'Gemini devolvió una respuesta vacía.',
      );
    }

    const analysis = this.parseWithRetry(rawText);
    return {
      ...analysis,
      provider: this.name,
      analyzedAt: analysis.analyzedAt ?? new Date().toISOString(),
    };
  }

  private parseWithRetry(raw: string): AIAnalysisResult {
    try {
      return this.parser.parseAnalysis(raw);
    } catch (firstError) {
      this.logger.warn('Primer intento de parseo IA falló; reintentando una vez.');
      try {
        return this.parser.parseAnalysis(this.stripMarkdownFences(raw));
      } catch {
        this.logger.error('Gemini devolvió JSON inválido tras reintento.');
        throw new ServiceUnavailableException(
          'Gemini devolvió un JSON inválido para el contrato AIAnalysisResult.',
          { cause: firstError },
        );
      }
    }
  }

  private stripMarkdownFences(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('```')) {
      return trimmed;
    }

    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }

  private getApiKey(): string {
    return this.configService.get<string>('gemini.apiKey')?.trim() ?? '';
  }

  private getModel(): string {
    return (
      this.configService.get<string>('gemini.model')?.trim() ??
      'gemini-3-flash-preview'
    );
  }
}

export const geminiProviderBinding = {
  provide: AI_PROVIDER,
  useExisting: GeminiProvider,
};
