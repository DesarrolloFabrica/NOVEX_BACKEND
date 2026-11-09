import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { UserStatus } from '../common/enums/identity.enums';
import { EvidenceType } from '../common/enums/situation-evidence.enums';
import { SituationStatus } from '../common/enums/situation.enums';
import { Situation } from '../situations/entities/situation.entity';
import { SituationEvidence } from './entities/situation-evidence.entity';
import { SituationEvidenceService } from './situation-evidence.service';

const situationId = '5d1f7c2a-3b4e-4f5a-8b6c-7d8e9f001122';

const actor: AuthPayload = {
  sub: '6f1c2b1e-8d2a-4c3b-9e4f-112233445566',
  email: 'coord@test.novex.invalid',
  roleId: 'role-coord',
  roleCode: 'COORDINADOR',
  coordinationId: 'coord-a',
  permissions: ['SITUATIONS_CREATE', 'SITUATIONS_UPDATE'],
  status: UserStatus.ACTIVE,
};

const existing = {
  id: 'ev-1',
  situationId,
  title: 'Notas adicionales',
  description: 'nota',
  type: EvidenceType.NOTE,
  clientKey: 'capture:notes',
  fileName: null,
  storagePath: null,
  mimeType: null,
  fileSize: null,
  uploadedByUserId: 'otro',
  createdAt: new Date('2026-10-22T10:00:00Z'),
  uploadedByUser: { fullName: 'Coordinador' },
  retiredAt: null as Date | null,
  retiredByUserId: null as string | null,
  retirementReason: null as string | null,
};

/**
 * El alta y el borrado corren en `evidenceRepository.manager.transaction`:
 * `findOne(Situation)` es la lectura con bloqueo compartido de la situación;
 * `findOne(SituationEvidence)` es la búsqueda por clave o por id.
 */
function createService(
  options: {
    status?: SituationStatus;
    evidenceByKey?: unknown;
    save?: jest.Mock;
    concurrent?: unknown;
  } = {},
) {
  const manager = {
    findOne: jest.fn((entity: unknown) => {
      if (entity === Situation) {
        return Promise.resolve({
          id: situationId,
          status: options.status ?? SituationStatus.OPEN,
        });
      }
      return Promise.resolve(options.evidenceByKey ?? null);
    }),
    create: jest.fn((_entity: unknown, value: object) => value),
    save:
      options.save ??
      jest.fn((_entity: unknown, value: object) =>
        Promise.resolve({ ...value, id: 'ev-new' }),
      ),
    remove: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const evidenceRepository = {
    manager: {
      transaction: jest.fn(
        <T>(work: (m: typeof manager) => Promise<T>): Promise<T> =>
          work(manager),
      ),
    },
    findOne: jest.fn().mockResolvedValue(options.concurrent ?? null),
    findByIdAndSituationId: jest.fn((id: string) =>
      Promise.resolve({ ...existing, id }),
    ),
  };
  const timelineService = { createEntry: jest.fn().mockResolvedValue({}) };
  const auditLogService = {
    record: jest.fn(),
    recordCritical: jest.fn().mockResolvedValue({}),
  };
  const service = new SituationEvidenceService(
    evidenceRepository as never,
    {} as never,
    {} as never,
    timelineService as never,
    auditLogService as never,
    new OperationalScopeService(),
  );
  return {
    service,
    manager,
    evidenceRepository,
    timelineService,
    auditLogService,
  };
}

const noteDto = {
  type: EvidenceType.NOTE,
  title: 'Notas adicionales',
  description: 'nota de captura',
};

describe('SituationEvidenceService con clave estable', () => {
  it('con una clave ya existente devuelve la evidencia previa sin insertar, registrar ni auditar', async () => {
    const { service, manager, timelineService, auditLogService } =
      createService({ evidenceByKey: existing });

    const result = await service.create(
      situationId,
      { ...noteDto, clientKey: 'capture:notes' },
      actor,
    );

    expect(result.id).toBe('ev-1');
    expect(manager.save).not.toHaveBeenCalled();
    expect(timelineService.createEntry).not.toHaveBeenCalled();
    expect(auditLogService.recordCritical).not.toHaveBeenCalled();
  });

  it('la repetición idempotente funciona aunque el caso se haya cerrado después', async () => {
    const { service } = createService({
      status: SituationStatus.CLOSED,
      evidenceByKey: existing,
    });

    const result = await service.create(
      situationId,
      { ...noteDto, clientKey: 'capture:notes' },
      actor,
    );
    expect(result.id).toBe('ev-1');
  });

  it('sin clave siempre inserta y audita en la transacción', async () => {
    const { service, manager, auditLogService } = createService();

    const result = await service.create(situationId, noteDto, actor);

    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('ev-new');
    expect(auditLogService.recordCritical).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SITUATION_EVIDENCE_ADDED',
        resourceId: situationId,
        metadata: expect.objectContaining({ evidenceId: 'ev-new' }) as unknown,
      }),
      manager,
    );
  });

  it('bloquea la situación con FOR SHARE antes de escribir', async () => {
    const { service, manager } = createService();
    await service.create(situationId, noteDto, actor);

    expect(manager.findOne).toHaveBeenCalledWith(
      Situation,
      expect.objectContaining({ lock: { mode: 'pessimistic_read' } }),
    );
  });

  it.each([
    [SituationStatus.CLOSED, 'SITUATION_CLOSED'],
    [SituationStatus.CANCELLED, 'SITUATION_CANCELLED'],
  ])(
    'un caso %s no admite evidencias nuevas (409 %s)',
    async (status, code) => {
      const { service, manager } = createService({ status });

      const error = await service
        .create(situationId, noteDto, actor)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code,
      });
      expect(manager.save).not.toHaveBeenCalled();
    },
  );

  it('una carrera por inserción con la misma clave devuelve la evidencia ganadora', async () => {
    const uniqueViolation = Object.assign(
      new QueryFailedError('INSERT', [], new Error('duplicate key')),
      { driverError: { code: '23505' } },
    );
    const { service } = createService({
      save: jest.fn().mockRejectedValue(uniqueViolation),
      concurrent: existing,
    });

    const result = await service.create(
      situationId,
      { ...noteDto, clientKey: 'capture:notes' },
      actor,
    );

    expect(result.id).toBe('ev-1');
  });

  it('un error ajeno a la unicidad no se oculta', async () => {
    const { service } = createService({
      save: jest.fn().mockRejectedValue(new Error('disk full')),
    });

    await expect(
      service.create(
        situationId,
        { ...noteDto, clientKey: 'capture:notes' },
        actor,
      ),
    ).rejects.toThrow('disk full');
  });
});

describe('Fase 01B.2 · retiro de evidencias (soft delete)', () => {
  const REASON = 'Archivo equivocado, se adjunta el correcto';

  it('retira sin borrar: fecha, autor y motivo, con línea de tiempo y auditoría en la misma transacción', async () => {
    const { service, manager, auditLogService, timelineService } =
      createService({ evidenceByKey: existing });

    await service.retire(situationId, 'ev-1', { reason: REASON }, actor);

    expect(manager.remove).not.toHaveBeenCalled();
    expect(manager.update).toHaveBeenCalledWith(
      SituationEvidence,
      { id: 'ev-1', situationId },
      expect.objectContaining({
        retiredByUserId: actor.sub,
        retirementReason: REASON,
        retiredAt: expect.any(Date) as unknown,
      }),
    );
    expect(timelineService.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'ATTACHMENT_RETIRED' }),
      manager,
    );
    const audit = auditLogService.recordCritical.mock.calls[0] as [
      { action: string; metadata: Record<string, unknown> },
      unknown,
    ];
    expect(audit[0].action).toBe('SITUATION_EVIDENCE_RETIRED');
    expect(audit[0].metadata).toMatchObject({
      evidenceId: 'ev-1',
      reasonLength: REASON.length,
    });
    // El texto del motivo no viaja a auditoría ni a la línea de tiempo.
    expect(JSON.stringify(audit[0].metadata)).not.toContain(REASON);
    expect(
      JSON.stringify(timelineService.createEntry.mock.calls),
    ).not.toContain(REASON);
    expect(audit[1]).toBe(manager);
  });

  it('bloquea la evidencia FOR UPDATE: una ya retirada responde 409', async () => {
    const { service, manager } = createService({
      evidenceByKey: { ...existing, retiredAt: new Date() },
    });

    const error = await service
      .retire(situationId, 'ev-1', { reason: REASON }, actor)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'EVIDENCE_ALREADY_RETIRED',
    });
    expect(manager.findOne).toHaveBeenCalledWith(
      SituationEvidence,
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(manager.update).not.toHaveBeenCalled();
  });

  it.each([
    [SituationStatus.CLOSED, 'SITUATION_CLOSED'],
    [SituationStatus.CANCELLED, 'SITUATION_CANCELLED'],
  ])('no retira evidencias de un caso %s (409 %s)', async (status, code) => {
    const { service, manager } = createService({
      status,
      evidenceByKey: existing,
    });

    const error = await service
      .retire(situationId, 'ev-1', { reason: REASON }, actor)
      .catch((caught: unknown) => caught);

    expect((error as ConflictException).getResponse()).toMatchObject({ code });
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('una evidencia inexistente responde 404', async () => {
    const { service } = createService();
    await expect(
      service.retire(situationId, 'ev-x', { reason: REASON }, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('si la auditoría obligatoria falla, el retiro no se confirma (error propagado)', async () => {
    const { service, auditLogService } = createService({
      evidenceByKey: existing,
    });
    auditLogService.recordCritical.mockRejectedValue(new Error('audit down'));

    await expect(
      service.retire(situationId, 'ev-1', { reason: REASON }, actor),
    ).rejects.toThrow('audit down');
  });

  it('la respuesta de una retirada la marca RETIRED con su retiro', async () => {
    const { service, evidenceRepository } = createService({
      evidenceByKey: existing,
    });
    const retiredAt = new Date('2026-11-09T12:00:00Z');
    evidenceRepository.findByIdAndSituationId.mockResolvedValue({
      ...existing,
      retiredAt,
      retiredByUserId: actor.sub,
      retirementReason: REASON,
    });

    const response = await service.retire(
      situationId,
      'ev-1',
      { reason: REASON },
      actor,
    );

    expect(response.status).toBe('RETIRED');
    expect(response.retirement).toEqual({
      retiredAt,
      retiredByUserId: actor.sub,
      reason: REASON,
    });
  });
});
