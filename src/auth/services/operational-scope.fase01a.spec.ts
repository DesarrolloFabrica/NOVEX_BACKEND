import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserStatus } from '../../common/enums/identity.enums';
import {
  SituationReportKind,
  SituationStatus,
} from '../../common/enums/situation.enums';
import { ROLE_PERMISSION_CODES } from '../../permissions/seeds/permissions.catalog.seed';
import type { AuthPayload } from '../contracts/auth-payload.contract';
import { OperationalScopeService } from './operational-scope.service';

const AREA_A = 'a0000000-0000-4000-8000-00000000000a';
const AREA_B = 'b0000000-0000-4000-8000-00000000000b';
const AREA_C = 'c0000000-0000-4000-8000-00000000000c';

function who(
  sub: string,
  roleCode: keyof typeof ROLE_PERMISSION_CODES,
  coordinationId: string | null,
): AuthPayload {
  return {
    sub,
    email: `${sub}@test.novex.invalid`,
    roleId: `role-${roleCode}`,
    roleCode,
    coordinationId,
    permissions: [...ROLE_PERMISSION_CODES[roleCode]],
    status: UserStatus.ACTIVE,
  };
}

const coordinadorA = who('coord-a', 'COORDINADOR', AREA_A);
const coordinadorSinArea = who('coord-null', 'COORDINADOR', null);
const analista = who('analista', 'ANALISTA', null);
const director = who('director', 'DIRECTOR', null);

const service = new OperationalScopeService();

describe('Fase 01A · OperationalScopeService', () => {
  describe('A2 · COORDINADOR sin coordinación falla cerrado', () => {
    it('el listado normal ya no devuelve «sin filtro»: 403 COORDINATION_REQUIRED', () => {
      let error: unknown;
      try {
        service.resolveSituationListCoordinationId(coordinadorSinArea, AREA_B);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'COORDINATION_REQUIRED',
      });
    });

    it('un COORDINADOR con área sigue listando SOLO la suya', () => {
      expect(
        service.resolveSituationListCoordinationId(coordinadorA, AREA_B),
      ).toBe(AREA_A);
    });

    it('los roles institucionales conservan la coordinación pedida', () => {
      expect(service.resolveSituationListCoordinationId(analista, AREA_B)).toBe(
        AREA_B,
      );
      expect(service.resolveSituationListCoordinationId(director)).toBe(
        undefined,
      );
    });

    it('no lee ni el caso que él mismo reportó (404, como un inexistente)', () => {
      expect(() =>
        service.assertSituationReadable(coordinadorSinArea, {
          coordinationId: AREA_B,
          affectedCoordinationId: AREA_C,
          createdByUserId: coordinadorSinArea.sub,
        }),
      ).toThrow(NotFoundException);
    });

    it('no registra dependencias INTER', () => {
      expect(() =>
        service.assertCanCreateInterDependency(coordinadorSinArea, AREA_A),
      ).toThrow(ForbiddenException);
    });
  });

  describe('alta INTER · el COORDINADOR reporta desde su coordinación', () => {
    it('admite una dependencia donde la AFECTADA es la suya', () => {
      expect(() =>
        service.assertCanCreateInterDependency(coordinadorA, AREA_A),
      ).not.toThrow();
    });

    it('rechaza una dependencia entre dos áreas ajenas (403)', () => {
      expect(() =>
        service.assertCanCreateInterDependency(coordinadorA, AREA_B),
      ).toThrow(ForbiddenException);
    });

    it('el ANALISTA conserva la selección libre', () => {
      expect(() =>
        service.assertCanCreateInterDependency(analista, AREA_B),
      ).not.toThrow();
    });

    it('sin SITUATIONS_CREATE nadie registra (DIRECTOR)', () => {
      expect(() =>
        service.assertCanCreateInterDependency(director, AREA_B),
      ).toThrow(ForbiddenException);
    });
  });

  describe('M1 · el análisis IA tiene su propia regla', () => {
    const interBAfectaA = {
      coordinationId: AREA_B,
      affectedCoordinationId: AREA_A,
      createdByUserId: coordinadorA.sub,
    };

    it('ANALISTA analiza cualquier caso legible, aunque no sea suyo', () => {
      expect(() =>
        service.assertCanRequestAnalysis(analista, {
          coordinationId: AREA_C,
          affectedCoordinationId: AREA_C,
          createdByUserId: 'otra-persona',
        }),
      ).not.toThrow();
    });

    it('…pero eso no le concede editar ese caso', () => {
      expect(() =>
        service.assertCanUpdateSituation(analista, {
          coordinationId: AREA_C,
          affectedCoordinationId: AREA_C,
          createdByUserId: 'otra-persona',
        }),
      ).toThrow(ForbiddenException);
    });

    it('COORDINADOR de la AFECTADA (y autor) puede leer el INTER pero no analizarlo (404)', () => {
      expect(() =>
        service.assertSituationReadable(coordinadorA, interBAfectaA),
      ).not.toThrow();
      expect(() =>
        service.assertCanRequestAnalysis(coordinadorA, interBAfectaA),
      ).toThrow(NotFoundException);
    });

    it('COORDINADOR de la RESPONSABLE analiza', () => {
      expect(() =>
        service.assertCanRequestAnalysis(coordinadorA, {
          coordinationId: AREA_A,
          affectedCoordinationId: AREA_B,
          createdByUserId: 'otra-persona',
        }),
      ).not.toThrow();
    });

    it('DIRECTOR no tiene AI_ANALYZE (403)', () => {
      expect(() =>
        service.assertCanRequestAnalysis(director, {
          coordinationId: AREA_A,
          affectedCoordinationId: AREA_A,
          createdByUserId: 'x',
        }),
      ).toThrow(ForbiddenException);
    });
  });

  describe('casos no activos', () => {
    it.each([SituationStatus.CLOSED, SituationStatus.RESOLVED])(
      '%s → 409 SITUATION_CLOSED',
      (status) => {
        let error: unknown;
        try {
          service.assertSituationWorkable({ status });
        } catch (caught) {
          error = caught;
        }
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toMatchObject({
          code: 'SITUATION_CLOSED',
        });
      },
    );

    it.each([SituationStatus.OPEN, SituationStatus.IN_PROGRESS])(
      '%s admite trabajo',
      (status) => {
        expect(() => service.assertSituationWorkable({ status })).not.toThrow();
      },
    );
  });

  it('no cambia la regla de afectaciones (referencia: INTERNAL activo)', () => {
    expect(
      service.canAddConsequence(coordinadorA, {
        coordinationId: AREA_A,
        createdByUserId: 'x',
        reportKind: SituationReportKind.INTERNAL,
        status: SituationStatus.OPEN,
      }),
    ).toBe(true);
  });
});
