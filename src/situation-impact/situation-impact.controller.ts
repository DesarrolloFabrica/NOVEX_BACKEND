import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { SituationAccessService } from '../situations/situation-access.service';
import { SituationImpactService } from './situation-impact.service';

@Controller('situations')
@UseGuards(PermissionsGuard)
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

  @Get(':id/impact-context')
  @RequirePermissions('SITUATIONS_VIEW')
  async getImpactContext(
    @Param('id', ParseUUIDPipe) situationId: string,
    @CurrentUser() user: AuthPayload,
  ) {
    await this.situationAccessService.requireAccessibleSituation(
      user,
      situationId,
    );
    return this.impactService.getImpactContext(situationId);
  }

  @Post(':id/simulate-impact')
  @RequirePermissions('SITUATIONS_VIEW')
  async simulateImpact(
    @Param('id', ParseUUIDPipe) situationId: string,
    @CurrentUser() user: AuthPayload,
    @Query('horizonMinutes', new DefaultValuePipe(30), ParseIntPipe)
    horizonMinutes: number,
  ) {
    await this.situationAccessService.requireAccessibleSituation(
      user,
      situationId,
    );
    return this.impactService.simulateImpact(situationId, horizonMinutes);
  }
}
