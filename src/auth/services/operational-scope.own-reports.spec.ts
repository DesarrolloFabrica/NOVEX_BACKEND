import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserStatus } from '../../common/enums/identity.enums';
import type { AuthPayload } from '../contracts/auth-payload.contract';
import { OperationalScopeService } from './operational-scope.service';

/**
 * LECTURA DE REPORTES PROPIOS ENTRE COORDINACIONES (fase 2).
 *
 * Política real, sin dobles. Lo que estas pruebas fijan es la frontera: la
 * autoría abre la LECTURA de un caso fuera del alcance de coordinación y no
 * abre nada más.
 */
describe('OperationalScopeService · reportes propios', () => {
  const service = new OperationalScopeService();

  const AREA_PROPIA = 'aaaa0000-0000-4000-8000-000000000001';
  const AREA_AJENA = 'bbbb0000-0000-4000-8000-000000000002';

  const coordinador: AuthPayload = {
    sub: 'yo',
    email: 'coord@cun.edu.co',
    roleId: 'r',
    roleCode: 'COORDINADOR',
    coordinationId: AREA_PROPIA,
    permissions: ['SITUATIONS_VIEW', 'SITUATIONS_UPDATE', 'SITUATIONS_CLOSE'],
    status: UserStatus.ACTIVE,
  };

  /** Reporte MÍO, alojado en un área que no es la mía. */
  const miReporteEnOtraArea = {
    coordinationId: AREA_AJENA,
    createdByUserId: 'yo',
  };

  /** Reporte AJENO en un área que no es la mía. */
  const reporteAjeno = {
    coordinationId: AREA_AJENA,
    createdByUserId: 'otra-persona',
  };

  describe('lectura', () => {
    it('puedo LEER mi propio reporte alojado en otra coordinación', () => {
      expect(() =>
        service.assertSituationReadable(coordinador, miReporteEnOtraArea),
      ).not.toThrow();
    });

    it('sigo SIN poder leer un reporte ajeno de otra coordinación', () => {
      // La fase no abre la lectura general de problemas ajenos.
      expect(() =>
        service.assertSituationReadable(coordinador, reporteAjeno),
      ).toThrow(NotFoundException);
    });

    it('sin SITUATIONS_VIEW no se lee nada, ni lo propio', () => {
      const sinPermiso = { ...coordinador, permissions: [] };
      expect(() =>
        service.assertSituationReadable(sinPermiso, miReporteEnOtraArea),
      ).toThrow(ForbiddenException);
    });

    it('un rol no acotado por coordinación no cambia de comportamiento', () => {
      const analista: AuthPayload = {
        ...coordinador,
        roleCode: 'ANALISTA',
        coordinationId: null,
      };
      expect(() =>
        service.assertSituationReadable(analista, reporteAjeno),
      ).not.toThrow();
    });
  });

  describe('la lectura NO se convierte en escritura', () => {
    it('leer mi reporte en otra área no me deja ACTUALIZARLO', () => {
      // `ownsSituation` me considera dueño por autoría; lo único que lo impide
      // es que `assertCanUpdateSituation` siga usando el alcance ESTRICTO.
      expect(() =>
        service.assertCanUpdateSituation(coordinador, miReporteEnOtraArea),
      ).toThrow(NotFoundException);
    });

    it('leer mi reporte en otra área no me deja RESOLVERLO', () => {
      // Resolver exige coordinar el área RESPONSABLE, que aquí no es la mía.
      expect(service.canResolveSituation(coordinador, miReporteEnOtraArea)).toBe(
        false,
      );
      expect(() =>
        service.assertCanResolveSituation(coordinador, miReporteEnOtraArea),
      ).toThrow(ForbiddenException);
    });

    it('sí puedo resolver un problema de MI área aunque lo reportara otro', () => {
      expect(
        service.canResolveSituation(coordinador, {
          coordinationId: AREA_PROPIA,
          createdByUserId: 'otra-persona',
        }),
      ).toBe(true);
    });

    it('`assertSituationInScope` sigue intacto: no conoce la autoría', () => {
      // Es el método que comparten las rutas de escritura. Si algún día alguien
      // lo relajara, esta prueba lo delataría.
      expect(() =>
        service.assertSituationInScope(coordinador, miReporteEnOtraArea),
      ).toThrow(NotFoundException);
    });
  });

  describe('identidad del autor', () => {
    it('la autoría se compara contra actor.sub, no contra un dato del cliente', () => {
      expect(service.isOwnReport(coordinador, { createdByUserId: 'yo' })).toBe(
        true,
      );
      expect(
        service.isOwnReport(coordinador, { createdByUserId: 'otra-persona' }),
      ).toBe(false);
    });
  });
});
