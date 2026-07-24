import { Injectable } from '@nestjs/common';
import { InterpretEventAiDto } from './gemini/dto/interpret-event-ai.dto';
import { GeminiInterpretationResult } from './gemini/dto/gemini-interpretation.result';
import { GeminiService } from './gemini/gemini.service';

/**
 * Fachada de inteligencia operacional.
 *
 * Único contrato que deben usar otros módulos (p. ej. Operational Events
 * en el futuro) para obtener interpretaciones.
 * Oculta GeminiService y cualquier proveedor de IA.
 */
@Injectable()
export class IntelligenceFacade {
  constructor(private readonly geminiService: GeminiService) {}

  /**
   * Interpreta un evento a partir del DTO mínimo de IA.
   * Devuelve un resultado estructurado listo para persistirse como AIInterpretation.
   */
  interpretOperationalEvent(
    input: InterpretEventAiDto,
  ): Promise<GeminiInterpretationResult> {
    return this.geminiService.interpretEvent(input);
  }
}
