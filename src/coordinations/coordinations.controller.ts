import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CoordinationsService } from './coordinations.service';
import { ListCoordinationsQueryDto } from './dto/coordination.dto';

@Controller('coordinations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CoordinationsController {
  constructor(private readonly coordinationsService: CoordinationsService) {}

  @Get()
  @RequirePermissions('COORDINATIONS_VIEW')
  list(
    @Query() query: ListCoordinationsQueryDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.coordinationsService.list(query, user);
  }

  @Get('graph')
  @RequirePermissions('COORDINATIONS_VIEW')
  getGraph(@CurrentUser() user: AuthPayload) {
    return this.coordinationsService.getGraph(user);
  }

  @Get('network-status')
  @RequirePermissions('COORDINATIONS_VIEW')
  getNetworkStatus(@CurrentUser() user: AuthPayload) {
    return this.coordinationsService.getNetworkStatus(user);
  }

  @Get(':id')
  @RequirePermissions('COORDINATIONS_VIEW')
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.coordinationsService.getById(id, user);
  }
}
