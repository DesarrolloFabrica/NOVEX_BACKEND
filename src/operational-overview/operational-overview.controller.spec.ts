import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { REQUIRE_PERMISSIONS_KEY } from '../auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { OperationalOverviewController } from './operational-overview.controller';
import { OperationalOverviewService } from './operational-overview.service';

const ACTOR = {
  sub: 'admin-user',
  roleCode: 'ADMIN',
  coordinationId: null,
  permissions: ['SITUATIONS_VIEW', 'COORDINATIONS_VIEW'],
} as unknown as AuthPayload;

/** El handler se lee como valor para inspeccionar su metadata de decoradores. */
const handler = (
  OperationalOverviewController.prototype as unknown as Record<string, object>
).getOverview;

describe('OperationalOverviewController', () => {
  it('expone la ruta GET /operational-overview', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, OperationalOverviewController),
    ).toBe('operational-overview');
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('/');
  });

  it('protege la ruta con PermissionsGuard', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, OperationalOverviewController),
    ).toContain(PermissionsGuard);
  });

  it('exige lectura de situaciones y de coordinaciones', () => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSIONS_KEY, handler)).toEqual([
      'SITUATIONS_VIEW',
      'COORDINATIONS_VIEW',
    ]);
  });

  it('delega en el service pasando el actor autenticado', async () => {
    const overview = { directionStatus: 'ESTABLE' };
    const getOverview = jest.fn().mockResolvedValue(overview);
    const controller = new OperationalOverviewController({
      getOverview,
    } as unknown as OperationalOverviewService);

    await expect(controller.getOverview(ACTOR)).resolves.toBe(overview);
    expect(getOverview).toHaveBeenCalledWith(ACTOR);
    expect(getOverview).toHaveBeenCalledTimes(1);
  });
});
