import {
  Body,
  Controller,
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
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  CreateSituationDto,
  ListSituationsQueryDto,
  UpdateSituationDto,
} from './dto/situation.dto';
import { SituationsService } from './situations.service';

@Controller('situations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SituationsController {
  constructor(private readonly situationsService: SituationsService) {}

  @Post()
  @RequirePermissions('SITUATIONS_CREATE')
  create(@Body() dto: CreateSituationDto, @CurrentUser() user: AuthPayload) {
    return this.situationsService.create(dto, user);
  }

  @Get()
  @RequirePermissions('SITUATIONS_VIEW')
  list(@Query() query: ListSituationsQueryDto, @CurrentUser() user: AuthPayload) {
    return this.situationsService.list(query, user);
  }

  @Get(':id')
  @RequirePermissions('SITUATIONS_VIEW')
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.situationsService.getById(id, user);
  }

  @Patch(':id')
  @RequirePermissions('SITUATIONS_UPDATE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSituationDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.situationsService.update(id, dto, user);
  }
}
