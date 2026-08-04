import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { SituationAccessService } from '../situations/situation-access.service';
import { AIAnalysisComparisonService } from './ai-analysis-comparison.service';
import { AIAnalysisSessionsService } from './ai-analysis-sessions.service';

class CompareAnalysisQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fromVersion!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  toVersion!: number;
}

@Controller('situations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AIAnalysisSessionsController {
  constructor(
    private readonly sessionsService: AIAnalysisSessionsService,
    private readonly comparisonService: AIAnalysisComparisonService,
    private readonly situationAccessService: SituationAccessService,
  ) {}

  @Get(':id/analysis/history')
  @RequirePermissions('AI_VIEW_REPORTS')
  async getHistory(
    @Param('id', ParseUUIDPipe) situationId: string,
    @CurrentUser() user: AuthPayload,
  ) {
    await this.situationAccessService.requireAccessibleSituation(
      user,
      situationId,
    );
    return this.sessionsService.getHistory(situationId);
  }

  @Get(':id/analysis/history/:version')
  @RequirePermissions('AI_VIEW_REPORTS')
  async getByVersion(
    @Param('id', ParseUUIDPipe) situationId: string,
    @Param('version', ParseIntPipe) version: number,
    @CurrentUser() user: AuthPayload,
  ) {
    await this.situationAccessService.requireAccessibleSituation(
      user,
      situationId,
    );
    return this.sessionsService.getByVersion(situationId, version);
  }

  @Get(':id/analysis/compare')
  @RequirePermissions('AI_VIEW_REPORTS')
  async compare(
    @Param('id', ParseUUIDPipe) situationId: string,
    @Query() query: CompareAnalysisQueryDto,
    @CurrentUser() user: AuthPayload,
  ) {
    await this.situationAccessService.requireAccessibleSituation(
      user,
      situationId,
    );
    return this.comparisonService.compareVersions(
      situationId,
      query.fromVersion,
      query.toVersion,
    );
  }
}
