import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { SituationAccessService } from '../situations/situation-access.service';
import { SituationTimelineService } from './situation-timeline.service';

@Controller('situations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SituationTimelineController {
  constructor(
    private readonly timelineService: SituationTimelineService,
    private readonly situationAccessService: SituationAccessService,
  ) {}

  @Get(':id/timeline')
  @RequirePermissions('SITUATIONS_VIEW')
  async findBySituation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPayload,
  ) {
    await this.situationAccessService.requireAccessibleSituation(user, id);
    return this.timelineService.findBySituation(id);
  }
}
