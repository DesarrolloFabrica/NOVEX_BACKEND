import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIInterpretation } from '../../intelligence/entities/ai-interpretation.entity';
import { IncidentCategory } from '../../intelligence/entities/incident-category.entity';
import { OperationalIndicator } from '../../intelligence/entities/operational-indicator.entity';
import { OperationalArea } from '../../operational-areas/entities/operational-area.entity';
import { OperationalEvent } from '../../operational-events/entities/operational-event.entity';
import { OperationalTimelineEntry } from '../../operational-events/entities/operational-timeline-entry.entity';
import { RecommendedActionsModule } from '../../recommended-actions/recommended-actions.module';
import { DatabaseSeedsService } from './database-seeds.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OperationalArea,
      IncidentCategory,
      OperationalEvent,
      OperationalTimelineEntry,
      AIInterpretation,
      OperationalIndicator,
    ]),
    RecommendedActionsModule,
  ],
  providers: [DatabaseSeedsService],
})
export class DatabaseSeedsModule {}
