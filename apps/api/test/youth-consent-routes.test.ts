import type {
  PublicYouthConsentProjection,
  YouthConsentProjection,
  YouthConsentSummaryProjection,
} from '@molokh/db';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { StaticBearerAuthAdapter } from '../src/auth.js';

const token = 'youth-athlete-token';
const userId = '0199a1b2-1234-7000-8000-000000000101';
const peerId = '0199a1b2-1234-7000-8000-000000000102';
const challengeId = '0199a1b2-1234-7000-8000-000000000201';
const consentId = '0199a1b2-1234-7000-8000-000000000202';
const eventId = '0199a1b2-1234-7000-8000-000000000203';
const tokenSecret = 'test-youth-consent-secret-with-32-characters';

function consent(overrides: Partial<YouthConsentProjection> = {}): YouthConsentProjection {
  return {
    consentId,
    challengeId,
    athleteUserId: userId,
    policyVersion: 'youth-consent-mvp-v1',
    state: 'PENDING',
    channel: 'EMAIL',
    maskedContact: 'pa****@example.com',
    expiresAt: '2026-10-03T10:00:00.000Z',
    decidedAt: null,
    revokedAt: null,
    version: 1,
    ...overrides,
  };
}

function publicConsent(
  overrides: Partial<PublicYouthConsentProjection> = {},
): PublicYouthConsentProjection {
  return {
    ...consent(),
    athleteDisplayName: 'Юный атлет',
    challengeState: 'AWAITING_RESPONSE',
    canGrant: true,
    canDecline: true,
    canRevoke: false,
    ...overrides,
  };
}

describe('Youth consent routes', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('AC-055 AC-169 exposes two independent consent states to Challenge participants', async () => {
    const summary: YouthConsentSummaryProjection = {
      challengeId,
      featureEnabled: true,
      viewerAgeDivision: 'YOUTH',
      requiredCount: 2,
      grantedCount: 1,
      ready: false,
      consents: [
        { athleteUserId: userId, state: 'GRANTED', maskedContact: 'pa****@example.com', expiresAt: '2026-10-03T10:00:00.000Z', version: 2 },
        { athleteUserId: peerId, state: 'NOT_REQUESTED', maskedContact: null, expiresAt: null, version: null },
      ],
      policyVersion: 'youth-consent-mvp-v1',
    };
    const readSummary = vi.fn().mockResolvedValue(summary);
    const app = await buildApp({
      youthConsent: {
        auth: new StaticBearerAuthAdapter(token, userId),
        tokenSecret,
        readSummary,
        request: vi.fn(),
        readPublic: vi.fn(),
        decide: vi.fn(),
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/challenges/${challengeId}/youth-consents`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(readSummary).toHaveBeenCalledWith(challengeId, userId);
    expect(response.json()).toMatchObject({
      data: { requiredCount: 2, grantedCount: 1, ready: false },
    });
  });

  it('requests delivery without exposing raw contact or token in the persisted projection', async () => {
    const requestConsent = vi.fn().mockImplementation(async (command, _ids, deliveryToken) => ({
      responseStatus: 201,
      response: consent({ consentId: command.aggregateId }),
      eventId,
      aggregateVersion: 1,
      replayed: false,
      deliveryToken,
    }));
    const app = await buildApp({
      youthConsent: {
        auth: new StaticBearerAuthAdapter(token, userId),
        tokenSecret,
        publicBaseUrl: 'http://localhost:8081',
        exposeDevelopmentActionUrl: true,
        readSummary: vi.fn(),
        request: requestConsent,
        readPublic: vi.fn(),
        decide: vi.fn(),
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/challenges/${challengeId}/youth-consents`,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': 'request-youth-consent-1',
        'if-match': '0',
      },
      payload: { channel: 'EMAIL', guardianContact: 'parent@example.com' },
    });
    expect(response.statusCode).toBe(201);
    expect(requestConsent).toHaveBeenCalledWith(
      expect.objectContaining({
        commandType: 'REQUEST_YOUTH_CHALLENGE_CONSENT',
        aggregateType: 'YouthChallengeConsent',
        expectedVersion: 0,
        payload: { challengeId, channel: 'EMAIL', guardianContact: 'parent@example.com' },
      }),
      expect.any(Object),
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    );
    expect(response.json()).toMatchObject({
      data: { state: 'PENDING', maskedContact: 'pa****@example.com' },
      meta: { developmentActionUrl: expect.stringContaining('/guardian-consent?token=') },
    });
    expect(JSON.stringify(response.json())).not.toContain('parent@example.com');
  });

  it('records an external guardian grant with a token-scoped actor and optimistic version', async () => {
    const publicToken = 'a'.repeat(43);
    const readPublic = vi.fn().mockResolvedValue(publicConsent());
    const decide = vi.fn().mockResolvedValue({
      responseStatus: 200,
      response: publicConsent({ state: 'GRANTED', canGrant: false, canDecline: false, canRevoke: true, version: 2 }),
      eventId,
      aggregateVersion: 2,
      replayed: false,
    });
    const app = await buildApp({
      youthConsent: {
        auth: new StaticBearerAuthAdapter(token, userId),
        tokenSecret,
        readSummary: vi.fn(),
        request: vi.fn(),
        readPublic,
        decide,
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/youth-consents/by-token/${publicToken}/grant`,
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'guardian-grant-1',
        'if-match': '1',
      },
      payload: {
        guardianDisplayName: 'Анна Соколова',
        relationship: 'мать',
        consentTextAccepted: true,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({
          type: 'EXTERNAL',
          id: consentId,
          roles: ['GUARDIAN_CONSENT'],
          scopeIds: [challengeId, userId],
        }),
        aggregateId: consentId,
        expectedVersion: 1,
        payload: expect.objectContaining({ decision: 'GRANT', consentTextAccepted: true }),
      }),
      expect.any(Object),
    );
    expect(response.json()).toMatchObject({ data: { state: 'GRANTED', canRevoke: true } });
  });
});
