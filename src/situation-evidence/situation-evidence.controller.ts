import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { SituationAccessService } from '../situations/situation-access.service';
import {
  CreateSituationEvidenceDto,
  ListSituationEvidencesQueryDto,
  RetireSituationEvidenceDto,
} from './dto/situation-evidence.dto';
import { SituationEvidenceService } from './situation-evidence.service';

@Controller('situations')
@UseGuards(PermissionsGuard)
export class SituationEvidenceController {
  constructor(
    private readonly evidenceService: SituationEvidenceService,
    private readonly situationAccessService: SituationAccessService,
  ) {}

  @Post(':id/evidences')
  @RequirePermissions('SITUATIONS_CREATE')
  async create(
    @Param('id', ParseUUIDPipe) situationId: string,
    @Body() dto: CreateSituationEvidenceDto,
    @CurrentUser() user: AuthPayload,
  ) {
    await this.situationAccessService.requireOperableSituation(
      user,
      situationId,
    );
    return this.evidenceService.create(situationId, dto, user);
  }

  /**
   * Por defecto solo evidencias activas. `?includeRetired=true` devuelve el
   * historial completo con los retiros (Fase 01B.2) y exige más que leer el
   * caso: poder operarlo (quien podría haber retirado) o ser ADMIN. La
   * autorización de lectura la aplica el servicio.
   */
  @Get(':id/evidences')
  @RequirePermissions('SITUATIONS_VIEW')
  findBySituation(
    @Param('id', ParseUUIDPipe) situationId: string,
    @Query() query: ListSituationEvidencesQueryDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.evidenceService.findBySituation(situationId, user, {
      includeRetired: query.includeRetired === true,
    });
  }

  /**
   * Una evidencia retirada exige el mismo permiso que `includeRetired`; sin él
   * responde 404 (servicio).
   */
  @Get(':id/evidences/:evidenceId')
  @RequirePermissions('SITUATIONS_VIEW')
  getById(
    @Param('id', ParseUUIDPipe) situationId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.evidenceService.getById(situationId, evidenceId, user);
  }

  /**
   * RETIRO de evidencia (Fase 01B.2): soft delete con motivo obligatorio. No
   * hay borrado físico.
   */
  @Post(':id/evidences/:evidenceId/retirement')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('SITUATIONS_UPDATE')
  async retire(
    @Param('id', ParseUUIDPipe) situationId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Body() dto: RetireSituationEvidenceDto,
    @CurrentUser() user: AuthPayload,
  ) {
    await this.situationAccessService.requireOperableSituation(
      user,
      situationId,
    );
    return this.evidenceService.retire(situationId, evidenceId, dto, user);
  }

  /**
   * Compatibilidad: DELETE ya no borra. Retira la evidencia y exige el mismo
   * motivo en el cuerpo (`{ reason }`); sin motivo responde 400.
   */
  @Delete(':id/evidences/:evidenceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('SITUATIONS_UPDATE')
  async delete(
    @Param('id', ParseUUIDPipe) situationId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Body() dto: RetireSituationEvidenceDto,
    @CurrentUser() user: AuthPayload,
  ): Promise<void> {
    await this.situationAccessService.requireOperableSituation(
      user,
      situationId,
    );
    await this.evidenceService.retire(situationId, evidenceId, dto, user);
  }
}
