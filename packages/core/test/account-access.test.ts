import { describe, expect, it } from 'vitest';

import {
  AccountAccessConflictError,
  assertAccountRecoveryCanBeRequested,
  assertDuplicateReviewCanBeResolved,
  assertPhoneChangeCanBeApproved,
  assertPhoneChangeHoldCanExpire,
  phoneChangeSecurityHoldUntil,
} from '../src/account-access.js';

const athlete = { type: 'USER', id: '0199a1b2-1234-7000-8000-000000000101',
  roles: ['ATHLETE'], scopeIds: [] } as const;
const central = { type: 'USER', id: '0199a1b2-1234-7000-8000-000000000506',
  roles: ['CENTRAL_ADMIN'], scopeIds: [] } as const;
const system = { type: 'SYSTEM', id: null, roles: [], scopeIds: [] } as const;

describe('account access and duplicate-account policy', () => {
  it('AC-197 keeps recovery signal-based and rejects identity-free or duplicate live requests', () => {
    const base = { actor: athlete, userId: athlete.id, accountState: 'ACTIVE' as const,
      hasLiveCase: false, route: 'VERIFIED_ROUTE' as const,
      signals: ['TRUSTED_SESSION'] as const, requestedPhoneE164: null,
      currentPhoneE164: '+79990000101', reason: 'Lost access to the previous SIM card' };
    expect(() => assertAccountRecoveryCanBeRequested(base)).not.toThrow();
    expect(() => assertAccountRecoveryCanBeRequested({ ...base, signals: [] }))
      .toThrowError(expect.objectContaining<Partial<AccountAccessConflictError>>({
        code: 'ACCOUNT_ACCESS_SIGNAL_REQUIRED',
      }));
    expect(() => assertAccountRecoveryCanBeRequested({ ...base, hasLiveCase: true }))
      .toThrowError(expect.objectContaining<Partial<AccountAccessConflictError>>({
        code: 'ACCOUNT_ACCESS_LIVE_CASE_EXISTS',
      }));
  });

  it('AC-198 applies an exact 24-hour hold after Central approves a phone change', () => {
    expect(() => assertPhoneChangeCanBeApproved({ actor: central, state: 'PENDING',
      route: 'PHONE_CHANGE', requestedPhoneE164: '+79990000999', phoneAvailable: true,
      hasUnresolvedDuplicate: false, hasUnresolvedRisk: false,
      reason: 'Trusted session and support signals agree' })).not.toThrow();
    const approvedAt = new Date('2026-10-03T10:00:00.000Z');
    const holdUntil = phoneChangeSecurityHoldUntil(approvedAt);
    expect(holdUntil.toISOString()).toBe('2026-10-04T10:00:00.000Z');
    expect(() => assertPhoneChangeHoldCanExpire({ actor: system, state: 'SECURITY_HOLD',
      securityHoldUntil: holdUntil, occurredAt: new Date('2026-10-04T09:59:59.999Z'),
      hasUnresolvedRisk: false }))
      .toThrowError(expect.objectContaining<Partial<AccountAccessConflictError>>({
        code: 'ACCOUNT_ACCESS_HOLD_NOT_DUE',
      }));
    expect(() => assertPhoneChangeHoldCanExpire({ actor: system, state: 'SECURITY_HOLD',
      securityHoldUntil: holdUntil, occurredAt: holdUntil,
      hasUnresolvedRisk: false })).not.toThrow();
  });

  it('AC-199 resolves duplicates only with one canonical User and explicit per-process decisions', () => {
    const otherUserId = '0199a1b2-1234-7000-8000-000000000102';
    const affectedProcesses = [
      { kind: 'STATUS' as const, aggregateId: 'community-1', currentOwnerUserId: athlete.id },
      { kind: 'OBLIGATION' as const, aggregateId: 'challenge-1', currentOwnerUserId: otherUserId },
    ] as const;
    const base = { actor: central, state: 'UNDER_REVIEW' as const,
      userIds: [athlete.id, otherUserId], canonicalUserId: athlete.id, affectedProcesses,
      reason: 'Central confirmed that both accounts belong to one person' };
    expect(() => assertDuplicateReviewCanBeResolved({ ...base, dispositions: [
      { kind: 'STATUS', aggregateId: 'community-1', currentOwnerUserId: athlete.id,
        decision: 'RETAIN_CURRENT_OWNER' },
      { kind: 'OBLIGATION', aggregateId: 'challenge-1', currentOwnerUserId: otherUserId,
        decision: 'SEPARATE_GOVERNED_REVIEW' },
    ] })).not.toThrow();
    expect(() => assertDuplicateReviewCanBeResolved({ ...base, dispositions: [
      { kind: 'STATUS', aggregateId: 'community-1', currentOwnerUserId: athlete.id,
        decision: 'RETAIN_CURRENT_OWNER' },
    ] })).toThrowError(expect.objectContaining<Partial<AccountAccessConflictError>>({
      code: 'DUPLICATE_ACCOUNT_DISPOSITIONS_REQUIRED',
    }));
  });
});
