import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserStatus } from '../../common/enums/identity.enums';
import { AuthPayload } from '../contracts/auth-payload.contract';
import { OperationalScopeService } from './operational-scope.service';

describe('OperationalScopeService', () => {
  const service = new OperationalScopeService();

  const coordinator: AuthPayload = {
    sub: 'coord-user',
    email: 'coord@cun.edu.co',
    roleId: 'role-coord',
    roleCode: 'COORDINADOR',
    coordinationId: 'coord-b2b',
    permissions: [
      'SITUATIONS_VIEW',
      'SITUATIONS_CREATE',
      'SITUATIONS_UPDATE',
      'COORDINATIONS_VIEW',
    ],
    status: UserStatus.ACTIVE,
  };

  const director: AuthPayload = {
    ...coordinator,
    sub: 'director-user',
    roleCode: 'DIRECTOR',
    coordinationId: 'coord-general',
    permissions: ['SITUATIONS_VIEW', 'COORDINATIONS_VIEW', 'REPORTS_VIEW'],
  };

  it('fuerza el scope de coordinación en listados para coordinador', () => {
    expect(
      service.resolveSituationListCoordinationId(coordinator, 'other-coord'),
    ).toBe('coord-b2b');
  });

  it('respeta filtros de coordinación para analista/director', () => {
    expect(
      service.resolveSituationListCoordinationId(director, 'other-coord'),
    ).toBe('other-coord');
  });

  it('bloquea acceso a situaciones de otra coordinación', () => {
    expect(() =>
      service.assertSituationInScope(coordinator, {
        coordinationId: 'other-coord',
      }),
    ).toThrow(NotFoundException);
  });

  it('impide registrar situaciones fuera de la coordinación asignada', () => {
    expect(() =>
      service.resolveCreateCoordinationId(coordinator, 'other-coord'),
    ).toThrow(ForbiddenException);
  });

  it('filtra coordinaciones visibles para coordinador', () => {
    const filtered = service.filterCoordinationsByScope(coordinator, [
      { id: 'coord-b2b', code: 'coord-b2b' },
      { id: 'coord-general', code: 'coord-general' },
    ]);

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe('coord-b2b');
  });
});
