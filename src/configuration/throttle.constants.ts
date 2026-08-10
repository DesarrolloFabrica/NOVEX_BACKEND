/** Ventana por defecto: 60 segundos. */
export const THROTTLE_TTL_MS = 60_000;

/** Baseline amplio para tráfico legítimo de dashboards y listados. */
export const THROTTLE_DEFAULT_LIMIT = 200;

/** Login / autenticación: evita fuerza bruta sin bloquear uso normal. */
export const THROTTLE_AUTH_LIMIT = 15;

/** Operaciones Gemini: costosas; límite más estricto por usuario/IP. */
export const THROTTLE_GEMINI_LIMIT = 10;

export const THROTTLE_LIMITS = {
  default: {
    name: 'default',
    ttl: THROTTLE_TTL_MS,
    limit: THROTTLE_DEFAULT_LIMIT,
  },
  auth: { name: 'auth', ttl: THROTTLE_TTL_MS, limit: THROTTLE_AUTH_LIMIT },
  gemini: {
    name: 'gemini',
    ttl: THROTTLE_TTL_MS,
    limit: THROTTLE_GEMINI_LIMIT,
  },
} as const;
