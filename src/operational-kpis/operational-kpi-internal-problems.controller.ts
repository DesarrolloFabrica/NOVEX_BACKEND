import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { OperationalKpiInternosQueryDto } from './dto/operational-kpi-internal-problems-query.dto';
import { OperationalKpiInternalProblemsService } from './operational-kpi-internal-problems.service';

@Controller('operational-kpis')
@UseGuards(PermissionsGuard)
export class OperationalKpiInternalProblemsController {
  constructor(
    private readonly internalProblemsService: OperationalKpiInternalProblemsService,
  ) {}

  /** INTERNOS · afectaciones de problemas activos al corte. */
  @Get('internal-problems')
  @RequirePermissions('KPIS_VIEW')
  getInternalProblems(
    @Query() query: OperationalKpiInternosQueryDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.internalProblemsService.getInternalProblems(query, user);
  }

  /** INTERNOS · recurrencia de categorías (INTERNAL creados por bucket). */
  @Get('internal-recurrence')
  @RequirePermissions('KPIS_VIEW')
  getInternalRecurrence(
    @Query() query: OperationalKpiInternosQueryDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.internalProblemsService.getInternalRecurrence(query, user);
  }
}
