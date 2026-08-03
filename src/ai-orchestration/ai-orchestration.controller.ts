import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { SituationAccessService } from '../situations/situation-access.service';
import { AIOrchestrator } from './ai-orchestrator.service';

@Controller('situations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AIOrchestrationController {
  constructor(
    private readonly orchestrator: AIOrchestrator,
    private readonly situationAccessService: SituationAccessService,
  ) {}

  @Post(':id/analyze')
  @RequirePermissions('AI_ANALYZE')
  async analyze(
    @Param('id', ParseUUIDPipe) situationId: string,
    @CurrentUser() user: AuthPayload,
  ) {
    await this.situationAccessService.requireAccessibleSituation(user, situationId);
    return this.orchestrator.execute(situationId, user.sub);
  }

  @Get(':id/analysis')
  @RequirePermissions('AI_VIEW_REPORTS')
  async getAnalysis(
    @Param('id', ParseUUIDPipe) situationId: string,
    @CurrentUser() user: AuthPayload,
  ) {
    await this.situationAccessService.requireAccessibleSituation(user, situationId);
    return this.orchestrator.getPersistedAnalysis(situationId);
  }
}
