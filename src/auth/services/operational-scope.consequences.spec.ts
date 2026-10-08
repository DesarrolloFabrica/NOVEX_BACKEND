import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserStatus } from '../../common/enums/identity.enums';
import {
  SituationReportKind,
  SituationStatus,
} from '../../common/enums/situation.enums';
import type { AuthPayload } from '../contracts/auth-payload.contract';
import {
  OperationalScopeService,
  type SituationConsequenceTarget,
} from './operational-scope.service';

/**
 * AFECTACIONES: «quien reportó + quien gestiona», con la política REAL.
 * Y la regla de alta INTERNAL (coordinación obligatoria, la propia para el
 * coordinador).
 */
describe('OperationalScopeService · afectaciones y alta INTERNAL', () => {
  const service = new OperationalScopeService();
  const AREA_A = 'area-a';
  const AREA_B = 'area-b';

  const actor = (over: Partial<AuthPayload>): AuthPayload => ({
    sub: 'u',
    email: 'u@cun.edu.co',
    roleId: 'r',
    roleCode: 'ANALISTA',
    coordinationId: null,
    permissions: ['SITUATIONS_VIEW', 'SITUATIONS_CREATE', 'SITUATIONS_UPDATE'],
    status: UserStatus.ACTIVE,
    ...over,
  });

  const analistaAutor = actor({ sub: 'autor' });
  const analistaOtro = actor({ sub: 'otro-analista' });
  const coordinadorA = actor({
    sub: 'coord-a',
    roleCode: 'COORDINADOR',
    coordinationId: AREA_A,
  });
  const coordinadorB = actor({
    sub: 'coord-b',
    roleCode: 'COORDINADOR',
    coordinationId: AREA_B,
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

  const situation = (
    over: Partial<SituationConsequenceTarget> = {},
  ): SituationConsequenceTarget => ({
    reportKind: SituationReportKind.INTERNAL,
    status: SituationStatus.OPEN,
    coordinationId: AREA_A,
    createdByUserId: 'autor',
    ...over,
  });

  describe('canAddConsequence', () => {
    it.each([
      ['ANALISTA autor', analistaAutor, true],
      ['ANALISTA no autor', analistaOtro, false],
      ['COORDINADOR responsable', coordinadorA, true],
      ['COORDINADOR de otra coordinación', coordinadorB, false],
      ['DIRECTOR', director, false],
      ['ADMIN', admin, false],
    ])('%s → %s', (_label, who, expected) => {
      expect(service.canAddConsequence(who, situation())).toBe(expected);
    });

    it('IN_PROGRESS también admite afectaciones', () => {
      expect(
        service.canAddConsequence(
          coordinadorA,
          situation({ status: SituationStatus.IN_PROGRESS }),
        ),
      ).toBe(true);
    });

    it.each([SituationStatus.CLOSED, SituationStatus.RESOLVED])(
      '%s congela: nadie agrega',
      (status) => {
        expect(
          service.canAddConsequence(coordinadorA, situation({ status })),
        ).toBe(false);
        expect(
          service.canAddConsequence(analistaAutor, situation({ status })),
        ).toBe(false);
      },
    );

    it('INTER nunca admite afectaciones', () => {
      expect(
        service.canAddConsequence(
          coordinadorA,
          situation({ reportKind: SituationReportKind.INTER_COORDINATION }),
        ),
      ).toBe(false);
    });

    it('sin SITUATIONS_UPDATE no basta con ser autor', () => {
      expect(
        service.canAddConsequence(
          { ...analistaAutor, permissions: ['SITUATIONS_VIEW'] },
          situation(),
        ),
      ).toBe(false);
    });

    it('el COORDINADOR autor de un caso de otra área no agrega (la regla es por coordinación)', () => {
      expect(
        service.canAddConsequence(
          coordinadorB,
          situation({ createdByUserId: 'coord-b' }),
        ),
      ).toBe(false);
    });

    it('assertCanAddConsequence lanza 403 con el motivo del rol', () => {
      expect(() =>
        service.assertCanAddConsequence(analistaOtro, situation()),
      ).toThrow(ForbiddenException);
      expect(() =>
        service.assertCanAddConsequence(coordinadorB, situation()),
      ).toThrow(ForbiddenException);
      expect(() =>
        service.assertCanAddConsequence(director, situation()),
      ).toThrow(ForbiddenException);
      expect(() =>
        service.assertCanAddConsequence(coordinadorA, situation()),
      ).not.toThrow();
    });
  });

  describe('resolveInternalCreateCoordinationId', () => {
    it('exige coordinación a todos los roles (no hay INTERNAL sin área)', () => {
      expect(() =>
        service.resolveInternalCreateCoordinationId(analistaAutor),
      ).toThrow(BadRequestException);
      expect(() =>
        service.resolveInternalCreateCoordinationId(coordinadorA, null),
      ).toThrow(BadRequestException);
    });

    it('el ANALISTA registra en la coordinación seleccionada', () => {
      expect(
        service.resolveInternalCreateCoordinationId(analistaAutor, AREA_B),
      ).toBe(AREA_B);
    });

    it('el COORDINADOR solo en la suya: otra → 403', () => {
      expect(
        service.resolveInternalCreateCoordinationId(coordinadorA, AREA_A),
      ).toBe(AREA_A);
      expect(() =>
        service.resolveInternalCreateCoordinationId(coordinadorA, AREA_B),
      ).toThrow(ForbiddenException);
    });

    it('un COORDINADOR sin coordinación asignada no registra INTERNAL', () => {
      expect(() =>
        service.resolveInternalCreateCoordinationId(
          { ...coordinadorA, coordinationId: null },
          AREA_A,
        ),
      ).toThrow(ForbiddenException);
    });

    it('sin SITUATIONS_CREATE → 403', () => {
      expect(() =>
        service.resolveInternalCreateCoordinationId(director, AREA_A),
      ).toThrow(ForbiddenException);
    });
  });
});
