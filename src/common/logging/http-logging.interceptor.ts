import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, catchError, tap, throwError } from 'rxjs';
import type { AuthPayload } from '../../auth/contracts/auth-payload.contract';
import { StructuredLogger } from '../logging/structured-logger';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private readonly configService: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.configService.get<boolean>('httpRequestLogging')) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
      requestId?: string;
      user?: AuthPayload;
    }>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = http.getResponse<{ statusCode?: number }>();
        StructuredLogger.info('http_request_completed', {
          requestId: request.requestId ?? null,
          method: request.method ?? null,
          path: request.originalUrl ?? request.url ?? null,
          statusCode: response.statusCode ?? null,
          durationMs: Date.now() - startedAt,
          userId: request.user?.sub ?? null,
        });
      }),
      catchError((error: unknown) => {
        const response = http.getResponse<{ statusCode?: number }>();
        const statusCode =
          typeof error === 'object' &&
          error !== null &&
          'status' in error &&
          typeof (error as { status?: unknown }).status === 'number'
            ? (error as { status: number }).status
            : (response.statusCode ?? 500);

        StructuredLogger.error('http_request_failed', {
          requestId: request.requestId ?? null,
          method: request.method ?? null,
          path: request.originalUrl ?? request.url ?? null,
          statusCode,
          durationMs: Date.now() - startedAt,
          userId: request.user?.sub ?? null,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });

        return throwError(() => error);
      }),
    );
  }
}
