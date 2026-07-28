import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateManualRecommendationDto,
  UpdateSituationRecommendationDto,
} from './dto/situation-recommendation.dto';
import { SituationRecommendationsService } from './situation-recommendations.service';

@Controller('situations')
export class SituationRecommendationsBySituationController {
  constructor(
    private readonly recommendationsService: SituationRecommendationsService,
  ) {}

  @Get(':id/recommendations')
  findBySituation(@Param('id', ParseUUIDPipe) situationId: string) {
    return this.recommendationsService.findBySituation(situationId);
  }

  @Post(':id/recommendations')
  @UseGuards(JwtAuthGuard)
  createManual(
    @Param('id', ParseUUIDPipe) situationId: string,
    @Body() dto: CreateManualRecommendationDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.recommendationsService.createManualRecommendation(
      situationId,
      dto,
      user.sub,
    );
  }
}

@Controller('recommendations')
export class SituationRecommendationsController {
  constructor(
    private readonly recommendationsService: SituationRecommendationsService,
  ) {}

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.recommendationsService.getById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSituationRecommendationDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.recommendationsService.updateRecommendation(id, dto, user.sub);
  }
}
