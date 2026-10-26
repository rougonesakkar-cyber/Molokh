import {
  DISCOVERY_RANKING_CONFIG_VERSION,
  evaluateDiscoveryCandidate,
  rankDiscoveryCandidates,
  type DiscoveryGeographyTier,
  type DiscoveryRankSignals,
  type DiscoverySportOverlap,
} from '@molokh/core';
import { type Kysely, sql } from 'kysely';

import type { Database } from './index.js';

export type DiscoveryRankingReason =
  | 'WITHIN_RADIUS'
  | 'CITY_EXPANSION'
  | 'INBOUND_INTEREST'
  | 'PRIMARY_SPORT_OVERLAP'
  | 'SECONDARY_SPORT_OVERLAP';

export interface DiscoveryCardProjection extends DiscoveryRankSignals {
  readonly displayName: string;
  readonly avatarAssetId: string | null;
  readonly ageDivision: 'YOUTH' | 'ADULT';
  readonly primarySport: string;
  readonly secondarySport: string | null;
  readonly experienceText: string | null;
  readonly homeVenue: {
    readonly venueId: string;
    readonly displayName: string;
  };
  readonly rankingConfigVersion: typeof DISCOVERY_RANKING_CONFIG_VERSION;
  readonly rankingReasons: readonly DiscoveryRankingReason[];
}

export interface LocalDiscoveryProfileFixture {
  readonly userId: string;
  readonly experienceText: string;
}

export class DiscoveryUnavailableError extends Error {
  readonly code = 'DISCOVERY_UNAVAILABLE';

  constructor(readonly reason: 'IDENTITY_NOT_FOUND' | 'ACCOUNT_INACTIVE' | 'PAUSED' | 'LOCATION_REQUIRED') {
    super(`Discovery is unavailable: ${reason}`);
    this.name = 'DiscoveryUnavailableError';
  }
}

interface DiscoveryViewerRow {
  readonly user_id: string;
  readonly account_state: 'ACTIVE' | 'RESTRICTED' | 'CLOSED';
  readonly discovery_paused: boolean;
  readonly age_division: 'YOUTH' | 'ADULT';
  readonly primary_sport: string;
  readonly secondary_sport: string | null;
  readonly discovery_radius_km: number;
  readonly venue_id: string | null;
  readonly city_code: string | null;
  readonly latitude: string | null;
  readonly longitude: string | null;
  readonly primary_community_id: string | null;
  readonly multi_community_discipline_enabled: boolean;
}

interface DiscoveryCandidateRow {
  readonly user_id: string;
  readonly display_name: string;
  readonly account_state: 'ACTIVE' | 'RESTRICTED' | 'CLOSED';
  readonly discovery_paused: boolean;
  readonly age_division: 'YOUTH' | 'ADULT';
  readonly primary_sport: string;
  readonly secondary_sport: string | null;
  readonly experience_text: string | null;
  readonly venue_id: string;
  readonly venue_display_name: string;
  readonly city_code: string;
  readonly latitude: string | null;
  readonly longitude: string | null;
  readonly inbound_like: boolean;
  readonly effective_block: boolean;
  readonly pair_suppressed: boolean;
  readonly existing_match: boolean;
  readonly outbound_like: boolean;
}

function radians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceKm(
  viewer: DiscoveryViewerRow,
  candidate: DiscoveryCandidateRow,
): number | null {
  if (viewer.venue_id === candidate.venue_id) return 0;
  if (
    viewer.latitude === null ||
    viewer.longitude === null ||
    candidate.latitude === null ||
    candidate.longitude === null
  ) {
    return null;
  }
  const viewerLatitude = Number(viewer.latitude);
  const viewerLongitude = Number(viewer.longitude);
  const candidateLatitude = Number(candidate.latitude);
  const candidateLongitude = Number(candidate.longitude);
  const latitudeDelta = radians(candidateLatitude - viewerLatitude);
  const longitudeDelta = radians(candidateLongitude - viewerLongitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(viewerLatitude)) *
      Math.cos(radians(candidateLatitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)) * 10) / 10;
}

function sportOverlap(
  viewer: DiscoveryViewerRow,
  candidate: DiscoveryCandidateRow,
): DiscoverySportOverlap {
  if (viewer.primary_sport === candidate.primary_sport) return 'PRIMARY';
  const viewerSports = new Set(
    [viewer.primary_sport, viewer.secondary_sport].filter((sport): sport is string => sport !== null),
  );
  return [candidate.primary_sport, candidate.secondary_sport].some(
    (sport) => sport !== null && viewerSports.has(sport),
  )
    ? 'SECONDARY'
    : 'NONE';
}

function rankingReasons(
  geographyTier: DiscoveryGeographyTier,
  inboundLike: boolean,
  overlap: DiscoverySportOverlap,
): DiscoveryRankingReason[] {
  const reasons: DiscoveryRankingReason[] = [geographyTier];
  if (inboundLike) reasons.push('INBOUND_INTEREST');
  if (overlap === 'PRIMARY') reasons.push('PRIMARY_SPORT_OVERLAP');
  if (overlap === 'SECONDARY') reasons.push('SECONDARY_SPORT_OVERLAP');
  return reasons;
}

export async function ensureLocalDiscoveryProfiles(
  database: Kysely<Database>,
  venueId: string,
  profiles: readonly LocalDiscoveryProfileFixture[],
): Promise<void> {
  await database.transaction().execute(async (transaction) => {
    await sql`
      update community.venues
      set latitude = 55.751244, longitude = 37.618423
      where venue_id = ${venueId}::uuid
        and (latitude is null or longitude is null)
    `.execute(transaction);
    for (const profile of profiles) {
      await sql`
        update identity.athlete_profiles
        set home_venue_id = ${venueId}::uuid,
            experience_text = coalesce(experience_text, ${profile.experienceText}),
            updated_at = clock_timestamp()
        where user_id = ${profile.userId}::uuid
      `.execute(transaction);
    }
  });
}

export async function readDiscoveryCards(
  database: Kysely<Database>,
  viewerUserId: string,
  limit = 20,
  _now = new Date(),
): Promise<readonly DiscoveryCardProjection[]> {
  const normalizedLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
  const viewerResult = await sql<DiscoveryViewerRow>`
    select
      users.user_id,
      users.account_state,
      users.discovery_paused,
      users.age_division,
      profile.primary_sport,
      profile.secondary_sport,
      profile.discovery_radius_km,
      profile.primary_community_id,
      coalesce((
        select flag.enabled from platform.feature_flags as flag
        where flag.feature_key = 'MULTI_COMMUNITY_DISCIPLINE'
      ), false) as multi_community_discipline_enabled,
      venue.venue_id,
      venue.city_code,
      venue.latitude::text as latitude,
      venue.longitude::text as longitude
    from identity.users as users
    join identity.athlete_profiles as profile on profile.user_id = users.user_id
    left join community.venues as venue on venue.venue_id = profile.home_venue_id
    where users.user_id = ${viewerUserId}::uuid
  `.execute(database);
  const viewer = viewerResult.rows[0];
  if (!viewer) throw new DiscoveryUnavailableError('IDENTITY_NOT_FOUND');
  if (viewer.account_state !== 'ACTIVE') {
    throw new DiscoveryUnavailableError('ACCOUNT_INACTIVE');
  }
  if (viewer.discovery_paused) throw new DiscoveryUnavailableError('PAUSED');
  if (!viewer.venue_id || !viewer.city_code) {
    throw new DiscoveryUnavailableError('LOCATION_REQUIRED');
  }

  const candidateResult = await sql<DiscoveryCandidateRow>`
    select
      candidate.user_id,
      candidate.display_name,
      candidate.account_state,
      candidate.discovery_paused,
      candidate.age_division,
      profile.primary_sport,
      profile.secondary_sport,
      profile.experience_text,
      venue.venue_id,
      venue.display_name as venue_display_name,
      venue.city_code,
      venue.latitude::text as latitude,
      venue.longitude::text as longitude,
      exists (
        select 1 from social.likes as inbound
        where inbound.from_user_id = candidate.user_id
          and inbound.to_user_id = ${viewerUserId}::uuid
          and inbound.state = 'ACTIVE'
      ) as inbound_like,
      exists (
        select 1 from social.likes as outbound
        where outbound.from_user_id = ${viewerUserId}::uuid
          and outbound.to_user_id = candidate.user_id
          and outbound.state = 'ACTIVE'
      ) as outbound_like,
      exists (
        select 1 from social.blocks as block
        where block.state = 'ACTIVE'
          and (
            (block.blocker_user_id = ${viewerUserId}::uuid and block.blocked_user_id = candidate.user_id)
            or (block.blocker_user_id = candidate.user_id and block.blocked_user_id = ${viewerUserId}::uuid)
          )
      ) as effective_block,
      exists (
        select 1 from social.discovery_pair_suppressions as suppression
        where suppression.pair_low_id = least(${viewerUserId}::uuid, candidate.user_id)
          and suppression.pair_high_id = greatest(${viewerUserId}::uuid, candidate.user_id)
          and suppression.state = 'ACTIVE'
      ) as pair_suppressed,
      exists (
        select 1 from social.matches as matched
        where matched.pair_low_id = least(${viewerUserId}::uuid, candidate.user_id)
          and matched.pair_high_id = greatest(${viewerUserId}::uuid, candidate.user_id)
          and matched.state in ('ACTIVE', 'ARCHIVED')
      ) as existing_match
    from identity.users as candidate
    join identity.athlete_profiles as profile on profile.user_id = candidate.user_id
    join community.venues as venue on venue.venue_id = profile.home_venue_id
    where venue.city_code = ${viewer.city_code}
      and (
        not ${viewer.multi_community_discipline_enabled}
        or (
          ${viewer.primary_community_id}::uuid is not null
          and profile.primary_community_id = ${viewer.primary_community_id}::uuid
          and exists (
            select 1 from community.community_memberships as candidate_membership
            where candidate_membership.user_id = candidate.user_id
              and candidate_membership.community_id = ${viewer.primary_community_id}::uuid
              and candidate_membership.state = 'ACTIVE'
              and candidate_membership.competition_enabled
          )
        )
      )
  `.execute(database);

  const eligibleCards: DiscoveryCardProjection[] = [];
  for (const candidate of candidateResult.rows) {
    const gate = evaluateDiscoveryCandidate({
      viewerUserId,
      candidateUserId: candidate.user_id,
      viewerAccountState: viewer.account_state,
      candidateAccountState: candidate.account_state,
      viewerDiscoveryPaused: viewer.discovery_paused,
      candidateDiscoveryPaused: candidate.discovery_paused,
      viewerAgeDivision: viewer.age_division,
      candidateAgeDivision: candidate.age_division,
      sameCity: viewer.city_code === candidate.city_code,
      effectiveBlock: candidate.effective_block,
      pairSuppressed: candidate.pair_suppressed,
      existingMatchState: candidate.existing_match ? 'ACTIVE' : null,
    });
    if (!gate.eligible || candidate.outbound_like) continue;
    const distance = distanceKm(viewer, candidate);
    const geographyTier: DiscoveryGeographyTier =
      distance !== null && distance <= viewer.discovery_radius_km
        ? 'WITHIN_RADIUS'
        : 'CITY_EXPANSION';
    const overlap = sportOverlap(viewer, candidate);
    eligibleCards.push({
      candidateUserId: candidate.user_id,
      displayName: candidate.display_name,
      avatarAssetId: null,
      ageDivision: candidate.age_division,
      primarySport: candidate.primary_sport,
      secondarySport: candidate.secondary_sport,
      experienceText: candidate.experience_text,
      homeVenue: {
        venueId: candidate.venue_id,
        displayName: candidate.venue_display_name,
      },
      geographyTier,
      inboundLike: candidate.inbound_like,
      sportOverlap: overlap,
      distanceKm: distance,
      recentActivityBucket: 0,
      responseSpeedBucket: 0,
      rankingConfigVersion: DISCOVERY_RANKING_CONFIG_VERSION,
      rankingReasons: rankingReasons(geographyTier, candidate.inbound_like, overlap),
    });
  }
  return rankDiscoveryCandidates(eligibleCards).slice(0, normalizedLimit);
}
