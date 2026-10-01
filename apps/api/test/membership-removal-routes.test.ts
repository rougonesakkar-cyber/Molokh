import type { MembershipRemovalProjection, VenueMemberProjection } from '@molokh/db';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { StaticBearerAuthAdapter } from '../src/auth.js';

const token = 'membership-removal-token';
const userId = '0199a1b2-1234-7000-8000-000000001001';
const subjectId = '0199a1b2-1234-7000-8000-000000001002';
const membershipId = '0199a1b2-1234-7000-8000-000000001003';
const communityId = '0199a1b2-1234-7000-8000-000000001004';
const competitionId = '0199a1b2-1234-7000-8000-000000001005';
const venueId = '0199a1b2-1234-7000-8000-000000001006';
const caseId = '0199a1b2-1234-7000-8000-000000001007';

function projection(
  overrides: Partial<MembershipRemovalProjection> = {},
): MembershipRemovalProjection {
  return {
    caseId, membershipId, communityId, competitionId,
    subjectUserId: subjectId, subjectDisplayName: 'Athlete',
    requestedByUserId: userId, requestedByDisplayName: 'Admin',
    subjectStatus: 'ORDINARY', state: 'REMOVED_APPEALABLE',
    requestReason: 'Repeated violation of published Community rules.',
    requestedAt: '2026-10-02T09:00:00.000Z',
    appealDeadlineAt: '2026-10-04T09:00:00.000Z',
    appealReason: null, appealedAt: null, reviewedByUserId: null,
    decisionReason: null, decidedAt: null, replacementMembershipId: null,
    cancelledChallengeCount: 1, cancelledBookingCount: 1,
    invalidatedQueueEntryCount: 0, version: 1,
    ...overrides,
  };
}

describe('Membership removal routes', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it('AC-131 requests scoped removal and exposes Venue members', async () => {
    const member: VenueMemberProjection = {
      membershipId, userId: subjectId, displayName: 'Athlete', ageDivision: 'ADULT',
      membershipState: 'ACTIVE', status: 'ORDINARY', latestRemovalCase: null,
    };
    const request = vi.fn().mockImplementation(async (command) => ({
      responseStatus: 201,
      response: projection({ caseId: command.aggregateId }),
      eventId: '0199a1b2-1234-7000-8000-000000001008',
      aggregateVersion: 1, replayed: false,
    }));
    const app = await buildApp({
      membershipRemoval: {
        auth: new StaticBearerAuthAdapter(token, userId),
        listVenueMembers: vi.fn().mockResolvedValue([member]),
        listForSubject: vi.fn().mockResolvedValue([]),
        listForCentral: vi.fn().mockResolvedValue([]),
        request, appeal: vi.fn(), decide: vi.fn(),
      },
    });
    apps.push(app);
    const listResponse = await app.inject({
      method: 'GET', url: `/api/v1/venues/${venueId}/members`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({ data: [{ membershipId, status: 'ORDINARY' }] });

    const response = await app.inject({
      method: 'POST', url: `/api/v1/memberships/${membershipId}/removal`,
      headers: {
        authorization: `Bearer ${token}`, 'content-type': 'application/json',
        'idempotency-key': 'remove-member-1', 'if-match': '0',
      },
      payload: { reason: 'Repeated violation of published Community rules.' },
    });
    expect(response.statusCode).toBe(201);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        commandType: 'REQUEST_MEMBERSHIP_REMOVAL', expectedVersion: 0,
        payload: {
          membershipId, reason: 'Repeated violation of published Community rules.',
        },
      }),
      expect.objectContaining({ caseId: expect.stringMatching(/^[0-9a-f-]{36}$/) }),
    );
    expect(response.json()).toMatchObject({
      data: { state: 'REMOVED_APPEALABLE', appealDeadlineAt: '2026-10-04T09:00:00.000Z' },
    });
  });

  it('AC-132 carries versioned Appeal and Central decision commands', async () => {
    const appeal = vi.fn().mockResolvedValue({
      responseStatus: 200,
      response: projection({ state: 'APPEALED', appealReason: 'The subject was misidentified.', appealedAt: '2026-10-02T10:00:00.000Z', version: 2 }),
      eventId: '0199a1b2-1234-7000-8000-000000001009',
      aggregateVersion: 2, replayed: false,
    });
    const decide = vi.fn().mockResolvedValue({
      responseStatus: 200,
      response: projection({
        state: 'OVERTURNED', appealReason: 'The subject was misidentified.',
        appealedAt: '2026-10-02T10:00:00.000Z', reviewedByUserId: userId,
        decisionReason: 'Independent review confirmed mistaken identity.',
        decidedAt: '2026-10-02T11:00:00.000Z',
        replacementMembershipId: '0199a1b2-1234-7000-8000-000000001010', version: 3,
      }),
      eventId: '0199a1b2-1234-7000-8000-000000001011',
      aggregateVersion: 3, replayed: false,
    });
    const app = await buildApp({
      membershipRemoval: {
        auth: new StaticBearerAuthAdapter(token, userId),
        listVenueMembers: vi.fn().mockResolvedValue([]),
        listForSubject: vi.fn().mockResolvedValue([projection()]),
        listForCentral: vi.fn().mockResolvedValue([projection({ state: 'APPEALED', version: 2 })]),
        request: vi.fn(), appeal, decide,
      },
    });
    apps.push(app);
    const appealResponse = await app.inject({
      method: 'POST', url: `/api/v1/membership-removals/${caseId}/appeal`,
      headers: {
        authorization: `Bearer ${token}`, 'content-type': 'application/json',
        'idempotency-key': 'appeal-removal-1', 'if-match': '1',
      },
      payload: { reason: 'The subject was misidentified.' },
    });
    expect(appealResponse.statusCode).toBe(200);
    expect(appeal).toHaveBeenCalledWith(
      expect.objectContaining({
        commandType: 'APPEAL_MEMBERSHIP_REMOVAL', expectedVersion: 1,
        payload: { caseId, reason: 'The subject was misidentified.' },
      }),
      expect.any(Object),
    );

    const decisionResponse = await app.inject({
      method: 'POST', url: `/api/v1/central/membership-removals/${caseId}/decision`,
      headers: {
        authorization: `Bearer ${token}`, 'content-type': 'application/json',
        'idempotency-key': 'decide-removal-1', 'if-match': '2',
      },
      payload: {
        decision: 'REJECT_REMOVAL',
        reason: 'Independent review confirmed mistaken identity.',
        cancelConfirmedSessions: true,
      },
    });
    expect(decisionResponse.statusCode).toBe(200);
    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({
        commandType: 'DECIDE_MEMBERSHIP_REMOVAL', expectedVersion: 2,
        payload: {
          caseId, decision: 'REJECT_REMOVAL',
          reason: 'Independent review confirmed mistaken identity.',
          cancelConfirmedSessions: true,
        },
      }),
      expect.any(Object),
    );
    expect(decisionResponse.json()).toMatchObject({ data: { state: 'OVERTURNED', version: 3 } });
  });
});
