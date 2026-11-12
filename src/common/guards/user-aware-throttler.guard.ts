import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Límite de peticiones POR USUARIO autenticado y, sin sesión, por IP.
 *
 * El guard estándar cuenta por IP: en una sede, todas las personas detrás de la
 * misma IP pública compartían un solo cupo (600/min) y bastaban unas pocas
 * recargas simultáneas del Centro para recibir 429. Este guard corre después de
 * `JwtAuthGuard`, así que `req.user` solo existe con un token VÁLIDO: un token
 * falso se rechaza antes con 401 y no sirve para esquivar el límite. Las rutas
 * públicas (login) siguen limitadas por IP con su límite estricto.
 */
@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    const user = req.user as { sub?: unknown } | undefined;
    if (user && typeof user.sub === 'string' && user.sub.length > 0) {
      return `user:${user.sub}`;
    }
    return super.getTracker(req);
  }
}
