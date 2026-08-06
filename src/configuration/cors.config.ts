const LOCAL_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
] as const;

function normalizeOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`CORS_ORIGINS contiene un origen inválido: ${value}`);
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.origin === 'null') {
    throw new Error(`CORS_ORIGINS contiene un origen inválido: ${value}`);
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(
      `CORS_ORIGINS solo admite orígenes sin ruta, query ni fragmento: ${value}`,
    );
  }

  return url.origin;
}

export function resolveCorsOrigins(
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  const configured = (environment.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured.length === 0) {
    if (environment.NODE_ENV === 'production') {
      throw new Error('CORS_ORIGINS es obligatoria en producción.');
    }
    return [...LOCAL_CORS_ORIGINS];
  }

  return [...new Set(configured.map(normalizeOrigin))];
}
