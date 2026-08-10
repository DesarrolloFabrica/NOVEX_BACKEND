import { sanitizeLogRecord } from './log-sanitizer';

export type LogSeverity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

export interface StructuredLogPayload {
  severity: LogSeverity;
  event: string;
  timestamp?: string;
  [key: string]: unknown;
}

export class StructuredLogger {
  static write(payload: StructuredLogPayload): void {
    const { severity, event, ...rest } = payload;
    const line = JSON.stringify(
      sanitizeLogRecord({
        severity,
        event,
        timestamp: payload.timestamp ?? new Date().toISOString(),
        ...rest,
      }),
    );

    if (severity === 'ERROR') {
      console.error(line);
      return;
    }

    if (severity === 'WARNING') {
      console.warn(line);
      return;
    }

    console.log(line);
  }

  static info(event: string, fields: Record<string, unknown> = {}): void {
    this.write({ severity: 'INFO', event, ...fields });
  }

  static warning(event: string, fields: Record<string, unknown> = {}): void {
    this.write({ severity: 'WARNING', event, ...fields });
  }

  static error(event: string, fields: Record<string, unknown> = {}): void {
    this.write({ severity: 'ERROR', event, ...fields });
  }
}
