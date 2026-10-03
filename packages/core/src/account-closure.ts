import type { AccountState } from './identity.js';
import type { ActorSnapshot } from './command.js';

export const ACCOUNT_CLOSURE_RECOVERY_DAYS = 30;
export const ACCOUNT_EXPORT_RETENTION_HOURS = 48;
export const ACCOUNT_LIFECYCLE_POLICY_VERSION = 'account-lifecycle-mvp-v1';

export type AccountClosureState = 'REQUESTED' | 'CANCELLED' | 'EXECUTED';
export type AccountExportState = 'REQUESTED' | 'READY' | 'EXPIRED';

export type AccountLifecycleErrorCode =
  | 'ACCOUNT_LIFECYCLE_USER_REQUIRED'
  | 'ACCOUNT_LIFECYCLE_CENTRAL_REQUIRED'
  | 'ACCOUNT_LIFECYCLE_SYSTEM_REQUIRED'
  | 'ACCOUNT_CLOSURE_INVALID_STATE'
  | 'ACCOUNT_CLOSURE_RECOVERY_ACTIVE'
  | 'ACCOUNT_CLOSURE_RECOVERY_ENDED'
  | 'ACCOUNT_CLOSURE_ACTIVE_OBLIGATION'
  | 'ACCOUNT_CLOSURE_STATUS_HELD'
  | 'ACCOUNT_CLOSURE_ACTIVE_SESSION'
  | 'ACCOUNT_CLOSURE_ACTIVE_MEMBERSHIP'
  | 'ACCOUNT_CLOSURE_ACTIVE_ROLE'
  | 'ACCOUNT_EXPORT_INVALID_STATE'
  | 'ACCOUNT_EXPORT_NOT_DUE'
  | 'ACCOUNT_NOT_CLOSABLE';

export class AccountLifecycleConflictError extends Error {
  constructor(readonly code: AccountLifecycleErrorCode) {
    super(`Account lifecycle action is not allowed: ${code}`);
    this.name = 'AccountLifecycleConflictError';
  }
}

function validDate(value: Date, field: string): void {
  if (!Number.isFinite(value.getTime())) throw new RangeError(`${field} must be a valid date`);
}

function plusMilliseconds(value: Date, milliseconds: number): Date {
  validDate(value, 'occurredAt');
  return new Date(value.getTime() + milliseconds);
}

export function accountClosureRecoveryDeadline(requestedAt: Date): Date {
  return plusMilliseconds(requestedAt, ACCOUNT_CLOSURE_RECOVERY_DAYS * 24 * 60 * 60 * 1_000);
}

export function accountExportExpiresAt(readyAt: Date): Date {
  return plusMilliseconds(readyAt, ACCOUNT_EXPORT_RETENTION_HOURS * 60 * 60 * 1_000);
}

export function assertOwnAccountActor(actor: ActorSnapshot, userId: string): void {
  if (actor.type !== 'USER' || actor.id !== userId) {
    throw new AccountLifecycleConflictError('ACCOUNT_LIFECYCLE_USER_REQUIRED');
  }
}

export function assertCentralAccountActor(actor: ActorSnapshot): void {
  if (actor.type !== 'USER' || actor.id === null || !actor.roles.includes('CENTRAL_ADMIN')) {
    throw new AccountLifecycleConflictError('ACCOUNT_LIFECYCLE_CENTRAL_REQUIRED');
  }
}

export function assertSystemAccountActor(actor: ActorSnapshot): void {
  if (actor.type !== 'SYSTEM' || actor.id !== null) {
    throw new AccountLifecycleConflictError('ACCOUNT_LIFECYCLE_SYSTEM_REQUIRED');
  }
}

export function assertAccountClosureCanBeRequested(input: {
  readonly accountState: AccountState;
  readonly actor: ActorSnapshot;
  readonly userId: string;
}): void {
  assertOwnAccountActor(input.actor, input.userId);
  if (input.accountState === 'CLOSED') {
    throw new AccountLifecycleConflictError('ACCOUNT_NOT_CLOSABLE');
  }
}

export function assertAccountClosureCanBeCancelled(input: {
  readonly state: AccountClosureState;
  readonly actor: ActorSnapshot;
  readonly userId: string;
  readonly recoveryUntil: Date;
  readonly occurredAt: Date;
}): void {
  assertOwnAccountActor(input.actor, input.userId);
  validDate(input.recoveryUntil, 'recoveryUntil');
  validDate(input.occurredAt, 'occurredAt');
  if (input.state !== 'REQUESTED') {
    throw new AccountLifecycleConflictError('ACCOUNT_CLOSURE_INVALID_STATE');
  }
  if (input.occurredAt >= input.recoveryUntil) {
    throw new AccountLifecycleConflictError('ACCOUNT_CLOSURE_RECOVERY_ENDED');
  }
}

export interface AccountClosureBlockers {
  readonly activeObligationCount: number;
  readonly heldStatusCount: number;
  readonly activeSessionCount: number;
  readonly activeMembershipCount: number;
  readonly activeRoleCount: number;
}

export function assertAccountClosureCanBeExecuted(input: {
  readonly state: AccountClosureState;
  readonly actor: ActorSnapshot;
  readonly recoveryUntil: Date;
  readonly occurredAt: Date;
  readonly blockers: AccountClosureBlockers;
}): void {
  assertCentralAccountActor(input.actor);
  validDate(input.recoveryUntil, 'recoveryUntil');
  validDate(input.occurredAt, 'occurredAt');
  if (input.state !== 'REQUESTED') {
    throw new AccountLifecycleConflictError('ACCOUNT_CLOSURE_INVALID_STATE');
  }
  if (input.occurredAt < input.recoveryUntil) {
    throw new AccountLifecycleConflictError('ACCOUNT_CLOSURE_RECOVERY_ACTIVE');
  }
  const checks: ReadonlyArray<readonly [number, AccountLifecycleErrorCode]> = [
    [input.blockers.activeObligationCount, 'ACCOUNT_CLOSURE_ACTIVE_OBLIGATION'],
    [input.blockers.heldStatusCount, 'ACCOUNT_CLOSURE_STATUS_HELD'],
    [input.blockers.activeSessionCount, 'ACCOUNT_CLOSURE_ACTIVE_SESSION'],
    [input.blockers.activeMembershipCount, 'ACCOUNT_CLOSURE_ACTIVE_MEMBERSHIP'],
    [input.blockers.activeRoleCount, 'ACCOUNT_CLOSURE_ACTIVE_ROLE'],
  ];
  for (const [count, code] of checks) {
    if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('blocker count is invalid');
    if (count > 0) throw new AccountLifecycleConflictError(code);
  }
}

export function assertAccountExportCanBeRequested(input: {
  readonly accountState: AccountState;
  readonly actor: ActorSnapshot;
  readonly userId: string;
}): void {
  assertOwnAccountActor(input.actor, input.userId);
  if (input.accountState === 'CLOSED') {
    throw new AccountLifecycleConflictError('ACCOUNT_NOT_CLOSABLE');
  }
}

export function assertAccountExportCanBePrepared(input: {
  readonly state: AccountExportState;
  readonly actor: ActorSnapshot;
}): void {
  assertSystemAccountActor(input.actor);
  if (input.state !== 'REQUESTED') {
    throw new AccountLifecycleConflictError('ACCOUNT_EXPORT_INVALID_STATE');
  }
}

export function assertAccountExportCanExpire(input: {
  readonly state: AccountExportState;
  readonly actor: ActorSnapshot;
  readonly expiresAt: Date | null;
  readonly occurredAt: Date;
}): void {
  assertSystemAccountActor(input.actor);
  if (input.state !== 'READY' || input.expiresAt === null) {
    throw new AccountLifecycleConflictError('ACCOUNT_EXPORT_INVALID_STATE');
  }
  validDate(input.expiresAt, 'expiresAt');
  validDate(input.occurredAt, 'occurredAt');
  if (input.occurredAt < input.expiresAt) {
    throw new AccountLifecycleConflictError('ACCOUNT_EXPORT_NOT_DUE');
  }
}
