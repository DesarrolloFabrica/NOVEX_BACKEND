import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { RbacService } from '../rbac/rbac.service';
import { ListRolesQueryDto } from './dto/role.dto';
import { RolesService } from './roles.service';

@Controller('roles')
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly rbacService: RbacService,
  ) {}

  @Get()
  list(@Query() query: ListRolesQueryDto) {
    return this.rolesService.list(query);
  }

  @Get(':id/permissions')
  getPermissions(@Param('id', ParseUUIDPipe) id: string) {
    return this.rbacService.getRolePermissions(id);
  }
}
