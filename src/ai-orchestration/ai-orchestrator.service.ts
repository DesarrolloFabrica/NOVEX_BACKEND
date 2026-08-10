import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { DataSource, EntityManager } from 'typeorm';

import { AuditAction, AuditResourceType } from '../audit/audit-action.enum';
import { AuditLogService } from '../audit/audit-log.service';

import type { AIAnalysisResult } from '../ai-analysis/contracts/ai-analysis-result.contract';

import type { AuthPayload } from '../auth/contracts/auth-payload.contract';

import { AIAnalysisService } from '../ai-analysis/ai-analysis.service';

import { AIAnalysisSessionsService } from '../ai-analysis-sessions/ai-analysis-sessions.service';

import { SituationAnalysisSession } from '../ai-analysis-sessions/entities/situation-analysis-session.entity';

import { TimelineEventType } from '../common/enums/situation-timeline.enums';

import { SituationsRepository } from '../situations/repositories/situations.repository';

import type { CreateSituationDto } from '../situations/dto/situation.dto';

import { SituationsService } from '../situations/situations.service';

import { SituationImpactService } from '../situation-impact/situation-impact.service';

import { SituationRecommendationsService } from '../situation-recommendations/situation-recommendations.service';

import { SituationTimelineService } from '../situation-timeline/situation-timeline.service';

import { AIPromptEngineService } from '../ai-prompt-engine/ai-prompt-engine.service';

import {
  ExecuteAIAnalysisResponseDto,
  RegisterSituationWithAnalysisResponseDto,
  SituationAIAnalysisResponseDto,
} from './dto/ai-orchestration.dto';

import { GeminiProvider } from './providers/gemini.provider';

import { SituationAIAnalysisRecordRepository } from './repositories/situation-ai-analysis-record.repository';
import { SituationAIAnalysisRecord } from './entities/situation-ai-analysis-record.entity';

@Injectable()
export class AIOrchestrator {
  private readonly logger = new Logger(AIOrchestrator.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,

    private readonly situationsRepository: SituationsRepository,

    private readonly situationsService: SituationsService,

    private readonly promptEngine: AIPromptEngineService,

    private readonly geminiProvider: GeminiProvider,

    private readonly analysisService: AIAnalysisService,

    private readonly impactService: SituationImpactService,

    private readonly recommendationsService: SituationRecommendationsService,

    private readonly timelineService: SituationTimelineService,

    private readonly analysisRecordRepository: SituationAIAnalysisRecordRepository,

    private readonly analysisSessionsService: AIAnalysisSessionsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async registerAndExecute(
    dto: CreateSituationDto,
    actor: AuthPayload,
  ): Promise<RegisterSituationWithAnalysisResponseDto> {
    const situation = await this.situationsService.create(dto, actor);

    try {
      const analysis = await this.execute(situation.id, actor);
      return { situation, analysis };
    } catch (error) {
      await this.discardFailedRegistration(situation.id);
      const causeMessage =
        error instanceof Error
          ? error.message
          : 'Error de análisis desconocido.';
      throw new ServiceUnavailableException(
        `La situación no fue registrada porque el análisis IA no pudo completarse: ${causeMessage}`,
        { cause: error },
      );
    }
  }

  async execute(
    situationId: string,
    actor: AuthPayload,
  ): Promise<ExecuteAIAnalysisResponseDto> {
    await this.ensureSituationExists(situationId);

    const previousLatest =
      await this.analysisSessionsService.getLatestSession(situationId);

    await this.timelineService.createEntry({
      situationId,

      userId: actor.sub,

      eventType: TimelineEventType.AI_ANALYSIS_STARTED,

      title: 'Análisis IA iniciado',

      description:
        'Se inició el análisis operacional con inteligencia artificial.',

      metadata: {
        provider: this.geminiProvider.name,
      },
    });

    const startedAt = Date.now();

    try {
      const engineResult =
        await this.promptEngine.buildForSituation(situationId);

      const providerAnalysis = await this.geminiProvider.executeAnalysis(
        engineResult.context,

        engineResult.prompt,
      );

      const normalizedAnalysis =
        await this.analysisService.normalizeCoordinationReferences(
          providerAnalysis,
        );

      const analysis =
        this.analysisService.validateAnalysis(normalizedAnalysis);

      const session = await this.dataSource.transaction(async (manager) => {
        await this.analysisService.persistAnalysis(
          situationId,
          analysis,
          actor.sub,
          manager,
        );

        const createdSession = await this.analysisSessionsService.createSession(
          {
            situationId,
            provider: analysis.provider,
            model: this.getModelName(),
            promptVersion: engineResult.prompt.templateVersion,
            analysisResult: analysis,
            prompt: engineResult.prompt,
            executionTimeMs: Date.now() - startedAt,
            tokenEstimate: engineResult.metrics.estimatedTokens,
          },
          manager,
        );

        await this.updateCurrentAnalysisRecord(
          situationId,
          analysis,
          createdSession,
          manager,
        );

        await this.timelineService.createEntry(
          {
            situationId,
            userId: actor.sub,
            eventType: TimelineEventType.AI_ANALYSIS_VERSION_CREATED,
            title: 'Versión de análisis IA creada',
            description: `Se registró la versión ${createdSession.version} del análisis IA.`,
            metadata: {
              sessionId: createdSession.id,
              analysisVersion: createdSession.version,
              provider: createdSession.provider,
            },
          },
          manager,
        );

        if (previousLatest) {
          await this.timelineService.createEntry(
            {
              situationId,
              userId: actor.sub,
              eventType: TimelineEventType.AI_REANALYZED,
              title: 'Situación reanalizada',
              description: `Nuevo análisis IA (v${createdSession.version}) reemplazó la versión vigente v${previousLatest.version}.`,
              metadata: {
                fromVersion: previousLatest.version,
                toVersion: createdSession.version,
                sessionId: createdSession.id,
              },
            },
            manager,
          );
        }

        return createdSession;
      });

      const [impactAssessment, recommendations, timeline] = await Promise.all([
        this.impactService.findBySituation(situationId),

        this.recommendationsService.findBySituation(situationId),

        this.timelineService.findBySituation(situationId),
      ]);

      await this.auditLogService.record({
        actor,
        action: previousLatest
          ? AuditAction.AI_REANALYZED
          : AuditAction.AI_ANALYSIS_COMPLETED,
        resourceType: AuditResourceType.AI_ANALYSIS,
        resourceId: situationId,
        metadata: {
          sessionId: session.id,
          analysisVersion: session.version,
          provider: session.provider,
          previousVersion: previousLatest?.version ?? null,
        },
      });

      return {
        situationId,

        sessionId: session.id,

        analysisVersion: session.version,

        isLatest: true,

        createdAt: session.createdAt,

        impactAssessment,

        recommendations: recommendations.items,

        timeline: timeline.items,

        confidence: analysis.confidence.overall,

        analysis,
      };
    } catch (error) {
      const causeMessage =
        error instanceof Error
          ? error.message
          : 'No fue posible completar el análisis IA.';

      this.logger.error(
        `Análisis IA fallido situationId=${situationId}: ${causeMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      await this.timelineService.createEntry({
        situationId,

        userId: actor.sub,

        eventType: TimelineEventType.AI_ANALYSIS_FAILED,

        title: 'Análisis IA fallido',

        description: causeMessage,

        metadata: {
          provider: this.geminiProvider.name,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        },
      });

      await this.auditLogService.record({
        actor,
        action: AuditAction.AI_ANALYSIS_FAILED,
        resourceType: AuditResourceType.AI_ANALYSIS,
        resourceId: situationId,
        metadata: {
          provider: this.geminiProvider.name,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        },
      });

      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        `No fue posible completar el análisis IA: ${causeMessage}`,
        { cause: error },
      );
    }
  }

  async getPersistedAnalysis(
    situationId: string,
  ): Promise<SituationAIAnalysisResponseDto> {
    await this.ensureSituationExists(situationId);

    const record =
      await this.analysisRecordRepository.findBySituationId(situationId);

    if (!record) {
      throw new NotFoundException(
        `Análisis IA no encontrado para la situación: ${situationId}`,
      );
    }

    const latestSession =
      await this.analysisSessionsService.getLatestSession(situationId);

    return {
      situationId: record.situationId,

      sessionId: record.currentSessionId,

      analysisVersion: latestSession?.version ?? 1,

      isLatest: true,

      provider: record.provider,

      analysis: record.analysisResult,

      createdAt: latestSession?.createdAt ?? record.createdAt,

      updatedAt: record.updatedAt,
    };
  }

  private async updateCurrentAnalysisRecord(
    situationId: string,
    analysis: AIAnalysisResult,
    session: SituationAnalysisSession,
    manager?: EntityManager,
  ): Promise<void> {
    const recordRepository = manager
      ? manager.getRepository(SituationAIAnalysisRecord)
      : this.analysisRecordRepository;

    const existing = manager
      ? await recordRepository.findOne({ where: { situationId } })
      : await this.analysisRecordRepository.findBySituationId(situationId);

    if (existing) {
      existing.currentSessionId = session.id;
      existing.provider = analysis.provider;
      existing.analysisResult = analysis;
      await recordRepository.save(existing);
      return;
    }

    const record = recordRepository.create({
      situationId,
      currentSessionId: session.id,
      provider: analysis.provider,
      analysisResult: analysis,
    });

    await recordRepository.save(record);
  }

  private getModelName(): string {
    return (
      this.configService.get<string>('gemini.model')?.trim() ??
      'gemini-3-flash-preview'
    );
  }

  private async discardFailedRegistration(situationId: string): Promise<void> {
    await this.analysisRecordRepository.delete({ situationId });
    await this.analysisSessionsService.deleteBySituationId(situationId);
    await this.situationsRepository.delete({ id: situationId });

    this.logger.warn(
      `Registro inicial revertido porque el análisis IA no se completó situationId=${situationId}`,
    );
  }

  private async ensureSituationExists(situationId: string): Promise<void> {
    const exists = await this.situationsRepository.exist({
      where: { id: situationId },
    });

    if (!exists) {
      throw new NotFoundException(`Situación no encontrada: ${situationId}`);
    }
  }
}
