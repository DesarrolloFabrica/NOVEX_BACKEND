import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserStatus } from '../common/enums/identity.enums';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { AIOrchestrator } from './ai-orchestrator.service';

describe('AI-002 atomic persistence', () => {
  it('envuelve persistencia post-Gemini en una transacción', async () => {
    const recordRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((value: unknown) => value),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue(recordRepository),
    };
    const transaction = jest.fn(
      (work: (entityManager: typeof manager) => unknown) =>
        Promise.resolve(work(manager)),
    );
    const dataSource = { transaction } as unknown as DataSource;

    const analysisService = {
      normalizeCoordinationReferences: jest.fn().mockResolvedValue({}),
      validateAnalysis: jest.fn().mockReturnValue({
        provider: 'gemini',
        confidence: { overall: 0.9 },
      }),
      persistAnalysis: jest.fn().mockResolvedValue({
        situationId: 'situation-id',
        impactAssessmentId: 'impact-id',
        recommendationIds: [],
        timelineEntryIds: [],
      }),
    };

    const analysisSessionsService = {
      getLatestSession: jest.fn().mockResolvedValue(null),
      createSession: jest.fn().mockResolvedValue({
        id: 'session-id',
        version: 1,
        provider: 'gemini',
        createdAt: new Date(),
      }),
    };

    const timelineService = {
      createEntry: jest.fn().mockResolvedValue({ id: 'timeline-id' }),
      findBySituation: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };

    const orchestrator = new AIOrchestrator(
      { get: jest.fn().mockReturnValue('gemini-test') } as never,
      dataSource,
      { exist: jest.fn().mockResolvedValue(true) } as never,
      {} as never,
      {
        buildForSituation: jest.fn().mockResolvedValue({
          context: {},
          prompt: { templateVersion: 'v1' },
          metrics: { estimatedTokens: 10 },
        }),
      } as never,
      {
        name: 'gemini',
        executeAnalysis: jest.fn().mockResolvedValue({
          provider: 'gemini',
          confidence: { overall: 0.9 },
        }),
      } as never,
      analysisService as never,
      { findBySituation: jest.fn().mockResolvedValue({}) } as never,
      { findBySituation: jest.fn().mockResolvedValue({ items: [] }) } as never,
      timelineService as never,
      {
        findBySituationId: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      } as never,
      analysisSessionsService as never,
    );

    const actor: AuthPayload = {
      sub: 'user-id',
      email: 'user@cun.edu.co',
      roleId: 'role-id',
      roleCode: 'ANALISTA',
      coordinationId: null,
      permissions: ['AI_ANALYZE'],
      status: UserStatus.ACTIVE,
    };

    await orchestrator.execute('situation-id', actor.sub);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(analysisService.persistAnalysis).toHaveBeenCalled();
    expect(analysisSessionsService.createSession).toHaveBeenCalled();
  });

  it('no persiste análisis cuando Gemini falla', async () => {
    const transaction = jest.fn();
    const dataSource = { transaction } as unknown as DataSource;

    const analysisService = {
      normalizeCoordinationReferences: jest.fn(),
      validateAnalysis: jest.fn(),
      persistAnalysis: jest.fn(),
    };

    const timelineService = {
      createEntry: jest.fn().mockResolvedValue({ id: 'timeline-id' }),
    };

    const orchestrator = new AIOrchestrator(
      { get: jest.fn() } as never,
      dataSource,
      { exist: jest.fn().mockResolvedValue(true) } as never,
      {} as never,
      {
        buildForSituation: jest.fn().mockResolvedValue({
          context: {},
          prompt: { templateVersion: 'v1' },
          metrics: { estimatedTokens: 10 },
        }),
      } as never,
      {
        name: 'gemini',
        executeAnalysis: jest
          .fn()
          .mockRejectedValue(new ServiceUnavailableException('Gemini error')),
      } as never,
      analysisService as never,
      {} as never,
      {} as never,
      timelineService as never,
      {} as never,
      { getLatestSession: jest.fn().mockResolvedValue(null) } as never,
    );

    await expect(
      orchestrator.execute('situation-id', 'user-id'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(transaction).not.toHaveBeenCalled();
    expect(analysisService.persistAnalysis).not.toHaveBeenCalled();
  });
});
