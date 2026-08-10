import { GatewayTimeoutException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { GoogleGenAI } from '@google/genai';
import { AIAnalysisParser } from '../../ai-analysis/parsers/ai-analysis.parser';
import { AIPromptEngineService } from '../../ai-prompt-engine/ai-prompt-engine.service';
import type { SituationContext } from '../../ai-prompt-engine/contracts/situation-context.contract';
import type { CompletePrompt } from '../../ai-prompt-engine/contracts/prompt.contract';
import { GeminiProvider } from './gemini.provider';
import { RequestContextService } from '../../common/request-context/request-context.service';

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn(),
}));

describe('GeminiProvider timeout and error handling', () => {
  let provider: GeminiProvider;
  let generateContent: jest.Mock;

  const context = {
    situationId: 'situation-1',
  } as SituationContext;

  const prompt = {
    systemPrompt: 'system',
    userPrompt: 'user',
  } as CompletePrompt;

  beforeEach(async () => {
    generateContent = jest.fn();
    (GoogleGenAI as jest.Mock).mockImplementation(() => ({
      models: { generateContent },
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'gemini.apiKey') return 'test-key';
              if (key === 'gemini.model') return 'gemini-test';
              if (key === 'gemini.timeoutMs') return 50;
              return undefined;
            }),
          },
        },
        {
          provide: AIAnalysisParser,
          useValue: {
            parseAnalysis: jest.fn().mockReturnValue({
              summary: 'ok',
              analyzedAt: '2026-01-01T00:00:00.000Z',
            }),
          },
        },
        {
          provide: AIPromptEngineService,
          useValue: { buildForSituation: jest.fn() },
        },
        {
          provide: RequestContextService,
          useValue: { getRequestId: jest.fn().mockReturnValue('req-1') },
        },
      ],
    }).compile();

    provider = module.get(GeminiProvider);
  });

  it('completa análisis cuando Gemini responde antes del timeout', async () => {
    generateContent.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                text: JSON.stringify({
                  summary: 'ok',
                  analyzedAt: '2026-01-01T00:00:00.000Z',
                }),
              }),
            10,
          );
        }),
    );

    const result = await provider.executeAnalysis(context, prompt);

    expect(result.summary).toBe('ok');
    expect(generateContent).toHaveBeenCalledTimes(1);
    const [[callArgs]] = generateContent.mock.calls as Array<
      [{ config?: { abortSignal?: AbortSignal } }]
    >;
    expect(callArgs.config?.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('devuelve 504 cuando Gemini excede el timeout', async () => {
    generateContent.mockImplementation(
      ({ config }: { config: { abortSignal?: AbortSignal } }) =>
        new Promise((resolve, reject) => {
          const onAbort = () => reject(new Error('aborted'));
          config.abortSignal?.addEventListener('abort', onAbort, {
            once: true,
          });
          setTimeout(() => resolve({ text: '{"summary":"late"}' }), 500);
        }),
    );

    await expect(
      provider.executeAnalysis(context, prompt),
    ).rejects.toBeInstanceOf(GatewayTimeoutException);
  });

  it('no filtra detalles internos cuando Gemini falla', async () => {
    generateContent.mockRejectedValue(new Error('internal sdk stack details'));

    await expect(provider.executeAnalysis(context, prompt)).rejects.toThrow(
      'No fue posible completar el análisis IA.',
    );
  });

  it('propaga abortSignal al SDK para cancelación del cliente', async () => {
    let capturedSignal: AbortSignal | undefined;
    generateContent.mockImplementation(
      (args: { config: { abortSignal?: AbortSignal } }) => {
        capturedSignal = args.config.abortSignal;
        return Promise.resolve({
          text: JSON.stringify({
            summary: 'ok',
            analyzedAt: '2026-01-01T00:00:00.000Z',
          }),
        });
      },
    );

    await provider.executeAnalysis(context, prompt);

    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });
});
