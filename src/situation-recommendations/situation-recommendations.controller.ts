import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
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
import { SITUATION_CANCELLED_CODE } from '../auth/services/operational-scope.service';
import { SituationStatus } from '../common/enums/situation.enums';
import { SituationAccessService } from '../situations/situation-access.service';
import {
  CreateManualRecommendationDto,
  UpdateSituationRecommendationDto,
} from './dto/situation-recommendation.dto';
import {
  recommendationNotFound,
  SituationRecommendationsService,
} from './situation-recommendations.service';

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
    // M1: crear es ESCRIBIR. Exige operar el caso (no basta con leerlo) y que
    // siga activo. Se comprueba antes de validar `assignedUserId`.
    await this.situationAccessService.requireOperableWorkableSituation(
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

/**
 * Acceso a una recomendación por su propio id.
 *
 * Una recomendación no tiene alcance propio: hereda el de su SITUACIÓN. Por eso
 * estas rutas no definen reglas nuevas; delegan en `SituationAccessService`,
 * igual que las rutas anidadas bajo `/situations/:id`:
 *
 *   LECTURA       `requireAccessibleSituation` (alcance de lectura del caso).
 *   MODIFICACIÓN  `requireOperableSituation` (alcance de escritura del caso),
 *                 comprobado ANTES de tocar la recomendación o validar
 *                 entidades relacionadas (`assignedUserId`).
 *
 * FUERA DE ALCANCE = INEXISTENTE. Si la situación no es accesible, la respuesta
 * es exactamente la misma que para un id que no existe (mismo estado y mismo
 * cuerpo), de modo que estas rutas no sirven para enumerar recomendaciones ni
 * situaciones de otras coordinaciones. Solo se normaliza `NotFoundException`:
 * un 403 de propiedad ya definido por el contrato y cualquier error inesperado
 * se propagan sin cambios.
 */
@Controller('recommendations')
@UseGuards(PermissionsGuard)
export class SituationRecommendationsController {
  constructor(
    private readonly recommendationsService: SituationRecommendationsService,
    private readonly situationAccessService: SituationAccessService,
  ) {}

  @Get(':id')
  @RequirePermissions('SITUATIONS_VIEW')
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPayload,
  ) {
    const recommendation = await this.recommendationsService.getById(id);
    await this.requireRecommendationScope(id, () =>
      this.situationAccessService.requireAccessibleSituation(
        user,
        recommendation.situationId,
      ),
    );
    return recommendation;
  }

  /**
   * @deprecated La gestión individual de recomendaciones está desacoplada del
   * Centro de Gestión Operativa. Conservado solo por compatibilidad; la UI de
   * `/gestion` ya no invoca este endpoint.
   */
  @Patch(':id')
  @RequirePermissions('SITUATIONS_UPDATE')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSituationRecommendationDto,
    @CurrentUser() user: AuthPayload,
  ) {
    const recommendation = await this.recommendationsService.getById(id);
    let situationStatus: SituationStatus | undefined;
    await this.requireRecommendationScope(id, async () => {
      const situation =
        await this.situationAccessService.requireOperableSituation(
          user,
          recommendation.situationId,
        );
      situationStatus = situation.status;
    });
    // Fase 01B.1: las recomendaciones de un caso ANULADO quedan congeladas
    // (se conservan, no se modifican). Comprobado después del alcance.
    if (situationStatus === SituationStatus.CANCELLED) {
      throw new ConflictException({
        code: SITUATION_CANCELLED_CODE,
        message:
          'El problema fue anulado: sus recomendaciones no se modifican.',
      });
    }
    return this.recommendationsService.updateRecommendation(id, dto, user.sub);
  }

  /**
   * Ejecuta la comprobación de alcance de la situación y, si la deniega como
   * «no encontrada», responde con el MISMO error que un id inexistente.
   */
  private async requireRecommendationScope(
    recommendationId: string,
    check: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await check();
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw recommendationNotFound(recommendationId);
      }
      throw error;
    }
  }
}
