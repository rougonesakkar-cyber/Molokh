import {
  IdempotencyKeyReusedError,
  VersionConflictError,
  type CommandEnvelope,
  type IdentityProjection,
} from '@molokh/core';
import type { ChangeDisplayNamePayload, IdentityEffectIds } from '@molokh/db';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { StaticBearerAuthAdapter } from '../src/auth.js';
import { mapApiError } from '../src/request-context.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const userId = '0199a1b2-1234-7000-8000-000000000301';
const token = 'molokh-api-test-token';

const identity: IdentityProjection = {
  userId,
  displayName: 'Свободный атлет',
  ageDivision: 'ADULT',
  accountState: 'ACTIVE',
  phoneVerified: true,
  accountVerificationState: 'NOT_STARTED',
  primarySport: 'BOXING',
  secondarySport: null,
  discoveryRadiusKm: 15,
  version: 1,
  capabilities: ['USE_DISCOVERY', 'EDIT_PROFILE', 'BOOK_ORDINARY_TRAINING'],
  capabilityDenials: [
    {
      capability: 'CREATE_OFFICIAL_CHALLENGE',
      code: 'ACCOUNT_NOT_VERIFIED',
      messageKey: 'identity.account_not_verified',
      retryable: true,
    },
  ],
};

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

  it('protects and returns the public identity projection', async () => {
    const app = await buildApp({
      identity: {
        auth: new StaticBearerAuthAdapter(token, userId),
        readMe: async () => identity,
        changeDisplayName: vi.fn(),
      },
    });
    apps.push(app);

    const unauthorized = await app.inject({ method: 'GET', url: '/api/v1/me' });
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.json()).toMatchObject({ code: 'UNAUTHENTICATED' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: identity });
    expect(response.json().data).not.toHaveProperty('phoneE164');
    expect(response.json().data).not.toHaveProperty('birthDate');
  });

  it('passes an idempotent, versioned display-name command to the identity module', async () => {
    const changed: IdentityProjection = {
      ...identity,
      displayName: 'Номер Один',
      version: 2,
    };
    const changeDisplayName = vi.fn(async (
      _command: CommandEnvelope<ChangeDisplayNamePayload>,
      _ids: IdentityEffectIds,
    ) => ({
      responseStatus: 200,
      response: changed,
      eventId: '0199a1b2-1234-7000-8000-000000000302',
      aggregateVersion: 2,
      replayed: false,
    }));
    const app = await buildApp({
      allowedOrigins: ['http://localhost:8081'],
      identity: {
        auth: new StaticBearerAuthAdapter(token, userId),
        readMe: async () => identity,
        changeDisplayName,
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me/profile',
      headers: {
        authorization: `Bearer ${token}`,
        origin: 'http://localhost:8081',
        'idempotency-key': 'display-name-test-1',
        'if-match': '1',
        'x-correlation-id': '0199a1b2-1234-7000-8000-000000000303',
      },
      payload: { displayName: 'Номер Один' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:8081');
    expect(response.json()).toMatchObject({
      data: { displayName: 'Номер Один', version: 2 },
      meta: {
        eventId: '0199a1b2-1234-7000-8000-000000000302',
        replayed: false,
      },
    });
    expect(changeDisplayName).toHaveBeenCalledOnce();
    expect(changeDisplayName.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'CHANGE_DISPLAY_NAME',
      idempotencyKey: 'display-name-test-1',
      aggregateId: userId,
      expectedVersion: 1,
      correlationId: '0199a1b2-1234-7000-8000-000000000303',
      payload: { displayName: 'Номер Один' },
    });
  });

  it('answers allowed browser preflight requests without reaching a route', async () => {
    const app = await buildApp({ allowedOrigins: ['http://localhost:8081'] });
    apps.push(app);

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/me',
      headers: { origin: 'http://localhost:8081' },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:8081');
  });
});
