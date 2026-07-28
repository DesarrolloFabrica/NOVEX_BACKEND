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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateSituationDto,
  ListSituationsQueryDto,
  UpdateSituationDto,
} from './dto/situation.dto';
import { SituationsService } from './situations.service';

@Controller('situations')
export class SituationsController {
  constructor(private readonly situationsService: SituationsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Body() dto: CreateSituationDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.situationsService.create(dto, user.sub);
  }

  @Get()
  list(@Query() query: ListSituationsQueryDto) {
    return this.situationsService.list(query);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.situationsService.getById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSituationDto,
  ) {
    return this.situationsService.update(id, dto);
  }
}
