import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OperationalAreasModule } from '../operational-areas/operational-areas.module';
import { OperationalEventsModule } from '../operational-events/operational-events.module';
import { AIInterpretation } from './entities/ai-interpretation.entity';
import { IncidentCategory } from './entities/incident-category.entity';
import { OperationalIndicator } from './entities/operational-indicator.entity';
import { GeminiModule } from './gemini/gemini.module';
import { IntelligenceController } from './intelligence.controller';
import { IntelligenceFacade } from './intelligence.facade';
import { IntelligenceService } from './intelligence.service';
import { AIInterpretationsRepository } from './repositories/ai-interpretations.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AIInterpretation,
      IncidentCategory,
      OperationalIndicator,
    ]),
    OperationalEventsModule,
    OperationalAreasModule,
    GeminiModule,
  ],
  controllers: [IntelligenceController],
  providers: [
    IntelligenceService,
    AIInterpretationsRepository,
    IntelligenceFacade,
  ],
  exports: [
    IntelligenceService,
    AIInterpretationsRepository,
    IntelligenceFacade,
  ],
})
export class IntelligenceModule {}
