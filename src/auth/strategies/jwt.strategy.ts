import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserStatus } from '../../common/enums/identity.enums';
import { AuthPayload } from '../contracts/auth-payload.contract';

/**
 * Valida la firma/expiración del JWT y expone el payload embebido
 * (id, rol, coordinación, permisos) sin consultas adicionales a BD.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const secret = configService.get<string>('jwt.secret', { infer: true });
    if (!secret) {
      throw new Error('JWT_SECRET no está configurado.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: AuthPayload): AuthPayload {
    if (
      !payload?.sub ||
      !payload.email ||
      !payload.roleId ||
      !payload.roleCode ||
      !Array.isArray(payload.permissions)
    ) {
      throw new UnauthorizedException('Token inválido.');
    }

    if (payload.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('El usuario no está activo.');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      roleId: payload.roleId,
      roleCode: payload.roleCode,
      coordinationId: payload.coordinationId,
      permissions: payload.permissions,
      status: payload.status,
    };
  }
}
