import { describe, expect, it } from 'vitest';

import {
  DISCOVERY_RANKING_CONFIG_VERSION,
  evaluateDiscoveryCandidate,
  rankDiscoveryCandidates,
  type DiscoveryGateInput,
  type DiscoveryRankSignals,
} from '../src/index.js';

const eligibleGate: DiscoveryGateInput = {
  viewerUserId: 'viewer',
  candidateUserId: 'candidate',
  viewerAccountState: 'ACTIVE',
  candidateAccountState: 'ACTIVE',
  viewerDiscoveryPaused: false,
  candidateDiscoveryPaused: false,
  viewerAgeDivision: 'ADULT',
  candidateAgeDivision: 'ADULT',
  sameCity: true,
  effectiveBlock: false,
  pairSuppressed: false,
  existingMatchState: null,
};

describe('Discovery hard gates and transparent ordering', () => {
  it('keeps preferences soft but rejects identity, safety and existing-pair conflicts', () => {
    expect(evaluateDiscoveryCandidate(eligibleGate)).toEqual({
      eligible: true,
      exclusionCodes: [],
    });
    expect(
      evaluateDiscoveryCandidate({
        ...eligibleGate,
        candidateAgeDivision: 'YOUTH',
        effectiveBlock: true,
        pairSuppressed: true,
        existingMatchState: 'ARCHIVED',
      }),
    ).toEqual({
      eligible: false,
      exclusionCodes: [
        'AGE_CONTOUR_MISMATCH',
        'EFFECTIVE_BLOCK',
        'PAIR_SUPPRESSED',
        'MATCH_ALREADY_EXISTS',
      ],
    });
  });

  it('exhausts radius before city expansion and uses stable visible signals', () => {
    const candidates: DiscoveryRankSignals[] = [
      {
        candidateUserId: 'outside-inbound',
        geographyTier: 'CITY_EXPANSION',
        inboundLike: true,
        sportOverlap: 'PRIMARY',
        distanceKm: 20,
        recentActivityBucket: 2,
        responseSpeedBucket: 2,
      },
      {
        candidateUserId: 'inside-secondary',
        geographyTier: 'WITHIN_RADIUS',
        inboundLike: false,
        sportOverlap: 'SECONDARY',
        distanceKm: 4,
        recentActivityBucket: 0,
        responseSpeedBucket: 0,
      },
      {
        candidateUserId: 'inside-inbound',
        geographyTier: 'WITHIN_RADIUS',
        inboundLike: true,
        sportOverlap: 'NONE',
        distanceKm: 6,
        recentActivityBucket: 0,
        responseSpeedBucket: 0,
      },
    ];

    expect(DISCOVERY_RANKING_CONFIG_VERSION).toBe('discovery-mvp-v1');
    expect(rankDiscoveryCandidates(candidates).map((candidate) => candidate.candidateUserId)).toEqual([
      'inside-inbound',
      'inside-secondary',
      'outside-inbound',
    ]);
  });
});
