import express from 'express';
import helmet from 'helmet';
import request from 'supertest';
import {
  ProbeHealthState,
  registerProbeHealthRoutes,
} from '../../src/health/probe-health';

function createProbeApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  registerProbeHealthRoutes(app, new ProbeHealthState());
  return app;
}

describe('Phase 2 HTTP security headers (Helmet)', () => {
  it('no expone X-Powered-By', async () => {
    const response = await request(createProbeApp()).get('/health').expect(200);

    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('aplica X-Content-Type-Options', async () => {
    const response = await request(createProbeApp()).get('/health').expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('aplica protección de frame', async () => {
    const response = await request(createProbeApp()).get('/health').expect(200);

    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('aplica Referrer-Policy', async () => {
    const response = await request(createProbeApp()).get('/health').expect(200);

    expect(response.headers['referrer-policy']).toBe('no-referrer');
  });
});
