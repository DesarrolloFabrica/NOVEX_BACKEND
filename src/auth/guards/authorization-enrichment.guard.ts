import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacService } from '../../rbac/rbac.service';
import { AuthPayload } from '../contracts/auth-payload.contract';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Enriquece request.user con autorización vigente desde BD (rol, permisos, scope).
 * JWT = identidad; servidor = autoridad actual (SEC-006).
 */
@Injectable()
export class AuthorizationEnrichmentGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthPayload }>();
    const jwtUser = request.user;

    if (!jwtUser?.sub) {
      return true;
    }

    try {
      request.user = await this.rbacService.resolveActiveAuthorization(
        jwtUser.sub,
      );
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Sesión no válida.');
    }

    return true;
  }
}
