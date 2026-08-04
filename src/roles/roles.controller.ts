import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacService } from '../rbac/rbac.service';
import { ListRolesQueryDto } from './dto/role.dto';
import { RolesService } from './roles.service';

@Controller('roles')
@UseGuards(JwtAuthGuard)
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly rbacService: RbacService,
  ) {}

  @Get()
  list(@Query() query: ListRolesQueryDto, @CurrentUser() actor: AuthPayload) {
    this.assertAdmin(actor);
    return this.rolesService.list(query);
  }

  @Get(':id/permissions')
  getPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthPayload,
  ) {
    this.assertAdmin(actor);
    return this.rbacService.getRolePermissions(id);
  }

  private assertAdmin(actor: AuthPayload): void {
    if (!actor.permissions.includes('SYSTEM_CONFIGURATION')) {
      throw new ForbiddenException(
        'Esta herramienta requiere acceso administrativo.',
      );
    }
  }
}
