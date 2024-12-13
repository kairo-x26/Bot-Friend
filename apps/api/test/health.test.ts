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
    const res = await app.inject({ method: 'GET', url: '/health', headers: { 'x-request-id': 'test-req-123' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
    expect(res.headers['x-request-id']).toBe('test-req-123');
  });

  it('generates a request id when the incoming one is unsafe', async () => {
    const res = await app.inject({ method: 'GET', url: '/health', headers: { 'x-request-id': 'bad id\n' } });
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
      AppConfig.fromEnv({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), AUTH_DEV_LOGIN: 'true' }),
    ).toThrow(/AUTH_DEV_LOGIN/);
  });
});

describe('CORS', () => {
  it('allows PATCH and DELETE in preflight', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/v1/me/preferences',
      headers: { origin: 'http://localhost:8081', 'access-control-request-method': 'PATCH', 'access-control-request-headers': 'authorization,content-type' },
    });
    expect(res.statusCode).toBeLessThan(300);
    expect(String(res.headers['access-control-allow-methods'])).toMatch(/PATCH/);
    expect(String(res.headers['access-control-allow-methods'])).toMatch(/DELETE/);
  });
});
