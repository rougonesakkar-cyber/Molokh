import type { CommunityContextContract } from '@molokh/contracts';

type VenueAdminAccessContext = {
  readonly activeRoleGrants: CommunityContextContract['activeRoleGrants'];
  readonly venue: Pick<CommunityContextContract['venue'], 'venueId'>;
};

export function hasScopedVenueAdminGrant(context: VenueAdminAccessContext): boolean {
  return context.activeRoleGrants.some((grant) =>
    (grant.role === 'GYM_ADMIN' || grant.role === 'PRIMARY_ADMIN')
      && grant.scopeType === 'VENUE'
      && grant.scopeId === context.venue.venueId);
}
