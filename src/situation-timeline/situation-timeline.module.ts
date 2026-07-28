import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Situation } from '../situations/entities/situation.entity';
import { SituationTimelineEntry } from './entities/situation-timeline-entry.entity';
import { SituationTimelineRepository } from './repositories/situation-timeline.repository';
import { SituationTimelineController } from './situation-timeline.controller';
import { SituationTimelineService } from './situation-timeline.service';
import { SituationTimelineSubscriber } from './subscribers/situation-timeline.subscriber';

@Module({
  imports: [TypeOrmModule.forFeature([SituationTimelineEntry, Situation])],
  controllers: [SituationTimelineController],
  providers: [
    SituationTimelineService,
    SituationTimelineRepository,
    SituationTimelineSubscriber,
  ],
  exports: [SituationTimelineService, SituationTimelineRepository],
})
export class SituationTimelineModule {}
