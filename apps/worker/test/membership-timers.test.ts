import { describe, expect, it } from 'vitest';

import { membershipTimerFromOutbox } from '../src/membership-timers.js';

const reminder = {
  commandType: 'REMIND_MEMBERSHIP_REQUEST', aggregateType: 'CommunityMembership',
  aggregateId: '0199a1b2-1234-7000-8000-000000000001', expectedState: 'PENDING',
  expectedVersion: 1, deadlineAt: '2026-10-04T22:00:00.000Z',
  policyVersion: 'membership-mvp-v1', idempotencyKey: 'membership:1:remind:v1',
} as const;

describe('Membership timer projection', () => {
  it('[AC-014] routes the 12h Admin reminder and 24h Central escalation', () => {
    expect(membershipTimerFromOutbox(
      'community.membership.request-reminder-timer.v1', { timer: reminder },
    )).toEqual(reminder);
    const escalation = { ...reminder, commandType: 'ESCALATE_MEMBERSHIP_REQUEST',
      deadlineAt: '2026-10-05T10:00:00.000Z' };
    expect(membershipTimerFromOutbox(
      'community.membership.request-escalation-timer.v1', { timer: escalation },
    )).toEqual(escalation);
    expect(() => membershipTimerFromOutbox(
      'community.membership.request-reminder-timer.v1', { timer: escalation },
    )).toThrow('does not match');
    expect(membershipTimerFromOutbox('social.like.created.v1', {})).toBeNull();
  });
});
