import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { SituationTimelineService } from './situation-timeline.service';

@Controller('situations')
export class SituationTimelineController {
  constructor(private readonly timelineService: SituationTimelineService) {}

  @Get(':id/timeline')
  findBySituation(@Param('id', ParseUUIDPipe) id: string) {
    return this.timelineService.findBySituation(id);
  }
}
