import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserStatus } from '../../src/common/enums/identity.enums';
import type { AuthPayload } from '../../src/auth/contracts/auth-payload.contract';
import { OperationalScopeService } from '../../src/auth/services/operational-scope.service';

/**
 * Matriz crítica AUTH + Operational Scope (sin DB).
 * Complementa suites HTTP con reglas reales del dominio.
 */
describe('Phase 3 authorization matrix (operational scope)', () => {
  const scope = new OperationalScopeService();

  const coordinator = (coordinationId: string): AuthPayload => ({
    sub: 'coord-user',
    email: 'coord@cun.edu.co',
    roleId: 'role-coord',
    roleCode: 'COORDINADOR',
    coordinationId,
    permissions: [
      'SITUATIONS_VIEW',
      'SITUATIONS_CREATE',
      'SITUATIONS_UPDATE',
      'COORDINATIONS_VIEW',
    ],
    status: UserStatus.ACTIVE,
  });

  const analyst: AuthPayload = {
    sub: 'analyst-user',
    email: 'analyst@cun.edu.co',
    roleId: 'role-analyst',
    roleCode: 'ANALISTA',
    coordinationId: null,
    permissions: [
      'SITUATIONS_VIEW',
      'SITUATIONS_CREATE',
      'SITUATIONS_UPDATE',
      'COORDINATIONS_VIEW',
    ],
    status: UserStatus.ACTIVE,
  };

  const director: AuthPayload = {
    sub: 'director-user',
    email: 'director@cun.edu.co',
    roleId: 'role-director',
    roleCode: 'DIRECTOR',
    coordinationId: 'coord-general',
    permissions: ['SITUATIONS_VIEW', 'COORDINATIONS_VIEW', 'REPORTS_VIEW'],
    status: UserStatus.ACTIVE,
  };

  const admin: AuthPayload = {
    sub: 'admin-user',
    email: 'admin@cun.edu.co',
    roleId: 'role-admin',
    roleCode: 'ADMIN',
    coordinationId: null,
    permissions: ['SYSTEM_CONFIGURATION', 'USERS_VIEW', 'USERS_UPDATE'],
    status: UserStatus.ACTIVE,
  };

  it('COORDINADOR: permite situación de su coordinación', () => {
    const actor = coordinator('coord-b2b');
    expect(() =>
      scope.assertSituationInScope(actor, { coordinationId: 'coord-b2b' }),
    ).not.toThrow();
  });

  it('COORDINADOR: rechaza situación de otra coordinación', () => {
    const actor = coordinator('coord-b2b');
    expect(() =>
      scope.assertSituationInScope(actor, { coordinationId: 'coord-other' }),
    ).toThrow(NotFoundException);
  });

  it('ANALISTA: puede actualizar solo casos propios', () => {
    expect(() =>
      scope.assertCanUpdateSituation(analyst, {
        coordinationId: null,
        createdByUserId: analyst.sub,
      }),
    ).not.toThrow();

    expect(() =>
      scope.assertCanUpdateSituation(analyst, {
        coordinationId: 'coord-b2b',
        createdByUserId: 'other-user',
      }),
    ).toThrow(ForbiddenException);
  });

  it('DIRECTOR: lectura en scope, escritura operativa rechazada', () => {
    expect(() =>
      scope.assertSituationInScope(director, { coordinationId: 'coord-b2b' }),
    ).not.toThrow();

    expect(() =>
      scope.assertCanUpdateSituation(director, {
        coordinationId: 'coord-b2b',
        createdByUserId: 'other-user',
      }),
    ).toThrow(ForbiddenException);
  });

  it('ADMIN: permiso administrativo presente en autorización vigente', () => {
    expect(admin.permissions).toContain('SYSTEM_CONFIGURATION');
    expect(() => scope.assertPermission(admin, 'USERS_VIEW')).not.toThrow();
  });
});
