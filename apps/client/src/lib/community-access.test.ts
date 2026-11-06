import { describe, expect, it } from 'vitest';

import {
  canLoadAthleteDiscovery,
  hasScopedVenueAdminGrant,
  operationalRoleForCommunityContext,
} from './community-access';

const venueId = '11111111-1111-4111-8111-111111111111';

describe('hasScopedVenueAdminGrant', () => {
  it('does not treat a global Central grant as Venue admin access', () => {
    expect(hasScopedVenueAdminGrant({
      venue: { venueId },
      activeRoleGrants: [{ role: 'CENTRAL_ADMIN', scopeType: 'GLOBAL', scopeId: null }],
    })).toBe(false);
  });

  it.each(['GYM_ADMIN', 'PRIMARY_ADMIN'] as const)(
    'allows an active %s grant scoped to the current Venue',
    (role) => {
      expect(hasScopedVenueAdminGrant({
        venue: { venueId },
        activeRoleGrants: [{ role, scopeType: 'VENUE', scopeId: venueId }],
      })).toBe(true);
    },
  );

  it('rejects a Venue admin grant for another Venue', () => {
    expect(hasScopedVenueAdminGrant({
      venue: { venueId },
      activeRoleGrants: [{
        role: 'GYM_ADMIN',
        scopeType: 'VENUE',
        scopeId: '22222222-2222-4222-8222-222222222222',
      }],
    })).toBe(false);
  });
});

describe('operationalRoleForCommunityContext', () => {
  it.each([
    ['CENTRAL_ADMIN', 'Central'],
    ['PRIMARY_ADMIN', 'Gym Admin'],
    ['GYM_ADMIN', 'Gym Admin'],
    ['COACH', 'Coach'],
  ] as const)('projects %s from DB role grants as %s', (role, expected) => {
    expect(operationalRoleForCommunityContext({
      activeRoleGrants: [{ role, scopeType: role === 'CENTRAL_ADMIN' ? 'GLOBAL' : 'VENUE',
        scopeId: role === 'CENTRAL_ADMIN' ? null : venueId }],
    })).toBe(expected);
  });

  it('keeps the explicit local test role when no DB operational grant exists', () => {
    expect(operationalRoleForCommunityContext({ activeRoleGrants: [] }, 'Athlete'))
      .toBe('Athlete');
  });
});

describe('canLoadAthleteDiscovery', () => {
  it('does not let operational roles issue Athlete-only Discovery reads', () => {
    expect(canLoadAthleteDiscovery('Athlete')).toBe(true);
    expect(canLoadAthleteDiscovery('Coach')).toBe(false);
    expect(canLoadAthleteDiscovery('Gym Admin')).toBe(false);
    expect(canLoadAthleteDiscovery('Central')).toBe(false);
  });
});
