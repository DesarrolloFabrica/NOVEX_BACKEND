import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  OperationalKpiLearningItemsQueryDto,
  OperationalKpiLearningsQueryDto,
} from './dto/operational-kpi-learnings-query.dto';
import { OperationalKpiLearningsService } from './operational-kpi-learnings.service';

/**
 * APRENDIZAJES (Director · coordinación responsable). Solo lectura.
 *
 * Endpoint propio y no `GET /situations` porque se necesitan agregados del
 * periodo completo (cierres, aprendizajes, categorías) y semántica de
 * coordinación RESPONSABLE; el `coordinationId` del listado general incluye
 * la afectada y su comportamiento no se altera.
 */
@Controller('operational-kpis')
@UseGuards(PermissionsGuard)
export class OperationalKpiLearningsController {
  constructor(
    private readonly learningsService: OperationalKpiLearningsService,
  ) {}

  /** Indicadores y distribución por categoría del periodo completo. */
  @Get('learnings')
  @RequirePermissions('KPIS_VIEW')
  getLearnings(
    @Query() query: OperationalKpiLearningsQueryDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.learningsService.getLearnings(query, user);
  }

  /** Fichas paginadas (closedAt ↓), con filtro opcional de categoría. */
  @Get('learnings/items')
  @RequirePermissions('KPIS_VIEW')
  getLearningItems(
    @Query() query: OperationalKpiLearningItemsQueryDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.learningsService.getLearningItems(query, user);
  }
}
