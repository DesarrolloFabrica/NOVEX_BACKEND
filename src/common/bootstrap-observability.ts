/**
 * Logs estructurados de arranque para diagnóstico en Cloud Run / Cloud Logging.
 * Solo observabilidad — no altera lógica de negocio.
 */

function formatError(error: unknown): {
  message: string;
  stack: string;
  cause: string;
} {
  if (error instanceof Error) {
    const cause =
      error.cause instanceof Error
        ? error.cause.stack ?? error.cause.message
        : error.cause !== undefined
          ? String(error.cause)
          : 'n/a';

    return {
      message: error.message,
      stack: error.stack ?? 'n/a',
      cause,
    };
  }

  return {
    message: String(error),
    stack: 'n/a',
    cause: 'n/a',
  };
}

export function logBootError(etapa: string, error: unknown): never {
  const formatted = formatError(error);

  console.error('[BOOT ERROR]');
  console.error('stage:', etapa);
  console.error('timestamp:', new Date().toISOString());
  console.error('message:', formatted.message);
  console.error('stack completo:', formatted.stack);
  console.error('cause:', formatted.cause);

  process.exit(1);
}

export function logLifecycleStart(serviceName: string): void {
  console.log(`Starting ${serviceName}`);
}

export function logLifecycleFinish(
  serviceName: string,
  detail?: string,
): void {
  if (detail) {
    console.log(`Finished ${serviceName} (${detail})`);
    return;
  }

  console.log(`Finished ${serviceName}`);
}

export function logLifecycleError(serviceName: string, error: unknown): void {
  const formatted = formatError(error);

  console.error(`[LIFECYCLE ERROR] ${serviceName}`);
  console.error('timestamp:', new Date().toISOString());
  console.error('message:', formatted.message);
  console.error('stack completo:', formatted.stack);
  console.error('cause:', formatted.cause);
}

export function registerGlobalProcessHandlers(): void {
  process.on('unhandledRejection', (reason) => {
    const formatted = formatError(reason);

    console.error('[unhandledRejection]');
    console.error('timestamp:', new Date().toISOString());
    console.error('message:', formatted.message);
    console.error('stack completo:', formatted.stack);
    console.error('cause:', formatted.cause);
  });

  process.on('uncaughtException', (error) => {
    const formatted = formatError(error);

    console.error('[uncaughtException]');
    console.error('timestamp:', new Date().toISOString());
    console.error('message:', formatted.message);
    console.error('stack completo:', formatted.stack);
    console.error('cause:', formatted.cause);
  });
}
