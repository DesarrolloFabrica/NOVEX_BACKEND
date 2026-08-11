import { Controller, Get, INestApplication, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import express from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { Public } from '../../src/auth/decorators/public.decorator';
import { THROTTLE_LIMITS } from '../../src/configuration/throttle.constants';
import {
  ProbeHealthState,
  registerProbeHealthRoutes,
} from '../../src/health/probe-health';

const TEST_LIMIT = 2;
const TEST_TTL_MS = 60_000;
const AUTH_LIKE_LIMIT = 2;
const GEMINI_LIKE_LIMIT = 2;

@Controller('rate-limit-fixture')
class RateLimitFixtureController {
  @Get('default')
  defaultRoute() {
    return { ok: true };
  }

  @Public()
  @Throttle({
    default: { limit: AUTH_LIKE_LIMIT, ttl: TEST_TTL_MS },
  })
  @Post('auth-like')
  authLikeRoute() {
    return { ok: true };
  }

  @Throttle({
    default: { limit: GEMINI_LIKE_LIMIT, ttl: TEST_TTL_MS },
  })
  @Post('gemini-like')
  geminiLikeRoute() {
    return { ok: true };
  }
}

describe('Phase 2 rate limiting', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          {
            name: THROTTLE_LIMITS.default.name,
            ttl: TEST_TTL_MS,
            limit: TEST_LIMIT,
          },
        ]),
      ],
      controllers: [RateLimitFixtureController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('permite requests normales bajo el límite global', async () => {
    await request(app.getHttpServer())
      .get('/rate-limit-fixture/default')
      .expect(200);
    await request(app.getHttpServer())
      .get('/rate-limit-fixture/default')
      .expect(200);
  });

  it('devuelve 429 al exceder el límite global', async () => {
    const server = request(app.getHttpServer());

    await server.get('/rate-limit-fixture/default').expect(200);
    await server.get('/rate-limit-fixture/default').expect(200);
    await server.get('/rate-limit-fixture/default').expect(429);
  });

  it('aplica límite estricto de auth solo en esa ruta', async () => {
    const server = request(app.getHttpServer());

    await server.post('/rate-limit-fixture/auth-like').expect(201);
    await server.post('/rate-limit-fixture/auth-like').expect(201);
    await server.post('/rate-limit-fixture/auth-like').expect(429);

    await server.get('/rate-limit-fixture/default').expect(200);
  });

  it('aplica límite estricto de Gemini solo en esa ruta', async () => {
    const server = request(app.getHttpServer());

    await server.post('/rate-limit-fixture/gemini-like').expect(201);
    await server.post('/rate-limit-fixture/gemini-like').expect(201);
    await server.post('/rate-limit-fixture/gemini-like').expect(429);

    await server.get('/rate-limit-fixture/default').expect(200);
  });
});

describe('Phase 2 probe health no bloqueado por throttler Nest', () => {
  it('GET /health sigue respondiendo fuera del pipeline Nest', async () => {
    const probeApp = express();
    registerProbeHealthRoutes(probeApp, new ProbeHealthState());

    for (let index = 0; index < 5; index += 1) {
      await request(probeApp).get('/health').expect(200);
    }
  });
});
