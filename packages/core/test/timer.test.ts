import { describe, expect, it } from 'vitest';

import { evaluateTimer, parseTimerCommandPayload } from '../src/index.js';

const payload = parseTimerCommandPayload({
  commandType: 'EXPIRE_PROBE',
  aggregateType: 'PlatformProbe',
  aggregateId: 'aggregate-1',
  expectedState: 'PENDING',
  expectedVersion: 3,
  deadlineAt: '2026-09-05T12:00:00.000Z',
  policyVersion: 'policy-1',
  idempotencyKey: 'expire-probe-1',
});

describe('timer decision', () => {
  it('reschedules before the deadline and becomes due exactly at the deadline', () => {
    const snapshot = { state: 'PENDING', version: 3 };
    expect(evaluateTimer(payload, snapshot, new Date('2026-09-05T11:59:59.999Z'))).toEqual({
      kind: 'NOT_DUE',
      retryAt: payload.deadlineAt,
    });
    expect(evaluateTimer(payload, snapshot, new Date(payload.deadlineAt))).toEqual({ kind: 'DUE' });
  });

  it('marks changed state or version as stale after the deadline', () => {
    const now = new Date('2026-09-05T12:00:00.001Z');
    expect(evaluateTimer(payload, { state: 'ACCEPTED', version: 4 }, now)).toMatchObject({
      kind: 'STALE',
      reason: 'STATE_CHANGED',
    });
    expect(evaluateTimer(payload, { state: 'PENDING', version: 4 }, now)).toMatchObject({
      kind: 'STALE',
      reason: 'VERSION_CHANGED',
    });
  });
});
