import type { MembershipExitProjection } from '@molokh/db';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { StaticBearerAuthAdapter } from '../src/auth.js';

const token = 'membership-exit-token';
const userId = '0199a1b2-1234-7000-8000-000000000101';
const membershipId = '0199a1b2-1234-7000-8000-000000000911';
const competitionId = '0199a1b2-1234-7000-8000-000000000912';
const exitId = '0199a1b2-1234-7000-8000-000000000913';
const confirmationToken = '0199a1b2-1234-7000-8000-000000000914';

function projection(overrides: Partial<MembershipExitProjection> = {}): MembershipExitProjection {
  return {
    exitId, membershipId, competitionId,
    departingStatus: 'ORDINARY', consequence: 'ORDINARY_EXIT', state: 'PREVIEWED',
    successorUserId: null, successorDisplayName: null,
    beforeMembershipVersion: 1, afterMembershipVersion: null,
    beforeStatusVersion: 4, afterStatusVersion: null,
    previewExpiresAt: '2026-10-01T12:15:00.000Z', confirmationToken,
    closedChallengeCount: 0, invalidatedQueueEntryCount: 0,
    createsForfeit: false, createsLoss: false, createsCooldown: false,
    appealWaived: false, version: 1,
    ...overrides,
  };
}

describe('voluntary Membership exit routes', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('AC-106 AC-108 AC-109 requires preview and explicit token-bound confirmation', async () => {
    const preview = vi.fn().mockImplementation(async (command, _ids, generatedToken: string) => ({
      responseStatus: 201,
      response: projection({ exitId: command.aggregateId, confirmationToken: generatedToken }),
      eventId: '0199a1b2-1234-7000-8000-000000000915',
      aggregateVersion: 1, replayed: false,
    }));
    const confirm = vi.fn().mockResolvedValue({
      responseStatus: 200,
      response: projection({
        state: 'CONFIRMED', afterMembershipVersion: 2,
        confirmationToken: null, closedChallengeCount: 1, version: 2,
      }),
      eventId: '0199a1b2-1234-7000-8000-000000000916',
      aggregateVersion: 2, replayed: false,
    });
    const app = await buildApp({
      membershipExit: {
        auth: new StaticBearerAuthAdapter(token, userId), preview, confirm,
      },
    });
    apps.push(app);

    const previewResponse = await app.inject({
      method: 'POST', url: '/api/v1/membership-exits/preview',
      headers: {
        authorization: `Bearer ${token}`, 'content-type': 'application/json',
        'idempotency-key': 'membership-exit-preview-1', 'if-match': '0',
      },
      payload: { membershipId },
    });
    expect(previewResponse.statusCode).toBe(201);
    expect(preview).toHaveBeenCalledWith(
      expect.objectContaining({
        commandType: 'PREVIEW_MEMBERSHIP_EXIT',
        aggregateType: 'VoluntaryMembershipExit', expectedVersion: 0,
        payload: { membershipId },
      }),
      expect.any(Object), expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
    expect(previewResponse.json()).toMatchObject({
      data: {
        state: 'PREVIEWED', consequence: 'ORDINARY_EXIT',
        createsForfeit: false, createsLoss: false, appealWaived: false,
      },
    });

    const generatedExitId = preview.mock.calls[0]?.[0].aggregateId as string;
    const confirmResponse = await app.inject({
      method: 'POST', url: `/api/v1/membership-exits/${generatedExitId}/confirm`,
      headers: {
        authorization: `Bearer ${token}`, 'content-type': 'application/json',
        'idempotency-key': 'membership-exit-confirm-1', 'if-match': '1',
      },
      payload: { confirmationToken },
    });
    expect(confirmResponse.statusCode).toBe(200);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        commandType: 'CONFIRM_MEMBERSHIP_EXIT', aggregateId: generatedExitId,
        expectedVersion: 1,
        payload: { exitId: generatedExitId, confirmationToken },
      }),
      expect.any(Object),
    );
    expect(confirmResponse.json()).toMatchObject({
      data: { state: 'CONFIRMED', afterMembershipVersion: 2, closedChallengeCount: 1 },
    });
  });

  it('requires authentication and concurrency headers', async () => {
    const app = await buildApp({
      membershipExit: {
        auth: new StaticBearerAuthAdapter(token, userId),
        preview: vi.fn(), confirm: vi.fn(),
      },
    });
    apps.push(app);
    const unauthenticated = await app.inject({
      method: 'POST', url: '/api/v1/membership-exits/preview',
      headers: { 'content-type': 'application/json' }, payload: { membershipId },
    });
    expect(unauthenticated.statusCode).toBe(401);
    const missingHeaders = await app.inject({
      method: 'POST', url: '/api/v1/membership-exits/preview',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { membershipId },
    });
    expect(missingHeaders.statusCode).toBe(400);
  });
});
