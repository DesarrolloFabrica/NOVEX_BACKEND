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
  CreateOperationalEventDto,
  ListOperationalEventsQueryDto,
  UpdateOperationalEventStatusDto,
} from './dto/operational-event.dto';
import { OperationalEventsService } from './operational-events.service';

@Controller('operational-events')
export class OperationalEventsController {
  constructor(private readonly eventsService: OperationalEventsService) {}

  @Get()
  list(@Query() query: ListOperationalEventsQueryDto) {
    return this.eventsService.list(query);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.getById(id);
  }

  @Post()
  create(@Body() dto: CreateOperationalEventDto) {
    return this.eventsService.create(dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOperationalEventStatusDto,
  ) {
    return this.eventsService.updateStatus(id, dto);
  }
}
