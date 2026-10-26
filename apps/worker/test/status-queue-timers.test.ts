import { describe, expect, it } from 'vitest';

import { statusQueueTimerFromOutbox } from '../src/status-queue-timers.js';

const timer = {
  commandType: 'EXPIRE_STATUS_QUEUE_RECONFIRMATION',
  aggregateType: 'ChallengeQueueEntry',
  aggregateId: '0199a1b2-1234-7000-8000-000000001401',
  expectedState: 'RECONFIRMATION_REQUIRED',
  expectedVersion: 2,
  deadlineAt: '2026-09-29T12:00:00.000Z',
  policyVersion: 'status-queue-mvp-v1',
  idempotencyKey: 'status-queue:0199a1b2-1234-7000-8000-000000001401:expire-reconfirmation:v2',
} as const;

describe('Status queue timer projection', () => {
  it('[AC-097] routes only the versioned 24-hour reconfirmation expiry', () => {
    expect(statusQueueTimerFromOutbox(
      'competition.status-queue.reconfirmation-requested.v1',
      { timer },
    )).toEqual(timer);
    expect(statusQueueTimerFromOutbox('competition.status-queue.reconfirmed.v1', {})).toBeNull();
    expect(() => statusQueueTimerFromOutbox(
      'competition.status-queue.reconfirmation-requested.v1',
      { timer: { ...timer, aggregateType: 'Challenge' } },
    )).toThrow('does not match');
  });

  it('[AC-093][AC-094][AC-102][AC-104] routes the three-day single-candidate promotion', () => {
    const singleTimer = {
      ...timer,
      commandType: 'PROMOTE_SINGLE_GENESIS_CANDIDATE',
      deadlineAt: '2026-10-01T12:00:00.000Z',
      idempotencyKey: 'genesis:0199a1b2-1234-7000-8000-000000001401:single-promote:v2',
    };
    expect(statusQueueTimerFromOutbox(
      'competition.status-vacancy.single-candidate-window.v1',
      { timer: singleTimer },
    )).toEqual(singleTimer);
  });
});
