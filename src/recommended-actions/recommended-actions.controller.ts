import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ListRecommendedActionsQueryDto,
  UpdateRecommendedActionStatusDto,
} from './dto/recommended-action.dto';
import { RecommendedActionsService } from './recommended-actions.service';

@Controller('recommended-actions')
export class RecommendedActionsController {
  constructor(
    private readonly recommendedActionsService: RecommendedActionsService,
  ) {}

  @Get()
  list(@Query() query: ListRecommendedActionsQueryDto) {
    return this.recommendedActionsService.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.recommendedActionsService.getById(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateRecommendedActionStatusDto,
  ) {
    return this.recommendedActionsService.updateStatus(id, dto);
  }
}
