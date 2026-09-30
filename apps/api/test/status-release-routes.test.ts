import type { StatusReleaseProjection } from '@molokh/db';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { StaticBearerAuthAdapter } from '../src/auth.js';

const token = 'status-release-token';
const userId = '0199a1b2-1234-7000-8000-000000000101';
const competitionId = '0199a1b2-1234-7000-8000-000000000901';
const releaseId = '0199a1b2-1234-7000-8000-000000000902';
const confirmationToken = '0199a1b2-1234-7000-8000-000000000903';

function projection(overrides: Partial<StatusReleaseProjection> = {}): StatusReleaseProjection {
  return {
    releaseId,
    competitionId,
    releasedStatus: 'CONTENDER',
    consequence: 'CONTENDER_VACANCY',
    state: 'PREVIEWED',
    successorUserId: null,
    successorDisplayName: null,
    beforeStatusVersion: 4,
    afterStatusVersion: null,
    previewExpiresAt: '2026-09-28T12:15:00.000Z',
    confirmationToken,
    membershipRemainsActive: true,
    createsResult: false,
    createsLoss: false,
    createsCooldown: false,
    version: 1,
    ...overrides,
  };
}

describe('voluntary status release routes', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('AC-106 AC-108 requires preview and an explicit token-bound confirmation', async () => {
    const preview = vi.fn().mockImplementation(async (command, _ids, generatedToken: string) => ({
      responseStatus: 201,
      response: projection({ releaseId: command.aggregateId, confirmationToken: generatedToken }),
      eventId: '0199a1b2-1234-7000-8000-000000000904',
      aggregateVersion: 1,
      replayed: false,
    }));
    const confirm = vi.fn().mockResolvedValue({
      responseStatus: 200,
      response: projection({
        state: 'CONFIRMED',
        afterStatusVersion: 5,
        confirmationToken: null,
        version: 2,
      }),
      eventId: '0199a1b2-1234-7000-8000-000000000905',
      aggregateVersion: 2,
      replayed: false,
    });
    const app = await buildApp({
      statusRelease: {
        auth: new StaticBearerAuthAdapter(token, userId),
        preview,
        confirm,
      },
    });
    apps.push(app);

    const previewResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/status-releases/preview',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': 'status-release-preview-1',
        'if-match': '0',
      },
      payload: { competitionId },
    });
    expect(previewResponse.statusCode).toBe(201);
    expect(preview).toHaveBeenCalledWith(
      expect.objectContaining({
        commandType: 'PREVIEW_STATUS_RELEASE',
        aggregateType: 'VoluntaryStatusRelease',
        expectedVersion: 0,
        payload: { competitionId },
      }),
      expect.any(Object),
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
    const previewBody = previewResponse.json();
    expect(previewBody.data).toMatchObject({
      state: 'PREVIEWED',
      membershipRemainsActive: true,
      createsResult: false,
      createsLoss: false,
      createsCooldown: false,
      version: 1,
    });

    const generatedReleaseId = preview.mock.calls[0]?.[0].aggregateId as string;
    const confirmResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/status-releases/${generatedReleaseId}/confirm`,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': 'status-release-confirm-1',
        'if-match': '1',
      },
      payload: { confirmationToken },
    });
    expect(confirmResponse.statusCode).toBe(200);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        commandType: 'CONFIRM_STATUS_RELEASE',
        aggregateId: generatedReleaseId,
        expectedVersion: 1,
        payload: { releaseId: generatedReleaseId, confirmationToken },
      }),
      expect.any(Object),
    );
    expect(confirmResponse.json()).toMatchObject({
      data: { state: 'CONFIRMED', afterStatusVersion: 5, confirmationToken: null },
    });
  });

  it('requires authentication and concurrency headers', async () => {
    const app = await buildApp({
      statusRelease: {
        auth: new StaticBearerAuthAdapter(token, userId),
        preview: vi.fn(),
        confirm: vi.fn(),
      },
    });
    apps.push(app);

    const unauthenticated = await app.inject({
      method: 'POST',
      url: '/api/v1/status-releases/preview',
      headers: { 'content-type': 'application/json' },
      payload: { competitionId },
    });
    expect(unauthenticated.statusCode).toBe(401);

    const missingHeaders = await app.inject({
      method: 'POST',
      url: '/api/v1/status-releases/preview',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { competitionId },
    });
    expect(missingHeaders.statusCode).toBe(400);
  });
});
