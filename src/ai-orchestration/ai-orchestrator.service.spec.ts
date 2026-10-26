import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { UserStatus } from '../common/enums/identity.enums';
import { AIOrchestrator } from './ai-orchestrator.service';

describe('AIOrchestrator initial registration', () => {
  it('persiste el expediente sin exigir análisis IA ni tocar el reclamo', async () => {
    const situationsRepository = {
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const dataSource = {
      query: jest.fn(),
      transaction: jest.fn(),
    };
    const situationsService = {
      create: jest.fn().mockResolvedValue({ id: 'situation-id' }),
    };
    const orchestrator = new AIOrchestrator(
      {} as never,
      dataSource as never,
      situationsRepository as never,
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
    const executeSpy = jest.spyOn(orchestrator, 'execute');
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
    ).resolves.toEqual({
      situation: { id: 'situation-id' },
      analysis: null,
      replayed: false,
    });

    expect(situationsService.create).toHaveBeenCalled();
    expect(executeSpy).not.toHaveBeenCalled();
    // Sin análisis no hay reclamo que tomar ni registro que revertir.
    expect(dataSource.query).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(situationsRepository.delete).not.toHaveBeenCalled();
  });
});
