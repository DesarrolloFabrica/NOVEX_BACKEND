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

  it('registra al coordinador siempre bajo su coordinación asignada', () => {
    expect(service.resolveCreateCoordinationId(coordinator)).toBe('coord-b2b');
    expect(service.resolveCreateCoordinationId(coordinator, 'coord-b2b')).toBe(
      'coord-b2b',
    );
  });

  const analyst: AuthPayload = {
    ...coordinator,
    sub: 'analyst-user',
    roleCode: 'ANALISTA',
    coordinationId: null,
    permissions: [
      'SITUATIONS_VIEW',
      'SITUATIONS_CREATE',
      'SITUATIONS_UPDATE',
      'COORDINATIONS_VIEW',
    ],
  };

  const situationOfCoordination = {
    coordinationId: 'coord-b2b',
    createdByUserId: 'another-coordinator',
  };

  it('permite al analista registrar sin coordinación', () => {
    expect(service.resolveCreateCoordinationId(analyst)).toBeNull();
  });

  it('impide que el analista atribuya su registro a una coordinación', () => {
    expect(() =>
      service.resolveCreateCoordinationId(analyst, 'coord-b2b'),
    ).toThrow(ForbiddenException);
  });

  it('impide registrar al coordinador que no tiene coordinación', () => {
    expect(() =>
      service.resolveCreateCoordinationId({
        ...coordinator,
        coordinationId: null,
      }),
    ).toThrow(ForbiddenException);
  });

  it('impide registrar a roles no operativos aunque conserven el permiso', () => {
    expect(() =>
      service.resolveCreateCoordinationId({
        ...director,
        permissions: [...director.permissions, 'SITUATIONS_CREATE'],
      }),
    ).toThrow(ForbiddenException);
  });

  it('impide registrar cuando el token no declara un rol', () => {
    expect(() =>
      service.resolveCreateCoordinationId({
        ...coordinator,
        roleCode: '',
      }),
    ).toThrow(ForbiddenException);
  });

  it('permite actualizar a la coordinación dueña de la situación', () => {
    expect(() =>
      service.assertCanUpdateSituation(coordinator, situationOfCoordination),
    ).not.toThrow();
  });

  it('permite al analista actualizar solo las situaciones que registró', () => {
    expect(() =>
      service.assertCanUpdateSituation(analyst, {
        coordinationId: 'coord-b2b',
        createdByUserId: analyst.sub,
      }),
    ).not.toThrow();

    expect(() =>
      service.assertCanUpdateSituation(analyst, situationOfCoordination),
    ).toThrow(ForbiddenException);
  });

  it('impide al director actualizar situaciones ajenas', () => {
    expect(() =>
      service.assertCanUpdateSituation(director, situationOfCoordination),
    ).toThrow(ForbiddenException);
  });

  it('impide intervenir un caso de otra coordinación aunque tenga el permiso', () => {
    expect(() =>
      service.assertCanOperateSituation(coordinator, {
        coordinationId: 'other-coord',
        createdByUserId: 'someone-else',
      }),
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
