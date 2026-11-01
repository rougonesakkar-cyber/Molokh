import type { CommunityContextContract } from '@molokh/contracts';

type VenueAdminAccessContext = {
  readonly activeRoleGrants: CommunityContextContract['activeRoleGrants'];
  readonly venue: Pick<CommunityContextContract['venue'], 'venueId'>;
};

export type ClientOperationalRole = 'Athlete' | 'Coach' | 'Gym Admin' | 'Central';

export function canLoadAthleteDiscovery(role: ClientOperationalRole): boolean {
  return role === 'Athlete';
}

export function operationalRoleForCommunityContext(
  context: Pick<CommunityContextContract, 'activeRoleGrants'> | null,
  fallback: ClientOperationalRole = 'Athlete',
): ClientOperationalRole {
  const roles = new Set(context?.activeRoleGrants.map((grant) => grant.role) ?? []);
  if (roles.has('CENTRAL_ADMIN')) return 'Central';
  if (roles.has('PRIMARY_ADMIN') || roles.has('GYM_ADMIN')) return 'Gym Admin';
  if (roles.has('COACH')) return 'Coach';
  return fallback;
}

export function hasScopedVenueAdminGrant(context: VenueAdminAccessContext): boolean {
  return context.activeRoleGrants.some((grant) =>
    (grant.role === 'GYM_ADMIN' || grant.role === 'PRIMARY_ADMIN')
      && grant.scopeType === 'VENUE'
      && grant.scopeId === context.venue.venueId);
}
