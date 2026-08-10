import { GatewayTimeoutException } from '@nestjs/common';

export class AbortTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Operation timed out after ${timeoutMs}ms`);
    this.name = 'AbortTimeoutError';
  }
}

/**
 * Ejecuta una operación async con cancelación real vía AbortSignal.
 * Al expirar, aborta la señal y lanza AbortTimeoutError.
 */
export async function executeWithAbortTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AbortTimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function toGatewayTimeoutException(
  error: unknown,
  timeoutMs: number,
): GatewayTimeoutException {
  const causeMessage =
    error instanceof Error ? error.message : 'Timeout de operación IA.';
  return new GatewayTimeoutException(
    `El análisis IA excedió el tiempo máximo permitido (${timeoutMs}ms).`,
    { cause: causeMessage },
  );
}
