import { describe, expect, it } from 'vitest';

import {
  AccountLifecycleConflictError,
  accountClosureRecoveryDeadline,
  accountExportExpiresAt,
  assertAccountClosureCanBeCancelled,
  assertAccountClosureCanBeExecuted,
  assertAccountClosureCanBeRequested,
  assertAccountExportCanExpire,
  assertAccountExportCanBePrepared,
} from '../src/account-closure.js';

const user = { type: 'USER', id: '0199a1b2-1234-7000-8000-000000000101',
  roles: ['ATHLETE'], scopeIds: [] } as const;
const central = { type: 'USER', id: '0199a1b2-1234-7000-8000-000000000506',
  roles: ['CENTRAL_ADMIN'], scopeIds: [] } as const;
const system = { type: 'SYSTEM', id: null, roles: [], scopeIds: [] } as const;
const requestedAt = new Date('2026-10-03T10:00:00.000Z');
const recoveryUntil = new Date('2026-11-02T10:00:00.000Z');

describe('account closure and export policy', () => {
  it('uses an exact 30-day recovery window and a 48-hour export retention window', () => {
    expect(accountClosureRecoveryDeadline(requestedAt).toISOString())
      .toBe('2026-11-02T10:00:00.000Z');
    expect(accountExportExpiresAt(requestedAt).toISOString())
      .toBe('2026-10-05T10:00:00.000Z');
  });

  it('lets the owner request and cancel before, but not at, the recovery boundary', () => {
    expect(() => assertAccountClosureCanBeRequested({ accountState: 'RESTRICTED',
      actor: user, userId: user.id })).not.toThrow();
    expect(() => assertAccountClosureCanBeCancelled({ state: 'REQUESTED', actor: user,
      userId: user.id, recoveryUntil,
      occurredAt: new Date('2026-11-02T09:59:59.999Z') })).not.toThrow();
    expect(() => assertAccountClosureCanBeCancelled({ state: 'REQUESTED', actor: user,
      userId: user.id, recoveryUntil, occurredAt: recoveryUntil }))
      .toThrowError(expect.objectContaining<Partial<AccountLifecycleConflictError>>({
        code: 'ACCOUNT_CLOSURE_RECOVERY_ENDED',
      }));
  });

  it('requires Central, an elapsed recovery window and zero operational blockers', () => {
    const blockers = { activeObligationCount: 0, heldStatusCount: 0,
      activeSessionCount: 0, activeMembershipCount: 0, activeRoleCount: 0 };
    expect(() => assertAccountClosureCanBeExecuted({ state: 'REQUESTED', actor: central,
      recoveryUntil, occurredAt: recoveryUntil, blockers })).not.toThrow();
    expect(() => assertAccountClosureCanBeExecuted({ state: 'REQUESTED', actor: central,
      recoveryUntil, occurredAt: recoveryUntil,
      blockers: { ...blockers, activeObligationCount: 1 } }))
      .toThrowError(expect.objectContaining<Partial<AccountLifecycleConflictError>>({
        code: 'ACCOUNT_CLOSURE_ACTIVE_OBLIGATION',
      }));
    expect(() => assertAccountClosureCanBeExecuted({ state: 'REQUESTED', actor: central,
      recoveryUntil, occurredAt: new Date('2026-11-02T09:59:59.999Z'), blockers }))
      .toThrowError(expect.objectContaining<Partial<AccountLifecycleConflictError>>({
        code: 'ACCOUNT_CLOSURE_RECOVERY_ACTIVE',
      }));
  });

  it('keeps export preparation/expiry SYSTEM-only and deletes only after expiry', () => {
    expect(() => assertAccountExportCanBePrepared({ state: 'REQUESTED', actor: system }))
      .not.toThrow();
    const expiresAt = new Date('2026-10-05T10:00:00.000Z');
    expect(() => assertAccountExportCanExpire({ state: 'READY', actor: system, expiresAt,
      occurredAt: new Date('2026-10-05T09:59:59.999Z') }))
      .toThrowError(expect.objectContaining<Partial<AccountLifecycleConflictError>>({
        code: 'ACCOUNT_EXPORT_NOT_DUE',
      }));
    expect(() => assertAccountExportCanExpire({ state: 'READY', actor: system, expiresAt,
      occurredAt: expiresAt })).not.toThrow();
  });
});
