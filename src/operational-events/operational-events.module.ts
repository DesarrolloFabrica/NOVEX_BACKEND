import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OperationalAreasModule } from '../operational-areas/operational-areas.module';
import { OperationalEvent } from './entities/operational-event.entity';
import { OperationalTimelineEntry } from './entities/operational-timeline-entry.entity';
import { OperationalEventsService } from './operational-events.service';
import { OperationalEventsRepository } from './repositories/operational-events.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([OperationalEvent, OperationalTimelineEntry]),
    OperationalAreasModule,
  ],
  controllers: [],
  providers: [OperationalEventsService, OperationalEventsRepository],
  exports: [OperationalEventsService, OperationalEventsRepository],
})
export class OperationalEventsModule {}
