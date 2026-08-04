import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import type { AuthPayload } from '../auth/contracts/auth-payload.contract';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsService } from './permissions.service';

@Controller('permissions')
@UseGuards(JwtAuthGuard)
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
