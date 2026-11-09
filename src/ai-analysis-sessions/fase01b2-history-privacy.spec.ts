import { AIAnalysisSessionsService } from './ai-analysis-sessions.service';
import {
  MIN_RETENTION_DAYS,
  isPromptSnapshotBeyondRetention,
  isSessionBeyondRetention,
  resolveAiRetentionPolicy,
} from './ai-retention.policy';

/**
 * FASE 01B.2 · Historial IA. El prompt completo solo lo ve ADMIN; el resto de
 * lectores autorizados conserva versión, modelo, plantilla y resultado. La
 * retención es configurable, desactivada por defecto y nunca borra nada.
 */
function buildService() {
  const session = {
    id: 'session-1',
    situationId: 'situation-1',
    version: 2,
    provider: 'gemini',
    model: 'gemini-test',
    promptVersion: 'v2',
    analysisResult: { confidence: { overall: 0.8 } },
    promptSnapshot: '{"systemPrompt":"...","userPrompt":"..."}',
    executionTimeMs: 100,
    tokenEstimate: 10,
    createdAt: new Date('2026-11-01T00:00:00Z'),
  };
  const repository = {
    findBySituationIdAndVersion: jest.fn().mockResolvedValue(session),
    findLatestBySituationId: jest.fn().mockResolvedValue(session),
  };
  return new AIAnalysisSessionsService(repository as never);
}

describe('Fase 01B.2 · permisos sobre el historial IA', () => {
  it('ADMIN recibe el prompt completo', async () => {
    const detail = await buildService().getByVersion('situation-1', 2, {
      roleCode: 'ADMIN',
    });
    expect(detail.promptSnapshot).toContain('systemPrompt');
    expect(detail.promptSnapshotWithheld).toBe(false);
  });

  it.each(['ANALISTA', 'DIRECTOR', 'COORDINADOR'])(
    '%s recibe versión y resultado, pero no el prompt',
    async (roleCode) => {
      const detail = await buildService().getByVersion('situation-1', 2, {
        roleCode,
      });
      expect(detail.promptSnapshot).toBeNull();
      expect(detail.promptSnapshotWithheld).toBe(true);
      expect(detail).toMatchObject({
        analysisVersion: 2,
        promptVersion: 'v2',
        model: 'gemini-test',
        analysis: { confidence: { overall: 0.8 } },
      });
    },
  );
});

describe('Fase 01B.2 · política de retención del historial IA', () => {
  it('por defecto la retención es indefinida y sin ejecución', () => {
    const policy = resolveAiRetentionPolicy({});
    expect(policy).toEqual({
      promptSnapshotDays: null,
      sessionDays: null,
      enforcementEnabled: false,
    });
    expect(
      isPromptSnapshotBeyondRetention(new Date('2000-01-01'), policy),
    ).toBe(false);
    expect(isSessionBeyondRetention(new Date('2000-01-01'), policy)).toBe(
      false,
    );
  });

  it.each(['abc', '-5', '10', '7.5', ' '])(
    'un valor inválido o menor al mínimo (%p) deja la retención indefinida',
    (raw) => {
      expect(
        resolveAiRetentionPolicy({ AI_PROMPT_SNAPSHOT_RETENTION_DAYS: raw })
          .promptSnapshotDays,
      ).toBeNull();
    },
  );

  it('con días válidos solo calcula elegibilidad', () => {
    const policy = resolveAiRetentionPolicy({
      AI_PROMPT_SNAPSHOT_RETENTION_DAYS: String(MIN_RETENTION_DAYS),
      AI_SESSION_RETENTION_DAYS: '365',
    });
    const now = new Date('2026-11-09T00:00:00Z');
    expect(policy.enforcementEnabled).toBe(false);
    expect(
      isPromptSnapshotBeyondRetention(
        new Date('2026-09-01T00:00:00Z'),
        policy,
        now,
      ),
    ).toBe(true);
    expect(
      isPromptSnapshotBeyondRetention(
        new Date('2026-11-01T00:00:00Z'),
        policy,
        now,
      ),
    ).toBe(false);
    // Una sesión de un caso aún activo (sin fecha de congelación) nunca vence.
    expect(isSessionBeyondRetention(null, policy, now)).toBe(false);
  });
});
