import { describe, expect, it } from 'vitest';

import {
  MembershipExitConflictError,
  assertMembershipExitCanBeConfirmed,
  assertMembershipExitEligibility,
  deriveMembershipExitPlan,
  membershipExitPreviewExpiresAt,
} from '../src/membership-exit.js';

describe('voluntary Membership exit', () => {
  it('derives ordinary exit, Champion succession and Contender vacancy', () => {
    expect(deriveMembershipExitPlan({
      actorUserId: 'ordinary', championUserId: 'champion', contenderUserId: 'contender',
    })).toMatchObject({ departingStatus: 'ORDINARY', consequence: 'ORDINARY_EXIT' });
    expect(deriveMembershipExitPlan({
      actorUserId: 'champion', championUserId: 'champion', contenderUserId: 'contender',
    })).toMatchObject({
      departingStatus: 'CHAMPION', consequence: 'CHAMPION_SUCCESSION',
      statusRelease: { transitionId: 'ST-09', afterChampionUserId: 'contender' },
    });
    expect(deriveMembershipExitPlan({
      actorUserId: 'contender', championUserId: 'champion', contenderUserId: 'contender',
    })).toMatchObject({
      departingStatus: 'CONTENDER', consequence: 'CONTENDER_VACANCY',
      statusRelease: { transitionId: 'ST-10', afterChampionUserId: 'champion' },
    });
    expect(deriveMembershipExitPlan({
      actorUserId: 'champion', championUserId: 'champion', contenderUserId: 'contender',
      hasAcceptedObligation: true,
    })).toMatchObject({
      departingStatus: 'CHAMPION', consequence: 'ACCEPTED_CHALLENGE_FORFEIT',
      statusRelease: null, createsForfeit: true,
    });
  });

  it('keeps accepted obligations and mandatory responses on the governed Forfeit path', () => {
    const eligible = {
      accountActive: true, membershipActive: true, communityActive: true,
      competitionActive: true, integrityHoldActive: false,
      hasActiveObligation: false, hasLiveStatusProcess: false,
    };
    expect(() => assertMembershipExitEligibility(eligible)).not.toThrow();
    expect(() => assertMembershipExitEligibility({
      ...eligible, hasActiveObligation: true,
    })).toThrowError(new MembershipExitConflictError('MEMBERSHIP_EXIT_ACTIVE_OBLIGATION'));
    expect(() => assertMembershipExitEligibility({
      ...eligible, hasActiveObligation: true, activeObligationCanForfeit: true,
    })).not.toThrow();
    expect(() => assertMembershipExitEligibility({
      ...eligible, hasActiveObligation: true, activeObligationCanForfeit: true,
      activeSessionStarted: true,
    })).toThrowError(new MembershipExitConflictError('MEMBERSHIP_EXIT_SESSION_ALREADY_STARTED'));
    expect(() => assertMembershipExitEligibility({
      ...eligible, hasLiveStatusProcess: true,
    })).toThrowError(new MembershipExitConflictError('MEMBERSHIP_EXIT_LIVE_STATUS_PROCESS'));
  });

  it('requires an unexpired token and unchanged Membership/status versions', () => {
    const occurredAt = new Date('2026-10-01T10:05:00.000Z');
    const input = {
      state: 'PREVIEWED', actorUserId: 'athlete', ownerUserId: 'athlete',
      previewExpiresAt: membershipExitPreviewExpiresAt(new Date('2026-10-01T10:00:00.000Z')),
      occurredAt, tokenMatches: true,
      previewMembershipVersion: 2, currentMembershipVersion: 2,
      previewStatusVersion: 4, currentStatusVersion: 4,
      previewChampionUserId: 'champion', currentChampionUserId: 'champion',
      previewContenderUserId: 'contender', currentContenderUserId: 'contender',
    };
    expect(() => assertMembershipExitCanBeConfirmed(input)).not.toThrow();
    expect(() => assertMembershipExitCanBeConfirmed({
      ...input, currentMembershipVersion: 3,
    })).toThrowError(new MembershipExitConflictError('MEMBERSHIP_EXIT_CONTEXT_CHANGED'));
    expect(() => assertMembershipExitCanBeConfirmed({
      ...input, tokenMatches: false,
    })).toThrowError(new MembershipExitConflictError('MEMBERSHIP_EXIT_TOKEN_INVALID'));
  });
});
