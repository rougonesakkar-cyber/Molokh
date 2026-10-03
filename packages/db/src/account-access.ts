import {
  ACCOUNT_ACCESS_POLICY_VERSION,
  AccountAccessConflictError,
  assertAccessIncidentCanBeConfirmed,
  assertAccountRecoveryCanBeRejected,
  assertAccountRecoveryCanBeRequested,
  assertDuplicateReviewCanBeCleared,
  assertDuplicateReviewCanBeOpened,
  assertDuplicateReviewCanBeResolved,
  assertPhoneChangeCanBeApproved,
  assertPhoneChangeHoldCanExpire,
  assertVerifiedRecoveryCanBeCompleted,
  normalizeRecoverySignals,
  phoneChangeSecurityHoldUntil,
  type AccountAccessCaseState,
  type AccountRecoveryRoute,
  type AccountRecoverySignal,
  type CommandEnvelope,
  type DuplicateAccountCaseState,
  type DuplicateProcessDecision,
  type DuplicateProcessDisposition,
  type DuplicateProcessKind,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import { executeCriticalCommand, type ExecutedCommand } from './platform-command.js';

export interface AccountAccessEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly sensitiveHoldId?: string;
  readonly userEventId?: string;
}

export interface DuplicateAccountEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly processHoldIds?: readonly string[];
  readonly aliasIds?: readonly string[];
  readonly userEventIds?: readonly string[];
}

export interface RequestAccountRecoveryPayload {
  readonly userId: string;
  readonly route: AccountRecoveryRoute;
  readonly signals: readonly AccountRecoverySignal[];
  readonly requestedPhoneE164: string | null;
  readonly reason: string;
}
export interface ApprovePhoneChangePayload {
  readonly caseId: string;
  readonly reason: string;
}
export interface CompleteVerifiedRecoveryPayload {
  readonly caseId: string;
  readonly verifiedRouteSucceeded: boolean;
}
export interface ExpirePhoneChangeHoldPayload { readonly caseId: string }
export interface RejectAccountRecoveryPayload {
  readonly caseId: string;
  readonly reason: string;
}
export interface ConfirmAccessIncidentPayload {
  readonly caseId: string;
  readonly incidentStartedAt: string;
  readonly incidentEndedAt: string;
  readonly affectedProcessIds: readonly string[];
  readonly reason: string;
}
export interface OpenDuplicateAccountReviewPayload {
  readonly userIds: readonly string[];
  readonly signalReferences: readonly string[];
  readonly reason: string;
}
export interface ClearDuplicateAccountReviewPayload {
  readonly caseId: string;
  readonly reason: string;
}
export interface ResolveDuplicateAccountReviewPayload {
  readonly caseId: string;
  readonly canonicalUserId: string;
  readonly dispositions: readonly DuplicateProcessDisposition[];
  readonly reason: string;
}

export interface AccountAccessCaseProjection {
  readonly caseId: string;
  readonly userId: string;
  readonly state: AccountAccessCaseState;
  readonly route: AccountRecoveryRoute;
  readonly signals: readonly AccountRecoverySignal[];
  readonly requestedPhoneE164: string | null;
  readonly requestedAt: string;
  readonly securityHoldUntil: string | null;
  readonly incidentStartedAt: string | null;
  readonly incidentEndedAt: string | null;
  readonly affectedProcessIds: readonly string[];
  readonly completedAt: string | null;
  readonly version: number;
}

export interface DuplicateAccountProcessProjection {
  readonly kind: DuplicateProcessKind;
  readonly aggregateId: string;
  readonly currentOwnerUserId: string;
  readonly decision: DuplicateProcessDecision | null;
}

export interface DuplicateAccountCaseProjection {
  readonly caseId: string;
  readonly state: DuplicateAccountCaseState;
  readonly userIds: readonly string[];
  readonly signalReferences: readonly string[];
  readonly canonicalUserId: string | null;
  readonly processes: readonly DuplicateAccountProcessProjection[];
  readonly requestedAt: string;
  readonly decidedAt: string | null;
  readonly version: number;
}

interface AccessCaseRow {
  readonly case_id: string;
  readonly user_id: string;
  readonly state: AccountAccessCaseState;
  readonly recovery_route: AccountRecoveryRoute;
  readonly recovery_signals: AccountRecoverySignal[];
  readonly requested_phone_e164: string | null;
  readonly requested_at: Date;
  readonly security_hold_until: Date | null;
  readonly incident_started_at: Date | null;
  readonly incident_ended_at: Date | null;
  readonly affected_process_ids: string[];
  readonly completed_at: Date | null;
  readonly version: string;
}

interface DuplicateCaseRow {
  readonly case_id: string;
  readonly state: DuplicateAccountCaseState;
  readonly signal_references: string[];
  readonly canonical_user_id: string | null;
  readonly requested_at: Date;
  readonly decided_at: Date | null;
  readonly version: string;
}

interface DuplicateProcessRow {
  readonly process_kind: DuplicateProcessKind;
  readonly aggregate_id: string;
  readonly current_owner_user_id: string;
  readonly decision: DuplicateProcessDecision | null;
}

function requiredId<T extends object>(ids: T, key: keyof T): string {
  const value = ids[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`Account access effect ID ${String(key)} is required`);
  }
  return value;
}

async function assertCentralGrant(
  database: Kysely<Database> | Transaction<Database>, actorId: string,
): Promise<void> {
  const result = await sql<{ readonly allowed: boolean }>`select true as allowed
    from community.role_grants where user_id = ${actorId}::uuid
      and role = 'CENTRAL_ADMIN' and scope_type = 'GLOBAL' and scope_id is null
      and state = 'ACTIVE' limit 1`.execute(database);
  if (!result.rows[0]?.allowed) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_CENTRAL_REQUIRED');
  }
}

async function assertCentralWhenUser(
  database: Kysely<Database> | Transaction<Database>,
  actor: CommandEnvelope<unknown>['actor'],
): Promise<void> {
  if (actor.type === 'USER') {
    if (!actor.id) throw new AccountAccessConflictError('ACCOUNT_ACCESS_CENTRAL_REQUIRED');
    await assertCentralGrant(database, actor.id);
  }
}

function accessProjection(row: AccessCaseRow): AccountAccessCaseProjection {
  return {
    caseId: row.case_id, userId: row.user_id, state: row.state,
    route: row.recovery_route, signals: row.recovery_signals,
    requestedPhoneE164: row.requested_phone_e164,
    requestedAt: row.requested_at.toISOString(),
    securityHoldUntil: row.security_hold_until?.toISOString() ?? null,
    incidentStartedAt: row.incident_started_at?.toISOString() ?? null,
    incidentEndedAt: row.incident_ended_at?.toISOString() ?? null,
    affectedProcessIds: row.affected_process_ids,
    completedAt: row.completed_at?.toISOString() ?? null,
    version: Number(row.version),
  };
}

async function accessCaseRow(
  database: Kysely<Database> | Transaction<Database>, caseId: string, lock = false,
): Promise<AccessCaseRow | null> {
  const result = await sql<AccessCaseRow>`select case_id, user_id, state, recovery_route,
      recovery_signals, requested_phone_e164, requested_at, security_hold_until,
      incident_started_at, incident_ended_at, affected_process_ids, completed_at,
      version::text as version
    from identity.account_access_cases where case_id = ${caseId}::uuid
    ${lock ? sql`for update` : sql``}`.execute(database);
  return result.rows[0] ?? null;
}

async function duplicateCaseRow(
  database: Kysely<Database> | Transaction<Database>, caseId: string, lock = false,
): Promise<DuplicateCaseRow | null> {
  const result = await sql<DuplicateCaseRow>`select case_id, state, signal_references,
      canonical_user_id, requested_at, decided_at, version::text as version
    from identity.duplicate_account_cases where case_id = ${caseId}::uuid
    ${lock ? sql`for update` : sql``}`.execute(database);
  return result.rows[0] ?? null;
}

async function duplicateProjection(
  database: Kysely<Database> | Transaction<Database>, row: DuplicateCaseRow,
): Promise<DuplicateAccountCaseProjection> {
  const users = await sql<{ readonly user_id: string }>`select user_id
    from identity.duplicate_account_case_users where case_id = ${row.case_id}::uuid
    order by user_id`.execute(database);
  const processes = await sql<DuplicateProcessRow>`select process_kind, aggregate_id,
      current_owner_user_id, decision from identity.duplicate_account_processes
    where case_id = ${row.case_id}::uuid
    order by process_kind, aggregate_id, current_owner_user_id`.execute(database);
  return {
    caseId: row.case_id, state: row.state, userIds: users.rows.map((item) => item.user_id),
    signalReferences: row.signal_references, canonicalUserId: row.canonical_user_id,
    processes: processes.rows.map((item) => ({ kind: item.process_kind,
      aggregateId: item.aggregate_id, currentOwnerUserId: item.current_owner_user_id,
      decision: item.decision })), requestedAt: row.requested_at.toISOString(),
    decidedAt: row.decided_at?.toISOString() ?? null, version: Number(row.version),
  };
}

export async function readMyAccountAccess(
  database: Kysely<Database> | Transaction<Database>, userId: string,
): Promise<AccountAccessCaseProjection | null> {
  const result = await sql<AccessCaseRow>`select case_id, user_id, state, recovery_route,
      recovery_signals, requested_phone_e164, requested_at, security_hold_until,
      incident_started_at, incident_ended_at, affected_process_ids, completed_at,
      version::text as version from identity.account_access_cases
    where user_id = ${userId}::uuid order by requested_at desc, case_id desc limit 1`
    .execute(database);
  return result.rows[0] ? accessProjection(result.rows[0]) : null;
}

export async function hasActiveSensitiveActionHold(
  database: Kysely<Database> | Transaction<Database>, userId: string,
): Promise<boolean> {
  const result = await sql<{ readonly active: boolean }>`select exists (
      select 1 from identity.user_sensitive_action_holds
      where user_id = ${userId}::uuid and state = 'ACTIVE'
    ) as active`.execute(database);
  return result.rows[0]?.active ?? false;
}

export async function requestAccountRecovery(
  database: Kysely<Database>, command: CommandEnvelope<RequestAccountRecoveryPayload>,
  ids: AccountAccessEffectIds, now?: () => Date,
): Promise<ExecutedCommand<AccountAccessCaseProjection>> {
  if (command.commandType !== 'REQUEST_ACCOUNT_RECOVERY'
    || command.aggregateType !== 'AccountAccessCase') {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_INVALID_STATE');
  }
  return executeCriticalCommand(database, { command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      if (command.actor.type === 'USER' && command.actor.id !== command.payload.userId) {
        await assertCentralWhenUser(transaction, command.actor);
      }
      const userResult = await sql<{ readonly user_id: string; readonly phone_e164: string;
        readonly account_state: 'ACTIVE' | 'RESTRICTED' | 'CLOSED' }>`
        select user_id, phone_e164, account_state from identity.users
        where user_id = ${command.payload.userId}::uuid for update`.execute(transaction);
      const user = userResult.rows[0];
      if (!user) throw new AccountAccessConflictError('ACCOUNT_ACCESS_ACCOUNT_NOT_ACTIVE');
      const liveResult = await sql<{ readonly present: boolean }>`select true as present
        from identity.account_access_cases where user_id = ${user.user_id}::uuid
          and state in ('PENDING', 'SECURITY_HOLD') limit 1`.execute(transaction);
      const signals = normalizeRecoverySignals(command.payload.signals);
      assertAccountRecoveryCanBeRequested({ actor: command.actor, userId: user.user_id,
        accountState: user.account_state, hasLiveCase: liveResult.rows[0]?.present ?? false,
        route: command.payload.route, signals,
        requestedPhoneE164: command.payload.requestedPhoneE164,
        currentPhoneE164: user.phone_e164, reason: command.payload.reason });
      const occurredAt = context.occurredAt.toISOString();
      await sql`insert into identity.account_access_cases (
          case_id, user_id, state, recovery_route, recovery_signals,
          requested_phone_e164, request_reason, requested_by, requested_at,
          policy_version, version, updated_at
        ) values (${command.aggregateId}::uuid, ${user.user_id}::uuid, 'PENDING',
          ${command.payload.route}, ${[...signals]}::text[], ${command.payload.requestedPhoneE164},
          ${command.payload.reason.trim()}, ${command.actor.id}::uuid,
          ${occurredAt}::timestamptz, ${ACCOUNT_ACCESS_POLICY_VERSION},
          ${context.nextVersion}, ${occurredAt}::timestamptz)`.execute(transaction);
      const response = accessProjection((await accessCaseRow(transaction, command.aggregateId))!);
      return { responseStatus: 202, response,
        event: { eventId: ids.eventId, eventName: 'AccountRecoveryRequested', schemaVersion: 1,
          transitionId: 'AR-01', payload: { caseId: response.caseId, userId: response.userId,
            route: response.route, signals: response.signals },
          metadata: { policyVersion: ACCOUNT_ACCESS_POLICY_VERSION } },
        audit: { auditId: ids.auditId, action: 'REQUEST_ACCOUNT_RECOVERY',
          transitionId: 'AR-01', reasonCode: null, beforeState: null, afterState: 'PENDING',
          metadata: { userId: response.userId, route: response.route } },
        outbox: [{ messageId: ids.outboxMessageId,
          topic: 'identity.account-recovery.requested.v1',
          payload: { caseId: response.caseId, userId: response.userId } }] };
    } });
}

export async function approvePhoneChange(
  database: Kysely<Database>, command: CommandEnvelope<ApprovePhoneChangePayload>,
  ids: AccountAccessEffectIds, now?: () => Date,
): Promise<ExecutedCommand<AccountAccessCaseProjection>> {
  if (command.commandType !== 'APPROVE_PHONE_CHANGE'
    || command.aggregateType !== 'AccountAccessCase'
    || command.aggregateId !== command.payload.caseId) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_INVALID_STATE');
  }
  return executeCriticalCommand(database, { command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      await assertCentralWhenUser(transaction, command.actor);
      const recovery = await accessCaseRow(transaction, command.aggregateId, true);
      if (!recovery) throw new AccountAccessConflictError('ACCOUNT_ACCESS_INVALID_STATE');
      await sql`select pg_advisory_xact_lock(hashtextextended(
        ${`User:${recovery.user_id}`}, 0))`.execute(transaction);
      const userResult = await sql<{ readonly phone_e164: string; readonly version: string }>`
        select phone_e164, version::text as version from identity.users
        where user_id = ${recovery.user_id}::uuid for update`.execute(transaction);
      const user = userResult.rows[0]!;
      const phoneAvailableResult = await sql<{ readonly available: boolean }>`select not exists (
          select 1 from identity.users where phone_e164 = ${recovery.requested_phone_e164}
            and user_id <> ${recovery.user_id}::uuid and account_state in ('ACTIVE', 'RESTRICTED')
        ) and not exists (
          select 1 from identity.account_access_cases
          where requested_phone_e164 = ${recovery.requested_phone_e164}
            and case_id <> ${recovery.case_id}::uuid and state in ('PENDING', 'SECURITY_HOLD')
        ) as available`.execute(transaction);
      const duplicateResult = await sql<{ readonly present: boolean }>`select true as present
        from identity.duplicate_account_case_users
        where user_id = ${recovery.user_id}::uuid and live limit 1`.execute(transaction);
      assertPhoneChangeCanBeApproved({ actor: command.actor, state: recovery.state,
        route: recovery.recovery_route, requestedPhoneE164: recovery.requested_phone_e164,
        phoneAvailable: phoneAvailableResult.rows[0]?.available ?? false,
        hasUnresolvedDuplicate: duplicateResult.rows[0]?.present ?? false,
        hasUnresolvedRisk: false, reason: command.payload.reason });
      const occurredAt = context.occurredAt.toISOString();
      const holdUntil = phoneChangeSecurityHoldUntil(context.occurredAt).toISOString();
      const userVersion = Number(user.version) + 1;
      await sql`update identity.users set phone_e164 = ${recovery.requested_phone_e164},
          phone_verified_at = ${occurredAt}::timestamptz, version = ${userVersion},
          updated_at = ${occurredAt}::timestamptz
        where user_id = ${recovery.user_id}::uuid`.execute(transaction);
      await sql`update identity.account_access_cases set state = 'SECURITY_HOLD',
          reviewed_by = ${command.actor.id}::uuid, decision_reason = ${command.payload.reason.trim()},
          decision_at = ${occurredAt}::timestamptz,
          security_hold_until = ${holdUntil}::timestamptz,
          version = ${context.nextVersion}, updated_at = ${occurredAt}::timestamptz
        where case_id = ${recovery.case_id}::uuid`.execute(transaction);
      await sql`insert into identity.user_sensitive_action_holds (
          hold_id, user_id, source_case_id, state, starts_at, ends_at, version, updated_at
        ) values (${requiredId(ids, 'sensitiveHoldId')}::uuid, ${recovery.user_id}::uuid,
          ${recovery.case_id}::uuid, 'ACTIVE', ${occurredAt}::timestamptz,
          ${holdUntil}::timestamptz, 1, ${occurredAt}::timestamptz)`.execute(transaction);
      const response = accessProjection((await accessCaseRow(transaction, recovery.case_id))!);
      const userEventId = requiredId(ids, 'userEventId');
      return { responseStatus: 200, response,
        event: { eventId: ids.eventId, eventName: 'AccountRecoveryApproved', schemaVersion: 1,
          transitionId: 'AR-02', payload: { caseId: response.caseId, userId: response.userId,
            securityHoldUntil: response.securityHoldUntil },
          metadata: { policyVersion: ACCOUNT_ACCESS_POLICY_VERSION } },
        relatedEvents: [{ eventId: userEventId, eventName: 'VerifiedPhoneChanged',
          schemaVersion: 1, aggregateType: 'User', aggregateId: recovery.user_id,
          aggregateVersion: userVersion, transitionId: 'AR-02',
          payload: { userId: recovery.user_id, accountAccessCaseId: recovery.case_id,
            previousPhoneE164: user.phone_e164, securityHoldUntil: holdUntil },
          metadata: { policyVersion: ACCOUNT_ACCESS_POLICY_VERSION } }],
        audit: { auditId: ids.auditId, action: 'APPROVE_PHONE_CHANGE', transitionId: 'AR-02',
          reasonCode: null, beforeState: recovery.state, afterState: 'SECURITY_HOLD',
          metadata: { userId: recovery.user_id, securityHoldUntil: holdUntil } },
        outbox: [{ messageId: ids.outboxMessageId,
          topic: 'identity.account-recovery.phone-changed.v1', sourceEventId: userEventId,
          payload: { caseId: response.caseId, userId: response.userId,
            securityHoldUntil: holdUntil } }] };
    } });
}

export async function completeVerifiedRecovery(
  database: Kysely<Database>, command: CommandEnvelope<CompleteVerifiedRecoveryPayload>,
  ids: AccountAccessEffectIds, now?: () => Date,
): Promise<ExecutedCommand<AccountAccessCaseProjection>> {
  if (command.commandType !== 'COMPLETE_VERIFIED_RECOVERY'
    || command.aggregateType !== 'AccountAccessCase'
    || command.aggregateId !== command.payload.caseId) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_INVALID_STATE');
  }
  return executeCriticalCommand(database, { command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      await assertCentralWhenUser(transaction, command.actor);
      const recovery = await accessCaseRow(transaction, command.aggregateId, true);
      if (!recovery) throw new AccountAccessConflictError('ACCOUNT_ACCESS_INVALID_STATE');
      assertVerifiedRecoveryCanBeCompleted({ actor: command.actor, state: recovery.state,
        route: recovery.recovery_route,
        verifiedRouteSucceeded: command.payload.verifiedRouteSucceeded });
      const occurredAt = context.occurredAt.toISOString();
      await sql`update identity.account_access_cases set state = 'COMPLETED',
          completed_at = ${occurredAt}::timestamptz, version = ${context.nextVersion},
          updated_at = ${occurredAt}::timestamptz
        where case_id = ${recovery.case_id}::uuid`.execute(transaction);
      const response = accessProjection((await accessCaseRow(transaction, recovery.case_id))!);
      return { responseStatus: 200, response,
        event: { eventId: ids.eventId, eventName: 'AccountRecoveryCompleted',
          schemaVersion: 1, transitionId: 'AR-03',
          payload: { caseId: response.caseId, userId: response.userId },
          metadata: { policyVersion: ACCOUNT_ACCESS_POLICY_VERSION } },
        audit: { auditId: ids.auditId, action: 'COMPLETE_VERIFIED_RECOVERY',
          transitionId: 'AR-03', reasonCode: null, beforeState: recovery.state,
          afterState: 'COMPLETED', metadata: { userId: recovery.user_id } },
        outbox: [{ messageId: ids.outboxMessageId,
          topic: 'identity.account-recovery.completed.v1',
          payload: { caseId: response.caseId, userId: response.userId } }] };
    } });
}

export async function expirePhoneChangeSecurityHold(
  database: Kysely<Database>, command: CommandEnvelope<ExpirePhoneChangeHoldPayload>,
  ids: AccountAccessEffectIds, now?: () => Date,
): Promise<ExecutedCommand<AccountAccessCaseProjection>> {
  if (command.commandType !== 'EXPIRE_SECURITY_HOLD'
    || command.aggregateType !== 'AccountAccessCase'
    || command.aggregateId !== command.payload.caseId) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_INVALID_STATE');
  }
  return executeCriticalCommand(database, { command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const recovery = await accessCaseRow(transaction, command.aggregateId, true);
      if (!recovery) throw new AccountAccessConflictError('ACCOUNT_ACCESS_INVALID_STATE');
      const duplicateResult = await sql<{ readonly present: boolean }>`select true as present
        from identity.duplicate_account_case_users where user_id = ${recovery.user_id}::uuid
          and live limit 1`.execute(transaction);
      assertPhoneChangeHoldCanExpire({ actor: command.actor, state: recovery.state,
        securityHoldUntil: recovery.security_hold_until, occurredAt: context.occurredAt,
        hasUnresolvedRisk: duplicateResult.rows[0]?.present ?? false });
      const occurredAt = context.occurredAt.toISOString();
      await sql`update identity.account_access_cases set state = 'COMPLETED',
          completed_at = ${occurredAt}::timestamptz, version = ${context.nextVersion},
          updated_at = ${occurredAt}::timestamptz
        where case_id = ${recovery.case_id}::uuid`.execute(transaction);
      await sql`update identity.user_sensitive_action_holds set state = 'RELEASED',
          released_at = ${occurredAt}::timestamptz, version = version + 1,
          updated_at = ${occurredAt}::timestamptz
        where source_case_id = ${recovery.case_id}::uuid and state = 'ACTIVE'`.execute(transaction);
      await sql`update identity.trusted_sessions set state = 'REVOKED',
          revoked_at = ${occurredAt}::timestamptz, updated_at = ${occurredAt}::timestamptz
        where user_id = ${recovery.user_id}::uuid and state = 'TRUSTED'`.execute(transaction);
      const response = accessProjection((await accessCaseRow(transaction, recovery.case_id))!);
      return { responseStatus: 200, response,
        event: { eventId: ids.eventId, eventName: 'AccountRecoveryCompleted',
          schemaVersion: 1, transitionId: 'AR-04',
          payload: { caseId: response.caseId, userId: response.userId },
          metadata: { policyVersion: ACCOUNT_ACCESS_POLICY_VERSION } },
        audit: { auditId: ids.auditId, action: 'EXPIRE_SECURITY_HOLD', transitionId: 'AR-04',
          reasonCode: null, beforeState: recovery.state, afterState: 'COMPLETED',
          metadata: { userId: recovery.user_id, obsoleteTrustedSessionsRevoked: true } },
        outbox: [{ messageId: ids.outboxMessageId,
          topic: 'identity.account-recovery.security-hold-expired.v1',
          payload: { caseId: response.caseId, userId: response.userId } }] };
    } });
}

export async function rejectAccountRecovery(
  database: Kysely<Database>, command: CommandEnvelope<RejectAccountRecoveryPayload>,
  ids: AccountAccessEffectIds, now?: () => Date,
): Promise<ExecutedCommand<AccountAccessCaseProjection>> {
  if (command.commandType !== 'REJECT_RECOVERY'
    || command.aggregateType !== 'AccountAccessCase'
    || command.aggregateId !== command.payload.caseId) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_INVALID_STATE');
  }
  return executeCriticalCommand(database, { command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      await assertCentralWhenUser(transaction, command.actor);
      const recovery = await accessCaseRow(transaction, command.aggregateId, true);
      if (!recovery) throw new AccountAccessConflictError('ACCOUNT_ACCESS_INVALID_STATE');
      assertAccountRecoveryCanBeRejected({ actor: command.actor, state: recovery.state,
        reason: command.payload.reason });
      const occurredAt = context.occurredAt.toISOString();
      await sql`update identity.account_access_cases set state = 'REJECTED',
          reviewed_by = ${command.actor.id}::uuid, decision_reason = ${command.payload.reason.trim()},
          decision_at = ${occurredAt}::timestamptz, version = ${context.nextVersion},
          updated_at = ${occurredAt}::timestamptz
        where case_id = ${recovery.case_id}::uuid`.execute(transaction);
      const response = accessProjection((await accessCaseRow(transaction, recovery.case_id))!);
      return { responseStatus: 200, response,
        event: { eventId: ids.eventId, eventName: 'AccountRecoveryRejected', schemaVersion: 1,
          transitionId: 'AR-05', payload: { caseId: response.caseId, userId: response.userId },
          metadata: { policyVersion: ACCOUNT_ACCESS_POLICY_VERSION } },
        audit: { auditId: ids.auditId, action: 'REJECT_RECOVERY', transitionId: 'AR-05',
          reasonCode: null, beforeState: recovery.state, afterState: 'REJECTED',
          metadata: { userId: recovery.user_id } },
        outbox: [{ messageId: ids.outboxMessageId,
          topic: 'identity.account-recovery.rejected.v1',
          payload: { caseId: response.caseId, userId: response.userId } }] };
    } });
}

export async function confirmAccessIncident(
  database: Kysely<Database>, command: CommandEnvelope<ConfirmAccessIncidentPayload>,
  ids: AccountAccessEffectIds, now?: () => Date,
): Promise<ExecutedCommand<AccountAccessCaseProjection>> {
  if (command.commandType !== 'CONFIRM_ACCESS_INCIDENT'
    || command.aggregateType !== 'AccountAccessCase'
    || command.aggregateId !== command.payload.caseId) {
    throw new AccountAccessConflictError('ACCOUNT_ACCESS_INVALID_STATE');
  }
  return executeCriticalCommand(database, { command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      await assertCentralWhenUser(transaction, command.actor);
      const recovery = await accessCaseRow(transaction, command.aggregateId, true);
      if (!recovery) throw new AccountAccessConflictError('ACCOUNT_ACCESS_INVALID_STATE');
      const startedAt = new Date(command.payload.incidentStartedAt);
      const endedAt = new Date(command.payload.incidentEndedAt);
      const affected = [...new Set(command.payload.affectedProcessIds)].sort();
      assertAccessIncidentCanBeConfirmed({ actor: command.actor, state: recovery.state,
        incidentStartedAt: startedAt, incidentEndedAt: endedAt,
        affectedProcessIds: affected, reason: command.payload.reason });
      const affectedResult = await sql<{ readonly process_id: string }>`
        select challenge.challenge_id as process_id from competition.challenges as challenge
        where challenge.challenge_id = any(${affected}::uuid[])
          and ${recovery.user_id}::uuid in (challenge.initiator_user_id, challenge.recipient_user_id)
        union select session.session_id as process_id from scheduling.sessions as session
        where session.session_id = any(${affected}::uuid[])
          and ${recovery.user_id}::uuid in (session.pair_low_id, session.pair_high_id)`
        .execute(transaction);
      if (affectedResult.rows.length !== affected.length) {
        throw new AccountAccessConflictError('ACCOUNT_ACCESS_AFFECTED_PROCESS_REQUIRED');
      }
      const occurredAt = context.occurredAt.toISOString();
      await sql`update identity.account_access_cases set
          incident_started_at = ${startedAt.toISOString()}::timestamptz,
          incident_ended_at = ${endedAt.toISOString()}::timestamptz,
          incident_reason = ${command.payload.reason.trim()}, affected_process_ids = ${affected}::uuid[],
          incident_confirmed_by = ${command.actor.id}::uuid,
          incident_confirmed_at = ${occurredAt}::timestamptz,
          version = ${context.nextVersion}, updated_at = ${occurredAt}::timestamptz
        where case_id = ${recovery.case_id}::uuid`.execute(transaction);
      const response = accessProjection((await accessCaseRow(transaction, recovery.case_id))!);
      return { responseStatus: 200, response,
        event: { eventId: ids.eventId, eventName: 'AccountAccessIncidentConfirmed',
          schemaVersion: 1, transitionId: 'AR-06',
          payload: { caseId: response.caseId, userId: response.userId,
            incidentStartedAt: response.incidentStartedAt, incidentEndedAt: response.incidentEndedAt,
            affectedProcessIds: response.affectedProcessIds },
          metadata: { policyVersion: ACCOUNT_ACCESS_POLICY_VERSION } },
        audit: { auditId: ids.auditId, action: 'CONFIRM_ACCESS_INCIDENT',
          transitionId: 'AR-06', reasonCode: null, beforeState: recovery.state,
          afterState: recovery.state, metadata: { userId: recovery.user_id,
            affectedProcessIds: affected } },
        outbox: [{ messageId: ids.outboxMessageId,
          topic: 'identity.account-access.incident-confirmed.v1',
          payload: { caseId: response.caseId, userId: response.userId,
            affectedProcessIds: affected } }] };
    } });
}

async function affectedDuplicateProcesses(
  database: Kysely<Database> | Transaction<Database>, userIds: readonly string[],
): Promise<readonly DuplicateAccountProcessProjection[]> {
  const result = await sql<DuplicateProcessRow>`
    select 'STATUS'::text as process_kind, status.competition_id as aggregate_id,
      status.owner_user_id as current_owner_user_id, null::text as decision
    from (
      select competition_id, champion_user_id as owner_user_id from competition.competitions
      where champion_user_id = any(${[...userIds]}::uuid[])
      union
      select competition_id, contender_user_id as owner_user_id from competition.competitions
      where contender_user_id = any(${[...userIds]}::uuid[])
    ) as status
    union all
    select 'OBLIGATION'::text as process_kind, obligation.challenge_id as aggregate_id,
      obligation.user_id as current_owner_user_id, null::text as decision
    from competition.challenge_participant_obligations as obligation
    where obligation.user_id = any(${[...userIds]}::uuid[]) and obligation.released_at is null
    order by process_kind, aggregate_id, current_owner_user_id
  `.execute(database);
  return result.rows.map((item) => ({ kind: item.process_kind,
    aggregateId: item.aggregate_id, currentOwnerUserId: item.current_owner_user_id,
    decision: item.decision }));
}

export async function openDuplicateAccountReview(
  database: Kysely<Database>, command: CommandEnvelope<OpenDuplicateAccountReviewPayload>,
  ids: DuplicateAccountEffectIds, now?: () => Date,
): Promise<ExecutedCommand<DuplicateAccountCaseProjection>> {
  if (command.commandType !== 'OPEN_DUPLICATE_REVIEW'
    || command.aggregateType !== 'DuplicateAccountCase') {
    throw new AccountAccessConflictError('DUPLICATE_ACCOUNT_INVALID_STATE');
  }
  return executeCriticalCommand(database, { command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      await assertCentralWhenUser(transaction, command.actor);
      const userIds = [...new Set(command.payload.userIds)].sort();
      const signalReferences = [...new Set(command.payload.signalReferences
        .map((item) => item.trim()).filter(Boolean))].sort();
      assertDuplicateReviewCanBeOpened({ actor: command.actor, userIds, signalReferences,
        reason: command.payload.reason });
      const users = await sql<{ readonly user_id: string }>`select user_id from identity.users
        where user_id = any(${userIds}::uuid[]) and account_state <> 'CLOSED'
        order by user_id for update`.execute(transaction);
      if (users.rows.length !== userIds.length) {
        throw new AccountAccessConflictError('DUPLICATE_ACCOUNT_USERS_REQUIRED');
      }
      const live = await sql<{ readonly user_id: string }>`select user_id
        from identity.duplicate_account_case_users where user_id = any(${userIds}::uuid[])
          and live limit 1`.execute(transaction);
      if (live.rows[0]) {
        throw new AccountAccessConflictError('DUPLICATE_ACCOUNT_INVALID_STATE');
      }
      const processes = await affectedDuplicateProcesses(transaction, userIds);
      const holdTargets = [...new Map(processes.map((process) => [
        `${process.kind}:${process.aggregateId}`,
        { aggregateType: process.kind === 'STATUS' ? 'COMPETITION' : 'CHALLENGE',
          aggregateId: process.aggregateId },
      ])).values()].sort((left, right) =>
        `${left.aggregateType}:${left.aggregateId}`.localeCompare(
          `${right.aggregateType}:${right.aggregateId}`));
      const holdIds = ids.processHoldIds ?? [];
      if (holdIds.length !== holdTargets.length) {
        throw new TypeError('One duplicate-account process hold ID is required per affected aggregate');
      }
      const occurredAt = context.occurredAt.toISOString();
      await sql`insert into identity.duplicate_account_cases (
          case_id, state, signal_references, request_reason, requested_by,
          requested_by_type, requested_at, policy_version, version, updated_at
        ) values (${command.aggregateId}::uuid, 'UNDER_REVIEW', ${signalReferences}::text[],
          ${command.payload.reason.trim()}, ${command.actor.id}::uuid, ${command.actor.type},
          ${occurredAt}::timestamptz, ${ACCOUNT_ACCESS_POLICY_VERSION},
          ${context.nextVersion}, ${occurredAt}::timestamptz)`.execute(transaction);
      for (const userId of userIds) {
        await sql`insert into identity.duplicate_account_case_users (case_id, user_id, live)
          values (${command.aggregateId}::uuid, ${userId}::uuid, true)`.execute(transaction);
      }
      for (const process of processes) {
        await sql`insert into identity.duplicate_account_processes (
            case_id, process_kind, aggregate_id, current_owner_user_id
          ) values (${command.aggregateId}::uuid, ${process.kind},
            ${process.aggregateId}::uuid, ${process.currentOwnerUserId}::uuid)`
          .execute(transaction);
      }
      for (const [index, target] of holdTargets.entries()) {
        await sql`insert into competition.process_holds (
            hold_id, aggregate_type, aggregate_id, reason, state, deadline_policy,
            duplicate_account_case_id, created_by, created_by_type, started_at, version, updated_at
          ) values (${holdIds[index]}::uuid, ${target.aggregateType}, ${target.aggregateId}::uuid,
            'DUPLICATE_ACCOUNT', 'ACTIVE', 'PAUSE', ${command.aggregateId}::uuid,
            ${command.actor.id}::uuid, ${command.actor.type}, ${occurredAt}::timestamptz,
            1, ${occurredAt}::timestamptz)`.execute(transaction);
      }
      const response = await duplicateProjection(transaction,
        (await duplicateCaseRow(transaction, command.aggregateId))!);
      return { responseStatus: 201, response,
        event: { eventId: ids.eventId, eventName: 'DuplicateAccountReviewStarted',
          schemaVersion: 1, transitionId: 'DA-01',
          payload: { caseId: response.caseId, userIds: response.userIds,
            affectedProcesses: response.processes, processHoldCount: holdTargets.length },
          metadata: { policyVersion: ACCOUNT_ACCESS_POLICY_VERSION } },
        audit: { auditId: ids.auditId, action: 'OPEN_DUPLICATE_REVIEW',
          transitionId: 'DA-01', reasonCode: null, beforeState: null,
          afterState: 'UNDER_REVIEW', metadata: { userIds, processHoldCount: holdTargets.length } },
        outbox: [{ messageId: ids.outboxMessageId,
          topic: 'identity.duplicate-account.review-opened.v1',
          payload: { caseId: response.caseId, userIds, processHoldCount: holdTargets.length } }] };
    } });
}

export async function clearDuplicateAccountReview(
  database: Kysely<Database>, command: CommandEnvelope<ClearDuplicateAccountReviewPayload>,
  ids: DuplicateAccountEffectIds, now?: () => Date,
): Promise<ExecutedCommand<DuplicateAccountCaseProjection>> {
  if (command.commandType !== 'CLEAR_DUPLICATE_SIGNAL'
    || command.aggregateType !== 'DuplicateAccountCase'
    || command.aggregateId !== command.payload.caseId) {
    throw new AccountAccessConflictError('DUPLICATE_ACCOUNT_INVALID_STATE');
  }
  return executeCriticalCommand(database, { command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      await assertCentralWhenUser(transaction, command.actor);
      const duplicate = await duplicateCaseRow(transaction, command.aggregateId, true);
      if (!duplicate) throw new AccountAccessConflictError('DUPLICATE_ACCOUNT_INVALID_STATE');
      assertDuplicateReviewCanBeCleared({ actor: command.actor, state: duplicate.state,
        reason: command.payload.reason });
      const occurredAt = context.occurredAt.toISOString();
      await sql`update identity.duplicate_account_cases set state = 'CLEARED',
          reviewed_by = ${command.actor.id}::uuid, decision_reason = ${command.payload.reason.trim()},
          decided_at = ${occurredAt}::timestamptz, version = ${context.nextVersion},
          updated_at = ${occurredAt}::timestamptz
        where case_id = ${duplicate.case_id}::uuid`.execute(transaction);
      await sql`update identity.duplicate_account_case_users set live = false
        where case_id = ${duplicate.case_id}::uuid`.execute(transaction);
      const released = await sql`update competition.process_holds set state = 'RELEASED',
          released_by = ${command.actor.id}::uuid, released_at = ${occurredAt}::timestamptz,
          version = version + 1, updated_at = ${occurredAt}::timestamptz
        where duplicate_account_case_id = ${duplicate.case_id}::uuid and state = 'ACTIVE'
        returning hold_id`.execute(transaction);
      const response = await duplicateProjection(transaction,
        (await duplicateCaseRow(transaction, duplicate.case_id))!);
      return { responseStatus: 200, response,
        event: { eventId: ids.eventId, eventName: 'DuplicateAccountCleared',
          schemaVersion: 1, transitionId: 'DA-02',
          payload: { caseId: response.caseId, releasedProcessHoldCount: released.rows.length },
          metadata: { policyVersion: ACCOUNT_ACCESS_POLICY_VERSION } },
        audit: { auditId: ids.auditId, action: 'CLEAR_DUPLICATE_SIGNAL',
          transitionId: 'DA-02', reasonCode: null, beforeState: duplicate.state,
          afterState: 'CLEARED', metadata: { releasedProcessHoldCount: released.rows.length } },
        outbox: [{ messageId: ids.outboxMessageId,
          topic: 'identity.duplicate-account.signal-cleared.v1',
          payload: { caseId: response.caseId, releasedProcessHoldCount: released.rows.length } }] };
    } });
}

export async function resolveDuplicateAccountReview(
  database: Kysely<Database>, command: CommandEnvelope<ResolveDuplicateAccountReviewPayload>,
  ids: DuplicateAccountEffectIds, now?: () => Date,
): Promise<ExecutedCommand<DuplicateAccountCaseProjection>> {
  if (command.commandType !== 'RESOLVE_DUPLICATE'
    || command.aggregateType !== 'DuplicateAccountCase'
    || command.aggregateId !== command.payload.caseId) {
    throw new AccountAccessConflictError('DUPLICATE_ACCOUNT_INVALID_STATE');
  }
  return executeCriticalCommand(database, { command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      await assertCentralWhenUser(transaction, command.actor);
      const duplicate = await duplicateCaseRow(transaction, command.aggregateId, true);
      if (!duplicate) throw new AccountAccessConflictError('DUPLICATE_ACCOUNT_INVALID_STATE');
      const before = await duplicateProjection(transaction, duplicate);
      assertDuplicateReviewCanBeResolved({ actor: command.actor, state: duplicate.state,
        userIds: before.userIds, canonicalUserId: command.payload.canonicalUserId,
        affectedProcesses: before.processes, dispositions: command.payload.dispositions,
        reason: command.payload.reason });
      const users = await sql<{ readonly user_id: string; readonly account_state: string;
        readonly version: string }>`select user_id, account_state, version::text as version
        from identity.users where user_id = any(${[...before.userIds]}::uuid[])
        order by user_id for update`.execute(transaction);
      const canonical = users.rows.find((item) => item.user_id === command.payload.canonicalUserId);
      if (!canonical || canonical.account_state === 'CLOSED') {
        throw new AccountAccessConflictError('DUPLICATE_ACCOUNT_CANONICAL_REQUIRED');
      }
      const duplicates = users.rows.filter((item) => item.user_id !== canonical.user_id);
      const aliasIds = ids.aliasIds ?? [];
      const userEventIds = ids.userEventIds ?? [];
      if (aliasIds.length !== duplicates.length || userEventIds.length !== duplicates.length) {
        throw new TypeError('One private alias and User event ID is required per duplicate User');
      }
      const occurredAt = context.occurredAt.toISOString();
      for (const disposition of command.payload.dispositions) {
        await sql`update identity.duplicate_account_processes set decision = ${disposition.decision}
          where case_id = ${duplicate.case_id}::uuid and process_kind = ${disposition.kind}
            and aggregate_id = ${disposition.aggregateId}::uuid
            and current_owner_user_id = ${disposition.currentOwnerUserId}::uuid`
          .execute(transaction);
      }
      const relatedEvents = [];
      for (const [index, duplicateUser] of duplicates.entries()) {
        const userVersion = Number(duplicateUser.version) + 1;
        await sql`update identity.users set account_state = 'RESTRICTED',
            version = ${userVersion}, updated_at = ${occurredAt}::timestamptz
          where user_id = ${duplicateUser.user_id}::uuid`.execute(transaction);
        await sql`insert into identity.duplicate_account_aliases (
            alias_id, case_id, canonical_user_id, duplicate_user_id, created_at
          ) values (${aliasIds[index]}::uuid, ${duplicate.case_id}::uuid,
            ${canonical.user_id}::uuid, ${duplicateUser.user_id}::uuid,
            ${occurredAt}::timestamptz)`.execute(transaction);
        relatedEvents.push({ eventId: userEventIds[index]!,
          eventName: 'DuplicateAccountRestricted', schemaVersion: 1,
          aggregateType: 'User', aggregateId: duplicateUser.user_id,
          aggregateVersion: userVersion, transitionId: 'DA-03',
          payload: { userId: duplicateUser.user_id, canonicalUserId: canonical.user_id,
            duplicateAccountCaseId: duplicate.case_id },
          metadata: { policyVersion: ACCOUNT_ACCESS_POLICY_VERSION } });
      }
      await sql`update identity.duplicate_account_cases set state = 'RESOLVED',
          canonical_user_id = ${canonical.user_id}::uuid, reviewed_by = ${command.actor.id}::uuid,
          decision_reason = ${command.payload.reason.trim()}, decided_at = ${occurredAt}::timestamptz,
          version = ${context.nextVersion}, updated_at = ${occurredAt}::timestamptz
        where case_id = ${duplicate.case_id}::uuid`.execute(transaction);
      await sql`update identity.duplicate_account_case_users set live = false
        where case_id = ${duplicate.case_id}::uuid`.execute(transaction);
      const released = await sql`update competition.process_holds as process_hold
          set state = 'RELEASED', released_by = ${command.actor.id}::uuid,
            released_at = ${occurredAt}::timestamptz, version = process_hold.version + 1,
            updated_at = ${occurredAt}::timestamptz
        where process_hold.duplicate_account_case_id = ${duplicate.case_id}::uuid
          and process_hold.state = 'ACTIVE' and not exists (
            select 1 from identity.duplicate_account_processes as process
            where process.case_id = ${duplicate.case_id}::uuid
              and process.aggregate_id = process_hold.aggregate_id
              and process.decision = 'SEPARATE_GOVERNED_REVIEW'
          ) returning process_hold.hold_id`.execute(transaction);
      const response = await duplicateProjection(transaction,
        (await duplicateCaseRow(transaction, duplicate.case_id))!);
      return { responseStatus: 200, response,
        event: { eventId: ids.eventId, eventName: 'DuplicateAccountResolved',
          schemaVersion: 1, transitionId: 'DA-03',
          payload: { caseId: response.caseId, canonicalUserId: response.canonicalUserId,
            duplicateUserIds: duplicates.map((item) => item.user_id),
            dispositions: response.processes, releasedProcessHoldCount: released.rows.length },
          metadata: { policyVersion: ACCOUNT_ACCESS_POLICY_VERSION } },
        relatedEvents,
        audit: { auditId: ids.auditId, action: 'RESOLVE_DUPLICATE', transitionId: 'DA-03',
          reasonCode: null, beforeState: duplicate.state, afterState: 'RESOLVED',
          metadata: { canonicalUserId: canonical.user_id,
            duplicateUserIds: duplicates.map((item) => item.user_id),
            releasedProcessHoldCount: released.rows.length } },
        outbox: [{ messageId: ids.outboxMessageId,
          topic: 'identity.duplicate-account.resolved.v1',
          payload: { caseId: response.caseId, canonicalUserId: response.canonicalUserId,
            duplicateUserIds: duplicates.map((item) => item.user_id) } }] };
    } });
}

export async function listAccountRecoveryCasesForCentral(
  database: Kysely<Database>, actorUserId: string,
): Promise<readonly AccountAccessCaseProjection[]> {
  await assertCentralGrant(database, actorUserId);
  const result = await sql<AccessCaseRow>`select case_id, user_id, state, recovery_route,
      recovery_signals, requested_phone_e164, requested_at, security_hold_until,
      incident_started_at, incident_ended_at, affected_process_ids, completed_at,
      version::text as version from identity.account_access_cases
    where state in ('PENDING', 'SECURITY_HOLD')
    order by requested_at, case_id`.execute(database);
  return result.rows.map(accessProjection);
}

export async function listDuplicateAccountCasesForCentral(
  database: Kysely<Database>, actorUserId: string,
): Promise<readonly DuplicateAccountCaseProjection[]> {
  await assertCentralGrant(database, actorUserId);
  const result = await sql<DuplicateCaseRow>`select case_id, state, signal_references,
      canonical_user_id, requested_at, decided_at, version::text as version
    from identity.duplicate_account_cases where state = 'UNDER_REVIEW'
    order by requested_at, case_id`.execute(database);
  return Promise.all(result.rows.map((row) => duplicateProjection(database, row)));
}
