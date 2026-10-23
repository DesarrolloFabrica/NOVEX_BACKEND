import { ServiceUnavailableException } from '@nestjs/common';
import { UserStatus } from '../common/enums/identity.enums';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { SituationAIAnalysisRecord } from './entities/situation-ai-analysis-record.entity';
import { SituationAnalysisSession } from '../ai-analysis-sessions/entities/situation-analysis-session.entity';
import { Situation } from '../situations/entities/situation.entity';
import { AIOrchestrator } from './ai-orchestrator.service';

describe('AIOrchestrator initial registration', () => {
  it('elimina el expediente provisional cuando falla el análisis IA, dentro de su reclamo', async () => {
    const manager = {
      query: jest.fn().mockResolvedValue([{ id: 'situation-id' }]),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const dataSource = {
      query: jest.fn().mockResolvedValue([[{ id: 'situation-id' }], 1]),
      transaction: jest.fn((work: (m: typeof manager) => unknown) =>
        Promise.resolve(work(manager)),
      ),
    };
    const situationsService = {
      create: jest.fn().mockResolvedValue({ id: 'situation-id' }),
    };
    const orchestrator = new AIOrchestrator(
      {} as never,
      dataSource as never,
      {} as never,
      situationsService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { record: jest.fn().mockResolvedValue(null) } as never,
    );
    jest
      .spyOn(
        orchestrator as unknown as {
          runClaimedAnalysis: () => Promise<unknown>;
        },
        'runClaimedAnalysis',
      )
      .mockRejectedValue(
        new ServiceUnavailableException('Gemini no respondió'),
      );
    const actor: AuthPayload = {
      sub: 'user-id',
      email: 'saber.pro@cun.edu.co',
      roleId: 'role-id',
      roleCode: 'COORDINADOR',
      coordinationId: 'coordination-id',
      permissions: ['SITUATIONS_CREATE', 'AI_ANALYZE'],
      status: UserStatus.ACTIVE,
    };

    await expect(
      orchestrator.registerAndExecute({} as never, actor),
    ).rejects.toThrow(
      'La situación no fue registrada porque el análisis IA no pudo completarse',
    );

    expect(manager.delete).toHaveBeenCalledWith(SituationAIAnalysisRecord, {
      situationId: 'situation-id',
    });
    expect(manager.delete).toHaveBeenCalledWith(SituationAnalysisSession, {
      situationId: 'situation-id',
    });
    expect(manager.delete).toHaveBeenCalledWith(Situation, {
      id: 'situation-id',
    });
  });
});
