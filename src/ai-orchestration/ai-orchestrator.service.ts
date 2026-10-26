import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
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

import type {
  CreateSituationDto,
  SituationResponseDto,
} from '../situations/dto/situation.dto';

import { SituationsService } from '../situations/situations.service';
import { Situation } from '../situations/entities/situation.entity';
import { computeRegistrationFingerprint } from '../situations/registration-fingerprint';
import { isUniqueViolation } from '../common/utils/database-errors';

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

/**
 * Duración del reclamo de análisis. Debe superar el tope de Gemini (60 s por
 * defecto) con margen para persistir. Si el tope de Gemini crece por encima de
 * ~90 s, aumentar esta constante. La seguridad no depende de este valor: la
 * confirmación y el borrado van fenciados por token.
 */
export const ANALYSIS_CLAIM_LEASE_MS = 150_000;

/**
 * TypeORM devuelve `[filas, conteo]` para UPDATE y DELETE en PostgreSQL, a
 * diferencia de SELECT, que devuelve solo las filas. Esta función lee el conteo.
 */
function updatedRowCount(result: unknown): number {
  const [, count] = result as [unknown[], number];
  return count;
}

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

  /**
   * ALTA DE UNA SITUACIÓN (`POST /situations/register-with-analysis`).
   *
   * ANÁLISIS IA EN EL REGISTRO: desactivado en la versión de cartas. Antes el
   * alta exigía Gemini en el mismo acto y, si fallaba, se borraba el
   * expediente y el usuario no podía reportar. Ahora el alta solo persiste la
   * situación (`analysis: null`) y el análisis se pide aparte con
   * `POST :id/analyze`, que conserva el reclamo fenciado de `execute`.
   *
   * IDEMPOTENCIA (independiente de la IA). Con `idempotencyKey`, la unicidad la
   * fija el índice parcial `uq_situations_creator_client_request`: solo el
   * intento que inserta la fila crea el registro.
   * - Clave nueva                       → crea y responde `replayed: false`.
   * - Clave ya usada, mismo contenido    → no crea nada; devuelve la situación
   *   existente con `replayed: true`.
   * - Clave ya usada, contenido distinto → 422 `IDEMPOTENCY_KEY_REUSED`; no
   *   crea ni modifica nada.
   * - Dos intentos simultáneos           → uno inserta; el otro choca con el
   *   índice y responde con el registro ganador (o 409
   *   `REGISTRATION_IN_PROGRESS` si todavía no es visible).
   * Sin clave se mantiene el comportamiento anterior: cada envío crea una fila.
   */
  async registerAndExecute(
    dto: CreateSituationDto,
    actor: AuthPayload,
    idempotencyKey?: string,
  ): Promise<RegisterSituationWithAnalysisResponseDto> {
    if (!idempotencyKey) {
      const situation = await this.situationsService.create(dto, actor);
      return this.newRegistrationResponse(situation);
    }

    const requestFingerprint = computeRegistrationFingerprint(dto);
    const existing = await this.findRegistrationByKey(
      actor.sub,
      idempotencyKey,
    );
    if (existing) {
      return this.resolveExistingRegistration(
        existing,
        requestFingerprint,
        actor,
      );
    }

    let situation: SituationResponseDto;
    try {
      situation = await this.situationsService.create(dto, actor, {
        clientRequestId: idempotencyKey,
        requestFingerprint,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      // Otra solicitud con la misma clave insertó primero.
      const concurrent = await this.findRegistrationByKey(
        actor.sub,
        idempotencyKey,
      );
      if (!concurrent) {
        throw this.registrationInProgress();
      }
      return this.resolveExistingRegistration(
        concurrent,
        requestFingerprint,
        actor,
      );
    }

    return this.newRegistrationResponse(situation);
  }

  /**
   * Ejecuta el análisis de una situación existente bajo reclamo. Si el reclamo
   * lo tiene otro intento vigente, responde 409 sin analizar. En fallo no
   * elimina nada: la situación ya existe y se conserva.
   */
  async execute(
    situationId: string,
    actor: AuthPayload,
  ): Promise<ExecuteAIAnalysisResponseDto> {
    await this.ensureSituationExists(situationId);

    const claimToken = await this.claimAnalysis(situationId);
    try {
      return await this.runClaimedAnalysis(situationId, actor, claimToken);
    } finally {
      await this.releaseAnalysisClaim(situationId, claimToken);
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

  /**
   * Registro recién insertado por esta solicitud. No se analiza (ver
   * `registerAndExecute`), así que no hay nada que revertir: la situación
   * queda persistida aunque Gemini no esté disponible.
   */
  private newRegistrationResponse(
    situation: SituationResponseDto,
  ): RegisterSituationWithAnalysisResponseDto {
    this.logger.log(
      `Registro sin análisis IA (diferido): situationId=${situation.id}`,
    );
    return { situation, analysis: null, replayed: false };
  }

  private async runClaimedAnalysis(
    situationId: string,
    actor: AuthPayload,
    claimToken: string,
  ): Promise<ExecuteAIAnalysisResponseDto> {
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
        claimToken,
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
        // Confirmación fenciada: si otro intento tomó el reclamo, este resultado
        // no se escribe. La transacción solo abarca la persistencia, no Gemini.
        await this.assertClaimHeld(manager, situationId, claimToken);

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
          claimToken,
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
      if (error instanceof ConflictException) {
        // Pérdida de reclamo: no es un fallo de IA y no se registra como tal.
        throw error;
      }

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
          claimToken,
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
          claimToken,
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

  /**
   * Toma el reclamo de análisis si está libre o vencido. Un único UPDATE
   * condicional: dos intentos simultáneos no pueden ganar los dos.
   */
  private async claimAnalysis(situationId: string): Promise<string> {
    const claimToken = randomUUID();

    const result: unknown = await this.dataSource.query(
      `UPDATE situations
          SET analysis_claim_token = $2,
              analysis_claim_expires_at = now() + ($3::int * interval '1 millisecond')
        WHERE id = $1
          AND (analysis_claim_expires_at IS NULL OR analysis_claim_expires_at < now())
        RETURNING id`,
      [situationId, claimToken, ANALYSIS_CLAIM_LEASE_MS],
    );

    if (updatedRowCount(result) !== 1) {
      throw new ConflictException({
        code: 'ANALYSIS_IN_PROGRESS',
        message:
          'El análisis de esta situación ya está en curso. Espere e intente de nuevo.',
        situationId,
      });
    }

    return claimToken;
  }

  /** Libera el reclamo solo si todavía es de este intento. */
  private async releaseAnalysisClaim(
    situationId: string,
    claimToken: string,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE situations
          SET analysis_claim_token = NULL, analysis_claim_expires_at = NULL
        WHERE id = $1 AND analysis_claim_token = $2`,
      [situationId, claimToken],
    );
  }

  /**
   * Verificación fenciada dentro de la transacción de confirmación. El
   * `FOR UPDATE` bloquea la fila mientras se escribe el análisis.
   */
  private async assertClaimHeld(
    manager: EntityManager,
    situationId: string,
    claimToken: string,
  ): Promise<void> {
    const rows: Array<{ id: string }> = await manager.query(
      `SELECT id FROM situations
        WHERE id = $1 AND analysis_claim_token = $2
        FOR UPDATE`,
      [situationId, claimToken],
    );

    if (rows.length !== 1) {
      throw new ConflictException({
        code: 'ANALYSIS_CLAIM_LOST',
        message:
          'El análisis fue reemplazado por otro intento. Este resultado no se guardó.',
        situationId,
      });
    }
  }

  private findRegistrationByKey(
    creatorUserId: string,
    idempotencyKey: string,
  ): Promise<Situation | null> {
    return this.situationsRepository.findOne({
      where: {
        createdByUserId: creatorUserId,
        clientRequestId: idempotencyKey,
      },
    });
  }

  /**
   * Respuesta para una clave ya usada: replay de SOLO LECTURA. Nunca modifica
   * la situación, nunca crea otra y nunca llama a Gemini. Si alguien pidió el
   * análisis después (`POST :id/analyze`), se devuelve; si no, `analysis: null`.
   */
  private async resolveExistingRegistration(
    registration: Situation,
    requestFingerprint: string,
    actor: AuthPayload,
  ): Promise<RegisterSituationWithAnalysisResponseDto> {
    if (registration.requestFingerprint !== requestFingerprint) {
      throw new UnprocessableEntityException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message:
          'La clave de registro ya se usó con otro contenido. Confirme el registro de nuevo.',
      });
    }

    const [situation, record] = await Promise.all([
      this.situationsService.getById(registration.id, actor),
      this.analysisRecordRepository.findBySituationId(registration.id),
    ]);
    const analysis = record
      ? await this.buildCompletedAnalysisResponse(registration.id, record)
      : null;

    return { situation, analysis, replayed: true };
  }

  private registrationInProgress(): ConflictException {
    return new ConflictException({
      code: 'REGISTRATION_IN_PROGRESS',
      message:
        'El registro sigue procesándose. Vuelva a confirmar en unos segundos; no se creará un duplicado.',
    });
  }

  private async buildCompletedAnalysisResponse(
    situationId: string,
    record: SituationAIAnalysisRecord,
  ): Promise<ExecuteAIAnalysisResponseDto> {
    const [latestSession, impactAssessment, recommendations, timeline] =
      await Promise.all([
        this.analysisSessionsService.getLatestSession(situationId),
        this.impactService.findBySituation(situationId),
        this.recommendationsService.findBySituation(situationId),
        this.timelineService.findBySituation(situationId),
      ]);

    return {
      situationId,
      sessionId: record.currentSessionId,
      analysisVersion: latestSession?.version ?? 1,
      isLatest: true,
      createdAt: latestSession?.createdAt ?? record.createdAt,
      impactAssessment,
      recommendations: recommendations.items,
      timeline: timeline.items,
      confidence: record.analysisResult.confidence.overall,
      analysis: record.analysisResult,
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

  private async ensureSituationExists(situationId: string): Promise<void> {
    const exists = await this.situationsRepository.exist({
      where: { id: situationId },
    });

    if (!exists) {
      throw new NotFoundException(`Situación no encontrada: ${situationId}`);
    }
  }
}
