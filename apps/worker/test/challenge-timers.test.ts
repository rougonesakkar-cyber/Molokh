import { describe, expect, it } from 'vitest';

import { challengeTimerFromOutbox } from '../src/challenge-timers.js';

const timer = {
  commandType: 'EXPIRE_OPTIONAL_CHALLENGE',
  aggregateType: 'Challenge',
  aggregateId: '0199a1b2-1234-7000-8000-000000001201',
  expectedState: 'AWAITING_RESPONSE',
  expectedVersion: 1,
  deadlineAt: '2026-09-10T10:00:00.000Z',
  policyVersion: 'challenge-mvp-v1',
  idempotencyKey: 'challenge:0199a1b2-1234-7000-8000-000000001201:expire-optional:v1',
} as const;

describe('Challenge timer projection', () => {
  it('[AC-054] accepts only the versioned optional response expiry timer', () => {
    expect(challengeTimerFromOutbox('competition.challenge.created.v1', { timer })).toEqual(timer);
    expect(() => challengeTimerFromOutbox('competition.challenge.accepted.v1', {}))
      .toThrow('must contain a timer');
    expect(() => challengeTimerFromOutbox('competition.challenge.created.v1', {
      timer: { ...timer, commandType: 'UNKNOWN' },
    })).toThrow('does not match');
  });

  it('routes the accepted Challenge scheduling deadline', () => {
    const schedulingTimer = {
      ...timer,
      commandType: 'EXPIRE_CHALLENGE_SCHEDULING',
      expectedState: 'ACCEPTED_UNSCHEDULED',
      deadlineAt: '2026-09-22T10:00:00.000Z',
      idempotencyKey: 'challenge:0199a1b2-1234-7000-8000-000000001201:expire-scheduling:v2',
    };
    expect(challengeTimerFromOutbox(
      'competition.challenge.accepted.v1',
      { timer: schedulingTimer },
    )).toEqual(schedulingTimer);
  });

  it('[AC-191] projects the current GENESIS response timer version', () => {
    const genesisTimer = {
      ...timer,
      commandType: 'EXPIRE_GENESIS_CHALLENGE',
      policyVersion: 'status-queue-mvp-v1',
      idempotencyKey: 'genesis:0199a1b2-1234-7000-8000-000000001201:expire:v1',
    };
    expect(challengeTimerFromOutbox(
      'competition.genesis.response-timer.v1',
      { timer: genesisTimer },
    )).toEqual(genesisTimer);
    expect(() => challengeTimerFromOutbox(
      'competition.genesis.accepted.v1',
      { timer },
    )).toThrow('does not match');
  });

  it('routes the 72-hour mandatory Challenge response timer', () => {
    const mandatoryTimer = {
      ...timer,
      commandType: 'EXPIRE_MANDATORY_CHALLENGE',
      deadlineAt: '2026-09-11T10:00:00.000Z',
      idempotencyKey: 'challenge:0199a1b2-1234-7000-8000-000000001201:expire-mandatory:v1',
    };
    expect(challengeTimerFromOutbox(
      'competition.challenge.mandatory-response-timer.v1',
      { timer: mandatoryTimer },
    )).toEqual(mandatoryTimer);
    expect(() => challengeTimerFromOutbox(
      'competition.challenge.mandatory-response-timer.v1',
      { timer },
    )).toThrow('does not match');
  });
});
