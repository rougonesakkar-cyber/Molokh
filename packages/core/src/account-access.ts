import type { ActorSnapshot } from './command.js';
import type { AccountState } from './identity.js';

export const ACCOUNT_ACCESS_POLICY_VERSION = 'account-access-mvp-v1' as const;
export const PHONE_CHANGE_SECURITY_HOLD_HOURS = 24;

export type AccountAccessCaseState = 'PENDING' | 'SECURITY_HOLD' | 'COMPLETED' | 'REJECTED';
export type AccountRecoveryRoute = 'VERIFIED_ROUTE' | 'PHONE_CHANGE';
export type AccountRecoverySignal = 'VERIFIED_PHONE' | 'TRUSTED_SESSION' | 'CENTRAL_SUPPORT';
export type DuplicateAccountCaseState = 'UNDER_REVIEW' | 'CLEARED' | 'RESOLVED';
export type DuplicateProcessKind = 'STATUS' | 'OBLIGATION';
export type DuplicateProcessDecision =
  | 'RETAIN_CURRENT_OWNER'
  | 'CLOSE_NO_FAULT'
  | 'SEPARATE_GOVERNED_REVIEW';

export interface DuplicateProcessDisposition {
  readonly kind: DuplicateProcessKind;
  readonly aggregateId: string;
  readonly currentOwnerUserId: string;
  readonly decision: DuplicateProcessDecision;
}

export type AccountAccessConflictCode =
  | 'ACCOUNT_ACCESS_USER_OR_CENTRAL_REQUIRED'
  | 'ACCOUNT_ACCESS_CENTRAL_REQUIRED'
  | 'ACCOUNT_ACCESS_SYSTEM_REQUIRED'
  | 'ACCOUNT_ACCESS_ACCOUNT_NOT_ACTIVE'
  | 'ACCOUNT_ACCESS_INVALID_STATE'
  | 'ACCOUNT_ACCESS_LIVE_CASE_EXISTS'
  | 'ACCOUNT_ACCESS_SIGNAL_REQUIRED'
  | 'ACCOUNT_ACCESS_PHONE_CHANGE_REQUIRED'
  | 'ACCOUNT_ACCESS_PHONE_UNCHANGED'
  | 'ACCOUNT_ACCESS_PHONE_IN_USE'
  | 'ACCOUNT_ACCESS_DUPLICATE_UNRESOLVED'
  | 'ACCOUNT_ACCESS_RISK_UNRESOLVED'
  | 'ACCOUNT_ACCESS_HOLD_NOT_DUE'
  | 'ACCOUNT_ACCESS_REASON_REQUIRED'
  | 'ACCOUNT_ACCESS_INCIDENT_INVALID'
  | 'ACCOUNT_ACCESS_AFFECTED_PROCESS_REQUIRED'
  | 'DUPLICATE_ACCOUNT_INVALID_STATE'
  | 'DUPLICATE_ACCOUNT_USERS_REQUIRED'
  | 'DUPLICATE_ACCOUNT_SIGNAL_REQUIRED'
  | 'DUPLICATE_ACCOUNT_CANONICAL_REQUIRED'
  | 'DUPLICATE_ACCOUNT_DISPOSITIONS_REQUIRED'
  | 'DUPLICATE_ACCOUNT_DISPOSITION_INVALID';

export class AccountAccessConflictError extends Error {
  constructor(readonly code: AccountAccessConflictCode) {
    super(`Account access action is not allowed: ${code}`);
    this.name = 'AccountAccessConflictError';
  }
}

function isCentral(actor: ActorSnapshot): boolean {
  return actor.type === 'USER'
    && actor.id !== null
    && actor.roles.includes('CENTRAL_ADMIN');
}

function assertCentral(actor: ActorSnapshot): void {
  if (!isCentral(actor)) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_CENTRAL_REQUIRED');
  }
}

function assertSystem(actor: ActorSnapshot): void {
  if (actor.type !== 'SYSTEM' || actor.id !== null) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_SYSTEM_REQUIRED');
  }
}

function assertReason(reason: string): void {
  const normalized = reason.trim();
  if (normalized.length < 10 || normalized.length > 1_000) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_REASON_REQUIRED');
  }
}

function assertValidDate(value: Date, field: string): void {
  if (!Number.isFinite(value.getTime())) throw new RangeError(`${field} must be a valid date`);
}

export function phoneChangeSecurityHoldUntil(approvedAt: Date): Date {
  assertValidDate(approvedAt, 'approvedAt');
  return new Date(approvedAt.getTime() + PHONE_CHANGE_SECURITY_HOLD_HOURS * 60 * 60 * 1_000);
}

export function normalizeRecoverySignals(
  signals: readonly AccountRecoverySignal[],
): readonly AccountRecoverySignal[] {
  return [...new Set(signals)].sort();
}

export function assertAccountRecoveryCanBeRequested(input: {
  readonly actor: ActorSnapshot;
  readonly userId: string;
  readonly accountState: AccountState;
  readonly hasLiveCase: boolean;
  readonly route: AccountRecoveryRoute;
  readonly signals: readonly AccountRecoverySignal[];
  readonly requestedPhoneE164: string | null;
  readonly currentPhoneE164: string;
  readonly reason: string;
}): void {
  const ownRequest = input.actor.type === 'USER' && input.actor.id === input.userId;
  if (!ownRequest && !isCentral(input.actor)) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_USER_OR_CENTRAL_REQUIRED');
  }
  if (input.accountState === 'CLOSED') {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_ACCOUNT_NOT_ACTIVE');
  }
  if (input.hasLiveCase) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_LIVE_CASE_EXISTS');
  }
  if (normalizeRecoverySignals(input.signals).length === 0) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_SIGNAL_REQUIRED');
  }
  if (input.route === 'PHONE_CHANGE') {
    if (!input.requestedPhoneE164) {
      throw new AccountAccessConflictError('ACCOUNT_ACCESS_PHONE_CHANGE_REQUIRED');
    }
    if (input.requestedPhoneE164 === input.currentPhoneE164) {
      throw new AccountAccessConflictError('ACCOUNT_ACCESS_PHONE_UNCHANGED');
    }
  } else if (input.requestedPhoneE164 !== null) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_PHONE_CHANGE_REQUIRED');
  }
  assertReason(input.reason);
}

export function assertPhoneChangeCanBeApproved(input: {
  readonly actor: ActorSnapshot;
  readonly state: AccountAccessCaseState;
  readonly route: AccountRecoveryRoute;
  readonly requestedPhoneE164: string | null;
  readonly phoneAvailable: boolean;
  readonly hasUnresolvedDuplicate: boolean;
  readonly hasUnresolvedRisk: boolean;
  readonly reason: string;
}): void {
  assertCentral(input.actor);
  if (input.state !== 'PENDING') {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_INVALID_STATE');
  }
  if (input.route !== 'PHONE_CHANGE' || input.requestedPhoneE164 === null) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_PHONE_CHANGE_REQUIRED');
  }
  if (!input.phoneAvailable) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_PHONE_IN_USE');
  }
  if (input.hasUnresolvedDuplicate) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_DUPLICATE_UNRESOLVED');
  }
  if (input.hasUnresolvedRisk) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_RISK_UNRESOLVED');
  }
  assertReason(input.reason);
}

export function assertVerifiedRecoveryCanBeCompleted(input: {
  readonly actor: ActorSnapshot;
  readonly state: AccountAccessCaseState;
  readonly route: AccountRecoveryRoute;
  readonly verifiedRouteSucceeded: boolean;
}): void {
  const allowedActor = isCentral(input.actor)
    || (input.actor.type === 'SYSTEM' && input.actor.id === null);
  if (!allowedActor) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_CENTRAL_REQUIRED');
  }
  if (input.state !== 'PENDING' || input.route !== 'VERIFIED_ROUTE') {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_INVALID_STATE');
  }
  if (!input.verifiedRouteSucceeded) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_SIGNAL_REQUIRED');
  }
}

export function assertPhoneChangeHoldCanExpire(input: {
  readonly actor: ActorSnapshot;
  readonly state: AccountAccessCaseState;
  readonly securityHoldUntil: Date | null;
  readonly occurredAt: Date;
  readonly hasUnresolvedRisk: boolean;
}): void {
  assertSystem(input.actor);
  if (input.state !== 'SECURITY_HOLD' || input.securityHoldUntil === null) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_INVALID_STATE');
  }
  assertValidDate(input.securityHoldUntil, 'securityHoldUntil');
  assertValidDate(input.occurredAt, 'occurredAt');
  if (input.occurredAt < input.securityHoldUntil) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_HOLD_NOT_DUE');
  }
  if (input.hasUnresolvedRisk) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_RISK_UNRESOLVED');
  }
}

export function assertAccountRecoveryCanBeRejected(input: {
  readonly actor: ActorSnapshot;
  readonly state: AccountAccessCaseState;
  readonly reason: string;
}): void {
  assertCentral(input.actor);
  if (input.state !== 'PENDING') {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_INVALID_STATE');
  }
  assertReason(input.reason);
}

export function assertAccessIncidentCanBeConfirmed(input: {
  readonly actor: ActorSnapshot;
  readonly state: AccountAccessCaseState;
  readonly incidentStartedAt: Date;
  readonly incidentEndedAt: Date;
  readonly affectedProcessIds: readonly string[];
  readonly reason: string;
}): void {
  assertCentral(input.actor);
  if (input.state !== 'PENDING' && input.state !== 'SECURITY_HOLD') {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_INVALID_STATE');
  }
  assertValidDate(input.incidentStartedAt, 'incidentStartedAt');
  assertValidDate(input.incidentEndedAt, 'incidentEndedAt');
  if (input.incidentEndedAt <= input.incidentStartedAt) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_INCIDENT_INVALID');
  }
  if (new Set(input.affectedProcessIds.filter((id) => id.trim().length > 0)).size === 0) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_AFFECTED_PROCESS_REQUIRED');
  }
  assertReason(input.reason);
}

export function assertDuplicateReviewCanBeOpened(input: {
  readonly actor: ActorSnapshot;
  readonly userIds: readonly string[];
  readonly signalReferences: readonly string[];
  readonly reason: string;
}): void {
  const allowedActor = isCentral(input.actor)
    || (input.actor.type === 'SYSTEM' && input.actor.id === null);
  if (!allowedActor) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_CENTRAL_REQUIRED');
  }
  const users = new Set(input.userIds.filter((id) => id.trim().length > 0));
  if (users.size < 2) {
    throw new AccountAccessConflictError('DUPLICATE_ACCOUNT_USERS_REQUIRED');
  }
  if (new Set(input.signalReferences.filter((signal) => signal.trim().length > 0)).size === 0) {
    throw new AccountAccessConflictError('DUPLICATE_ACCOUNT_SIGNAL_REQUIRED');
  }
  assertReason(input.reason);
}

export function assertDuplicateReviewCanBeCleared(input: {
  readonly actor: ActorSnapshot;
  readonly state: DuplicateAccountCaseState;
  readonly reason: string;
}): void {
  assertCentral(input.actor);
  if (input.state !== 'UNDER_REVIEW') {
    throw new AccountAccessConflictError('DUPLICATE_ACCOUNT_INVALID_STATE');
  }
  assertReason(input.reason);
}

export function assertDuplicateReviewCanBeResolved(input: {
  readonly actor: ActorSnapshot;
  readonly state: DuplicateAccountCaseState;
  readonly userIds: readonly string[];
  readonly canonicalUserId: string;
  readonly affectedProcesses: readonly {
    readonly kind: DuplicateProcessKind;
    readonly aggregateId: string;
    readonly currentOwnerUserId: string;
  }[];
  readonly dispositions: readonly DuplicateProcessDisposition[];
  readonly reason: string;
}): void {
  assertCentral(input.actor);
  if (input.state !== 'UNDER_REVIEW') {
    throw new AccountAccessConflictError('DUPLICATE_ACCOUNT_INVALID_STATE');
  }
  const users = new Set(input.userIds);
  if (!users.has(input.canonicalUserId)) {
    throw new AccountAccessConflictError('DUPLICATE_ACCOUNT_CANONICAL_REQUIRED');
  }
  if (input.dispositions.length !== input.affectedProcesses.length) {
    throw new AccountAccessConflictError('DUPLICATE_ACCOUNT_DISPOSITIONS_REQUIRED');
  }
  const expected = new Map(input.affectedProcesses.map((process) => [
    `${process.kind}:${process.aggregateId}:${process.currentOwnerUserId}`,
    process,
  ]));
  const seen = new Set<string>();
  for (const disposition of input.dispositions) {
    const key = `${disposition.kind}:${disposition.aggregateId}:${disposition.currentOwnerUserId}`;
    const process = expected.get(key);
    if (!process || seen.has(key) || disposition.currentOwnerUserId !== process.currentOwnerUserId
      || !users.has(disposition.currentOwnerUserId)) {
      throw new AccountAccessConflictError('DUPLICATE_ACCOUNT_DISPOSITION_INVALID');
    }
    seen.add(key);
  }
  if (seen.size !== expected.size) {
    throw new AccountAccessConflictError('DUPLICATE_ACCOUNT_DISPOSITIONS_REQUIRED');
  }
  assertReason(input.reason);
}
