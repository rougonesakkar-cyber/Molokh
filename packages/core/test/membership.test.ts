import { describe, expect, it } from 'vitest';

import {
  assertMembershipTransition,
  membershipRequestDeadline,
} from '../src/membership.js';

const now = new Date('2026-10-04T10:00:00.000Z');
const base = {
  accountState: 'ACTIVE' as const,
  communityState: 'ACTIVE' as const,
  userAgeDivision: 'ADULT' as const,
  hasCurrentRelationship: false,
  hasOtherActiveCompetitiveMembership: false,
  now,
};

describe('Membership lifecycle policy', () => {
  it('[AC-013] activates a valid same-contour Venue invite under the MVP limit', () => {
    expect(() => assertMembershipTransition({
      ...base, transition: 'ACTIVATE', inviteValid: true, inviteAgeDivision: 'ADULT',
    })).not.toThrow();
    expect(() => assertMembershipTransition({
      ...base, transition: 'ACTIVATE', inviteValid: true, inviteAgeDivision: 'YOUTH',
    })).toThrowError(expect.objectContaining({ code: 'MEMBERSHIP_AGE_CONTOUR_MISMATCH' }));
  });

  it('[AC-014] permits a fresh self-request and fixes reminder deadlines at 12h and 24h', () => {
    expect(() => assertMembershipTransition({ ...base, transition: 'REQUEST' })).not.toThrow();
    expect(membershipRequestDeadline(now, 12)).toBe('2026-10-04T22:00:00.000Z');
    expect(membershipRequestDeadline(now, 24)).toBe('2026-10-05T10:00:00.000Z');
    expect(() => assertMembershipTransition({
      ...base, transition: 'REQUEST', reapplyNotBeforeAt: '2026-10-05T10:00:00.000Z',
    })).toThrowError(expect.objectContaining({ code: 'MEMBERSHIP_REAPPLY_NOT_DUE' }));
  });

  it('[AC-015][AC-016] requires a scoped Admin and an eligible pending request', () => {
    expect(() => assertMembershipTransition({
      ...base, transition: 'APPROVE', currentMembershipState: 'PENDING',
      actorControlsVenue: true,
    })).not.toThrow();
    expect(() => assertMembershipTransition({
      ...base, transition: 'APPROVE', currentMembershipState: 'PENDING',
      actorControlsVenue: false,
    })).toThrowError(expect.objectContaining({ code: 'MEMBERSHIP_ADMIN_REQUIRED' }));
    expect(() => assertMembershipTransition({
      ...base, transition: 'APPROVE', currentMembershipState: 'PENDING',
      actorControlsVenue: true, hasOtherActiveCompetitiveMembership: true,
    })).toThrowError(expect.objectContaining({ code: 'MVP_ACTIVE_COMMUNITY_LIMIT' }));
  });
});
