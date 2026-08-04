import { Injectable, NotFoundException } from '@nestjs/common';
import type { CompletePrompt } from '../ai-prompt-engine/contracts/prompt.contract';
import {
  AnalysisHistoryResponseDto,
  AnalysisSessionDetailDto,
  AnalysisSessionSummaryDto,
  CreateAnalysisSessionInput,
} from './dto/ai-analysis-session.dto';
import { SituationAnalysisSession } from './entities/situation-analysis-session.entity';
import { SituationAnalysisSessionRepository } from './repositories/situation-analysis-session.repository';

@Injectable()
export class AIAnalysisSessionsService {
  constructor(
    private readonly sessionsRepository: SituationAnalysisSessionRepository,
  ) {}

  async createSession(
    input: CreateAnalysisSessionInput,
  ): Promise<SituationAnalysisSession> {
    const version = await this.sessionsRepository.getNextVersion(
      input.situationId,
    );

    const session = this.sessionsRepository.create({
      situationId: input.situationId,
      version,
      provider: input.provider,
      model: input.model,
      promptVersion: input.promptVersion,
      analysisResult: input.analysisResult,
      promptSnapshot: this.serializePrompt(input.prompt),
      executionTimeMs: input.executionTimeMs,
      tokenEstimate: input.tokenEstimate,
    });

    return this.sessionsRepository.save(session);
  }

  async getHistory(situationId: string): Promise<AnalysisHistoryResponseDto> {
    const sessions =
      await this.sessionsRepository.findBySituationId(situationId);
    const latestVersion = sessions.at(-1)?.version ?? null;

    return {
      situationId,
      items: sessions.map((session) => this.toSummary(session, latestVersion)),
      total: sessions.length,
      latestVersion,
    };
  }

  async getByVersion(
    situationId: string,
    version: number,
  ): Promise<AnalysisSessionDetailDto> {
    const session = await this.sessionsRepository.findBySituationIdAndVersion(
      situationId,
      version,
    );
    if (!session) {
      throw new NotFoundException(
        `Sesión de análisis no encontrada: situación ${situationId}, versión ${version}`,
      );
    }

    const latest =
      await this.sessionsRepository.findLatestBySituationId(situationId);

    return this.toDetail(session, latest?.version ?? session.version);
  }

  async getLatestSession(
    situationId: string,
  ): Promise<SituationAnalysisSession | null> {
    return this.sessionsRepository.findLatestBySituationId(situationId);
  }

  private serializePrompt(prompt: CompletePrompt): string {
    return JSON.stringify(
      {
        templateId: prompt.templateId,
        templateVersion: prompt.templateVersion,
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        expectedSchema: prompt.expectedSchema,
      },
      null,
      2,
    );
  }

  private toSummary(
    session: SituationAnalysisSession,
    latestVersion: number | null,
  ): AnalysisSessionSummaryDto {
    return {
      sessionId: session.id,
      situationId: session.situationId,
      analysisVersion: session.version,
      isLatest: latestVersion === session.version,
      provider: session.provider,
      model: session.model,
      promptVersion: session.promptVersion,
      confidence: session.analysisResult.confidence.overall,
      executionTimeMs: session.executionTimeMs,
      tokenEstimate: session.tokenEstimate,
      createdAt: session.createdAt,
    };
  }

  private toDetail(
    session: SituationAnalysisSession,
    latestVersion: number,
  ): AnalysisSessionDetailDto {
    return {
      ...this.toSummary(session, latestVersion),
      analysis: session.analysisResult,
      promptSnapshot: session.promptSnapshot,
    };
  }
}
