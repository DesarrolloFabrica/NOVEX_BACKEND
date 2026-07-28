import { Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
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
export class AIAnalysisSessionsController {
  constructor(
    private readonly sessionsService: AIAnalysisSessionsService,
    private readonly comparisonService: AIAnalysisComparisonService,
  ) {}

  @Get(':id/analysis/history')
  getHistory(@Param('id', ParseUUIDPipe) situationId: string) {
    return this.sessionsService.getHistory(situationId);
  }

  @Get(':id/analysis/history/:version')
  getByVersion(
    @Param('id', ParseUUIDPipe) situationId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.sessionsService.getByVersion(situationId, version);
  }

  @Get(':id/analysis/compare')
  compare(
    @Param('id', ParseUUIDPipe) situationId: string,
    @Query() query: CompareAnalysisQueryDto,
  ) {
    return this.comparisonService.compareVersions(
      situationId,
      query.fromVersion,
      query.toVersion,
    );
  }
}
