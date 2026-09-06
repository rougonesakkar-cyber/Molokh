export const DISCOVERY_RANKING_CONFIG_VERSION = 'discovery-mvp-v1' as const;

export type DiscoveryExclusionCode =
  | 'VIEWER_ACCOUNT_INACTIVE'
  | 'VIEWER_DISCOVERY_PAUSED'
  | 'CANDIDATE_ACCOUNT_INACTIVE'
  | 'CANDIDATE_DISCOVERY_PAUSED'
  | 'SELF'
  | 'AGE_CONTOUR_MISMATCH'
  | 'CITY_MISMATCH'
  | 'EFFECTIVE_BLOCK'
  | 'PAIR_SUPPRESSED'
  | 'MATCH_ALREADY_EXISTS';

export interface DiscoveryGateInput {
  readonly viewerUserId: string;
  readonly candidateUserId: string;
  readonly viewerAccountState: 'ACTIVE' | 'RESTRICTED' | 'CLOSED';
  readonly candidateAccountState: 'ACTIVE' | 'RESTRICTED' | 'CLOSED';
  readonly viewerDiscoveryPaused: boolean;
  readonly candidateDiscoveryPaused: boolean;
  readonly viewerAgeDivision: 'YOUTH' | 'ADULT';
  readonly candidateAgeDivision: 'YOUTH' | 'ADULT';
  readonly sameCity: boolean;
  readonly effectiveBlock: boolean;
  readonly pairSuppressed: boolean;
  readonly existingMatchState: 'ACTIVE' | 'ARCHIVED' | 'UNMATCHED' | 'BLOCKED' | null;
}

export interface DiscoveryGateDecision {
  readonly eligible: boolean;
  readonly exclusionCodes: readonly DiscoveryExclusionCode[];
}

export function evaluateDiscoveryCandidate(
  input: DiscoveryGateInput,
): DiscoveryGateDecision {
  const exclusionCodes: DiscoveryExclusionCode[] = [];
  if (input.viewerAccountState !== 'ACTIVE') {
    exclusionCodes.push('VIEWER_ACCOUNT_INACTIVE');
  }
  if (input.viewerDiscoveryPaused) {
    exclusionCodes.push('VIEWER_DISCOVERY_PAUSED');
  }
  if (input.candidateAccountState !== 'ACTIVE') {
    exclusionCodes.push('CANDIDATE_ACCOUNT_INACTIVE');
  }
  if (input.candidateDiscoveryPaused) {
    exclusionCodes.push('CANDIDATE_DISCOVERY_PAUSED');
  }
  if (input.viewerUserId === input.candidateUserId) exclusionCodes.push('SELF');
  if (input.viewerAgeDivision !== input.candidateAgeDivision) {
    exclusionCodes.push('AGE_CONTOUR_MISMATCH');
  }
  if (!input.sameCity) exclusionCodes.push('CITY_MISMATCH');
  if (input.effectiveBlock) exclusionCodes.push('EFFECTIVE_BLOCK');
  if (input.pairSuppressed) exclusionCodes.push('PAIR_SUPPRESSED');
  if (
    input.existingMatchState === 'ACTIVE' ||
    input.existingMatchState === 'ARCHIVED'
  ) {
    exclusionCodes.push('MATCH_ALREADY_EXISTS');
  }
  return { eligible: exclusionCodes.length === 0, exclusionCodes };
}

export type DiscoveryGeographyTier = 'WITHIN_RADIUS' | 'CITY_EXPANSION';
export type DiscoverySportOverlap = 'PRIMARY' | 'SECONDARY' | 'NONE';

export interface DiscoveryRankSignals {
  readonly candidateUserId: string;
  readonly geographyTier: DiscoveryGeographyTier;
  readonly inboundLike: boolean;
  readonly sportOverlap: DiscoverySportOverlap;
  readonly distanceKm: number | null;
  readonly recentActivityBucket: 0 | 1 | 2;
  readonly responseSpeedBucket: 0 | 1 | 2;
}

const sportPriority: Readonly<Record<DiscoverySportOverlap, number>> = {
  PRIMARY: 2,
  SECONDARY: 1,
  NONE: 0,
};

export function compareDiscoveryRank(
  left: DiscoveryRankSignals,
  right: DiscoveryRankSignals,
): number {
  const leftWithinRadius = left.geographyTier === 'WITHIN_RADIUS' ? 1 : 0;
  const rightWithinRadius = right.geographyTier === 'WITHIN_RADIUS' ? 1 : 0;
  if (leftWithinRadius !== rightWithinRadius) return rightWithinRadius - leftWithinRadius;
  if (left.inboundLike !== right.inboundLike) return left.inboundLike ? -1 : 1;
  if (sportPriority[left.sportOverlap] !== sportPriority[right.sportOverlap]) {
    return sportPriority[right.sportOverlap] - sportPriority[left.sportOverlap];
  }
  if (left.distanceKm === null && right.distanceKm !== null) return 1;
  if (left.distanceKm !== null && right.distanceKm === null) return -1;
  if (
    left.distanceKm !== null &&
    right.distanceKm !== null &&
    left.distanceKm !== right.distanceKm
  ) {
    return left.distanceKm - right.distanceKm;
  }
  if (left.recentActivityBucket !== right.recentActivityBucket) {
    return right.recentActivityBucket - left.recentActivityBucket;
  }
  if (left.responseSpeedBucket !== right.responseSpeedBucket) {
    return right.responseSpeedBucket - left.responseSpeedBucket;
  }
  return left.candidateUserId.localeCompare(right.candidateUserId);
}

export function rankDiscoveryCandidates<T extends DiscoveryRankSignals>(
  candidates: readonly T[],
): T[] {
  return [...candidates].sort(compareDiscoveryRank);
}
