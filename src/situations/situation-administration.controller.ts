import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  CancelSituationDto,
  TransferSituationCoordinationDto,
} from './dto/situation.dto';
import { SituationAdministrationService } from './situation-administration.service';

/**
 * Acciones ADMINISTRATIVAS sobre situaciones (Fase 01B.1). Solo ADMIN, con
 * permisos específicos; ninguna concede editar, atender ni resolver.
 * Contratos documentados en docs/seguridad-y-permisos.md.
 */
@Controller('situations')
@UseGuards(PermissionsGuard)
export class SituationAdministrationController {
  constructor(
    private readonly administration: SituationAdministrationService,
  ) {}

  /** Anula un reporte erróneo o duplicado. Responde el detalle actualizado. */
  @Post(':id/cancellation')
  @RequirePermissions('SITUATIONS_CANCEL')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelSituationDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.administration.cancel(id, dto, user);
  }

  /** Traslada la coordinación responsable. Responde el detalle actualizado. */
  @Post(':id/coordination-transfer')
  @RequirePermissions('SITUATIONS_TRANSFER')
  transferCoordination(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferSituationCoordinationDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.administration.transferCoordination(id, dto, user);
  }
}
