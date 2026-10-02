import { describe, expect, it } from 'vitest';

import { incidentTimerFromOutbox } from '../src/incident-timers.js';

const timer = {
  commandType: 'EXPIRE_BOOKING_SELECTION',
  aggregateType: 'Booking',
  aggregateId: '0199a1b2-1234-7000-8000-000000001301',
  expectedState: 'SELECTING',
  expectedVersion: 2,
  deadlineAt: '2026-09-10T10:37:00.000Z',
  policyVersion: 'platform-incident-mvp-v1',
  idempotencyKey: 'incident:0199a1b2-1234-7000-8000-000000001399:BOOKING_SELECTION:0199a1b2-1234-7000-8000-000000001301',
} as const;

describe('platform incident timer projection', () => {
  it('routes only a registered pausable timer with its registered aggregate', () => {
    expect(incidentTimerFromOutbox(
      'platform.incident.deadline-extended.v1',
      { timer },
    )).toEqual(timer);
    expect(incidentTimerFromOutbox('competition.challenge.created.v1', { timer })).toBeNull();
    expect(() => incidentTimerFromOutbox(
      'platform.incident.deadline-extended.v1',
      { timer: { ...timer, aggregateType: 'Challenge' } },
    )).toThrow('not registered as pausable');
  });
});
