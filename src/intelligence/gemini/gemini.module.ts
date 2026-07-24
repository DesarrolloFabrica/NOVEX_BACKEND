import { Module } from '@nestjs/common';
import { GeminiService } from './gemini.service';

/**
 * Submódulo Gemini — aislado del dominio Operational Events.
 * Solo expone GeminiService; el orquestador es IntelligenceFacade.
 */
@Module({
  providers: [GeminiService],
  exports: [GeminiService],
})
export class GeminiModule {}
