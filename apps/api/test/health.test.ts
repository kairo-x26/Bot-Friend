import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppConfig } from '../src/config/config.js';
import { createTestApp } from './support/app.js';

let app: NestFastifyApplication;

beforeAll(async () => {
  ({ app } = await createTestApp());
});
afterAll(() => app.close());

describe('health and error envelope', () => {
  it('responds ok and echoes a request id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'test-req-123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
    expect(res.headers['x-request-id']).toBe('test-req-123');
  });

  it('generates a request id when the incoming one is unsafe', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'bad id\n' },
    });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('uses the stable error envelope for unknown routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
    expect(res.json().error.requestId).toBeTruthy();
  });
});

describe('AppConfig', () => {
  it('refuses dev login and default secrets in production', () => {
    expect(() => AppConfig.fromEnv({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(() =>
      AppConfig.fromEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'x'.repeat(40),
        AUTH_DEV_LOGIN: 'true',
      }),
    ).toThrow(/AUTH_DEV_LOGIN/);
  });
});

describe('CORS', () => {
  it('allows PATCH and DELETE in preflight', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/v1/me/preferences',
      headers: {
        origin: 'http://localhost:8081',
        'access-control-request-method': 'PATCH',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    expect(res.statusCode).toBeLessThan(300);
    expect(String(res.headers['access-control-allow-methods'])).toMatch(/PATCH/);
    expect(String(res.headers['access-control-allow-methods'])).toMatch(/DELETE/);
  });
});

describe('readiness and metrics', () => {
  it('reports ready when the database answers', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.json()).toEqual({ status: 'ready' });
  });

  it('exposes Prometheus metrics with route patterns, never raw ids', async () => {
    await app.inject({
      method: 'GET',
      url: '/v1/conversations/7d1c5d8e-3f0a-4c55-9a3b-5d0e2b9f8a11',
    });
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('botfriend_http_requests_total');
    expect(res.body).toContain('route="/v1/conversations/:id"');
    expect(res.body).not.toContain('7d1c5d8e');
  });

  it('protects metrics with a token when configured', async () => {
    const { createTestApp } = await import('./support/app.js');
    const t2 = await createTestApp({ METRICS_TOKEN: 'metrics-secret-0123456789' });
    expect((await t2.app.inject({ method: 'GET', url: '/metrics' })).statusCode).toBe(401);
    const ok = await t2.app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: 'Bearer metrics-secret-0123456789' },
    });
    expect(ok.statusCode).toBe(200);
    await t2.close();
  });
});
