import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { mapApiError } from '../src/request-context.js';
import { IdempotencyKeyReusedError, VersionConflictError } from '@molokh/core';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('runtime contract', () => {
  it('returns the typed readiness projection', async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'molokh-api',
      contractVersion: 1,
    });
  });

  it('publishes an OpenAPI 3.1 document', async () => {
    const app = await buildApp();
    apps.push(app);
    await app.ready();

    const document = app.swagger();

    expect('openapi' in document ? document.openapi : undefined).toBe('3.1.0');
    expect(document.paths).toHaveProperty('/health/ready');
    expect(document.paths).toHaveProperty('/v1/meta/runtime');
  });

  it('propagates valid transport context and replaces invalid identifiers', async () => {
    const app = await buildApp();
    apps.push(app);
    const requestId = '0199a1b2-1234-7000-8000-000000000021';
    const correlationId = '0199a1b2-1234-7000-8000-000000000022';

    const supplied = await app.inject({
      method: 'GET',
      url: '/health/ready',
      headers: {
        'x-request-id': requestId,
        'x-correlation-id': correlationId,
      },
    });
    expect(supplied.headers['x-request-id']).toBe(requestId);
    expect(supplied.headers['x-correlation-id']).toBe(correlationId);

    const replaced = await app.inject({
      method: 'GET',
      url: '/health/ready',
      headers: { 'x-request-id': 'not-a-uuid' },
    });
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(replaced.headers['x-request-id']).not.toBe('not-a-uuid');
    expect(replaced.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('maps command conflicts to stable public errors', () => {
    const requestId = '0199a1b2-1234-7000-8000-000000000021';
    expect(mapApiError(new VersionConflictError(1, 2), requestId)).toEqual({
      statusCode: 409,
      body: {
        code: 'VERSION_CONFLICT',
        message: 'Resource changed; refresh and try again',
        requestId,
      },
    });
    expect(mapApiError(new IdempotencyKeyReusedError('scope'), requestId)).toMatchObject({
      statusCode: 409,
      body: { code: 'IDEMPOTENCY_KEY_REUSED', requestId },
    });
  });
});
