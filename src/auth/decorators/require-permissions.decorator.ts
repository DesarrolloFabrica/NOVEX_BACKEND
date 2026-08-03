import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSIONS_KEY = 'novex:required_permissions';

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);
