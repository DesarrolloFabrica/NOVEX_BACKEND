import { UserAwareThrottlerGuard } from './user-aware-throttler.guard';

/** Acceso al método protegido sin montar el módulo de Nest. */
type TrackerProbe = {
  getTracker(req: Record<string, unknown>): Promise<string>;
};

function guard(): TrackerProbe {
  const instance = Object.create(
    UserAwareThrottlerGuard.prototype,
  ) as UserAwareThrottlerGuard;
  return instance as unknown as TrackerProbe;
}

describe('UserAwareThrottlerGuard', () => {
  it('con usuario autenticado cuenta por usuario, no por IP', async () => {
    await expect(
      guard().getTracker({ ip: '10.0.0.1', user: { sub: 'u-1' } }),
    ).resolves.toBe('user:u-1');
  });

  it('dos usuarios detrás de la misma IP tienen cupos distintos', async () => {
    const a = await guard().getTracker({
      ip: '10.0.0.1',
      user: { sub: 'u-1' },
    });
    const b = await guard().getTracker({
      ip: '10.0.0.1',
      user: { sub: 'u-2' },
    });
    expect(a).not.toBe(b);
  });

  it('sin sesión (login) sigue contando por IP', async () => {
    await expect(guard().getTracker({ ip: '10.0.0.1' })).resolves.toBe(
      '10.0.0.1',
    );
  });

  it('un usuario sin `sub` válido no abre un cupo propio', async () => {
    await expect(
      guard().getTracker({ ip: '10.0.0.1', user: { sub: '' } }),
    ).resolves.toBe('10.0.0.1');
  });
});
