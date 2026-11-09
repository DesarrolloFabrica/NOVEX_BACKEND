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
import { SituationCancellation } from './entities/situation-cancellation.entity';
import { Situation } from './entities/situation.entity';
import { SituationAdministrationService } from './situation-administration.service';

const SIT = '5c000000-0000-4000-8000-000000000001';
const COORD_A = 'a0000000-0000-4000-8000-00000000000a';

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
  const manager = {
    findOne: jest.fn(() => Promise.resolve(situation)),
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
