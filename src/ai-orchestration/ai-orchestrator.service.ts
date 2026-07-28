import {

  Injectable,

  NotFoundException,

  ServiceUnavailableException,

} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import type { AIAnalysisResult } from '../ai-analysis/contracts/ai-analysis-result.contract';

import { AIAnalysisService } from '../ai-analysis/ai-analysis.service';

import { AIAnalysisSessionsService } from '../ai-analysis-sessions/ai-analysis-sessions.service';

import { SituationAnalysisSession } from '../ai-analysis-sessions/entities/situation-analysis-session.entity';

import { TimelineEventType } from '../common/enums/situation-timeline.enums';

import { SituationsRepository } from '../situations/repositories/situations.repository';

import { SituationImpactService } from '../situation-impact/situation-impact.service';

import { SituationRecommendationsService } from '../situation-recommendations/situation-recommendations.service';

import { SituationTimelineService } from '../situation-timeline/situation-timeline.service';

import { AIPromptEngineService } from '../ai-prompt-engine/ai-prompt-engine.service';

import {

  ExecuteAIAnalysisResponseDto,

  SituationAIAnalysisResponseDto,

} from './dto/ai-orchestration.dto';

import { GeminiProvider } from './providers/gemini.provider';

import { SituationAIAnalysisRecordRepository } from './repositories/situation-ai-analysis-record.repository';



@Injectable()

export class AIOrchestrator {

  constructor(

    private readonly configService: ConfigService,

    private readonly situationsRepository: SituationsRepository,

    private readonly promptEngine: AIPromptEngineService,

    private readonly geminiProvider: GeminiProvider,

    private readonly analysisService: AIAnalysisService,

    private readonly impactService: SituationImpactService,

    private readonly recommendationsService: SituationRecommendationsService,

    private readonly timelineService: SituationTimelineService,

    private readonly analysisRecordRepository: SituationAIAnalysisRecordRepository,

    private readonly analysisSessionsService: AIAnalysisSessionsService,

  ) {}



  async execute(

    situationId: string,

    actorUserId: string,

  ): Promise<ExecuteAIAnalysisResponseDto> {

    await this.ensureSituationExists(situationId);



    const previousLatest =

      await this.analysisSessionsService.getLatestSession(situationId);



    await this.timelineService.createEntry({

      situationId,

      userId: actorUserId,

      eventType: TimelineEventType.AI_ANALYSIS_STARTED,

      title: 'Análisis IA iniciado',

      description: 'Se inició el análisis operacional con inteligencia artificial.',

      metadata: {

        provider: this.geminiProvider.name,

      },

    });



    const startedAt = Date.now();



    try {

      const engineResult = await this.promptEngine.buildForSituation(situationId);

      const analysis = await this.geminiProvider.executeAnalysis(

        engineResult.context,

        engineResult.prompt,

      );



      this.analysisService.validateAnalysis(analysis);

      await this.analysisService.persistAnalysis(situationId, analysis, actorUserId);



      const session = await this.analysisSessionsService.createSession({

        situationId,

        provider: analysis.provider,

        model: this.getModelName(),

        promptVersion: engineResult.prompt.templateVersion,

        analysisResult: analysis,

        prompt: engineResult.prompt,

        executionTimeMs: Date.now() - startedAt,

        tokenEstimate: engineResult.metrics.estimatedTokens,

      });



      await this.updateCurrentAnalysisRecord(situationId, analysis, session);



      await this.timelineService.createEntry({

        situationId,

        userId: actorUserId,

        eventType: TimelineEventType.AI_ANALYSIS_VERSION_CREATED,

        title: 'Versión de análisis IA creada',

        description: `Se registró la versión ${session.version} del análisis IA.`,

        metadata: {

          sessionId: session.id,

          analysisVersion: session.version,

          provider: session.provider,

        },

      });



      if (previousLatest) {

        await this.timelineService.createEntry({

          situationId,

          userId: actorUserId,

          eventType: TimelineEventType.AI_REANALYZED,

          title: 'Situación reanalizada',

          description: `Nuevo análisis IA (v${session.version}) reemplazó la versión vigente v${previousLatest.version}.`,

          metadata: {

            fromVersion: previousLatest.version,

            toVersion: session.version,

            sessionId: session.id,

          },

        });

      }



      const [impactAssessment, recommendations, timeline] = await Promise.all([

        this.impactService.findBySituation(situationId),

        this.recommendationsService.findBySituation(situationId),

        this.timelineService.findBySituation(situationId),

      ]);



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

      await this.timelineService.createEntry({

        situationId,

        userId: actorUserId,

        eventType: TimelineEventType.AI_ANALYSIS_FAILED,

        title: 'Análisis IA fallido',

        description:

          error instanceof Error

            ? error.message

            : 'No fue posible completar el análisis IA.',

        metadata: {

          provider: this.geminiProvider.name,

        },

      });



      if (error instanceof ServiceUnavailableException) {

        throw error;

      }



      throw new ServiceUnavailableException(

        'No fue posible completar el análisis IA.',

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

  ): Promise<void> {

    const existing =

      await this.analysisRecordRepository.findBySituationId(situationId);



    if (existing) {

      existing.currentSessionId = session.id;

      existing.provider = analysis.provider;

      existing.analysisResult = analysis;

      await this.analysisRecordRepository.save(existing);

      return;

    }



    const record = this.analysisRecordRepository.create({

      situationId,

      currentSessionId: session.id,

      provider: analysis.provider,

      analysisResult: analysis,

    });

    await this.analysisRecordRepository.save(record);

  }



  private getModelName(): string {

    return (

      this.configService.get<string>('gemini.model')?.trim() ??

      'gemini-3-flash-preview'

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


