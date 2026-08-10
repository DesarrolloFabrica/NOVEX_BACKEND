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
  THROTTLE_LIMITS,
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
    [THROTTLE_LIMITS.gemini.name]: {
      limit: THROTTLE_GEMINI_LIMIT,
      ttl: THROTTLE_TTL_MS,
    },
  })
  @RequirePermissions('SITUATIONS_CREATE', 'AI_ANALYZE')
  registerWithAnalysis(
    @Body() dto: CreateSituationDto,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.orchestrator.registerAndExecute(dto, user);
  }

  @Post(':id/analyze')
  @Throttle({
    [THROTTLE_LIMITS.gemini.name]: {
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
