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

  it('permite registrar situaciones en otra coordinación', () => {
    // Regla nueva: la coordinación seleccionada es la RESPONSABLE del problema
    // y manda siempre. Antes esto lanzaba ForbiddenException.
    expect(
      service.resolveCreateCoordinationId(coordinator, 'other-coord'),
    ).toBe('other-coord');
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

  it('conserva la coordinación que selecciona el analista', () => {
    // Regla nueva: el reporte de un analista puede tener área responsable, que
    // es lo que le da sitio en la carta de esa coordinación. Su AUTORÍA sigue
    // registrándose aparte, en createdByUserId.
    expect(service.resolveCreateCoordinationId(analyst, 'coord-b2b')).toBe(
      'coord-b2b',
    );
  });

  it('un coordinador sin área registra sin coordinación responsable', () => {
    // Regla nueva: sin selección explícita y sin área asignada, el caso nace
    // sin dueña en lugar de rechazarse. Con selección, se respeta la elegida.
    expect(
      service.resolveCreateCoordinationId({
        ...coordinator,
        coordinationId: null,
      }),
    ).toBeNull();
    expect(
      service.resolveCreateCoordinationId(
        { ...coordinator, coordinationId: null },
        'coord-b2b',
      ),
    ).toBe('coord-b2b');
  });

  it('el permiso es la autoridad para registrar, no una lista de roles', () => {
    // Regla nueva: reportar dejó de estar reservado a Analista y Coordinador.
    // Quien tenga SITUATIONS_CREATE registra; quien no lo tenga, no.
    const directorConPermiso = {
      ...director,
      permissions: [...director.permissions, 'SITUATIONS_CREATE'],
    };
    expect(
      service.resolveCreateCoordinationId(directorConPermiso, 'coord-b2b'),
    ).toBe('coord-b2b');

    expect(() =>
      service.resolveCreateCoordinationId(director, 'coord-b2b'),
    ).toThrow(ForbiddenException);
  });

  it('sin rol reconocible sigue mandando el permiso', () => {
    // Regla nueva: la autorización de creación no consulta el rol. Un actor sin
    // rol legible pero con el permiso registra sin coordinación dueña; sin el
    // permiso no registra en ningún caso. La RESOLUCIÓN, en cambio, sí exige
    // rol COORDINADOR: son reglas separadas a propósito.
    expect(
      service.resolveCreateCoordinationId({ ...coordinator, roleCode: '' }),
    ).toBeNull();

    expect(() =>
      service.resolveCreateCoordinationId({
        ...coordinator,
        roleCode: '',
        permissions: ['SITUATIONS_VIEW'],
      }),
    ).toThrow(ForbiddenException);

    expect(
      service.canResolveSituation(
        { ...coordinator, roleCode: '', permissions: ['SITUATIONS_CLOSE'] },
        { coordinationId: 'coord-b2b', createdByUserId: 'x' },
      ),
    ).toBe(false);
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
