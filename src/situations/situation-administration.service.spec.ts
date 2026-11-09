import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { UserStatus } from '../common/enums/identity.enums';
import { TimelineEventType } from '../common/enums/situation-timeline.enums';
import {
  SituationReportKind,
  SituationStatus,
} from '../common/enums/situation.enums';
import { ROLE_PERMISSION_CODES } from '../permissions/seeds/permissions.catalog.seed';
import { Coordination } from '../coordinations/entities/coordination.entity';
import { SituationCancellation } from './entities/situation-cancellation.entity';
import { SituationCoordinationTransfer } from './entities/situation-coordination-transfer.entity';
import { Situation } from './entities/situation.entity';
import { SituationAdministrationService } from './situation-administration.service';

const SIT = '5c000000-0000-4000-8000-000000000001';
const COORD_A = 'a0000000-0000-4000-8000-00000000000a';
const COORD_B = 'b0000000-0000-4000-8000-00000000000b';
const COORD_C = 'c0000000-0000-4000-8000-00000000000c';

function who(
  roleCode: keyof typeof ROLE_PERMISSION_CODES,
  permissions: string[] = [...ROLE_PERMISSION_CODES[roleCode]],
): AuthPayload {
  return {
    sub: `user-${roleCode.toLowerCase()}`,
    email: `${roleCode.toLowerCase()}@test.novex.invalid`,
    roleId: `role-${roleCode}`,
    roleCode,
    coordinationId: roleCode === 'COORDINADOR' ? COORD_A : null,
    permissions,
    status: UserStatus.ACTIVE,
  };
}

const admin = who('ADMIN');
const REASON = 'Reporte duplicado del caso registrado ayer';

/** Arnés: `manager.findOne(Situation)` devuelve la fila bloqueada. */
function administrationHarness(row: Partial<Situation> = {}) {
  const situation = {
    id: SIT,
    status: SituationStatus.OPEN,
    reportKind: SituationReportKind.INTERNAL,
    coordinationId: COORD_A,
    affectedCoordinationId: COORD_A,
    createdByUserId: 'autor',
    ...row,
  };
  const calls: string[] = [];
  const coordinations: Record<
    string,
    { id: string; name: string; isActive: boolean }
  > = {
    [COORD_A]: { id: COORD_A, name: 'Área A', isActive: true },
    [COORD_B]: { id: COORD_B, name: 'Área B', isActive: true },
    [COORD_C]: { id: COORD_C, name: 'Área C (inactiva)', isActive: false },
  };
  const manager = {
    findOne: jest.fn((entity: unknown, options?: { where: { id: string } }) => {
      if (entity === Coordination) {
        const coordination = coordinations[options?.where.id ?? ''];
        return Promise.resolve(coordination ?? null);
      }
      return Promise.resolve(situation);
    }),
    update: jest.fn(() => {
      calls.push('update');
      return Promise.resolve({});
    }),
    insert: jest.fn(() => {
      calls.push('insert');
      return Promise.resolve({});
    }),
  };
  const situationsRepository = {
    manager: {
      transaction: jest.fn(
        <T>(work: (m: typeof manager) => Promise<T>): Promise<T> =>
          work(manager),
      ),
    },
  };
  const coordinationsRepository = { findOne: jest.fn() };
  const situationsService = {
    getById: jest.fn().mockResolvedValue({ id: SIT }),
  };
  const timelineService = {
    createEntry: jest.fn(() => {
      calls.push('timeline');
      return Promise.resolve({});
    }),
  };
  const auditLogService = {
    record: jest.fn(),
    recordCritical: jest.fn(() => {
      calls.push('audit');
      return Promise.resolve({});
    }),
  };
  const service = new SituationAdministrationService(
    situationsRepository as never,
    situationsService as never,
    new OperationalScopeService(),
    timelineService as never,
    auditLogService as never,
    coordinationsRepository as never,
  );
  return {
    service,
    manager,
    calls,
    situation,
    coordinationsRepository,
    situationsService,
    timelineService,
    auditLogService,
  };
}

describe('SituationAdministrationService · anulación', () => {
  it('anula en una transacción con bloqueo: estado, registro, línea de tiempo y auditoría', async () => {
    const h = administrationHarness({ status: SituationStatus.IN_PROGRESS });

    await h.service.cancel(SIT, { reason: REASON }, admin);

    expect(h.manager.findOne).toHaveBeenCalledWith(Situation, {
      where: { id: SIT },
      loadEagerRelations: false,
      lock: { mode: 'pessimistic_write' },
    });
    expect(h.calls).toEqual(['update', 'insert', 'timeline', 'audit']);
    expect(h.manager.update).toHaveBeenCalledWith(
      Situation,
      { id: SIT },
      { status: SituationStatus.CANCELLED },
    );
    expect(h.manager.insert).toHaveBeenCalledWith(SituationCancellation, {
      situationId: SIT,
      reason: REASON,
      previousStatus: SituationStatus.IN_PROGRESS,
      cancelledByUserId: admin.sub,
    });
    expect(h.timelineService.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: TimelineEventType.CANCELLED,
        metadata: { previousStatus: SituationStatus.IN_PROGRESS },
      }),
      h.manager,
    );
    expect(h.auditLogService.recordCritical).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SITUATION_CANCELLED',
        resourceId: SIT,
        metadata: expect.objectContaining({
          previousStatus: SituationStatus.IN_PROGRESS,
          nextStatus: SituationStatus.CANCELLED,
          reasonLength: REASON.length,
        }) as unknown,
      }),
      h.manager,
    );
  });

  it('la auditoría no guarda el texto del motivo', async () => {
    const h = administrationHarness();
    await h.service.cancel(SIT, { reason: REASON }, admin);
    const [[input]] = h.auditLogService.recordCritical.mock
      .calls as unknown as [[{ metadata: unknown }]];
    expect(JSON.stringify(input.metadata)).not.toContain(REASON);
  });

  it('admite el estado legado RESOLVED', async () => {
    const h = administrationHarness({ status: SituationStatus.RESOLVED });
    await h.service.cancel(SIT, { reason: REASON }, admin);
    expect(h.manager.insert).toHaveBeenCalledWith(
      SituationCancellation,
      expect.objectContaining({ previousStatus: SituationStatus.RESOLVED }),
    );
  });

  it.each([
    [SituationStatus.CANCELLED, 'SITUATION_ALREADY_CANCELLED'],
    [SituationStatus.CLOSED, 'SITUATION_CLOSED'],
  ])('rechaza un caso %s (409 %s) sin escribir', async (status, code) => {
    const h = administrationHarness({ status });

    const error = await h.service
      .cancel(SIT, { reason: REASON }, admin)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code });
    expect(h.calls).toEqual([]);
  });

  it.each(['DIRECTOR', 'ANALISTA', 'COORDINADOR'] as const)(
    '%s no anula (403), sin abrir la transacción',
    async (role) => {
      const h = administrationHarness();
      await expect(
        h.service.cancel(SIT, { reason: REASON }, who(role)),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(h.manager.findOne).not.toHaveBeenCalled();
    },
  );

  it('ni siquiera con el permiso concedido por error a otro rol (defensa en profundidad)', async () => {
    const h = administrationHarness();
    const coordinadorConPermiso = who('COORDINADOR', [
      ...ROLE_PERMISSION_CODES.COORDINADOR,
      'SITUATIONS_CANCEL',
    ]);
    await expect(
      h.service.cancel(SIT, { reason: REASON }, coordinadorConPermiso),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('exige un motivo de al menos 10 caracteres tras recortar (400)', async () => {
    const h = administrationHarness();
    await expect(
      h.service.cancel(SIT, { reason: '   corto    ' }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.manager.findOne).not.toHaveBeenCalled();
  });

  it('un caso inexistente responde 404', async () => {
    const h = administrationHarness();
    h.manager.findOne.mockResolvedValueOnce(null as never);
    await expect(
      h.service.cancel(SIT, { reason: REASON }, admin),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('si la auditoría obligatoria falla, la anulación no se confirma', async () => {
    const h = administrationHarness();
    h.auditLogService.recordCritical.mockRejectedValueOnce(
      new Error('audit down'),
    );

    await expect(
      h.service.cancel(SIT, { reason: REASON }, admin),
    ).rejects.toThrow('audit down');
    expect(h.situationsService.getById).not.toHaveBeenCalled();
  });
});

describe('SituationAdministrationService · traslado de coordinación', () => {
  const dto = (toCoordinationId: string, extra: object = {}) => ({
    toCoordinationId,
    reason: 'Corresponde al área de admisiones',
    ...extra,
  });

  it('INTERNAL: traslada responsable Y afectada (invariante), con registro, evento y auditoría', async () => {
    const h = administrationHarness({ status: SituationStatus.IN_PROGRESS });

    await h.service.transferCoordination(SIT, dto(COORD_B), admin);

    expect(h.calls).toEqual(['update', 'insert', 'timeline', 'audit']);
    expect(h.manager.update).toHaveBeenCalledWith(
      Situation,
      { id: SIT },
      { coordinationId: COORD_B, affectedCoordinationId: COORD_B },
    );
    expect(h.manager.insert).toHaveBeenCalledWith(
      SituationCoordinationTransfer,
      expect.objectContaining({
        fromCoordinationId: COORD_A,
        toCoordinationId: COORD_B,
        statusAtTransfer: SituationStatus.IN_PROGRESS,
        reportKind: SituationReportKind.INTERNAL,
        transferredByUserId: admin.sub,
      }),
    );
    expect(h.timelineService.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: TimelineEventType.COORDINATION_TRANSFERRED,
        metadata: expect.objectContaining({
          fromCoordinationId: COORD_A,
          toCoordinationId: COORD_B,
        }) as unknown,
      }),
      h.manager,
    );
    expect(h.auditLogService.recordCritical).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SITUATION_COORDINATION_TRANSFERRED',
        metadata: expect.objectContaining({
          previousCoordinationId: COORD_A,
          nextCoordinationId: COORD_B,
          previousAffectedCoordinationId: COORD_A,
          nextAffectedCoordinationId: COORD_B,
        }) as unknown,
      }),
      h.manager,
    );
  });

  it('INTER: solo cambia la responsable; la afectada se conserva', async () => {
    const h = administrationHarness({
      reportKind: SituationReportKind.INTER_COORDINATION,
      coordinationId: COORD_A,
      affectedCoordinationId: COORD_C,
    });

    await h.service.transferCoordination(SIT, dto(COORD_B), admin);

    expect(h.manager.update).toHaveBeenCalledWith(
      Situation,
      { id: SIT },
      { coordinationId: COORD_B },
    );
  });

  it('INTER: la responsable no puede pasar a ser la afectada (400)', async () => {
    const h = administrationHarness({
      reportKind: SituationReportKind.INTER_COORDINATION,
      coordinationId: COORD_A,
      affectedCoordinationId: COORD_B,
    });

    const error = await h.service
      .transferCoordination(SIT, dto(COORD_B), admin)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'TRANSFER_DESTINATION_IS_AFFECTED',
    });
    expect(h.calls).toEqual([]);
  });

  it.each([
    [
      'a la misma coordinación',
      COORD_A,
      BadRequestException,
      'TRANSFER_SAME_COORDINATION',
    ],
    [
      'a una coordinación inactiva',
      COORD_C,
      BadRequestException,
      'TRANSFER_DESTINATION_INACTIVE',
    ],
  ])('rechaza el traslado %s', async (_label, to, type, code) => {
    const h = administrationHarness();

    const error = await h.service
      .transferCoordination(SIT, dto(to), admin)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(type);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code,
    });
    expect(h.calls).toEqual([]);
  });

  it('una coordinación destino inexistente responde 404', async () => {
    const h = administrationHarness();
    await expect(
      h.service.transferCoordination(
        SIT,
        dto('d0000000-0000-4000-8000-00000000000d'),
        admin,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    [SituationStatus.CLOSED, 'SITUATION_CLOSED'],
    [SituationStatus.CANCELLED, 'SITUATION_CANCELLED'],
  ])('no traslada un caso %s (409 %s)', async (status, code) => {
    const h = administrationHarness({ status });

    const error = await h.service
      .transferCoordination(SIT, dto(COORD_B), admin)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code });
    expect(h.calls).toEqual([]);
  });

  it('control optimista: si la responsable cambió desde la consulta → 409 COORDINATION_CHANGED', async () => {
    const h = administrationHarness();

    const error = await h.service
      .transferCoordination(
        SIT,
        dto(COORD_B, { expectedCurrentCoordinationId: COORD_C }),
        admin,
      )
      .catch((caught: unknown) => caught);

    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'COORDINATION_CHANGED',
    });
  });

  it('un registro histórico sin responsable puede recibir una', async () => {
    const h = administrationHarness({
      coordinationId: null,
      affectedCoordinationId: null,
    });

    await h.service.transferCoordination(SIT, dto(COORD_B), admin);

    expect(h.manager.insert).toHaveBeenCalledWith(
      SituationCoordinationTransfer,
      expect.objectContaining({ fromCoordinationId: null }),
    );
  });

  it.each(['DIRECTOR', 'ANALISTA', 'COORDINADOR'] as const)(
    '%s no traslada (403)',
    async (role) => {
      const h = administrationHarness();
      await expect(
        h.service.transferCoordination(SIT, dto(COORD_B), who(role)),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(h.manager.findOne).not.toHaveBeenCalled();
    },
  );

  it('si la auditoría obligatoria falla, el traslado no se confirma', async () => {
    const h = administrationHarness();
    h.auditLogService.recordCritical.mockRejectedValueOnce(
      new Error('audit down'),
    );
    await expect(
      h.service.transferCoordination(SIT, dto(COORD_B), admin),
    ).rejects.toThrow('audit down');
  });
});
