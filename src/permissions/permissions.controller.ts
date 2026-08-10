import { Controller, ForbiddenException, Get } from '@nestjs/common';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PermissionsService } from './permissions.service';

@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  list(@CurrentUser() actor: AuthPayload) {
    if (!actor.permissions.includes('SYSTEM_CONFIGURATION')) {
      throw new ForbiddenException(
        'Esta herramienta requiere acceso administrativo.',
      );
    }
    return this.permissionsService.list();
  }
}
