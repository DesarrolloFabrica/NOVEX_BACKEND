import { ConflictException } from '@nestjs/common';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { OperationalScopeService } from '../auth/services/operational-scope.service';
import { UserStatus } from '../common/enums/identity.enums';
import { SituationStatus } from '../common/enums/situation.enums';
import { ROLE_PERMISSION_CODES } from '../permissions/seeds/permissions.catalog.seed';
import { SituationAccessService } from './situation-access.service';

/**
 * FASE 01B.2 · Un caso CERRADO o ANULADO no se vuelve a analizar, aunque el
 * actor sea ANALISTA (lee y analiza todo lo activo).
 */
const analista: AuthPayload = {
  sub: 'user-analista',
  email: 'analista@test.novex.invalid',
  roleId: 'role-analista',
  roleCode: 'ANALISTA',
  coordinationId: null,
  permissions: [...ROLE_PERMISSION_CODES.ANALISTA],
  status: UserStatus.ACTIVE,
};

function serviceFor(status: SituationStatus) {
  return new SituationAccessService(new OperationalScopeService(), {
    findByIdWithRelations: jest.fn().mockResolvedValue({
      id: 'situation-1',
      status,
      coordinationId: 'coord-a',
      createdByUserId: 'otro-usuario',
    }),
  } as never);
}

describe('Fase 01B.2 · análisis IA sobre casos congelados', () => {
  it.each([
    [SituationStatus.CLOSED, 'SITUATION_CLOSED'],
    [SituationStatus.CANCELLED, 'SITUATION_CANCELLED'],
  ])('%s → 409 %s', async (status, code) => {
    const error = await serviceFor(status)
      .requireAnalyzableSituation(analista, 'situation-1')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code });
  });

  it.each([SituationStatus.OPEN, SituationStatus.IN_PROGRESS])(
    '%s sigue siendo analizable',
    async (status) => {
      await expect(
        serviceFor(status).requireAnalyzableSituation(analista, 'situation-1'),
      ).resolves.toMatchObject({ status });
    },
  );
});
