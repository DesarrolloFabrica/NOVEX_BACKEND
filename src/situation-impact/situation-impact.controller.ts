import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { SituationAccessService } from '../situations/situation-access.service';
import { SituationImpactService } from './situation-impact.service';

@Controller('situations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SituationImpactController {
  constructor(
    private readonly impactService: SituationImpactService,
    private readonly situationAccessService: SituationAccessService,
  ) {}

  @Get(':id/impact')
  @RequirePermissions('SITUATIONS_VIEW')
  async getImpact(
    @Param('id', ParseUUIDPipe) situationId: string,
    @CurrentUser() user: AuthPayload,
  ) {
    await this.situationAccessService.requireAccessibleSituation(
      user,
      situationId,
    );
    return this.impactService.findBySituation(situationId);
  }

  @Get(':id/affected-coordinations')
  @RequirePermissions('SITUATIONS_VIEW')
  async getAffectedCoordinations(
    @Param('id', ParseUUIDPipe) situationId: string,
    @CurrentUser() user: AuthPayload,
  ) {
    await this.situationAccessService.requireAccessibleSituation(
      user,
      situationId,
    );
    return this.impactService.getAffectedCoordinationsBySituation(situationId);
  }
}
