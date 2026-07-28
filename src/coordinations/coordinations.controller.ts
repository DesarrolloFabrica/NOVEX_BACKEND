import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { CoordinationsService } from './coordinations.service';
import { ListCoordinationsQueryDto } from './dto/coordination.dto';

@Controller('coordinations')
export class CoordinationsController {
  constructor(private readonly coordinationsService: CoordinationsService) {}

  @Get()
  list(@Query() query: ListCoordinationsQueryDto) {
    return this.coordinationsService.list(query);
  }

  @Get('graph')
  getGraph() {
    return this.coordinationsService.getGraph();
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.coordinationsService.getById(id);
  }
}
