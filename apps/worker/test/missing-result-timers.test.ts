import { describe, expect, it } from 'vitest';

import { missingResultTimerFromOutbox } from '../src/missing-result-timers.js';

describe('Missing Result timer projection', () => {
  it('projects the first reminder and chained escalations', () => {
    const timer = {
      commandType: 'REMIND_MISSING_RESULT_COACH', aggregateType: 'Challenge',
      aggregateId: '0199a1b2-1234-7000-8000-000000009001', expectedState: 'RESULT_PENDING',
      expectedVersion: 8, deadlineAt: '2026-09-10T12:00:00.000Z',
      policyVersion: 'result-mvp-v1', idempotencyKey: 'missing-result-reminder',
    };
    expect(missingResultTimerFromOutbox(
      'competition.challenge.result-required.v1', { timer },
    )).toEqual(timer);
  });

  it('rejects an unrelated timer on the Missing Result topic', () => {
    expect(() => missingResultTimerFromOutbox(
      'competition.challenge.missing-result-escalated.v1',
      { timer: {
        commandType: 'FINALIZE_RESULT', aggregateType: 'Result',
        aggregateId: '0199a1b2-1234-7000-8000-000000009001', expectedState: 'RECORDED',
        expectedVersion: 1, deadlineAt: '2026-09-10T12:00:00.000Z',
        policyVersion: 'result-mvp-v1', idempotencyKey: 'wrong',
      } },
    )).toThrowError('Missing Result timer does not match its topic');
  });
});
