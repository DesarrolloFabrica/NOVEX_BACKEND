import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { SituationImpactService } from './situation-impact.service';

@Controller('situations')
export class SituationImpactController {
  constructor(private readonly impactService: SituationImpactService) {}

  @Get(':id/impact')
  getImpact(@Param('id', ParseUUIDPipe) situationId: string) {
    return this.impactService.findBySituation(situationId);
  }

  @Get(':id/affected-coordinations')
  getAffectedCoordinations(@Param('id', ParseUUIDPipe) situationId: string) {
    return this.impactService.getAffectedCoordinationsBySituation(situationId);
  }
}
