import { describe, expect, it } from 'vitest';

import { hasScopedVenueAdminGrant } from './community-access';

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
