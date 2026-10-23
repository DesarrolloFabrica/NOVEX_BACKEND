import {
  ConflictException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { UserStatus } from '../common/enums/identity.enums';
import { SituationSeverity } from '../common/enums/situation.enums';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import type { CreateSituationDto } from '../situations/dto/situation.dto';
import { computeRegistrationFingerprint } from '../situations/registration-fingerprint';
import { AIOrchestrator } from './ai-orchestrator.service';

const KEY = '6f1c2b1e-8d2a-4c3b-9e4f-112233445566';

const dto: CreateSituationDto = {
  title: 'Caída de red',
  description: 'Sin conexión en piso 3',
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
  /** false: el reclamo lo tiene otro intento vigente. */
  claimAvailable?: boolean;
  runClaimed?: jest.Mock;
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

  it('sin cabecera mantiene el flujo anterior sin clave ni huella', async () => {
    const { orchestrator, situationsService, runClaimed } =
      createOrchestrator();

    const result = await orchestrator.registerAndExecute(dto, actor);

    expect(situationsService.create).toHaveBeenCalledWith(dto, actor);
    expect(runClaimed).toHaveBeenCalledTimes(1);
    expect(result.replayed).toBe(false);
  });

  it('clave nueva crea la fila con clave y huella, y analiza una vez', async () => {
    const { orchestrator, situationsService, runClaimed } =
      createOrchestrator();

    const result = await orchestrator.registerAndExecute(dto, actor, KEY);

    expect(situationsService.create).toHaveBeenCalledWith(dto, actor, {
      clientRequestId: KEY,
      requestFingerprint: fingerprint,
    });
    expect(runClaimed).toHaveBeenCalledTimes(1);
    expect(result.replayed).toBe(false);
  });

  it('repetición completada: solo lee; no crea, no analiza y no modifica', async () => {
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
    expect(result.analysis.sessionId).toBe('session-1');
    expect(result.analysis.confidence).toBe(0.82);
  });

  it('misma clave con otro contenido: 422 sin crear ni analizar', async () => {
    const { orchestrator, situationsService, runClaimed } = createOrchestrator({
      existing: { id: 'sit-1', requestFingerprint: 'otra-huella' },
      record: analysisRecord,
    });

    await expect(
      orchestrator.registerAndExecute(dto, actor, KEY),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(situationsService.create).not.toHaveBeenCalled();
    expect(runClaimed).not.toHaveBeenCalled();
  });

  it('huérfano con reclamo vigente de otro intento: 409 sin analizar ni borrar', async () => {
    const { orchestrator, situationsService, runClaimed, manager } =
      createOrchestrator({
        existing: { id: 'sit-1', requestFingerprint: fingerprint },
        record: null,
        claimAvailable: false,
      });

    const error = await orchestrator
      .registerAndExecute(dto, actor, KEY)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'REGISTRATION_IN_PROGRESS',
      situationId: 'sit-1',
    });
    expect(situationsService.create).not.toHaveBeenCalled();
    expect(runClaimed).not.toHaveBeenCalled();
    expect(manager.delete).not.toHaveBeenCalled();
  });

  it('huérfano sin reclamo: reanuda sobre la misma fila sin crear otra ni borrar', async () => {
    const { orchestrator, situationsService, runClaimed, manager } =
      createOrchestrator({
        existing: { id: 'sit-1', requestFingerprint: fingerprint },
        record: null,
      });

    const result = await orchestrator.registerAndExecute(dto, actor, KEY);

    expect(situationsService.create).not.toHaveBeenCalled();
    expect(runClaimed).toHaveBeenCalledTimes(1);
    expect(result.replayed).toBe(false);
    expect(manager.delete).not.toHaveBeenCalled();
  });

  it('huérfano que vuelve a fallar en Gemini: conserva la fila y no borra', async () => {
    const { orchestrator, manager } = createOrchestrator({
      existing: { id: 'sit-1', requestFingerprint: fingerprint },
      record: null,
      runClaimed: () =>
        Promise.reject(new ServiceUnavailableException('Gemini no respondió')),
    });

    await expect(
      orchestrator.registerAndExecute(dto, actor, KEY),
    ).rejects.toThrow('La situación quedó registrada');
    expect(manager.delete).not.toHaveBeenCalled();
  });

  it('carrera por inserción: la perdedora devuelve el resultado completado', async () => {
    const create = jest.fn().mockRejectedValue(uniqueViolation());
    const { orchestrator, runClaimed, situationsRepository } =
      createOrchestrator({ create, record: analysisRecord });
    situationsRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'sit-1', requestFingerprint: fingerprint });

    const result = await orchestrator.registerAndExecute(dto, actor, KEY);

    expect(create).toHaveBeenCalledTimes(1);
    expect(runClaimed).not.toHaveBeenCalled();
    expect(result.replayed).toBe(true);
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

  it('fallo de Gemini en registro nuevo: borra la fila dentro de su reclamo', async () => {
    const { orchestrator, manager, dataSource } = createOrchestrator({
      runClaimed: () =>
        Promise.reject(new ServiceUnavailableException('Gemini no respondió')),
    });

    await expect(
      orchestrator.registerAndExecute(dto, actor, KEY),
    ).rejects.toThrow('La situación no fue registrada');

    expect(manager.delete).toHaveBeenCalledWith(expect.anything(), {
      id: 'sit-1',
    });
    // El reclamo se libera después del borrado, con el token de este intento.
    const releaseCall = dataSource.query.mock.calls.at(-1) as unknown[];
    expect(releaseCall[0]).toContain('analysis_claim_token = NULL');
  });

  it('pérdida de reclamo durante un registro nuevo: no borra y responde 409', async () => {
    const { orchestrator, manager } = createOrchestrator({
      runClaimed: () =>
        Promise.reject(
          new ConflictException({
            code: 'ANALYSIS_CLAIM_LOST',
            message: 'reemplazado',
          }),
        ),
    });

    await expect(
      orchestrator.registerAndExecute(dto, actor, KEY),
    ).rejects.toMatchObject({
      response: { code: 'REGISTRATION_IN_PROGRESS' },
    });
    expect(manager.delete).not.toHaveBeenCalled();
  });

  it('reclamo ajeno al crear: 409 sin borrar la fila de la otra solicitud', async () => {
    const { orchestrator, manager, runClaimed } = createOrchestrator({
      claimAvailable: false,
    });

    await expect(
      orchestrator.registerAndExecute(dto, actor, KEY),
    ).rejects.toMatchObject({
      response: { code: 'REGISTRATION_IN_PROGRESS' },
    });
    expect(runClaimed).not.toHaveBeenCalled();
    expect(manager.delete).not.toHaveBeenCalled();
  });
});
