import type {
  ActivateMembershipPayload,
  ApproveMembershipPayload,
  MembershipEffectIds,
  MembershipProjection,
  RequestMembershipPayload,
} from '@molokh/db';
import type { CommandEnvelope } from '@molokh/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { StaticBearerAuthAdapter } from '../src/auth.js';

const token = 'membership-route-token';
const athleteId = '0199a1b2-1234-7000-8000-000000000101';
const communityId = '0199a1b2-1234-7000-8000-000000000102';
const membershipId = '0199a1b2-1234-7000-8000-000000000103';
const eventId = '0199a1b2-1234-7000-8000-000000000104';

function projection(overrides: Partial<MembershipProjection> = {}): MembershipProjection {
  return {
    membershipId, communityId, userId: athleteId, ageDivision: 'ADULT',
    state: 'PENDING', competitionEnabled: false, joinPath: 'SELF_REQUEST',
    requestedAt: '2026-10-04T10:00:00.000Z', decidedAt: null, decidedBy: null,
    version: 1, ...overrides,
  };
}

describe('Membership routes', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('[AC-014][AC-015] exposes self-request, pending Admin queue and approval', async () => {
    const requestMembership = vi.fn(async (
      _command: CommandEnvelope<RequestMembershipPayload>, _ids: MembershipEffectIds,
    ) => ({ responseStatus: 201, response: projection(), eventId,
      aggregateVersion: 1, replayed: false }));
    const approveMembership = vi.fn(async (
      _command: CommandEnvelope<ApproveMembershipPayload>, _ids: MembershipEffectIds,
    ) => ({ responseStatus: 200, response: projection({ state: 'ACTIVE',
      competitionEnabled: true, decidedAt: '2026-10-04T11:00:00.000Z',
      decidedBy: athleteId, version: 2 }), eventId,
      aggregateVersion: 2, replayed: false }));
    const app = await buildApp({ membership: {
      auth: new StaticBearerAuthAdapter(token, athleteId), requestMembership,
      activateMembershipByInvite: vi.fn(), approveMembership,
      listPendingMemberships: async () => [{ ...projection(), displayName: 'Свободный атлет' }],
    } });
    apps.push(app);

    const requested = await app.inject({
      method: 'POST', url: `/api/v1/communities/${communityId}/memberships`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'membership-request-1' },
    });
    expect(requested.statusCode).toBe(201);
    expect(requested.json()).toMatchObject({ data: { state: 'PENDING' },
      meta: { replayed: false } });
    expect(requestMembership.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'REQUEST_MEMBERSHIP', expectedVersion: 0,
      actor: { id: athleteId }, payload: { communityId },
    });
    expect(requestMembership.mock.calls[0]?.[1]).toMatchObject({
      reminderTimerOutboxMessageId: expect.any(String),
      escalationTimerOutboxMessageId: expect.any(String),
    });

    const pending = await app.inject({
      method: 'GET', url: `/api/v1/communities/${communityId}/memberships/pending`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(pending.statusCode).toBe(200);
    expect(pending.json()).toMatchObject({ data: [{ membershipId,
      displayName: 'Свободный атлет' }] });

    const approved = await app.inject({
      method: 'POST', url: `/api/v1/memberships/${membershipId}/approve`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'membership-approve-1',
        'if-match': '1' },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({ data: { state: 'ACTIVE', version: 2 } });
    expect(approveMembership.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'APPROVE_MEMBERSHIP', aggregateId: membershipId,
      expectedVersion: 1, payload: { membershipId }, source: 'admin',
    });
  });

  it('[AC-013] accepts an invite token without putting it in the URL response', async () => {
    const activateMembershipByInvite = vi.fn(async (
      _command: CommandEnvelope<ActivateMembershipPayload>, _ids: MembershipEffectIds,
    ) => ({ responseStatus: 201, response: projection({ state: 'ACTIVE',
      competitionEnabled: true, joinPath: 'QR', requestedAt: null,
      decidedAt: '2026-10-04T10:00:00.000Z', decidedBy: athleteId }), eventId,
      aggregateVersion: 1, replayed: false }));
    const app = await buildApp({ membership: {
      auth: new StaticBearerAuthAdapter(token, athleteId), requestMembership: vi.fn(),
      activateMembershipByInvite, approveMembership: vi.fn(),
      listPendingMemberships: async () => [],
    } });
    apps.push(app);
    const inviteToken = 'pilot-venue-qr-token-2026';
    const accepted = await app.inject({
      method: 'POST', url: '/api/v1/community-invites/accept', body: { token: inviteToken },
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'membership-qr-1' },
    });
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json()).toMatchObject({ data: { state: 'ACTIVE', joinPath: 'QR' } });
    expect(JSON.stringify(accepted.json())).not.toContain(inviteToken);
    expect(activateMembershipByInvite.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'JOIN_BY_QR_OR_INVITE', payload: { token: inviteToken },
    });
  });
});
