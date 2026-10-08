import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { SchedulerOidcGuard } from './scheduler-oidc.guard';
import { SituationSweepController } from './situation-sweep.controller';

describe('SchedulerOidcGuard', () => {
  const AUDIENCE = 'https://novex-backend.example.run.app';
  const SA = 'novex-scheduler@proyecto.iam.gserviceaccount.com';

  const validClaims = {
    iss: 'https://accounts.google.com',
    aud: AUDIENCE,
    email: SA,
    email_verified: true,
  };

  function build(
    config: { audience?: string; email?: string } = {},
    claims: Record<string, unknown> | Error = validClaims,
  ) {
    const configService = {
      get: jest.fn((key: string) =>
        key === 'situationSweep.oidcAudience'
          ? (config.audience ?? AUDIENCE)
          : (config.email ?? SA),
      ),
    };
    const verifier = {
      verify: jest.fn(async () => {
        if (claims instanceof Error) throw claims;
        return claims;
      }),
    };
    const guard = new SchedulerOidcGuard(
      configService as never,
      verifier as never,
    );
    return { guard, verifier };
  }

  const context = (authorization?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers: authorization ? { authorization } : {} }),
      }),
    }) as never;

  it('acepta un ID token de Google válido de la cuenta configurada', async () => {
    const { guard, verifier } = build();
    await expect(guard.canActivate(context('Bearer tok'))).resolves.toBe(true);
    expect(verifier.verify).toHaveBeenCalledWith('tok', AUDIENCE);
  });

  it('sin configuración rechaza todo (no queda abierto por omisión)', async () => {
    const { guard } = build({ audience: '' });
    await expect(
      guard.canActivate(context('Bearer tok')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sin token → 401', async () => {
    const { guard } = build();
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('firma/expiración inválidas (verifyIdToken lanza) → 401', async () => {
    const { guard } = build({}, new Error('Invalid token signature'));
    await expect(
      guard.canActivate(context('Bearer tok')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([
    ['audiencia distinta', { aud: 'https://otra' }, UnauthorizedException],
    [
      'emisor no Google',
      { iss: 'https://evil.example' },
      UnauthorizedException,
    ],
    ['email sin verificar', { email_verified: false }, UnauthorizedException],
    [
      'otra cuenta de servicio',
      { email: 'otra@x.iam.gserviceaccount.com' },
      ForbiddenException,
    ],
  ])('%s → rechazado', async (_label, override, error) => {
    const { guard } = build({}, { ...validClaims, ...override });
    await expect(
      guard.canActivate(context('Bearer tok')),
    ).rejects.toBeInstanceOf(error);
  });

  it('el endpoint es @Public solo para la sesión de usuario y exige este guard', () => {
    const handler = SituationSweepController.prototype.run;
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, SituationSweepController)).toBe(
      true,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
      SchedulerOidcGuard,
    ]);
  });
});
