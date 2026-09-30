import { describe, expect, it } from 'vitest';

import { socialTimerFromOutbox } from '../src/social-timers.js';

const timer = {
  commandType: 'EXPIRE_LIKE',
  aggregateType: 'Like',
  aggregateId: '0199a1b2-1234-7000-8000-000000000001',
  expectedState: 'ACTIVE',
  expectedVersion: 1,
  deadlineAt: '2026-10-07T10:00:00.000Z',
  policyVersion: 'social-mvp-v1',
  idempotencyKey: 'like:0199a1b2-1234-7000-8000-000000000001:expire:v1',
} as const;

describe('social timer projection', () => {
  it('[AC-008] accepts only a versioned Like expiry timer from LikeCreated', () => {
    expect(
      socialTimerFromOutbox('social.like.created.v1', { likeId: timer.aggregateId, timer }),
    ).toEqual(timer);
    expect(socialTimerFromOutbox('social.match.created.v1', {})).toBeNull();
    expect(() =>
      socialTimerFromOutbox('social.like.created.v1', {
        timer: { ...timer, commandType: 'UNKNOWN' },
      }),
    ).toThrow('does not match');
  });

  it('[AC-007] accepts the fixed suppression expiry timer', () => {
    const suppressionTimer = {
      ...timer,
      commandType: 'EXPIRE_DISCOVERY_SUPPRESSION',
      aggregateType: 'DiscoveryPairSuppression',
      deadlineAt: '2026-09-22T10:00:00.000Z',
    };
    expect(
      socialTimerFromOutbox('social.pair.suppressed.v1', {
        suppressionId: suppressionTimer.aggregateId,
        timer: suppressionTimer,
      }),
    ).toEqual(suppressionTimer);
  });
});
