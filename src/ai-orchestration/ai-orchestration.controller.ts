import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  THROTTLE_GEMINI_LIMIT,
  THROTTLE_TTL_MS,
} from '../configuration/throttle.constants';
import { SituationAccessService } from '../situations/situation-access.service';
import { CreateSituationDto } from '../situations/dto/situation.dto';
import { AIOrchestrator } from './ai-orchestrator.service';

@Controller('situations')
@UseGuards(PermissionsGuard)
export class AIOrchestrationController {
  constructor(
    private readonly orchestrator: AIOrchestrator,
    private readonly situationAccessService: SituationAccessService,
  ) {}

  @Post('register-with-analysis')
  @Throttle({
    default: {
      limit: THROTTLE_GEMINI_LIMIT,
      ttl: THROTTLE_TTL_MS,
    },
  })
  /*
   * REPORTAR exige `SITUATIONS_CREATE` y nada más.
   *
   * Antes exigía también `AI_ANALYZE`, y eso convertía el análisis —que aquí es
   * un PASO INTERNO del registro, no una acción que el usuario invoque— en una
   * capacidad que había que conceder para poder reportar. Con los cuatro roles
   * reportando, la alternativa habría sido dar `AI_ANALYZE` a ADMIN y DIRECTOR,
   * lo que de paso les habría abierto `POST :id/analyze`: relanzar el análisis
   * de CUALQUIER situación. Eso es mucho más de lo que pide reportar.
   *
   * El cambio concede exactamente esto: quien puede registrar un problema
   * provoca el análisis de ESE problema, en el acto de crearlo. Ejecutar un
   * análisis sobre una situación ajena o repetirlo sigue requiriendo
   * `AI_ANALYZE`, que no se ha tocado en los dos endpoints de abajo. El
   * `@Throttle` de Gemini tampoco cambia.
   */
  @RequirePermissions('SITUATIONS_CREATE')
  registerWithAnalysis(
    @Body() dto: CreateSituationDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.orchestrator.registerAndExecute(dto, user);
  }

  @Post(':id/analyze')
  @Throttle({
    default: {
      limit: THROTTLE_GEMINI_LIMIT,
      ttl: THROTTLE_TTL_MS,
    },
  })
  @RequirePermissions('AI_ANALYZE')
  async analyze(
    @Param('id', ParseUUIDPipe) situationId: string,
    @CurrentUser() user: AuthPayload,
  ) {
    await this.situationAccessService.requireAccessibleSituation(
      user,
      situationId,
    );
    return this.orchestrator.execute(situationId, user);
  }

  @Get(':id/analysis')
  @RequirePermissions('AI_VIEW_REPORTS')
  async getAnalysis(
    @Param('id', ParseUUIDPipe) situationId: string,
    @CurrentUser() user: AuthPayload,
  ) {
    await this.situationAccessService.requireAccessibleSituation(
      user,
      situationId,
    );
    return this.orchestrator.getPersistedAnalysis(situationId);
  }
}
