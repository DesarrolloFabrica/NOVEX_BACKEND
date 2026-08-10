import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { HttpLoggingInterceptor } from './logging/http-logging.interceptor';
import { RequestContextMiddleware } from './request-context/request-context.middleware';
import { RequestContextService } from './request-context/request-context.service';

/**
 * Utilidades transversales del backend (observabilidad, contexto de request).
 */
@Global()
@Module({
  providers: [
    RequestContextService,
    RequestContextMiddleware,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
  exports: [RequestContextService, RequestContextMiddleware],
})
export class CommonModule {}
