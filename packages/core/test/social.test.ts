import { describe, expect, it } from 'vitest';

import {
  assertBlockOwner,
  assertCanEndMatch,
  assertSameAgeContour,
  discoverySuppressionEndsAt,
  likeExpiresAt,
  newLikeState,
  normalizeSocialPair,
  SocialActionDeniedError,
  socialPairEndPolicy,
} from '../src/index.js';

describe('social policy', () => {
  it('rejects self-pairs and normalizes every valid pair deterministically', () => {
    expect(normalizeSocialPair('b', 'a')).toEqual({
      lowUserId: 'a',
      highUserId: 'b',
      key: 'a:b',
    });
    expect(() => normalizeSocialPair('a', 'a')).toThrow(SocialActionDeniedError);
  });

  it('[AC-004] rejects Like across Youth and Adult contours', () => {
    expect(() => assertSameAgeContour('YOUTH', 'ADULT')).toThrowError(
      expect.objectContaining({ code: 'AGE_CONTOUR_MISMATCH' }),
    );
    expect(() => assertSameAgeContour('ADULT', 'ADULT')).not.toThrow();
  });

  it('[AC-005] keeps a one-sided Like active for exactly 30 days', () => {
    const createdAt = new Date('2026-09-06T10:00:00.000Z');
    expect(newLikeState(false)).toBe('ACTIVE');
    expect(likeExpiresAt(createdAt).toISOString()).toBe('2026-10-06T10:00:00.000Z');
  });

  it('[AC-006] marks a new Like as matched when a reverse active Like exists', () => {
    expect(newLikeState(true)).toBe('MATCHED');
  });

  it('[AC-007] applies a fixed 15-day Discovery suppression after Skip', () => {
    expect(discoverySuppressionEndsAt(new Date('2026-09-06T10:00:00.000Z')).toISOString()).toBe(
      '2026-09-21T10:00:00.000Z',
    );
  });

  it('[AC-010][AC-188] ends only a live participant Match and preserves obligations', () => {
    expect(() => assertCanEndMatch('ACTIVE', 'a', 'a', 'b')).not.toThrow();
    expect(() => assertCanEndMatch('ARCHIVED', 'b', 'a', 'b')).not.toThrow();
    expect(() => assertCanEndMatch('UNMATCHED', 'a', 'a', 'b')).toThrowError(
      expect.objectContaining({ code: 'MATCH_NOT_ACTIVE' }),
    );
    expect(() => assertCanEndMatch('ACTIVE', 'c', 'a', 'b')).toThrowError(
      expect.objectContaining({ code: 'MATCH_PARTICIPANT_REQUIRED' }),
    );
    expect(socialPairEndPolicy('UNMATCH')).toEqual({
      matchState: 'UNMATCHED',
      suppressionDays: 15,
      closePersonalChat: true,
      closeOptionalPreAcceptanceIntents: true,
      preserveAcceptedObligations: true,
      preserveStatusPaths: true,
    });
  });

  it('[AC-011][AC-146][AC-189] keeps Block directed and status-safe', () => {
    expect(() => assertBlockOwner('a', 'a')).not.toThrow();
    expect(() => assertBlockOwner('b', 'a')).toThrowError(
      expect.objectContaining({ code: 'BLOCK_OWNER_REQUIRED' }),
    );
    expect(socialPairEndPolicy('BLOCK')).toEqual({
      matchState: 'BLOCKED',
      suppressionDays: null,
      closePersonalChat: true,
      closeOptionalPreAcceptanceIntents: true,
      preserveAcceptedObligations: true,
      preserveStatusPaths: true,
    });
  });
});
