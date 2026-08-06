/**
 * Logs estructurados de arranque para diagnóstico en Cloud Run / Cloud Logging.
 * Solo observabilidad — no altera lógica de negocio.
 */

export function isBootVerbose(): boolean {
  return process.env.BOOT_VERBOSE?.trim().toLowerCase() === 'true';
}

export function logBootDebug(message: string, ...details: unknown[]): void {
  if (isBootVerbose()) {
    console.log(message, ...details);
  }
}

function stringifyUnknown(value: unknown): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }

  try {
    return JSON.stringify(value) ?? 'n/a';
  } catch {
    return 'n/a';
  }
}

function formatError(error: unknown): {
  message: string;
  stack: string;
  cause: string;
} {
  if (error instanceof Error) {
    const cause =
      error.cause instanceof Error
        ? (error.cause.stack ?? error.cause.message)
        : error.cause !== undefined
          ? stringifyUnknown(error.cause)
          : 'n/a';

    return {
      message: error.message,
      stack: error.stack ?? 'n/a',
      cause,
    };
  }

  return {
    message: stringifyUnknown(error),
    stack: 'n/a',
    cause: 'n/a',
  };
}

export function logBootError(etapa: string, error: unknown): void {
  const formatted = formatError(error);

  console.error('[BOOT ERROR]');
  console.error('stage:', etapa);
  console.error('timestamp:', new Date().toISOString());
  console.error('message:', formatted.message);
  console.error('stack completo:', formatted.stack);
  console.error('cause:', formatted.cause);
}

export function logLifecycleStart(serviceName: string): void {
  logBootDebug(`Starting ${serviceName}`);
}

export function logLifecycleFinish(serviceName: string, detail?: string): void {
  if (detail) {
    logBootDebug(`Finished ${serviceName} (${detail})`);
    return;
  }

  logBootDebug(`Finished ${serviceName}`);
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
