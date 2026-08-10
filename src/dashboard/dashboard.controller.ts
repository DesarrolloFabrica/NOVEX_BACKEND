import { Controller, Get, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(PermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('metrics')
  @RequirePermissions('REPORTS_VIEW')
  getMetrics() {
    return this.dashboardService.getMetrics();
  }
}
