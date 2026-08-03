import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { AuthPayload } from '../contracts/auth-payload.contract';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthPayload }>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Sesión no válida.');
    }

    const missing = required.filter(
      (permission) => !user.permissions.includes(permission),
    );

    if (missing.length > 0) {
      throw new ForbiddenException(
        `No tienes permiso para ejecutar esta acción (${missing.join(', ')}).`,
      );
    }

    return true;
  }
}
