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
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { SituationAccessService } from '../situations/situation-access.service';
import {
  CreateManualRecommendationDto,
  UpdateSituationRecommendationDto,
} from './dto/situation-recommendation.dto';
import { SituationRecommendationsService } from './situation-recommendations.service';

@Controller('situations')
@UseGuards(PermissionsGuard)
export class SituationRecommendationsBySituationController {
  constructor(
    private readonly recommendationsService: SituationRecommendationsService,
    private readonly situationAccessService: SituationAccessService,
  ) {}

  @Get(':id/recommendations')
  @RequirePermissions('SITUATIONS_VIEW')
  async findBySituation(
    @Param('id', ParseUUIDPipe) situationId: string,
    @CurrentUser() user: AuthPayload,
  ) {
    await this.situationAccessService.requireAccessibleSituation(
      user,
      situationId,
    );
    return this.recommendationsService.findBySituation(situationId);
  }

  /**
   * @deprecated La gestión individual de recomendaciones está desacoplada del
   * Centro de Gestión Operativa. Conservado solo por compatibilidad; la UI de
   * `/gestion` ya no invoca este endpoint.
   */
  @Post(':id/recommendations')
  @RequirePermissions('SITUATIONS_UPDATE')
  async createManual(
    @Param('id', ParseUUIDPipe) situationId: string,
    @Body() dto: CreateManualRecommendationDto,
    @CurrentUser() user: AuthPayload,
  ) {
    await this.situationAccessService.requireAccessibleSituation(
      user,
      situationId,
    );
    return this.recommendationsService.createManualRecommendation(
      situationId,
      dto,
      user.sub,
    );
  }
}

@Controller('recommendations')
@UseGuards(PermissionsGuard)
export class SituationRecommendationsController {
  constructor(
    private readonly recommendationsService: SituationRecommendationsService,
  ) {}

  @Get(':id')
  @RequirePermissions('SITUATIONS_VIEW')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.recommendationsService.getById(id);
  }

  /**
   * @deprecated La gestión individual de recomendaciones está desacoplada del
   * Centro de Gestión Operativa. Conservado solo por compatibilidad; la UI de
   * `/gestion` ya no invoca este endpoint.
   */
  @Patch(':id')
  @RequirePermissions('SITUATIONS_UPDATE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSituationRecommendationDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.recommendationsService.updateRecommendation(id, dto, user.sub);
  }
}
