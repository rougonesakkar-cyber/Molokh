import { describe, expect, it } from 'vitest';

import { resultTimerFromOutbox } from '../src/result-timers.js';

const timer = {
  commandType: 'FINALIZE_RESULT',
  aggregateType: 'Result',
  aggregateId: '0199a1b2-1234-7000-8000-000000001401',
  expectedState: 'RECORDED',
  expectedVersion: 1,
  deadlineAt: '2026-09-11T10:00:00.000Z',
  policyVersion: 'result-mvp-v1',
  idempotencyKey: 'result:0199a1b2-1234-7000-8000-000000001401:finalize:v1',
} as const;

describe('Result timer projection', () => {
  it('[AC-088] accepts Result finalization timers from record and waiver events', () => {
    expect(resultTimerFromOutbox('competition.result.recorded.v1', { timer })).toEqual(timer);
    expect(resultTimerFromOutbox('competition.result.appeal-waived.v1', { timer })).toEqual(timer);
    expect(resultTimerFromOutbox('competition.result.finalized.v1', {})).toBeNull();
  });

  it('rejects a timer whose command or aggregate does not match the topic', () => {
    expect(() => resultTimerFromOutbox('competition.result.recorded.v1', {
      timer: { ...timer, commandType: 'EXPIRE_RESULT' },
    })).toThrow('does not match');
  });
});
