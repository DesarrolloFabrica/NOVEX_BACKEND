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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AIOrchestrator } from './ai-orchestrator.service';

@Controller('situations')
export class AIOrchestrationController {
  constructor(private readonly orchestrator: AIOrchestrator) {}

  @Post(':id/analyze')
  @UseGuards(JwtAuthGuard)
  analyze(
    @Param('id', ParseUUIDPipe) situationId: string,
    @CurrentUser() user: AuthPayload,
  ) {
    return this.orchestrator.execute(situationId, user.sub);
  }

  @Get(':id/analysis')
  getAnalysis(@Param('id', ParseUUIDPipe) situationId: string) {
    return this.orchestrator.getPersistedAnalysis(situationId);
  }
}
