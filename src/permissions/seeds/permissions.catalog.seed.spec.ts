import {
  ROLE_PERMISSION_CODES,
} from './permissions.catalog.seed';

describe('ROLE_PERMISSION_CODES · operación de situaciones', () => {
  it('DIRECTOR no tiene SITUATIONS_CREATE ni ciclo de vida', () => {
    expect(ROLE_PERMISSION_CODES.DIRECTOR).not.toContain('SITUATIONS_CREATE');
    expect(ROLE_PERMISSION_CODES.DIRECTOR).not.toContain('SITUATIONS_UPDATE');
    expect(ROLE_PERMISSION_CODES.DIRECTOR).not.toContain('SITUATIONS_CLOSE');
    expect(ROLE_PERMISSION_CODES.DIRECTOR).not.toContain('AI_ANALYZE');
    expect(ROLE_PERMISSION_CODES.DIRECTOR).toEqual(
      expect.arrayContaining([
        'SITUATIONS_VIEW',
        'COORDINATIONS_VIEW',
        'AI_VIEW_REPORTS',
        'REPORTS_VIEW',
        'REPORTS_EXPORT',
        'KPIS_VIEW',
      ]),
    );
  });

  it('solo DIRECTOR tiene KPIS_VIEW', () => {
    expect(ROLE_PERMISSION_CODES.DIRECTOR).toContain('KPIS_VIEW');
    expect(ROLE_PERMISSION_CODES.ADMIN).not.toContain('KPIS_VIEW');
    expect(ROLE_PERMISSION_CODES.ANALISTA).not.toContain('KPIS_VIEW');
    expect(ROLE_PERMISSION_CODES.COORDINADOR).not.toContain('KPIS_VIEW');
  });

  it('ADMIN no tiene SITUATIONS_CREATE ni ciclo de vida; conserva plataforma', () => {
    expect(ROLE_PERMISSION_CODES.ADMIN).not.toContain('SITUATIONS_CREATE');
    expect(ROLE_PERMISSION_CODES.ADMIN).not.toContain('SITUATIONS_UPDATE');
    expect(ROLE_PERMISSION_CODES.ADMIN).not.toContain('SITUATIONS_CLOSE');
    expect(ROLE_PERMISSION_CODES.ADMIN).not.toContain('AI_ANALYZE');
    expect(ROLE_PERMISSION_CODES.ADMIN).toEqual(
      expect.arrayContaining([
        'SITUATIONS_VIEW',
        'COORDINATIONS_VIEW',
        'COORDINATIONS_MANAGE',
        'USERS_VIEW',
        'USERS_CREATE',
        'USERS_UPDATE',
        'USERS_DELETE',
        'SYSTEM_CONFIGURATION',
      ]),
    );
  });

  it('ANALISTA conserva CREATE, UPDATE, CLOSE y AI_ANALYZE', () => {
    expect(ROLE_PERMISSION_CODES.ANALISTA).toEqual(
      expect.arrayContaining([
        'SITUATIONS_VIEW',
        'SITUATIONS_CREATE',
        'SITUATIONS_UPDATE',
        'SITUATIONS_CLOSE',
        'AI_ANALYZE',
      ]),
    );
  });

  it('COORDINADOR conserva CREATE, UPDATE, CLOSE y AI_ANALYZE', () => {
    expect(ROLE_PERMISSION_CODES.COORDINADOR).toEqual(
      expect.arrayContaining([
        'SITUATIONS_VIEW',
        'SITUATIONS_CREATE',
        'SITUATIONS_UPDATE',
        'SITUATIONS_CLOSE',
        'AI_ANALYZE',
      ]),
    );
  });
});
