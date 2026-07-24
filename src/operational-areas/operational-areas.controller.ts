import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreateOperationalAreaDto,
  ListOperationalAreasQueryDto,
  UpdateOperationalAreaDto,
} from './dto/operational-area.dto';
import { OperationalAreasService } from './operational-areas.service';

@Controller('operational-areas')
export class OperationalAreasController {
  constructor(private readonly areasService: OperationalAreasService) {}

  @Get()
  list(@Query() query: ListOperationalAreasQueryDto) {
    return this.areasService.list(query);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.areasService.getById(id);
  }

  @Post()
  create(@Body() dto: CreateOperationalAreaDto) {
    return this.areasService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOperationalAreaDto,
  ) {
    return this.areasService.update(id, dto);
  }
}
