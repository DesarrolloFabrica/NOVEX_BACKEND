import { resolveCorsOrigins } from './cors.config';

describe('resolveCorsOrigins', () => {
  it('habilita ambos hosts locales por defecto en desarrollo', () => {
    expect(resolveCorsOrigins({ NODE_ENV: 'development' })).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ]);
  });

  it('normaliza, deduplica y conserva únicamente los orígenes configurados', () => {
    expect(
      resolveCorsOrigins({
        NODE_ENV: 'production',
        CORS_ORIGINS:
          'https://novex.example, https://novex.example/,https://admin.example',
      }),
    ).toEqual(['https://novex.example', 'https://admin.example']);
  });

  it('falla rápido si producción no declara CORS_ORIGINS', () => {
    expect(() => resolveCorsOrigins({ NODE_ENV: 'production' })).toThrow(
      'CORS_ORIGINS es obligatoria en producción',
    );
  });

  it('rechaza valores que no sean orígenes web exactos', () => {
    expect(() =>
      resolveCorsOrigins({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://novex.example/api/v1',
      }),
    ).toThrow('solo admite orígenes sin ruta');
  });
});
