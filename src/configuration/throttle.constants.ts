/** Ventana por defecto: 60 segundos. */
export const THROTTLE_TTL_MS = 60_000;

/**
 * Baseline amplio para tráfico legítimo de dashboards y listados.
 * El tablero enriquece N situaciones con varias lecturas por ítem;
 * un límite bajo por handler provoca 429 en despliegues con más datos.
 */
export const THROTTLE_DEFAULT_LIMIT = 600;

/** Login / autenticación: evita fuerza bruta sin bloquear uso normal. */
export const THROTTLE_AUTH_LIMIT = 15;

/** Operaciones Gemini: costosas; límite más estricto por usuario/IP. */
/**
 * Límite de operaciones Gemini por ventana. Fuera de producción puede ajustarse
 * con GEMINI_THROTTLE_LIMIT (pruebas E2E que registran varias situaciones).
 * En producción el valor es siempre 10.
 */
export const THROTTLE_GEMINI_LIMIT = resolveGeminiThrottleLimit();

function resolveGeminiThrottleLimit(): number {
  const defaultLimit = 10;
  if (process.env.NODE_ENV === 'production') return defaultLimit;
  const configured = Number(process.env.GEMINI_THROTTLE_LIMIT);
  return Number.isInteger(configured) && configured > 0
    ? configured
    : defaultLimit;
}

/**
 * Solo `default` debe vivir en ThrottlerModule.forRoot.
 * `auth` y `gemini` son metadatos de @Throttle({ default: … }) en rutas sensibles:
 * si se registran como named throttlers globales, Nest los aplica a TODAS las rutas
 * y el dashboard/listados agotan el cupo de Gemini (10/min) en segundos.
 */
export const THROTTLE_LIMITS = {
  default: {
    name: 'default',
    ttl: THROTTLE_TTL_MS,
    limit: THROTTLE_DEFAULT_LIMIT,
  },
} as const;
