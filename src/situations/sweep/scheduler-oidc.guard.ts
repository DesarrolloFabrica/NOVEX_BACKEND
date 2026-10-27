import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { GoogleIdTokenVerifier } from './google-id-token.verifier';

const GOOGLE_ISSUERS = new Set([
  'https://accounts.google.com',
  'accounts.google.com',
]);

/**
 * Autentica a Cloud Scheduler en `POST /internal/jobs/situation-sweep`.
 *
 * El servicio de Cloud Run está desplegado con `--allow-unauthenticated`, así
 * que la ruta es alcanzable desde Internet: que sea «interna» no protege nada.
 * Este guard exige un ID token OIDC de Google y comprueba, en el servidor:
 *
 *   - firma de Google y expiración (`verifyIdToken`);
 *   - `aud` exactamente igual a la audiencia configurada;
 *   - `iss` de Google;
 *   - `email` igual a la cuenta de servicio configurada;
 *   - `email_verified === true`.
 *
 * Sin configuración (audiencia o cuenta vacías) rechaza TODA llamada: el
 * endpoint no queda abierto por omisión. Un JWT de usuario de NOVEX nunca
 * sirve aquí (ruta `@Public`, este guard no lo acepta).
 */
@Injectable()
export class SchedulerOidcGuard implements CanActivate {
  private readonly logger = new Logger(SchedulerOidcGuard.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly verifier: GoogleIdTokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const audience =
      this.configService.get<string>('situationSweep.oidcAudience') ?? '';
    const serviceAccount = (
      this.configService.get<string>(
        'situationSweep.oidcServiceAccountEmail',
      ) ?? ''
    ).toLowerCase();

    if (!audience || !serviceAccount) {
      throw new ForbiddenException('El barrido externo no está configurado.');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Falta el token OIDC del programador.');
    }

    let claims;
    try {
      claims = await this.verifier.verify(token, audience);
    } catch (error) {
      this.logger.warn(
        `Token OIDC rechazado: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new UnauthorizedException('Token OIDC no válido.');
    }

    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(audience)) {
      throw new UnauthorizedException('Audiencia OIDC no válida.');
    }
    if (!claims.iss || !GOOGLE_ISSUERS.has(claims.iss)) {
      throw new UnauthorizedException('Emisor OIDC no válido.');
    }
    if (claims.email_verified !== true) {
      throw new UnauthorizedException('Cuenta OIDC sin verificar.');
    }
    if ((claims.email ?? '').toLowerCase() !== serviceAccount) {
      throw new ForbiddenException('Cuenta de servicio no autorizada.');
    }

    return true;
  }
}
