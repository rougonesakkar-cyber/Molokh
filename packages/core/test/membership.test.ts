import { describe, expect, it } from 'vitest';

import {
  assertMembershipTransition,
  membershipReapplyNotBefore,
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

  it('[AC-014][AC-176] uses a server seven-day reapply deadline without blocking invite entry', () => {
    expect(() => assertMembershipTransition({ ...base, transition: 'REQUEST' })).not.toThrow();
    expect(membershipRequestDeadline(now, 12)).toBe('2026-10-04T22:00:00.000Z');
    expect(membershipRequestDeadline(now, 24)).toBe('2026-10-05T10:00:00.000Z');
    let conflict: unknown;
    try {
      assertMembershipTransition({
        ...base, transition: 'REQUEST', reapplyNotBeforeAt: '2026-10-11T10:00:00.000Z',
        now: new Date('2026-10-07T10:00:00.000Z'),
      });
    } catch (caught) {
      conflict = caught;
    }
    expect(conflict).toMatchObject({
      code: 'MEMBERSHIP_REAPPLY_WAIT', retryAt: '2026-10-11T10:00:00.000Z',
    });
    expect(() => assertMembershipTransition({
      ...base, transition: 'REQUEST', reapplyNotBeforeAt: '2026-10-05T10:00:00.000Z',
      now: new Date('2026-10-05T10:00:00.000Z'),
    })).not.toThrow();
    expect(() => assertMembershipTransition({
      ...base, transition: 'ACTIVATE', inviteValid: true, inviteAgeDivision: 'ADULT',
      reapplyNotBeforeAt: '2026-10-11T10:00:00.000Z',
    })).not.toThrow();
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

  it('[AC-183] keeps the MVP limit by default and permits a second scope only when enabled', () => {
    expect(() => assertMembershipTransition({
      ...base, transition: 'ACTIVATE', inviteValid: true, inviteAgeDivision: 'ADULT',
      hasOtherActiveCompetitiveMembership: true,
    })).toThrowError(expect.objectContaining({ code: 'MVP_ACTIVE_COMMUNITY_LIMIT' }));
    expect(() => assertMembershipTransition({
      ...base, transition: 'ACTIVATE', inviteValid: true, inviteAgeDivision: 'ADULT',
      hasOtherActiveCompetitiveMembership: true, multiCommunityDisciplineEnabled: true,
    })).not.toThrow();
  });

  it('[M-04] requires private and neutral reasons and starts an exact seven-day reapply wait', () => {
    expect(() => assertMembershipTransition({
      ...base, transition: 'REJECT', currentMembershipState: 'PENDING',
      actorControlsVenue: true, publicRejectionReasonCode: 'CAPACITY_UNAVAILABLE',
      internalRejectionReasonCode: 'CAPACITY_LIMIT',
    })).not.toThrow();
    expect(() => assertMembershipTransition({
      ...base, transition: 'REJECT', currentMembershipState: 'PENDING',
      actorControlsVenue: true, publicRejectionReasonCode: 'CAPACITY_UNAVAILABLE',
    })).toThrowError(expect.objectContaining({ code: 'MEMBERSHIP_REJECTION_REASON_INVALID' }));
    expect(() => assertMembershipTransition({
      ...base, transition: 'REJECT', currentMembershipState: 'PENDING',
      actorControlsVenue: true, publicRejectionReasonCode: 'REQUEST_NOT_APPROVED',
      internalRejectionReasonCode: 'SAFETY_REVIEW',
    })).toThrowError(expect.objectContaining({ code: 'MEMBERSHIP_REJECTION_REASON_INVALID' }));
    expect(membershipReapplyNotBefore(now)).toBe('2026-10-11T10:00:00.000Z');
  });

  it('[M-05] lets only the requester withdraw a pending application', () => {
    expect(() => assertMembershipTransition({
      ...base, transition: 'WITHDRAW', currentMembershipState: 'PENDING',
      actorIsRequester: true,
    })).not.toThrow();
    expect(() => assertMembershipTransition({
      ...base, transition: 'WITHDRAW', currentMembershipState: 'PENDING',
      actorIsRequester: false,
    })).toThrowError(expect.objectContaining({ code: 'MEMBERSHIP_REQUESTER_REQUIRED' }));
  });
});
