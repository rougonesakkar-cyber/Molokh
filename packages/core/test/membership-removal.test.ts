import { describe, expect, it } from 'vitest';

import {
  MembershipRemovalConflictError,
  assertMembershipRemovalAppeal,
  assertMembershipRemovalDecision,
  assertMembershipRemovalRequest,
  deriveConfirmedRemovalStatusPlan,
  membershipRemovalAppealDeadline,
  membershipRemovalSubjectStatus,
} from '../src/membership-removal.js';

describe('membership removal policy', () => {
  it('classifies status and derives administrative succession without a loss', () => {
    expect(membershipRemovalSubjectStatus({
      subjectUserId: 'champion', championUserId: 'champion', contenderUserId: 'contender',
    })).toBe('CHAMPION');
    expect(deriveConfirmedRemovalStatusPlan({
      subjectUserId: 'champion', subjectStatus: 'CHAMPION',
      championUserId: 'champion', contenderUserId: 'contender',
    })).toMatchObject({
      consequence: 'CHAMPION_SUCCESSION',
      afterChampionUserId: 'contender', afterContenderUserId: null,
    });
  });

  it('allows scoped, reasoned non-self removal requests', () => {
    expect(() => assertMembershipRemovalRequest({
      membershipActive: true, communityActive: true, actorIsScopedAdmin: true,
      actorUserId: 'admin', subjectUserId: 'athlete',
      reason: 'Repeated violation of the published Community rules.',
    })).not.toThrow();
    expect(() => assertMembershipRemovalRequest({
      membershipActive: true, communityActive: true, actorIsScopedAdmin: true,
      actorUserId: 'athlete', subjectUserId: 'athlete', reason: 'Long enough reason.',
    })).toThrowError(new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_SELF_CONFLICT'));
  });

  it('keeps the ordinary appeal window open for exactly 48 hours', () => {
    const removedAt = new Date('2026-10-02T10:00:00.000Z');
    const deadline = membershipRemovalAppealDeadline(removedAt);
    expect(deadline.toISOString()).toBe('2026-10-04T10:00:00.000Z');
    expect(() => assertMembershipRemovalAppeal({
      state: 'REMOVED_APPEALABLE', actorUserId: 'athlete', subjectUserId: 'athlete',
      appealDeadlineAt: deadline, occurredAt: new Date('2026-10-04T09:59:59.999Z'),
      reason: 'The removal was based on a mistaken participant identity.',
    })).not.toThrow();
    expect(() => assertMembershipRemovalAppeal({
      state: 'REMOVED_APPEALABLE', actorUserId: 'athlete', subjectUserId: 'athlete',
      appealDeadlineAt: deadline, occurredAt: deadline,
      reason: 'The removal was based on a mistaken participant identity.',
    })).toThrowError(new MembershipRemovalConflictError(
      'MEMBERSHIP_REMOVAL_APPEAL_WINDOW_CLOSED',
    ));
  });

  it('separates ordinary appeals from status-holder review', () => {
    expect(() => assertMembershipRemovalDecision({
      actorIsCentral: true, state: 'UNDER_REVIEW', subjectStatus: 'CHAMPION',
      decision: 'CONFIRM_REMOVAL', reason: 'Evidence confirms the administrative removal request.',
    })).not.toThrow();
    expect(() => assertMembershipRemovalDecision({
      actorIsCentral: true, state: 'UNDER_REVIEW', subjectStatus: 'ORDINARY',
      decision: 'CONFIRM_REMOVAL', reason: 'Evidence confirms the administrative removal request.',
    })).toThrowError(new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_INVALID_STATE'));
  });
});
