import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AdminManagementService } from './admin-management.service';
import {
  CreateCoordinationDto,
  ListAuditLogsQueryDto,
  ReplaceRolePermissionsDto,
  UpdateCoordinationDto,
  UpdateRoleDto,
} from './dto/admin-management.dto';

/**
 * API de la Consola de Administración (escrituras de catálogo y auditoría).
 *
 * Cada ruta exige su permiso con `PermissionsGuard`; los permisos se leen de BD
 * en cada petición. Usuarios siguen en `/users` (USERS_CREATE / USERS_UPDATE).
 */
@Controller('admin')
@UseGuards(PermissionsGuard)
export class AdminManagementController {
  constructor(
    private readonly adminManagementService: AdminManagementService,
  ) {}

  @Get('role-matrix')
  @RequirePermissions('SYSTEM_CONFIGURATION')
  getRoleMatrix() {
    return this.adminManagementService.getRoleMatrix();
  }

  @Patch('roles/:id')
  @RequirePermissions('SYSTEM_CONFIGURATION')
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() actor: AuthPayload,
  ) {
    return this.adminManagementService.updateRole(id, dto, actor);
  }

  @Put('roles/:id/permissions')
  @RequirePermissions('SYSTEM_CONFIGURATION')
  replaceRolePermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceRolePermissionsDto,
    @CurrentUser() actor: AuthPayload,
  ) {
    return this.adminManagementService.replaceRolePermissions(id, dto, actor);
  }

  @Post('coordinations')
  @RequirePermissions('COORDINATIONS_MANAGE')
  createCoordination(
    @Body() dto: CreateCoordinationDto,
    @CurrentUser() actor: AuthPayload,
  ) {
    return this.adminManagementService.createCoordination(dto, actor);
  }

  @Patch('coordinations/:id')
  @RequirePermissions('COORDINATIONS_MANAGE')
  updateCoordination(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCoordinationDto,
    @CurrentUser() actor: AuthPayload,
  ) {
    return this.adminManagementService.updateCoordination(id, dto, actor);
  }

  @Get('audit-logs')
  @RequirePermissions('SYSTEM_CONFIGURATION')
  listAuditLogs(@Query() query: ListAuditLogsQueryDto) {
    return this.adminManagementService.listAuditLogs(query);
  }
}
