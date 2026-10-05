import { describe, expect, it } from 'vitest';

import {
  assertCommunityClosureTransition,
  assertCommunityLifecycleTransition,
  projectCommunityAccess,
  type CommunityAccessInput,
} from '../src/community.js';

const base: CommunityAccessInput = {
  userId: '0199a1b2-1234-7000-8000-000000000401',
  accountState: 'ACTIVE',
  accountVerificationState: 'VERIFIED',
  ageDivision: 'ADULT',
  venueId: '0199a1b2-1234-7000-8000-000000000402',
  communityId: '0199a1b2-1234-7000-8000-000000000403',
  communityState: 'ACTIVE',
  membership: {
    state: 'ACTIVE',
    ageDivision: 'ADULT',
    competitionEnabled: true,
  },
  membershipReapplyBlocked: false,
  hasOtherActiveCompetitiveMembership: false,
  activeRoleGrants: [],
};

describe('community access projection', () => {
  it('requires both Central verification and an active same-contour membership for Official Challenge', () => {
    const unverified = projectCommunityAccess({
      ...base,
      accountVerificationState: 'NOT_STARTED',
    });
    expect(unverified.capabilities).not.toContain('CREATE_OFFICIAL_CHALLENGE');
    expect(unverified.denials).toContainEqual(
      expect.objectContaining({
        capability: 'CREATE_OFFICIAL_CHALLENGE',
        code: 'ACCOUNT_NOT_VERIFIED',
      }),
    );

    const wrongContour = projectCommunityAccess({
      ...base,
      membership: { ...base.membership!, ageDivision: 'YOUTH' },
    });
    expect(wrongContour.denials).toContainEqual(
      expect.objectContaining({ code: 'AGE_CONTOUR_MISMATCH' }),
    );
    expect(projectCommunityAccess(base).capabilities).toContain('CREATE_OFFICIAL_CHALLENGE');
    expect(projectCommunityAccess(base).denials).toContainEqual(
      expect.objectContaining({
        capability: 'REQUEST_MEMBERSHIP',
        code: 'MEMBERSHIP_ALREADY_EXISTS',
        retryable: false,
      }),
    );
  });

  it('does not let a Coach judge a Challenge outside the granted Community', () => {
    const access = projectCommunityAccess({
      ...base,
      activeRoleGrants: [
        {
          role: 'COACH',
          scopeType: 'COMMUNITY',
          scopeId: '0199a1b2-1234-7000-8000-000000000499',
        },
      ],
    });

    expect(access.capabilities).not.toContain('RECORD_COMMUNITY_RESULT');
    expect(access.denials).toContainEqual(
      expect.objectContaining({
        capability: 'RECORD_COMMUNITY_RESULT',
        code: 'ROLE_SCOPE_MISMATCH',
      }),
    );
  });

  it('gives Primary and ordinary Gym Admin the same everyday Venue operations', () => {
    for (const role of ['PRIMARY_ADMIN', 'GYM_ADMIN'] as const) {
      const access = projectCommunityAccess({
        ...base,
        activeRoleGrants: [{ role, scopeType: 'VENUE', scopeId: base.venueId }],
      });
      expect(access.capabilities).toEqual(
        expect.arrayContaining(['MANAGE_MEMBERSHIPS', 'MANAGE_VENUE_OPERATIONS']),
      );
      expect(access.capabilities).not.toContain('TRANSFER_PRIMARY_ADMIN');
    }
  });

  it('[AC-016] keeps Primary transfer Central-only and blocks a second competitive Community request', () => {
    const central = projectCommunityAccess({
      ...base,
      activeRoleGrants: [{ role: 'CENTRAL_ADMIN', scopeType: 'GLOBAL', scopeId: null }],
    });
    expect(central.capabilities).toContain('TRANSFER_PRIMARY_ADMIN');

    const limited = projectCommunityAccess({
      ...base,
      membership: null,
      hasOtherActiveCompetitiveMembership: true,
    });
    expect(limited.denials).toContainEqual(
      expect.objectContaining({
        capability: 'REQUEST_MEMBERSHIP',
        code: 'MVP_ACTIVE_COMMUNITY_LIMIT',
      }),
    );
  });

  it('[M-04] keeps a rejected self-request closed until its seven-day wait ends', () => {
    const waiting = projectCommunityAccess({
      ...base, membership: null, membershipReapplyBlocked: true,
    });
    expect(waiting.capabilities).not.toContain('REQUEST_MEMBERSHIP');
    expect(waiting.denials).toContainEqual(expect.objectContaining({
      capability: 'REQUEST_MEMBERSHIP', code: 'MEMBERSHIP_REAPPLY_NOT_DUE', retryable: true,
    }));
  });
});

describe('community lifecycle guard', () => {
  it('[CO-02][CO-03] keeps pause/reactivation Central-only and state-explicit', () => {
    expect(() => assertCommunityLifecycleTransition({
      action: 'PAUSE', actorIsCentral: true, currentState: 'ACTIVE', reason: 'Плановые работы',
    })).not.toThrow();
    expect(() => assertCommunityLifecycleTransition({
      action: 'REACTIVATE', actorIsCentral: true, currentState: 'PAUSED', reason: 'Работы завершены',
    })).not.toThrow();
    expect(() => assertCommunityLifecycleTransition({
      action: 'PAUSE', actorIsCentral: false, currentState: 'ACTIVE', reason: 'Нет полномочий',
    })).toThrowError(expect.objectContaining({
      code: 'COMMUNITY_LIFECYCLE_CENTRAL_REQUIRED',
    }));
    expect(() => assertCommunityLifecycleTransition({
      action: 'PAUSE', actorIsCentral: true, currentState: 'PAUSED', reason: 'Повтор',
    })).toThrowError(expect.objectContaining({
      code: 'COMMUNITY_LIFECYCLE_INVALID_STATE',
    }));
    expect(() => assertCommunityLifecycleTransition({
      action: 'PAUSE', actorIsCentral: true, currentState: 'ACTIVE', reason: '   ',
    })).toThrowError(expect.objectContaining({
      code: 'COMMUNITY_LIFECYCLE_REASON_REQUIRED',
    }));
  });

  it('[CO-04][CO-05][AC-177] validates a versioned closure plan and blocks early finalization', () => {
    const now = new Date('2026-10-01T10:00:00.000Z');
    const effectiveAt = new Date('2026-10-02T10:00:00.000Z');
    expect(() => assertCommunityClosureTransition({
      action: 'SCHEDULE_CLOSURE', actorIsCentral: true, currentState: 'ACTIVE',
      reason: 'Permanent venue closure', effectiveAt, now, emergency: false,
      dispositions: [{
        sessionId: '0199a1b2-1234-7000-8000-000000000404',
        disposition: 'RETAIN_TO_COMPLETION',
      }],
    })).not.toThrow();
    expect(() => assertCommunityClosureTransition({
      action: 'SCHEDULE_CLOSURE', actorIsCentral: true, currentState: 'PAUSED',
      reason: 'Emergency closure', effectiveAt: now, now, emergency: true, dispositions: [],
    })).not.toThrow();
    expect(() => assertCommunityClosureTransition({
      action: 'SCHEDULE_CLOSURE', actorIsCentral: true, currentState: 'ACTIVE',
      reason: 'Too early', effectiveAt: now, now, emergency: false, dispositions: [],
    })).toThrowError(expect.objectContaining({
      code: 'COMMUNITY_CLOSURE_EFFECTIVE_AT_INVALID',
    }));
    expect(() => assertCommunityClosureTransition({
      action: 'FINALIZE_CLOSURE', actorIsCentral: true, currentState: 'CLOSING',
      reason: 'Plan complete', effectiveAt, now, emergency: false,
      unresolvedRetainedSessionCount: 0,
    })).toThrowError(expect.objectContaining({ code: 'COMMUNITY_CLOSURE_NOT_DUE' }));
    expect(() => assertCommunityClosureTransition({
      action: 'FINALIZE_CLOSURE', actorIsCentral: true, currentState: 'CLOSING',
      reason: 'Plan complete', effectiveAt,
      now: new Date('2026-10-03T10:00:00.000Z'), emergency: false,
      unresolvedRetainedSessionCount: 1,
    })).toThrowError(expect.objectContaining({
      code: 'COMMUNITY_CLOSURE_RETAINED_SESSION_UNRESOLVED',
    }));
  });
});
