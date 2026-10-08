import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AuditAction } from '../audit/audit-action.enum';
import { UserStatus } from '../common/enums/identity.enums';
import { TimelineEventType } from '../common/enums/situation-timeline.enums';
import {
  SituationReportKind,
  SituationSeverity,
  SituationSeverityChangeSource,
  SituationStatus,
} from '../common/enums/situation.enums';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { SituationConsequence } from './entities/situation-consequence.entity';
import { SituationSeverityChange } from './entities/situation-severity-change.entity';
import { Situation } from './entities/situation.entity';
import { SituationConsequencesService } from './situation-consequences.service';
import { SituationsController } from './situations.controller';
import {
  createManagerMock,
  transactionalManager,
} from './testing/situations-service.test-kit-spec';

describe('SituationConsequencesService · agregar afectación', () => {
  const AREA_A = 'aaaaaaaa-0000-4000-8000-000000000001';
  const SIT_ID = 'ssssssss-0000-4000-8000-000000000010';
  const PROBLEM_AT = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const actor = (over: Partial<AuthPayload>): AuthPayload => ({
    sub: 'u',
    email: 'u@cun.edu.co',
    roleId: 'r',
    roleCode: 'ANALISTA',
    coordinationId: null,
    permissions: ['SITUATIONS_VIEW', 'SITUATIONS_UPDATE'],
    status: UserStatus.ACTIVE,
    ...over,
  });
  const analistaAutor = actor({ sub: 'autor' });
  const analistaOtro = actor({ sub: 'otro' });
  const coordinadorA = actor({
    sub: 'coord-a',
    roleCode: 'COORDINADOR',
    coordinationId: AREA_A,
  });
  const coordinadorB = actor({
    sub: 'coord-b',
    roleCode: 'COORDINADOR',
    coordinationId: 'area-b',
  });
  const director = actor({
    sub: 'dir',
    roleCode: 'DIRECTOR',
    permissions: ['SITUATIONS_VIEW', 'KPIS_VIEW'],
  });
  const admin = actor({
    sub: 'adm',
    roleCode: 'ADMIN',
    permissions: ['SITUATIONS_VIEW'],
  });

  function buildSituation(over: Partial<Situation> = {}): Situation {
    return {
      id: SIT_ID,
      reportKind: SituationReportKind.INTERNAL,
      status: SituationStatus.OPEN,
      coordinationId: AREA_A,
      affectedCoordinationId: AREA_A,
      createdByUserId: 'autor',
      severity: SituationSeverity.MEDIUM,
      reportedSeverity: SituationSeverity.MEDIUM,
      severityEscalationPolicyCode: null,
      occurredAt: PROBLEM_AT,
      createdAt: PROBLEM_AT,
      closedAt: null,
      ...over,
    } as unknown as Situation;
  }

  function harness(seed: Situation | null = buildSituation()) {
    const manager = createManagerMock({ findOneResult: seed });
    const calls: string[] = [];
    // findOne: primero la situación bloqueada; después, la afectación creada.
    manager.findOne.mockImplementation(async (entity: unknown) => {
      if (entity === Situation) return seed ? { ...seed } : null;
      if (entity === SituationConsequence) {
        const saved = manager.save.mock.calls.find(
          ([e]) => e === SituationConsequence,
        )?.[1] as Record<string, unknown> | undefined;
        return saved
          ? {
              ...saved,
              id: 'generated-1',
              createdByUser: { fullName: 'Autor', role: { name: 'Analista' } },
            }
          : null;
      }
      return null;
    });
    manager.find.mockImplementation(async (entity: unknown) =>
      entity === SituationSeverityChange
        ? [
            {
              id: 'rep',
              previousSeverity: null,
              newSeverity: SituationSeverity.MEDIUM,
              source: SituationSeverityChangeSource.REPORTED,
              effectiveAt: PROBLEM_AT,
              createdAt: PROBLEM_AT,
            },
          ]
        : [],
    );
    manager.save.mockImplementation(async (_e: unknown, data: object) => {
      calls.push('save-consequence');
      return { ...data, id: 'generated-1' };
    });

    const timelineService = {
      createEntry: jest.fn(async () => {
        calls.push('timeline');
        return {};
      }),
    };
    const auditLogService = {
      record: jest.fn(async () => {
        calls.push('audit');
        return null;
      }),
    };
    const escalationService = {
      materializeDueEscalations: jest.fn(async () => {
        calls.push('escalate');
        return [];
      }),
      recordAudit: jest.fn().mockResolvedValue(undefined),
    };
    const situationsRepository = { manager: transactionalManager(manager) };

    const service = new SituationConsequencesService(
      situationsRepository as never,
      new OperationalScopeService(),
      timelineService as never,
      auditLogService as never,
      escalationService as never,
    );
    return {
      service,
      manager,
      timelineService,
      auditLogService,
      escalationService,
      calls,
    };
  }

  it('ANALISTA autor agrega; queda con fecha por defecto = ahora', async () => {
    const h = harness();
    const before = Date.now();
    const result = await h.service.addConsequence(
      SIT_ID,
      { description: '  No fue posible cargar archivos.  ' },
      analistaAutor,
    );

    const saved = h.manager.save.mock.calls[0][1] as Record<string, unknown>;
    expect(saved.description).toBe('No fue posible cargar archivos.');
    expect((saved.occurredAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect(saved.createdByUserId).toBe('autor');
    expect(result.severityAtOccurrence).toBe(SituationSeverity.MEDIUM);
    expect(result.createdByRoleName).toBe('Analista');
  });

  it('bloquea la fila, escala antes de insertar, escribe el evento en la transacción y audita después', async () => {
    const h = harness();
    await h.service.addConsequence(
      SIT_ID,
      { description: 'Algo' },
      coordinadorA,
    );

    expect(h.manager.findOne).toHaveBeenCalledWith(
      Situation,
      expect.objectContaining({
        loadEagerRelations: false,
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(h.calls).toEqual([
      'escalate',
      'save-consequence',
      'timeline',
      'audit',
    ]);
    expect(h.timelineService.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: TimelineEventType.CONSEQUENCE_ADDED,
        // Sin el texto en metadata.
        metadata: {
          consequenceId: 'generated-1',
          occurredAt: expect.any(String),
        },
      }),
      h.manager,
    );
    expect(h.auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.SITUATION_CONSEQUENCE_ADDED,
        metadata: expect.objectContaining({
          consequenceId: 'generated-1',
          descriptionLength: 'Algo'.length,
        }),
      }),
    );
  });

  it('COORDINADOR responsable agrega', async () => {
    const h = harness();
    await expect(
      h.service.addConsequence(SIT_ID, { description: 'x' }, coordinadorA),
    ).resolves.toBeDefined();
  });

  it.each([
    ['ANALISTA no autor', analistaOtro, ForbiddenException],
    ['DIRECTOR', director, ForbiddenException],
    ['ADMIN', admin, ForbiddenException],
    // Fuera de su alcance de lectura: ni siquiera ve el caso.
    ['COORDINADOR de otra coordinación', coordinadorB, NotFoundException],
  ])('%s → denegado', async (_label, who, error) => {
    const h = harness();
    await expect(
      h.service.addConsequence(SIT_ID, { description: 'x' }, who),
    ).rejects.toBeInstanceOf(error);
    expect(h.manager.save).not.toHaveBeenCalled();
  });

  it('CLOSED → 409 (el cierre congela)', async () => {
    const h = harness(
      buildSituation({ status: SituationStatus.CLOSED, closedAt: new Date() }),
    );
    await expect(
      h.service.addConsequence(SIT_ID, { description: 'x' }, coordinadorA),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.manager.save).not.toHaveBeenCalled();
  });

  it('INTER → 400', async () => {
    const h = harness(
      buildSituation({ reportKind: SituationReportKind.INTER_COORDINATION }),
    );
    await expect(
      h.service.addConsequence(SIT_ID, { description: 'x' }, coordinadorA),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('occurredAt futuro → 400 (instante real, no fin del día)', async () => {
    const h = harness();
    await expect(
      h.service.addConsequence(
        SIT_ID,
        {
          description: 'x',
          occurredAt: new Date(Date.now() + 60 * 1000).toISOString(),
        },
        coordinadorA,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.manager.findOne).not.toHaveBeenCalled();
  });

  it('occurredAt anterior a la ocurrencia del problema → 400', async () => {
    const h = harness();
    await expect(
      h.service.addConsequence(
        SIT_ID,
        {
          description: 'x',
          occurredAt: new Date(PROBLEM_AT.getTime() - 1000).toISOString(),
        },
        coordinadorA,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.manager.save).not.toHaveBeenCalled();
  });

  it('situación inexistente → 404', async () => {
    const h = harness(null);
    await expect(
      h.service.addConsequence(SIT_ID, { description: 'x' }, coordinadorA),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('texto en blanco → 400', async () => {
    const h = harness();
    await expect(
      h.service.addConsequence(SIT_ID, { description: '   ' }, coordinadorA),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('APPEND-ONLY: la API solo expone POST sobre /consequences (sin PATCH ni DELETE)', () => {
    const proto = SituationsController.prototype as unknown as Record<
      string,
      unknown
    >;
    const routes = Object.getOwnPropertyNames(proto)
      .filter((name) => name !== 'constructor')
      .map((name) => ({
        path: Reflect.getMetadata(PATH_METADATA, proto[name] as object) as
          string | undefined,
        method: Reflect.getMetadata(METHOD_METADATA, proto[name] as object) as
          RequestMethod | undefined,
      }))
      .filter((route) => route.path?.includes('consequences'));

    expect(routes).toEqual([
      { path: ':id/consequences', method: RequestMethod.POST },
    ]);
    // Y el servicio no tiene operación de edición ni de borrado.
    const serviceMethods = Object.getOwnPropertyNames(
      SituationConsequencesService.prototype,
    );
    expect(
      serviceMethods.some((m) => /update|delete|remove|edit/i.test(m)),
    ).toBe(false);
  });
});
