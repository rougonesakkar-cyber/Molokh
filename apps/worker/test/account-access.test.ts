import { describe, expect, it } from 'vitest';

import { accountAccessTimerFromOutbox } from '../src/account-access.js';

const caseId = '0199a1b2-1234-7000-8000-000000005401';

describe('account access outbox projection', () => {
  it('routes only the exact 24-hour security-hold timer', () => {
    const timer = { commandType: 'EXPIRE_SECURITY_HOLD', aggregateType: 'AccountAccessCase',
      aggregateId: caseId, expectedState: 'SECURITY_HOLD', expectedVersion: 2,
      deadlineAt: '2026-10-04T10:00:00.000Z', policyVersion: 'account-access-mvp-v1',
      idempotencyKey: `account-access:${caseId}:expire-security-hold:v2` };
    expect(accountAccessTimerFromOutbox('identity.account-recovery.phone-changed.v1', { timer }))
      .toEqual(timer);
    expect(accountAccessTimerFromOutbox('identity.account-recovery.completed.v1', {})).toBeNull();
    expect(() => accountAccessTimerFromOutbox(
      'identity.account-recovery.phone-changed.v1', {},
    )).toThrow('must contain a timer');
  });
});
