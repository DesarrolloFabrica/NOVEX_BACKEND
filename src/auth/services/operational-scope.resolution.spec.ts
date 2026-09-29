import { ForbiddenException } from '@nestjs/common';
import { UserStatus } from '../../common/enums/identity.enums';
import type { AuthPayload } from '../contracts/auth-payload.contract';
import { OperationalScopeService } from './operational-scope.service';

/**
 * POLÍTICA REAL, SIN DOBLES.
 *
 * Estas pruebas instancian `OperationalScopeService` de verdad: es justamente la
 * pieza que deciden verificar, así que sustituirla por un mock dejaría el
 * comprobante vacío. No hay base de datos porque la política es una función de
 * `(actor, situación)` y no consulta nada.
 */
describe('OperationalScopeService · reportar y solucionar', () => {
  const service = new OperationalScopeService();

  const AREA_A = 'coord-aaaaaaaa-0000-4000-8000-000000000001';
  const AREA_B = 'coord-bbbbbbbb-0000-4000-8000-000000000002';
  const AREA_PADRE = 'coord-cccccccc-0000-4000-8000-000000000003';

  const actor = (over: Partial<AuthPayload>): AuthPayload => ({
    sub: 'user-1',
    email: 'persona@cun.edu.co',
    roleId: 'role-x',
    roleCode: 'ANALISTA',
    coordinationId: null,
    permissions: [],
    status: UserStatus.ACTIVE,
    ...over,
  });

  const CREATE = ['SITUATIONS_VIEW', 'SITUATIONS_CREATE'];
  const CLOSE = ['SITUATIONS_VIEW', 'SITUATIONS_CLOSE'];

  const admin = actor({ roleCode: 'ADMIN', permissions: CREATE });
  const director = actor({ roleCode: 'DIRECTOR', permissions: CREATE });
  const analista = actor({ roleCode: 'ANALISTA', permissions: CREATE });
  const coordinadorA = actor({
    roleCode: 'COORDINADOR',
    coordinationId: AREA_A,
    permissions: CREATE,
  });

  describe('crear: los cuatro roles reportan en otra coordinación', () => {
    it.each([
      ['ADMIN', admin],
      ['DIRECTOR', director],
      ['ANALISTA', analista],
      ['COORDINADOR', coordinadorA],
    ])('%s conserva la coordinación seleccionada', (_label, who) => {
      expect(service.resolveCreateCoordinationId(who, AREA_B)).toBe(AREA_B);
    });

    it('el COORDINADOR también puede reportar en la suya', () => {
      expect(service.resolveCreateCoordinationId(coordinadorA, AREA_A)).toBe(
        AREA_A,
      );
    });

    it('la selección de un ANALISTA ya NO se descarta', () => {
      // Antes de esta fase esto lanzaba ForbiddenException y el caso nacía sin
      // coordinación dueña, por lo que no aparecía en ninguna carta.
      expect(service.resolveCreateCoordinationId(analista, AREA_B)).toBe(AREA_B);
    });

    it('sin selección se conserva el contrato histórico de cada rol', () => {
      // Consumidor existente: el asistente de captura registra a nombre del
      // analista omitiendo la coordinación.
      expect(service.resolveCreateCoordinationId(analista)).toBeNull();
      expect(service.resolveCreateCoordinationId(admin)).toBeNull();
      expect(service.resolveCreateCoordinationId(coordinadorA)).toBe(AREA_A);
    });

    it('sin el permiso de crear no se reporta, se elija lo que se elija', () => {
      const sinPermiso = actor({
        roleCode: 'DIRECTOR',
        permissions: ['SITUATIONS_VIEW'],
      });
      expect(() =>
        service.resolveCreateCoordinationId(sinPermiso, AREA_B),
      ).toThrow(ForbiddenException);
    });
  });

  describe('solucionar: coordinador del área responsable', () => {
    const problemaDeA = {
      coordinationId: AREA_A,
      createdByUserId: 'otra-persona',
    };

    it('el COORDINADOR del área responsable puede', () => {
      const who = actor({
        roleCode: 'COORDINADOR',
        coordinationId: AREA_A,
        permissions: CLOSE,
      });
      expect(service.canResolveSituation(who, problemaDeA)).toBe(true);
      expect(() =>
        service.assertCanResolveSituation(who, problemaDeA),
      ).not.toThrow();
    });

    it.each([
      ['ADMIN', 'ADMIN'],
      ['DIRECTOR', 'DIRECTOR'],
    ])('%s NO puede, ni siquiera con el permiso concedido', (_l, roleCode) => {
      const who = actor({
        roleCode,
        coordinationId: AREA_A,
        permissions: CLOSE,
      });
      expect(service.canResolveSituation(who, problemaDeA)).toBe(false);
      expect(() => service.assertCanResolveSituation(who, problemaDeA)).toThrow(
        ForbiddenException,
      );
    });

    it('ANALISTA NO puede sobre un área que no es Coordinación General', () => {
      const who = actor({
        roleCode: 'ANALISTA',
        coordinationId: null,
        permissions: CLOSE,
      });
      expect(
        service.canResolveSituation(who, problemaDeA, AREA_PADRE),
      ).toBe(false);
      expect(() =>
        service.assertCanResolveSituation(who, problemaDeA, AREA_PADRE),
      ).toThrow(/Coordinación General/);
    });

    it('un COORDINADOR de OTRA área no puede', () => {
      const who = actor({
        roleCode: 'COORDINADOR',
        coordinationId: AREA_B,
        permissions: CLOSE,
      });
      expect(service.canResolveSituation(who, problemaDeA)).toBe(false);
    });

    it('HABER REPORTADO el problema no concede resolverlo', () => {
      const autor = actor({
        sub: 'autor-1',
        roleCode: 'COORDINADOR',
        coordinationId: AREA_B,
        permissions: CLOSE,
      });
      expect(
        service.canResolveSituation(autor, {
          coordinationId: AREA_A,
          createdByUserId: 'autor-1',
        }),
      ).toBe(false);
    });

    it('coordinar un área RELACIONADA o AFECTADA no concede resolver al COORDINADOR', () => {
      const coordinadorDeAfectada = actor({
        roleCode: 'COORDINADOR',
        coordinationId: AREA_B,
        permissions: CLOSE,
      });
      expect(
        service.canResolveSituation(coordinadorDeAfectada, {
          coordinationId: AREA_A,
          createdByUserId: 'x',
        }),
      ).toBe(false);
    });

    it('coordinar el área PADRE no concede resolver la de la hija', () => {
      const coordinadorPadre = actor({
        roleCode: 'COORDINADOR',
        coordinationId: AREA_PADRE,
        permissions: CLOSE,
      });
      expect(
        service.canResolveSituation(coordinadorPadre, {
          coordinationId: AREA_A,
          createdByUserId: 'x',
        }),
      ).toBe(false);
    });

    it('sin SITUATIONS_CLOSE no puede ni el coordinador responsable', () => {
      const who = actor({
        roleCode: 'COORDINADOR',
        coordinationId: AREA_A,
        permissions: ['SITUATIONS_VIEW', 'SITUATIONS_UPDATE'],
      });
      expect(service.canResolveSituation(who, problemaDeA)).toBe(false);
      expect(() => service.assertCanResolveSituation(who, problemaDeA)).toThrow(
        ForbiddenException,
      );
    });

    it('un problema SIN coordinación responsable no lo resuelve el coordinador', () => {
      const who = actor({
        roleCode: 'COORDINADOR',
        coordinationId: AREA_A,
        permissions: CLOSE,
      });
      expect(
        service.canResolveSituation(who, {
          coordinationId: null,
          createdByUserId: 'x',
        }),
      ).toBe(false);
    });

    it('un coordinador SIN área asignada no resuelve nada', () => {
      const who = actor({
        roleCode: 'COORDINADOR',
        coordinationId: null,
        permissions: CLOSE,
      });
      expect(service.canResolveSituation(who, problemaDeA)).toBe(false);
    });

    it('el código de rol se normaliza (espacios y minúsculas)', () => {
      const who = actor({
        roleCode: ' coordinador ',
        coordinationId: AREA_A,
        permissions: CLOSE,
      });
      expect(service.canResolveSituation(who, problemaDeA)).toBe(true);
    });
  });

  describe('solucionar: ANALISTA solo cuando General es responsable', () => {
    const GENERAL = AREA_A;
    const analista = actor({
      roleCode: 'ANALISTA',
      coordinationId: null,
      permissions: CLOSE,
    });

    it('puede cuando General es responsable (interno)', () => {
      expect(
        service.canResolveSituation(
          analista,
          { coordinationId: GENERAL, createdByUserId: 'x' },
          GENERAL,
        ),
      ).toBe(true);
      expect(() =>
        service.assertCanResolveSituation(
          analista,
          { coordinationId: GENERAL, createdByUserId: 'x' },
          GENERAL,
        ),
      ).not.toThrow();
    });

    it('puede cuando General es responsable e INTER afecta a otra área', () => {
      expect(
        service.canResolveSituation(
          analista,
          {
            coordinationId: GENERAL,
            affectedCoordinationId: AREA_B,
            createdByUserId: 'x',
          },
          GENERAL,
        ),
      ).toBe(true);
    });

    it('NO puede cuando General es solo afectada (INTER entrante)', () => {
      expect(
        service.canResolveSituation(
          analista,
          {
            coordinationId: AREA_B,
            affectedCoordinationId: GENERAL,
            createdByUserId: 'x',
          },
          GENERAL,
        ),
      ).toBe(false);
      expect(() =>
        service.assertCanResolveSituation(
          analista,
          {
            coordinationId: AREA_B,
            affectedCoordinationId: GENERAL,
            createdByUserId: 'x',
          },
          GENERAL,
        ),
      ).toThrow(/Coordinación General/);
    });

    it('NO puede aunque sea el autor si General es solo afectada', () => {
      expect(
        service.canResolveSituation(
          { ...analista, sub: 'autor-ana' },
          {
            coordinationId: AREA_B,
            affectedCoordinationId: GENERAL,
            createdByUserId: 'autor-ana',
          },
          GENERAL,
        ),
      ).toBe(false);
    });

    it('no puede sobre otra área sin General como responsable', () => {
      expect(
        service.canResolveSituation(
          analista,
          { coordinationId: AREA_B, createdByUserId: 'x' },
          GENERAL,
        ),
      ).toBe(false);
    });

    it('sin UUID de General resuelto no puede', () => {
      expect(
        service.canResolveSituation(
          analista,
          { coordinationId: GENERAL, createdByUserId: 'x' },
          null,
        ),
      ).toBe(false);
    });

    it('haber reportado en General no cambia la regla: sigue pudiendo por el área responsable', () => {
      expect(
        service.canResolveSituation(
          { ...analista, sub: 'autor-2' },
          { coordinationId: GENERAL, createdByUserId: 'autor-2' },
          GENERAL,
        ),
      ).toBe(true);
    });
  });

  describe('separación de reglas', () => {
    it('poder reportar en un área NO concede operarla', () => {
      // El director reporta en AREA_A y, aun así, sigue sin poder intervenirla:
      // la regla de creación no toca las de actualización ni resolución.
      expect(service.resolveCreateCoordinationId(director, AREA_A)).toBe(
        AREA_A,
      );
      expect(
        service.canUpdateSituation(director, {
          coordinationId: AREA_A,
          createdByUserId: 'otro',
        }),
      ).toBe(false);
      expect(
        service.canResolveSituation(director, {
          coordinationId: AREA_A,
          createdByUserId: 'otro',
        }),
      ).toBe(false);
    });
  });

  describe('avanzar OPEN → IN_PROGRESS: ANALISTA solo si General es responsable', () => {
    const GENERAL = AREA_A;
    const analista = actor({
      roleCode: 'ANALISTA',
      coordinationId: null,
      permissions: ['SITUATIONS_UPDATE'],
    });
    const UPDATE = ['SITUATIONS_UPDATE'] as const;

    it('puede cuando General es responsable (interno)', () => {
      expect(
        service.canAdvanceSituationToInProgress(
          analista,
          { coordinationId: GENERAL },
          GENERAL,
        ),
      ).toBe(true);
    });

    it('puede cuando General es responsable e INTER afecta a otra', () => {
      expect(
        service.canAdvanceSituationToInProgress(
          analista,
          { coordinationId: GENERAL },
          GENERAL,
        ),
      ).toBe(true);
    });

    it('NO puede cuando General es solo afectada, aunque sea autor', () => {
      const autor = actor({
        roleCode: 'ANALISTA',
        sub: 'ana-autor',
        coordinationId: null,
        permissions: [...UPDATE],
      });
      expect(
        service.canAdvanceSituationToInProgress(
          autor,
          { coordinationId: AREA_B },
          GENERAL,
        ),
      ).toBe(false);
      expect(
        service.canUpdateSituation(autor, {
          coordinationId: AREA_B,
          affectedCoordinationId: GENERAL,
          createdByUserId: 'ana-autor',
        }),
      ).toBe(true);
      expect(() =>
        service.assertCanAdvanceSituationToInProgress(
          autor,
          { coordinationId: AREA_B },
          GENERAL,
        ),
      ).toThrow(/En atención/);
    });

    it('NO puede en interno de otra coordinación por sola autoría', () => {
      const autor = actor({
        roleCode: 'ANALISTA',
        sub: 'ana-autor',
        coordinationId: null,
        permissions: [...UPDATE],
      });
      expect(
        service.canAdvanceSituationToInProgress(
          autor,
          { coordinationId: AREA_B },
          GENERAL,
        ),
      ).toBe(false);
      expect(
        service.canUpdateSituation(autor, {
          coordinationId: AREA_B,
          createdByUserId: 'ana-autor',
        }),
      ).toBe(true);
    });

    it('COORDINADOR responsable conserva el avance', () => {
      expect(
        service.canAdvanceSituationToInProgress(
          actor({
            roleCode: 'COORDINADOR',
            coordinationId: AREA_B,
            permissions: [...UPDATE],
          }),
          { coordinationId: AREA_B },
        ),
      ).toBe(true);
    });

    it('ADMIN/DIRECTOR no avanzan aunque tengan SITUATIONS_UPDATE', () => {
      for (const roleCode of ['ADMIN', 'DIRECTOR'] as const) {
        expect(
          service.canAdvanceSituationToInProgress(
            actor({
              roleCode,
              coordinationId: null,
              permissions: [...UPDATE],
            }),
            { coordinationId: GENERAL },
            GENERAL,
          ),
        ).toBe(false);
      }
    });
  });
});
