import express from 'express';
import request from 'supertest';
import { ProbeHealthState, registerProbeHealthRoutes } from './probe-health';

describe('probe health routes', () => {
  it('reports liveness before Nest and PostgreSQL are ready', async () => {
    const app = express();
    registerProbeHealthRoutes(app, new ProbeHealthState());

    const liveness = await request(app).get('/health').expect(200);
    const livenessBody: unknown = liveness.body;
    expect(livenessBody).toMatchObject({ status: 'ok' });
    expect(typeof (livenessBody as { timestamp?: unknown }).timestamp).toBe(
      'string',
    );
    await request(app).get('/health/ready').expect(503);
    await request(app).get('/api/v1/auth/health').expect(503, {
      status: 'starting',
      module: 'auth',
    });
  });

  it('reports readiness only after PostgreSQL responds', async () => {
    const app = express();
    const state = new ProbeHealthState();
    const query = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    state.markNestReady({ isInitialized: true, query });
    registerProbeHealthRoutes(app, state);

    const response = await request(app).get('/health/ready').expect(200);
    const responseBody: unknown = response.body;

    expect(responseBody).toMatchObject({
      status: 'ready',
      checks: { database: 'up' },
    });
    expect(typeof (responseBody as { timestamp?: unknown }).timestamp).toBe(
      'string',
    );
    expect(query).toHaveBeenCalledWith('SELECT 1');
    await request(app).get('/api/v1/auth/health').expect(200, {
      status: 'ok',
      module: 'auth',
    });
  });

  it('removes readiness when PostgreSQL stops responding', async () => {
    const app = express();
    const state = new ProbeHealthState();
    state.markNestReady({
      isInitialized: true,
      query: jest.fn().mockRejectedValue(new Error('database unavailable')),
    });
    registerProbeHealthRoutes(app, state);

    const response = await request(app).get('/health/ready').expect(503);

    expect(response.body).toMatchObject({
      status: 'not_ready',
      checks: { database: 'down' },
    });
  });
});
