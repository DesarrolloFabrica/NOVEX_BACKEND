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
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  ListSituationsQueryDto,
  ResolveSituationDto,
  UpdateSituationDto,
} from './dto/situation.dto';
import { SituationsService } from './situations.service';

@Controller('situations')
@UseGuards(PermissionsGuard)
export class SituationsController {
  constructor(private readonly situationsService: SituationsService) {}

  @Get('categories')
  @RequirePermissions('SITUATIONS_VIEW')
  listCategories() {
    return this.situationsService.listIncidentCategories();
  }

  @Get()
  @RequirePermissions('SITUATIONS_VIEW')
  list(
    @Query() query: ListSituationsQueryDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.situationsService.list(query, user);
  }

  @Get(':id')
  @RequirePermissions('SITUATIONS_VIEW')
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.situationsService.getById(id, user);
  }

  @Patch(':id')
  @RequirePermissions('SITUATIONS_UPDATE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSituationDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.situationsService.update(id, dto, user);
  }

  /**
   * SOLUCIONAR: cierra el problema y registra el aprendizaje en una sola
   * operación atómica.
   *
   * `SITUATIONS_CLOSE` deja de ser un permiso declarado y sin uso: aquí se
   * comprueba de verdad. Pero es solo el PRIMER filtro —limita la operación a
   * los roles que participan del cierre— y NO concede excepción a la regla
   * funcional: el servicio exige además que quien resuelve COORDINE el área
   * responsable del problema, comprobado contra la coordinación persistida.
   * Un permiso genérico nunca sustituye a esa comprobación.
   */
  @Post(':id/resolution')
  @RequirePermissions('SITUATIONS_CLOSE')
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveSituationDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.situationsService.resolve(id, dto, user);
  }
}
