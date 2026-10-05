import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserStatus } from '../../common/enums/identity.enums';
import { ROLE_PERMISSION_CODES } from '../../permissions/seeds/permissions.catalog.seed';
import type { AuthPayload } from '../contracts/auth-payload.contract';
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { PermissionsGuard } from './permissions.guard';
import { AIOrchestrationController } from '../../ai-orchestration/ai-orchestration.controller';
import { SituationEvidenceController } from '../../situation-evidence/situation-evidence.controller';
import { SituationsController } from '../../situations/situations.controller';
import { OperationalKpiController } from '../../operational-kpis/operational-kpi.controller';
import { OperationalOverviewController } from '../../operational-overview/operational-overview.controller';

function actor(
  roleCode: keyof typeof ROLE_PERMISSION_CODES,
): AuthPayload {
  return {
    sub: `${roleCode.toLowerCase()}-user`,
    email: `${roleCode.toLowerCase()}@cun.edu.co`,
    roleId: `role-${roleCode.toLowerCase()}`,
    roleCode,
    coordinationId: roleCode === 'COORDINADOR' ? 'coord-b2b' : null,
    permissions: [...ROLE_PERMISSION_CODES[roleCode]],
    status: UserStatus.ACTIVE,
  };
}

function contextWith(user: AuthPayload): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

function guardRequiring(...required: string[]): PermissionsGuard {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(required),
  };
  return new PermissionsGuard(reflector as unknown as Reflector);
}

function requiredOn(
  prototype: object,
  method: string,
): string[] | undefined {
  return Reflect.getMetadata(
    REQUIRE_PERMISSIONS_KEY,
    (prototype as Record<string, unknown>)[method],
  );
}

describe('matriz contractual · situaciones (PermissionsGuard + ROLE_PERMISSION_CODES)', () => {
  it('DIRECTOR: lectura 200-equivalente; create/update/close/analyze 403', () => {
    const director = actor('DIRECTOR');
    expect(() =>
      guardRequiring('SITUATIONS_VIEW', 'COORDINATIONS_VIEW').canActivate(
        contextWith(director),
      ),
    ).not.toThrow();
    expect(() =>
      guardRequiring('SITUATIONS_CREATE').canActivate(contextWith(director)),
    ).toThrow(ForbiddenException);
    expect(() =>
      guardRequiring('SITUATIONS_UPDATE').canActivate(contextWith(director)),
    ).toThrow(ForbiddenException);
    expect(() =>
      guardRequiring('SITUATIONS_CLOSE').canActivate(contextWith(director)),
    ).toThrow(ForbiddenException);
    expect(() =>
      guardRequiring('AI_ANALYZE').canActivate(contextWith(director)),
    ).toThrow(ForbiddenException);
  });

  it('ADMIN: lectura institucional; sin operación de situaciones', () => {
    const admin = actor('ADMIN');
    expect(() =>
      guardRequiring('SITUATIONS_VIEW', 'COORDINATIONS_VIEW').canActivate(
        contextWith(admin),
      ),
    ).not.toThrow();
    expect(() =>
      guardRequiring('SITUATIONS_CREATE').canActivate(contextWith(admin)),
    ).toThrow(ForbiddenException);
    expect(() =>
      guardRequiring('SITUATIONS_UPDATE').canActivate(contextWith(admin)),
    ).toThrow(ForbiddenException);
    expect(() =>
      guardRequiring('SITUATIONS_CLOSE').canActivate(contextWith(admin)),
    ).toThrow(ForbiddenException);
  });

  it('ANALISTA: CREATE permitido; lifecycle según permiso de catálogo', () => {
    const analyst = actor('ANALISTA');
    expect(() =>
      guardRequiring('SITUATIONS_CREATE').canActivate(contextWith(analyst)),
    ).not.toThrow();
    expect(() =>
      guardRequiring('SITUATIONS_UPDATE').canActivate(contextWith(analyst)),
    ).not.toThrow();
    expect(() =>
      guardRequiring('SITUATIONS_CLOSE').canActivate(contextWith(analyst)),
    ).not.toThrow();
    expect(() =>
      guardRequiring('AI_ANALYZE').canActivate(contextWith(analyst)),
    ).not.toThrow();
  });

  it('COORDINADOR: CREATE y operación de catálogo intactos', () => {
    const coordinator = actor('COORDINADOR');
    expect(() =>
      guardRequiring('SITUATIONS_CREATE').canActivate(contextWith(coordinator)),
    ).not.toThrow();
    expect(() =>
      guardRequiring('SITUATIONS_UPDATE').canActivate(contextWith(coordinator)),
    ).not.toThrow();
    expect(() =>
      guardRequiring('SITUATIONS_CLOSE').canActivate(contextWith(coordinator)),
    ).not.toThrow();
  });
});

describe('rutas de situaciones · metadata de autorización', () => {
  it('crear y evidencias POST exigen SITUATIONS_CREATE', () => {
    expect(
      requiredOn(AIOrchestrationController.prototype, 'registerWithAnalysis'),
    ).toEqual(['SITUATIONS_CREATE']);
    expect(
      requiredOn(SituationEvidenceController.prototype, 'create'),
    ).toEqual(['SITUATIONS_CREATE']);
  });

  it('ciclo de vida y evidencias DELETE no usan CREATE', () => {
    expect(requiredOn(SituationsController.prototype, 'update')).toEqual([
      'SITUATIONS_UPDATE',
    ]);
    expect(requiredOn(SituationsController.prototype, 'resolve')).toEqual([
      'SITUATIONS_CLOSE',
    ]);
    expect(
      requiredOn(AIOrchestrationController.prototype, 'analyze'),
    ).toEqual(['AI_ANALYZE']);
    expect(
      requiredOn(SituationEvidenceController.prototype, 'delete'),
    ).toEqual(['SITUATIONS_UPDATE']);
  });

  it('lectura institucional y detalle exigen VIEW', () => {
    expect(
      requiredOn(OperationalOverviewController.prototype, 'getOverview'),
    ).toEqual(['SITUATIONS_VIEW', 'COORDINATIONS_VIEW']);
    expect(requiredOn(SituationsController.prototype, 'list')).toEqual([
      'SITUATIONS_VIEW',
    ]);
    expect(requiredOn(SituationsController.prototype, 'getById')).toEqual([
      'SITUATIONS_VIEW',
    ]);
  });
});

describe('KPIS_VIEW · PermissionsGuard + ROLE_PERMISSION_CODES', () => {
  it('DIRECTOR puede; ANALISTA, COORDINADOR y ADMIN no', () => {
    expect(() =>
      guardRequiring('KPIS_VIEW').canActivate(contextWith(actor('DIRECTOR'))),
    ).not.toThrow();
    expect(() =>
      guardRequiring('KPIS_VIEW').canActivate(contextWith(actor('ANALISTA'))),
    ).toThrow(ForbiddenException);
    expect(() =>
      guardRequiring('KPIS_VIEW').canActivate(
        contextWith(actor('COORDINADOR')),
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      guardRequiring('KPIS_VIEW').canActivate(contextWith(actor('ADMIN'))),
    ).toThrow(ForbiddenException);
  });

  it('GET /operational-kpis exige KPIS_VIEW, no REPORTS_VIEW', () => {
    expect(
      requiredOn(OperationalKpiController.prototype, 'getSnapshot'),
    ).toEqual(['KPIS_VIEW']);
    expect(
      requiredOn(OperationalKpiController.prototype, 'compare'),
    ).toEqual(['KPIS_VIEW']);
  });
});
