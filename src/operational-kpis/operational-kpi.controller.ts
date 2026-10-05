import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { OperationalKpiBreakdownQueryDto } from './dto/operational-kpi-breakdown-query.dto';
import { OperationalKpiCompareQueryDto } from './dto/operational-kpi-compare-query.dto';
import { OperationalKpiHistoryQueryDto } from './dto/operational-kpi-history-query.dto';
import { OperationalKpiPeriodQueryDto } from './dto/operational-kpi-period-query.dto';
import { OperationalKpiRelationsQueryDto } from './dto/operational-kpi-relations-query.dto';
import { OperationalKpiQueryDto } from './dto/operational-kpi-query.dto';
import { OperationalKpiStateQueryDto } from './dto/operational-kpi-state-query.dto';
import { OperationalKpiService } from './operational-kpi.service';

@Controller('operational-kpis')
@UseGuards(PermissionsGuard)
export class OperationalKpiController {
  constructor(private readonly operationalKpiService: OperationalKpiService) {}

  @Get('state')
  @RequirePermissions('KPIS_VIEW')
  getState(
    @Query() query: OperationalKpiStateQueryDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.operationalKpiService.getState(query, user);
  }

  @Get('period')
  @RequirePermissions('KPIS_VIEW')
  getPeriod(
    @Query() query: OperationalKpiPeriodQueryDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.operationalKpiService.getPeriod(query, user);
  }

  @Get('breakdown')
  @RequirePermissions('KPIS_VIEW')
  getBreakdown(
    @Query() query: OperationalKpiBreakdownQueryDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.operationalKpiService.getBreakdown(query, user);
  }

  @Get('relations')
  @RequirePermissions('KPIS_VIEW')
  getRelations(
    @Query() query: OperationalKpiRelationsQueryDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.operationalKpiService.getRelations(query, user);
  }

  @Get('history')
  @RequirePermissions('KPIS_VIEW')
  getHistory(
    @Query() query: OperationalKpiHistoryQueryDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.operationalKpiService.getHistory(query, user);
  }

  @Get('compare')
  @RequirePermissions('KPIS_VIEW')
  compare(
    @Query() query: OperationalKpiCompareQueryDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.operationalKpiService.compare(query, user);
  }

  @Get()
  @RequirePermissions('KPIS_VIEW')
  getSnapshot(
    @Query() query: OperationalKpiQueryDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.operationalKpiService.getSnapshot(query, user);
  }
}
