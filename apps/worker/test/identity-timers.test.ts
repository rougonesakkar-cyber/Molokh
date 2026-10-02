import { describe, expect, it } from 'vitest';

import { identityTimerFromOutbox } from '../src/identity-timers.js';

describe('Identity timer projection', () => {
  it('[AC-002] routes the deterministic 18th-birthday transition timer', () => {
    const timer = {
      commandType: 'TRANSITION_TO_ADULT',
      aggregateType: 'AgeDivisionTransition',
      aggregateId: '0199a1b2-1234-7000-8000-000000000801',
      expectedState: 'YOUTH',
      expectedVersion: 0,
      deadlineAt: '2026-09-06T00:00:00.000Z',
      policyVersion: 'identity-v1',
      idempotencyKey: 'age-division:test:adult:v1',
    };
    expect(identityTimerFromOutbox('identity.age-division-timer.v1', { timer })).toEqual(timer);
    expect(identityTimerFromOutbox('identity.age-division.changed.v1', {})).toBeNull();
    expect(() => identityTimerFromOutbox('identity.age-division-timer.v1', {
      timer: { ...timer, aggregateType: 'User' },
    })).toThrow('does not match');
  });
});
