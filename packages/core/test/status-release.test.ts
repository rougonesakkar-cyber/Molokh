import { describe, expect, it } from 'vitest';

import {
  StatusReleaseConflictError,
  assertStatusReleaseCanBeConfirmed,
  assertStatusReleaseEligibility,
  deriveStatusReleasePlan,
  statusReleasePreviewExpiresAt,
} from '../src/status-release.js';

describe('voluntary status-only release policy', () => {
  it('[AC-106][AC-108][AC-186] derives succession/vacancy without a sporting result', () => {
    expect(deriveStatusReleasePlan({
      actorUserId: 'champion', championUserId: 'champion', contenderUserId: 'contender',
    })).toMatchObject({
      releasedStatus: 'CHAMPION', consequence: 'CHAMPION_SUCCESSION',
      transitionId: 'ST-09', afterChampionUserId: 'contender', afterContenderUserId: null,
      afterPhase: 'CONTENDER_VACANT_OPEN',
    });
    expect(deriveStatusReleasePlan({
      actorUserId: 'contender', championUserId: 'champion', contenderUserId: 'contender',
    })).toMatchObject({
      releasedStatus: 'CONTENDER', consequence: 'CONTENDER_VACANCY',
      transitionId: 'ST-10', afterChampionUserId: 'champion', afterContenderUserId: null,
    });
    expect(deriveStatusReleasePlan({
      actorUserId: 'champion', championUserId: 'champion', contenderUserId: null,
    })).toMatchObject({
      consequence: 'CHAMPION_VACANCY', transitionId: 'ST-14',
      afterChampionUserId: null, afterPhase: 'FOUNDING_OPEN',
    });
  });

  it('denies release while an accepted obligation or affected live status response exists', () => {
    const eligible = {
      accountActive: true,
      membershipActive: true,
      competitionActive: true,
      integrityHoldActive: false,
      hasActiveObligation: false,
      hasBlockingLiveChallenge: false,
    };
    expect(() => assertStatusReleaseEligibility(eligible)).not.toThrow();
    expect(() => assertStatusReleaseEligibility({
      ...eligible, hasActiveObligation: true,
    })).toThrowError(new StatusReleaseConflictError('STATUS_RELEASE_ACTIVE_OBLIGATION'));
    expect(() => assertStatusReleaseEligibility({
      ...eligible, hasBlockingLiveChallenge: true,
    })).toThrowError(new StatusReleaseConflictError('STATUS_RELEASE_LIVE_CHALLENGE'));
  });

  it('confirms only the same holder against an unexpired unchanged preview', () => {
    const previewedAt = new Date('2026-09-28T12:00:00.000Z');
    const expiresAt = statusReleasePreviewExpiresAt(previewedAt);
    expect(expiresAt.toISOString()).toBe('2026-09-28T12:15:00.000Z');
    const input = {
      state: 'PREVIEWED', actorUserId: 'contender', ownerUserId: 'contender',
      previewExpiresAt: expiresAt, occurredAt: new Date('2026-09-28T12:14:59.999Z'),
      tokenMatches: true, previewStatusVersion: 4, currentStatusVersion: 4,
      previewChampionUserId: 'champion', currentChampionUserId: 'champion',
      previewContenderUserId: 'contender', currentContenderUserId: 'contender',
    };
    expect(() => assertStatusReleaseCanBeConfirmed(input)).not.toThrow();
    expect(() => assertStatusReleaseCanBeConfirmed({
      ...input, currentStatusVersion: 5,
    })).toThrowError('STATUS_RELEASE_STATUS_CHANGED');
    expect(() => assertStatusReleaseCanBeConfirmed({
      ...input, occurredAt: expiresAt,
    })).toThrowError('STATUS_RELEASE_PREVIEW_EXPIRED');
  });
});
