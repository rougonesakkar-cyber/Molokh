import { describe, expect, it } from 'vitest';

import {
  accountExportIdFromRequestedOutbox,
  accountLifecycleTimerFromOutbox,
} from '../src/account-lifecycle.js';

const exportId = '0199a1b2-1234-7000-8000-000000005321';

describe('account lifecycle outbox projection', () => {
  it('routes an export request to deterministic preparation', () => {
    expect(accountExportIdFromRequestedOutbox('identity.account-export.requested.v1', {
      exportId,
    })).toBe(exportId);
    expect(accountExportIdFromRequestedOutbox('identity.account.closed.v1', {})).toBeNull();
    expect(() => accountExportIdFromRequestedOutbox(
      'identity.account-export.requested.v1', {},
    )).toThrow('must contain exportId');
  });

  it('routes only the versioned export retention timer', () => {
    const timer = { commandType: 'EXPIRE_ACCOUNT_EXPORT', aggregateType: 'AccountDataExport',
      aggregateId: exportId, expectedState: 'READY', expectedVersion: 2,
      deadlineAt: '2026-10-05T10:01:00.000Z', policyVersion: 'account-lifecycle-mvp-v1',
      idempotencyKey: `account-export:${exportId}:expire:v2` };
    expect(accountLifecycleTimerFromOutbox('identity.account-export.prepared.v1', { timer }))
      .toEqual(timer);
    expect(() => accountLifecycleTimerFromOutbox('identity.account-export.prepared.v1', {
      timer: { ...timer, commandType: 'UNKNOWN' },
    })).toThrow('does not match');
  });
});
