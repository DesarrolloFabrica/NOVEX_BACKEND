import {
  Controller,
  Get,
  INestApplication,
  Module,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { HttpLoggingInterceptor } from '../../src/common/logging/http-logging.interceptor';
import { StructuredLogger } from '../../src/common/logging/structured-logger';
import { RequestContextMiddleware } from '../../src/common/request-context/request-context.middleware';
import { RequestContextService } from '../../src/common/request-context/request-context.service';

@Controller('observability-test')
class ObservabilityTestController {
  @Get('ok')
  ok() {
    return { ok: true };
  }

  @Get('error')
  error() {
    throw new UnauthorizedException('Credenciales inválidas');
  }

  @Get('server-error')
  serverError() {
    throw new Error('fallo interno con password=secret');
  }
}

@Module({
  controllers: [ObservabilityTestController],
  providers: [RequestContextService, RequestContextMiddleware],
})
class ObservabilityTestModule {}

describe('Structured request logging', () => {
  let app: INestApplication<App>;
  let logSpy: jest.SpyInstance;

  beforeEach(async () => {
    logSpy = jest
      .spyOn(StructuredLogger, 'write')
      .mockImplementation(() => undefined);

    const expressApp = express();
    const moduleRef = await Test.createTestingModule({
      imports: [ObservabilityTestModule],
    }).compile();

    app = moduleRef.createNestApplication(new ExpressAdapter(expressApp));
    const requestContext = app.get(RequestContextMiddleware);
    expressApp.use((req, res, next) => requestContext.use(req, res, next));
    app.useGlobalInterceptors(new HttpLoggingInterceptor());
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    logSpy.mockRestore();
    await app.close();
  });

  it('genera requestId y devuelve X-Request-Id', async () => {
    const response = await request(app.getHttpServer())
      .get('/observability-test/ok')
      .expect(200);

    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.headers['x-request-id']).toHaveLength(36);
  });

  it('respeta X-Request-Id entrante', async () => {
    const response = await request(app.getHttpServer())
      .get('/observability-test/ok')
      .set('X-Request-Id', 'incoming-req-id')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('incoming-req-id');
  });

  it('correlaciona errores 5xx con requestId sin stack trace', async () => {
    const response = await request(app.getHttpServer())
      .get('/observability-test/server-error')
      .expect(500);

    const body = response.body as { requestId?: string };
    expect(body.requestId).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toContain('stack');
    expect(JSON.stringify(response.body)).not.toContain('password=secret');
  });

  it('no registra Authorization ni password en logs estructurados', async () => {
    await request(app.getHttpServer())
      .get('/observability-test/error')
      .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.test')
      .expect(401);

    const payloads = logSpy.mock.calls.map(
      ([payload]: [Record<string, unknown>]) => JSON.stringify(payload),
    );
    expect(payloads.join('\n')).not.toContain('Bearer eyJ');
    expect(payloads.join('\n')).not.toContain('password');
    expect(payloads.some((line) => line.includes('http_request_failed'))).toBe(
      true,
    );
  });
});
