import { describe, expect, it } from 'vitest';

import {
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

  it('keeps Primary transfer Central-only and blocks a second competitive Community request', () => {
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
});
