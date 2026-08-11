import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { UserStatus } from '../../src/common/enums/identity.enums';
import { SituationStatus } from '../../src/common/enums/situation.enums';
import type { AuthPayload } from '../../src/auth/contracts/auth-payload.contract';
import {
  AuditAction,
  AuditResourceType,
} from '../../src/audit/audit-action.enum';
import { AuditLogService } from '../../src/audit/audit-log.service';
import { AIOrchestrator } from '../../src/ai-orchestration/ai-orchestrator.service';
import { SituationsService } from '../../src/situations/situations.service';
import { UsersService } from '../../src/users/users.service';

describe('Institutional audit trail', () => {
  const actor: AuthPayload = {
    sub: 'actor-1',
    email: 'admin@cun.edu.co',
    roleId: 'role-admin',
    roleCode: 'ADMIN',
    coordinationId: null,
    permissions: ['USERS_CREATE', 'USERS_UPDATE', 'SITUATIONS_CREATE'],
    status: UserStatus.ACTIVE,
  };

  const createAuditService = () => {
    const saved: Array<Record<string, unknown>> = [];
    const repository = {
      create: jest.fn((input: Record<string, unknown>) => input),
      save: jest.fn((input: Record<string, unknown>) => {
        const entry = {
          id: 'audit-1',
          createdAt: new Date('2026-08-10T12:00:00.000Z'),
          ...input,
        };
        saved.push(entry);
        return Promise.resolve(entry);
      }),
    };
    const requestContext = {
      getRequestId: jest.fn().mockReturnValue('req-audit-1'),
    };
    const service = new AuditLogService(
      repository as never,
      requestContext as never,
    );
    return { service, repository, saved, requestContext };
  };

  it('persiste actor, action, resource y requestId', async () => {
    const { service, saved } = createAuditService();

    await service.record({
      actor,
      action: AuditAction.SITUATION_CREATED,
      resourceType: AuditResourceType.SITUATION,
      resourceId: 'sit-1',
      metadata: { status: SituationStatus.OPEN },
    });

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      actorUserId: actor.sub,
      actorRole: actor.roleCode,
      action: AuditAction.SITUATION_CREATED,
      resourceType: AuditResourceType.SITUATION,
      resourceId: 'sit-1',
      requestId: 'req-audit-1',
      metadata: { status: SituationStatus.OPEN },
    });
    expect(saved[0].createdAt).toBeInstanceOf(Date);
  });

  it('registra SITUATION_CREATED al crear situación', async () => {
    const auditLogService = { record: jest.fn().mockResolvedValue(null) };
    const situationsRepository = {
      create: jest.fn((input: unknown) => input),
      save: jest.fn().mockResolvedValue({ id: 'sit-new' }),
      findByIdWithRelations: jest.fn().mockResolvedValue({
        id: 'sit-new',
        status: SituationStatus.OPEN,
        severity: 'HIGH',
        categoryId: 'cat-1',
        title: 'Incidente',
        description: 'Desc',
        coordinationId: 'coord-1',
        coordination: { code: 'c', name: 'C' },
        createdByUserId: actor.sub,
        createdByUser: { fullName: 'Actor' },
        assignedUserId: null,
        assignedUser: null,
        category: { code: 'TECH', name: 'Tech' },
        relatedCoordinations: [],
        occurredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    };

    const service = new SituationsService(
      situationsRepository as never,
      {
        findOne: jest.fn().mockResolvedValue({ id: 'coord-1', isActive: true }),
      } as never,
      { findOne: jest.fn().mockResolvedValue({ id: 'cat-1' }) } as never,
      {} as never,
      { create: jest.fn((input: unknown) => input) } as never,
      { createEntry: jest.fn() } as never,
      {
        resolveCreateCoordinationId: jest.fn().mockReturnValue('coord-1'),
      } as never,
      auditLogService as never,
    );

    await service.create(
      {
        title: 'Incidente',
        description: 'Desc',
        categoryId: 'cat-1',
        severity: 'HIGH',
        occurredAt: '2026-08-10T10:00:00.000Z',
        coordinationId: 'coord-1',
      },
      actor,
    );

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor,
        action: AuditAction.SITUATION_CREATED,
        resourceType: AuditResourceType.SITUATION,
        resourceId: 'sit-new',
      }),
    );
  });

  it('registra SITUATION_STATUS_CHANGED al cambiar estado', async () => {
    const auditLogService = { record: jest.fn().mockResolvedValue(null) };
    const situation = {
      id: 'sit-1',
      title: 'Incidente',
      description: 'Desc',
      coordinationId: 'c1',
      coordination: { code: 'coord', name: 'Coord' },
      createdByUserId: 'creator',
      createdByUser: { fullName: 'Creador' },
      assignedUserId: null,
      assignedUser: null,
      categoryId: 'cat',
      category: { code: 'TECH', name: 'Tech' },
      severity: 'HIGH',
      status: SituationStatus.OPEN,
      lastStatusComment: null,
      resolvedAt: null,
      closedAt: null,
      occurredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      relatedCoordinations: [],
    };

    const situationsRepository = {
      findByIdWithRelations: jest.fn().mockResolvedValue(situation),
      save: jest.fn().mockResolvedValue(situation),
    };
    const usersRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: actor.sub, fullName: 'Actor' }),
    };

    const service = new SituationsService(
      situationsRepository as never,
      {} as never,
      {} as never,
      usersRepository as never,
      {} as never,
      { createEntry: jest.fn().mockResolvedValue({}) } as never,
      {
        assertCanUpdateSituation: jest.fn(),
        assertSituationInScope: jest.fn(),
        isCoordinationScoped: jest.fn().mockReturnValue(false),
      } as never,
      auditLogService as never,
    );

    await service.update(
      'sit-1',
      { status: SituationStatus.IN_PROGRESS },
      {
        ...actor,
        permissions: ['SITUATIONS_UPDATE'],
      },
    );

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.SITUATION_STATUS_CHANGED,
        resourceType: AuditResourceType.SITUATION,
        resourceId: 'sit-1',
        metadata: {
          previousStatus: SituationStatus.OPEN,
          nextStatus: SituationStatus.IN_PROGRESS,
          statusComment: null,
          dueAt: undefined,
          slaBreachedAt: undefined,
          closedOnTime: null,
        },
      }),
    );
  });

  it('registra acciones administrativas de usuario', async () => {
    const auditLogService = { record: jest.fn().mockResolvedValue(null) };
    const existing = {
      id: 'user-2',
      email: 'user@cun.edu.co',
      fullName: 'Usuario',
      roleId: 'role-analyst',
      role: {
        id: 'role-analyst',
        code: 'ANALISTA',
        name: 'Analista',
        isActive: true,
      },
      coordinationId: 'coord-1',
      coordination: { id: 'coord-1', code: 'c', name: 'C', isActive: true },
      status: UserStatus.ACTIVE,
    };

    const usersRepository = {
      findByIdWithRelations: jest
        .fn()
        .mockResolvedValueOnce({ ...existing })
        .mockResolvedValueOnce({
          ...existing,
          roleId: 'role-dir',
          role: {
            id: 'role-dir',
            code: 'DIRECTOR',
            name: 'Director',
            isActive: true,
          },
          status: UserStatus.INACTIVE,
        }),
      save: jest.fn(),
    };
    const rolesRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'role-dir',
        code: 'DIRECTOR',
        name: 'Director',
        isActive: true,
      }),
    };

    const service = new UsersService(
      usersRepository as never,
      rolesRepository as never,
      {} as never,
      auditLogService as never,
    );

    await service.update(
      'user-2',
      { roleCode: 'DIRECTOR', status: UserStatus.INACTIVE },
      actor,
    );

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.USER_ROLE_CHANGED,
        resourceType: AuditResourceType.USER,
        resourceId: 'user-2',
      }),
    );
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.USER_DEACTIVATED,
        resourceType: AuditResourceType.USER,
        resourceId: 'user-2',
      }),
    );
  });

  it('registra AI_ANALYSIS_COMPLETED y AI_ANALYSIS_FAILED', async () => {
    const auditLogService = { record: jest.fn().mockResolvedValue(null) };
    const transaction = jest.fn(
      (work: (manager: { getRepository: jest.Mock }) => unknown) =>
        Promise.resolve(
          work({
            getRepository: jest.fn().mockReturnValue({
              findOne: jest.fn().mockResolvedValue(null),
              create: jest.fn((value: unknown) => value),
              save: jest.fn(),
            }),
          }),
        ),
    );

    const analysisService = {
      normalizeCoordinationReferences: jest.fn().mockResolvedValue({}),
      validateAnalysis: jest.fn().mockReturnValue({
        provider: 'gemini',
        confidence: { overall: 0.9 },
      }),
      persistAnalysis: jest.fn().mockResolvedValue({}),
    };

    const orchestrator = new AIOrchestrator(
      { get: jest.fn().mockReturnValue('gemini-test') } as never,
      { transaction } as never,
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
      analysisService as never,
      { findBySituation: jest.fn().mockResolvedValue({}) } as never,
      { findBySituation: jest.fn().mockResolvedValue({ items: [] }) } as never,
      {
        createEntry: jest.fn().mockResolvedValue({}),
        findBySituation: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      } as never,
      {
        findBySituationId: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      } as never,
      {
        getLatestSession: jest.fn().mockResolvedValue(null),
        createSession: jest.fn().mockResolvedValue({
          id: 'session-1',
          version: 1,
          provider: 'gemini',
          createdAt: new Date(),
        }),
      } as never,
      auditLogService as never,
    );

    await orchestrator.execute('situation-id', actor);

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.AI_ANALYSIS_COMPLETED,
        resourceType: AuditResourceType.AI_ANALYSIS,
        resourceId: 'situation-id',
      }),
    );

    const failingOrchestrator = new AIOrchestrator(
      { get: jest.fn() } as never,
      { transaction: jest.fn() } as never,
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
        executeAnalysis: jest
          .fn()
          .mockRejectedValue(new Error('provider down')),
      } as never,
      analysisService as never,
      {} as never,
      {} as never,
      { createEntry: jest.fn().mockResolvedValue({}) } as never,
      {} as never,
      { getLatestSession: jest.fn().mockResolvedValue(null) } as never,
      auditLogService as never,
    );

    await expect(
      failingOrchestrator.execute('situation-id', actor),
    ).rejects.toThrow();

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.AI_ANALYSIS_FAILED,
        resourceType: AuditResourceType.AI_ANALYSIS,
        resourceId: 'situation-id',
      }) as unknown,
    );
  });

  it('no expone controlador HTTP para modificar o eliminar audit logs', () => {
    const srcDir = join(__dirname, '../../src');
    const auditFiles = readdirSync(join(srcDir, 'audit'), {
      recursive: false,
    });

    expect(auditFiles.some((file) => file.includes('controller'))).toBe(false);
  });
});
