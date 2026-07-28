import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { InterpretEventAiDto } from './dto/interpret-event-ai.dto';
import { GeminiInterpretationResult } from './dto/gemini-interpretation.result';
import { GeminiPromptBuilder } from './prompt.builder';
import { GeminiResponseParser } from './response.parser';
import { GEMINI_INTERPRETATION_RESPONSE_SCHEMA } from './response.schema';

/**
 * Cliente Gemini — único punto que habla con el proveedor de IA.
 * No conoce TypeORM ni Operational Events.
 */
@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly promptBuilder = new GeminiPromptBuilder();
  private readonly responseParser = new GeminiResponseParser();

  constructor(private readonly configService: ConfigService) {}

  async interpretEvent(
    input: InterpretEventAiDto,
  ): Promise<GeminiInterpretationResult> {
    const apiKey = this.configService.get<string>('gemini.apiKey') ?? '';
    const modelName =
      this.configService.get<string>('gemini.model') ?? 'gemini-3-flash-preview';

    if (!apiKey.trim()) {
      throw new ServiceUnavailableException(
        'GEMINI_API_KEY no está configurada. No se puede generar interpretación real.',
      );
    }

    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({
      model: modelName,
      systemInstruction: this.promptBuilder.buildSystemInstruction(),
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: GEMINI_INTERPRETATION_RESPONSE_SCHEMA,
        temperature: 0.2,
      },
    });

    const userPrompt = this.promptBuilder.buildUserPrompt(input);
    this.logger.debug(`Invocando Gemini model=${modelName}`);

    const result = await model.generateContent(userPrompt);
    const text = result.response.text();

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text) as unknown;
    } catch {
      this.logger.error('Gemini devolvió JSON no parseable');
      throw new ServiceUnavailableException(
        'Gemini devolvió una respuesta no estructurada.',
      );
    }

    return this.responseParser.parse(parsedJson, input, modelName);
  }
}
