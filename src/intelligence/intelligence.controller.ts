import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CreateAIInterpretationDto } from './dto/ai-interpretation.dto';
import { InterpretEventAiDto } from './gemini/dto/interpret-event-ai.dto';
import { IntelligenceService } from './intelligence.service';

@Controller('intelligence')
export class IntelligenceController {
  constructor(private readonly intelligenceService: IntelligenceService) {}

  @Get('categories')
  listCategories() {
    return this.intelligenceService.listCategories();
  }

  @Get('interpretations/by-event/:eventId')
  listByEvent(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.intelligenceService.listByEvent(eventId);
  }

  /**
   * Persistencia de interpretación ya estructurada (mock u origen externo).
   * Conservado del Sprint 6.
   */
  @Post('interpretations')
  createMockInterpretation(@Body() dto: CreateAIInterpretationDto) {
    return this.intelligenceService.createMockInterpretation(dto);
  }

  /**
   * Interpretación real vía IntelligenceFacade → Gemini.
   * Recibe DTO mínimo de IA (no entidades). No persiste.
   */
  @Post('interpret')
  interpretWithAi(@Body() dto: InterpretEventAiDto) {
    return this.intelligenceService.interpretWithAi(dto);
  }

  /**
   * Carga el evento, interpreta con IA y persiste AIInterpretation.
   */
  @Post('interpret/:eventId')
  interpretEventAndPersist(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.intelligenceService.interpretEventAndPersist(eventId);
  }
}
