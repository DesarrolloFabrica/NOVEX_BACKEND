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

  describe('solucionar: solo el coordinador del área responsable', () => {
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
      ['ANALISTA', 'ANALISTA'],
    ])('%s NO puede, ni siquiera con el permiso concedido', (_l, roleCode) => {
      // Se le da SITUATIONS_CLOSE a propósito: el objetivo es demostrar que un
      // permiso genérico no crea una excepción a la regla funcional.
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

    it('un COORDINADOR de OTRA área no puede', () => {
      const who = actor({
        roleCode: 'COORDINADOR',
        coordinationId: AREA_B,
        permissions: CLOSE,
      });
      expect(service.canResolveSituation(who, problemaDeA)).toBe(false);
    });

    it('HABER REPORTADO el problema no concede resolverlo', () => {
      // Mismo usuario que lo creó, pero coordina otra área.
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

    it('un ANALISTA autor tampoco puede resolver su propio reporte', () => {
      const autor = actor({
        sub: 'autor-2',
        roleCode: 'ANALISTA',
        coordinationId: AREA_A,
        permissions: CLOSE,
      });
      expect(
        service.canResolveSituation(autor, {
          coordinationId: AREA_A,
          createdByUserId: 'autor-2',
        }),
      ).toBe(false);
    });

    it('coordinar un área RELACIONADA o AFECTADA no concede resolver', () => {
      // El problema es responsabilidad de A y declara relación con B; quien
      // coordina B sigue sin poder cerrarlo. La política solo mira la
      // coordinación RESPONSABLE, nunca las relacionadas.
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
      // La jerarquía no se consulta: la responsabilidad es el vínculo directo.
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

    it('un problema SIN coordinación responsable no lo resuelve nadie', () => {
      // Caso histórico del Registro de analista.
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
});
