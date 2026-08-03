import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacService } from '../rbac/rbac.service';
import {
  CreateUserDto,
  ListUsersQueryDto,
  UpdateUserDto,
} from './dto/user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly rbacService: RbacService,
  ) {}

  @Get()
  list(@Query() query: ListUsersQueryDto) {
    return this.usersService.list(query);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthPayload) {
    this.assertPermission(actor, 'USERS_CREATE');
    return this.usersService.create(dto);
  }

  @Get(':id/permissions')
  getPermissions(@Param('id', ParseUUIDPipe) id: string) {
    return this.rbacService.getUserPermissions(id);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthPayload,
  ) {
    this.assertPermission(actor, 'USERS_UPDATE');
    return this.usersService.update(id, dto);
  }

  private assertPermission(actor: AuthPayload, permission: string): void {
    if (!actor.permissions.includes(permission)) {
      throw new ForbiddenException(
        `No tienes permiso para ejecutar esta acción (${permission}).`,
      );
    }
  }
}
