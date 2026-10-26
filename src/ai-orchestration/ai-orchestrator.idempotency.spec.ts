import {
  ConflictException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { UserStatus } from '../common/enums/identity.enums';
import {
  SituationReportKind,
  SituationSeverity,
} from '../common/enums/situation.enums';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import type { CreateSituationDto } from '../situations/dto/situation.dto';
import { computeRegistrationFingerprint } from '../situations/registration-fingerprint';
import { AIOrchestrator } from './ai-orchestrator.service';

/*
 * Registro idempotente SIN análisis IA en el alta (versión de cartas).
 *
 * La idempotencia es independiente de la IA: la clave y la huella siguen
 * decidiendo si se crea, se repite o se rechaza. Lo que cambia respecto de
 * main es que el alta nunca toma el reclamo de análisis, nunca llama a Gemini
 * y nunca borra la fila. El reclamo sigue protegiendo `POST :id/analyze`.
 */

const KEY = '6f1c2b1e-8d2a-4c3b-9e4f-112233445566';

const dto: CreateSituationDto = {
  title: 'Caída de red',
  description: 'Sin conexión en piso 3',
  reportKind: SituationReportKind.INTERNAL,
  coordinationId: '11111111-1111-4111-8111-111111111111',
  categoryId: '22222222-2222-4222-8222-222222222222',
  severity: SituationSeverity.MEDIUM,
  occurredAt: '2026-10-22',
};

const actor: AuthPayload = {
  sub: 'user-1',
  email: 'coord@cun.edu.co',
  roleId: 'role-coord',
  roleCode: 'COORDINADOR',
  coordinationId: '11111111-1111-4111-8111-111111111111',
  permissions: ['SITUATIONS_CREATE', 'AI_ANALYZE', 'SITUATIONS_VIEW'],
  status: UserStatus.ACTIVE,
};

const uniqueViolation = () =>
  new QueryFailedError('INSERT INTO situations', [], {
    code: '23505',
  } as never);

const analysisRecord = {
  id: 'record-1',
  situationId: 'sit-1',
  currentSessionId: 'session-1',
  createdAt: new Date('2026-10-22T10:00:00Z'),
  analysisResult: { confidence: { overall: 0.82 } },
};

interface Options {
  existing?: unknown;
  record?: unknown;
  create?: jest.Mock;
  /** false: el reclamo de análisis lo tiene otro intento vigente. */
  claimAvailable?: boolean;
  runClaimed?: () => Promise<unknown>;
}

function createOrchestrator(options: Options = {}) {
  const manager = {
    query: jest.fn().mockResolvedValue([{ id: 'sit-1' }]),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const dataSource = {
    query: jest
      .fn()
      .mockResolvedValue(
        options.claimAvailable === false ? [[], 0] : [[{ id: 'sit-1' }], 1],
      ),
    transaction: jest.fn((work: (m: typeof manager) => unknown) =>
      Promise.resolve(work(manager)),
    ),
  };
  const situationsRepository = {
    findOne: jest.fn().mockResolvedValue(options.existing ?? null),
    exist: jest.fn().mockResolvedValue(true),
    delete: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };
  const situationsService = {
    create:
      options.create ??
      jest.fn().mockResolvedValue({ id: 'sit-1', status: 'OPEN' }),
    getById: jest
      .fn()
      .mockResolvedValue({ id: 'sit-1', status: 'IN_PROGRESS' }),
  };
  const analysisRecordRepository = {
    findBySituationId: jest.fn().mockResolvedValue(options.record ?? null),
  };
  const analysisSessionsService = {
    getLatestSession: jest
      .fn()
      .mockResolvedValue({ version: 1, createdAt: new Date() }),
  };
  const orchestrator = new AIOrchestrator(
    {} as never,
    dataSource as never,
    situationsRepository as never,
    situationsService as never,
    {} as never,
    {} as never,
    {} as never,
    { findBySituation: jest.fn().mockResolvedValue({}) } as never,
    { findBySituation: jest.fn().mockResolvedValue({ items: [] }) } as never,
    { findBySituation: jest.fn().mockResolvedValue({ items: [] }) } as never,
    analysisRecordRepository as never,
    analysisSessionsService as never,
    { record: jest.fn().mockResolvedValue(null) } as never,
  );

  const runClaimed = jest.spyOn(
    orchestrator as unknown as {
      runClaimedAnalysis: (...args: unknown[]) => Promise<unknown>;
    },
    'runClaimedAnalysis',
  );
  runClaimed.mockImplementation(
    options.runClaimed ?? (() => Promise.resolve({ situationId: 'sit-1' })),
  );

  return {
    orchestrator,
    runClaimed,
    manager,
    dataSource,
    situationsRepository,
    situationsService,
  };
}

describe('AIOrchestrator registro idempotente (decisiones)', () => {
  const fingerprint = computeRegistrationFingerprint(dto);

  it('sin cabecera mantiene el flujo anterior sin clave ni huella, y sin IA', async () => {
    const { orchestrator, situationsService, runClaimed, dataSource } =
      createOrchestrator();

    const result = await orchestrator.registerAndExecute(dto, actor);

    expect(situationsService.create).toHaveBeenCalledWith(dto, actor);
    expect(runClaimed).not.toHaveBeenCalled();
    expect(dataSource.query).not.toHaveBeenCalled();
    expect(result).toEqual({
      situation: { id: 'sit-1', status: 'OPEN' },
      analysis: null,
      replayed: false,
    });
  });

  it('clave nueva crea la fila con clave y huella, sin analizar ni tomar el reclamo', async () => {
    const { orchestrator, situationsService, runClaimed, dataSource } =
      createOrchestrator();

    const result = await orchestrator.registerAndExecute(dto, actor, KEY);

    expect(situationsService.create).toHaveBeenCalledTimes(1);
    expect(situationsService.create).toHaveBeenCalledWith(dto, actor, {
      clientRequestId: KEY,
      requestFingerprint: fingerprint,
    });
    expect(runClaimed).not.toHaveBeenCalled();
    expect(dataSource.query).not.toHaveBeenCalled();
    expect(result.replayed).toBe(false);
    expect(result.analysis).toBeNull();
  });

  it('repetición con análisis ya pedido aparte: solo lee y lo devuelve', async () => {
    const {
      orchestrator,
      situationsService,
      runClaimed,
      situationsRepository,
      dataSource,
    } = createOrchestrator({
      existing: { id: 'sit-1', requestFingerprint: fingerprint },
      record: analysisRecord,
    });

    const result = await orchestrator.registerAndExecute(dto, actor, KEY);

    expect(situationsService.create).not.toHaveBeenCalled();
    expect(runClaimed).not.toHaveBeenCalled();
    expect(situationsRepository.save).not.toHaveBeenCalled();
    expect(situationsRepository.update).not.toHaveBeenCalled();
    expect(dataSource.query).not.toHaveBeenCalled();
    expect(result.replayed).toBe(true);
    expect(result.analysis?.sessionId).toBe('session-1');
    expect(result.analysis?.confidence).toBe(0.82);
  });

  it('repetición sin análisis (respuesta perdida): devuelve la misma fila, sin crear, analizar ni borrar', async () => {
    const { orchestrator, situationsService, runClaimed, manager, dataSource } =
      createOrchestrator({
        existing: { id: 'sit-1', requestFingerprint: fingerprint },
        record: null,
      });

    const result = await orchestrator.registerAndExecute(dto, actor, KEY);

    expect(situationsService.create).not.toHaveBeenCalled();
    expect(runClaimed).not.toHaveBeenCalled();
    expect(dataSource.query).not.toHaveBeenCalled();
    expect(manager.delete).not.toHaveBeenCalled();
    expect(result).toEqual({
      situation: { id: 'sit-1', status: 'IN_PROGRESS' },
      analysis: null,
      replayed: true,
    });
  });

  it('repetición mientras otro intento analiza la fila: el replay no depende del reclamo', async () => {
    const { orchestrator, situationsService, runClaimed, manager } =
      createOrchestrator({
        existing: { id: 'sit-1', requestFingerprint: fingerprint },
        record: null,
        claimAvailable: false,
      });

    const result = await orchestrator.registerAndExecute(dto, actor, KEY);

    expect(result.replayed).toBe(true);
    expect(situationsService.create).not.toHaveBeenCalled();
    expect(runClaimed).not.toHaveBeenCalled();
    expect(manager.delete).not.toHaveBeenCalled();
  });

  it('misma clave con otro contenido: 422 IDEMPOTENCY_KEY_REUSED sin crear ni analizar', async () => {
    const { orchestrator, situationsService, runClaimed } = createOrchestrator({
      existing: { id: 'sit-1', requestFingerprint: 'otra-huella' },
      record: analysisRecord,
    });

    const error = await orchestrator
      .registerAndExecute(dto, actor, KEY)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject(
      { code: 'IDEMPOTENCY_KEY_REUSED' },
    );
    expect(situationsService.create).not.toHaveBeenCalled();
    expect(runClaimed).not.toHaveBeenCalled();
  });

  it('carrera por inserción: la perdedora devuelve el registro ganador como replay', async () => {
    const create = jest.fn().mockRejectedValue(uniqueViolation());
    const { orchestrator, runClaimed, situationsRepository } =
      createOrchestrator({ create });
    situationsRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'sit-1', requestFingerprint: fingerprint });

    const result = await orchestrator.registerAndExecute(dto, actor, KEY);

    expect(create).toHaveBeenCalledTimes(1);
    expect(runClaimed).not.toHaveBeenCalled();
    expect(result.replayed).toBe(true);
    expect(result.analysis).toBeNull();
  });

  it('carrera por inserción con otro contenido: 422, nunca un segundo registro', async () => {
    const create = jest.fn().mockRejectedValue(uniqueViolation());
    const { orchestrator, situationsRepository } = createOrchestrator({
      create,
    });
    situationsRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'sit-1', requestFingerprint: 'otra-huella' });

    await expect(
      orchestrator.registerAndExecute(dto, actor, KEY),
    ).rejects.toMatchObject({
      response: { code: 'IDEMPOTENCY_KEY_REUSED' },
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('carrera por inserción sin fila visible: 409 de procesamiento, no 500', async () => {
    const create = jest.fn().mockRejectedValue(uniqueViolation());
    const { orchestrator, runClaimed } = createOrchestrator({ create });

    await expect(
      orchestrator.registerAndExecute(dto, actor, KEY),
    ).rejects.toMatchObject({
      response: { code: 'REGISTRATION_IN_PROGRESS' },
    });
    expect(runClaimed).not.toHaveBeenCalled();
  });

  it('errores ajenos a la unicidad se propagan sin tratarse como duplicado', async () => {
    const create = jest.fn().mockRejectedValue(new Error('timeout de BD'));
    const { orchestrator } = createOrchestrator({ create });

    await expect(
      orchestrator.registerAndExecute(dto, actor, KEY),
    ).rejects.toThrow('timeout de BD');
  });

  it('Gemini caído no afecta al alta: se registra y no se borra nada', async () => {
    const { orchestrator, manager, runClaimed } = createOrchestrator({
      runClaimed: () =>
        Promise.reject(new ServiceUnavailableException('Gemini no respondió')),
    });

    const result = await orchestrator.registerAndExecute(dto, actor, KEY);

    expect(result.situation).toEqual({ id: 'sit-1', status: 'OPEN' });
    expect(runClaimed).not.toHaveBeenCalled();
    expect(manager.delete).not.toHaveBeenCalled();
  });
});

describe('AIOrchestrator análisis bajo demanda (POST :id/analyze)', () => {
  it('con el reclamo libre analiza una vez y libera el reclamo con su token', async () => {
    const { orchestrator, runClaimed, dataSource } = createOrchestrator();

    await orchestrator.execute('sit-1', actor);

    expect(runClaimed).toHaveBeenCalledTimes(1);
    const [claimSql] = dataSource.query.mock.calls[0] as [string];
    expect(claimSql).toContain('analysis_claim_token = $2');
    const [releaseSql] = dataSource.query.mock.calls.at(-1) as [string];
    expect(releaseSql).toContain('analysis_claim_token = NULL');
  });

  it('con el reclamo de otro intento vigente: 409 ANALYSIS_IN_PROGRESS sin llamar a Gemini', async () => {
    const { orchestrator, runClaimed } = createOrchestrator({
      claimAvailable: false,
    });

    const error = await orchestrator
      .execute('sit-1', actor)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'ANALYSIS_IN_PROGRESS',
    });
    expect(runClaimed).not.toHaveBeenCalled();
  });

  it('si Gemini falla, conserva la situación y libera el reclamo', async () => {
    const { orchestrator, manager, dataSource } = createOrchestrator({
      runClaimed: () =>
        Promise.reject(new ServiceUnavailableException('Gemini no respondió')),
    });

    await expect(orchestrator.execute('sit-1', actor)).rejects.toThrow(
      'Gemini no respondió',
    );
    expect(manager.delete).not.toHaveBeenCalled();
    const [releaseSql] = dataSource.query.mock.calls.at(-1) as [string];
    expect(releaseSql).toContain('analysis_claim_token = NULL');
  });
});
