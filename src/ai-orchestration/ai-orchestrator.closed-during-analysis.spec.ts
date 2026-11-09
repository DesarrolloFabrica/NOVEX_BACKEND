import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserStatus } from '../common/enums/identity.enums';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { AIOrchestrator } from './ai-orchestrator.service';

/**
 * M1 · CIERRE CONCURRENTE. Gemini corre FUERA de toda transacción; la
 * confirmación vuelve a leer la fila con `FOR UPDATE`. Si mientras tanto el
 * caso se cerró (la resolución bloquea la misma fila), el análisis NO se
 * escribe: 409 `SITUATION_CLOSED`, sin evaluación de impacto, sin sesión y sin
 * registrarlo como fallo de IA. El reclamo se libera igual.
 */
function buildOrchestrator(lockedRow: { status: string; sameClaim: boolean }) {
  const persistAnalysis = jest.fn();
  const createSession = jest.fn();
  const timelineCreateEntry = jest.fn().mockResolvedValue({ id: 't' });
  const auditRecord = jest.fn().mockResolvedValue(null);

  const dataSource = {
    query: jest.fn().mockResolvedValue([[{ id: 'situation-id' }], 1]),
    transaction: jest.fn(),
  };
  const claimedToken = () =>
    (dataSource.query.mock.calls[0] as [string, string[]])[1][1];
  const manager = {
    getRepository: jest.fn(),
    query: jest.fn(() =>
      Promise.resolve([
        {
          claim_token: lockedRow.sameClaim ? claimedToken() : 'otro-intento',
          status: lockedRow.status,
        },
      ]),
    ),
  };
  dataSource.transaction.mockImplementation(
    (work: (m: typeof manager) => unknown) => Promise.resolve(work(manager)),
  );

  const orchestrator = new AIOrchestrator(
    { get: jest.fn().mockReturnValue('gemini-test') } as never,
    dataSource as unknown as DataSource,
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
    {
      normalizeCoordinationReferences: jest.fn().mockResolvedValue({}),
      validateAnalysis: jest.fn().mockReturnValue({
        provider: 'gemini',
        confidence: { overall: 0.9 },
      }),
      persistAnalysis,
    } as never,
    { findBySituation: jest.fn() } as never,
    { findBySituation: jest.fn() } as never,
    {
      createEntry: timelineCreateEntry,
      findBySituation: jest.fn(),
    } as never,
    {
      findBySituationId: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as never,
    {
      getLatestSession: jest.fn().mockResolvedValue(null),
      createSession,
    } as never,
    { record: auditRecord } as never,
  );

  return {
    orchestrator,
    dataSource,
    persistAnalysis,
    createSession,
    timelineCreateEntry,
    auditRecord,
  };
}

const analista: AuthPayload = {
  sub: 'user-id',
  email: 'analista@test.novex.invalid',
  roleId: 'role-analista',
  roleCode: 'ANALISTA',
  coordinationId: null,
  permissions: ['AI_ANALYZE'],
  status: UserStatus.ACTIVE,
};

describe('M1 · análisis IA y cierre concurrente', () => {
  it.each(['CLOSED', 'RESOLVED'])(
    'si el caso pasó a %s durante Gemini, no se persiste nada: 409 SITUATION_CLOSED',
    async (status) => {
      const { orchestrator, dataSource, persistAnalysis, createSession } =
        buildOrchestrator({ status, sameClaim: true });

      const error = await orchestrator
        .execute('situation-id', analista)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'SITUATION_CLOSED',
      });
      expect(persistAnalysis).not.toHaveBeenCalled();
      expect(createSession).not.toHaveBeenCalled();
      // El reclamo se libera aunque el resultado se descarte.
      const [releaseSql] = dataSource.query.mock.calls.at(-1) as [string];
      expect(releaseSql).toContain('analysis_claim_token = NULL');
    },
  );

  it('un cierre concurrente no se registra como fallo de IA', async () => {
    const { orchestrator, timelineCreateEntry, auditRecord } =
      buildOrchestrator({ status: 'CLOSED', sameClaim: true });

    await orchestrator.execute('situation-id', analista).catch(() => null);

    const failedTimeline = timelineCreateEntry.mock.calls.filter(
      ([entry]: [{ eventType: string }]) =>
        entry.eventType === 'AI_ANALYSIS_FAILED',
    );
    const failedAudit = auditRecord.mock.calls.filter(
      ([entry]: [{ action: string }]) => entry.action === 'AI_ANALYSIS_FAILED',
    );
    expect(failedTimeline).toHaveLength(0);
    expect(failedAudit).toHaveLength(0);
  });

  it('con el caso activo pero el reclamo perdido, conserva ANALYSIS_CLAIM_LOST', async () => {
    const { orchestrator, persistAnalysis } = buildOrchestrator({
      status: 'IN_PROGRESS',
      sameClaim: false,
    });

    const error = await orchestrator
      .execute('situation-id', analista)
      .catch((caught: unknown) => caught);

    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'ANALYSIS_CLAIM_LOST',
    });
    expect(persistAnalysis).not.toHaveBeenCalled();
  });
});
