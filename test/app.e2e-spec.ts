import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

/**
 * E2E base. Requiere PostgreSQL disponible para AppModule completo.
 * En Sprint 6 se deja como placeholder estructural.
 */
describe('Cunmark Backend (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('módulo raíz arranca', () => {
    expect(app).toBeDefined();
  });

  it.skip('GET /api/v1/dashboard/metrics (requiere DB)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/dashboard/metrics')
      .expect(200);
  });
});
