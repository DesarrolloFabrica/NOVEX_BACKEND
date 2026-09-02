import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { OperationalOverviewService } from './operational-overview.service';

@Controller('operational-overview')
@UseGuards(PermissionsGuard)
export class OperationalOverviewController {
  constructor(
    private readonly operationalOverviewService: OperationalOverviewService,
  ) {}

  /**
   * LEVEL 0 de la experiencia de cartas. Exige los dos permisos de lectura que
   * el recurso combina: situaciones (los conteos) y coordinaciones (el
   * catálogo). El guard aplica conjunción, no alternativa.
   */
  @Get()
  @RequirePermissions('SITUATIONS_VIEW', 'COORDINATIONS_VIEW')
  getOverview(@CurrentUser() user: AuthPayload) {
    return this.operationalOverviewService.getOverview(user);
  }
}
