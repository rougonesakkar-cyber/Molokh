import { createHash } from 'node:crypto';

import {
  ACCOUNT_LIFECYCLE_POLICY_VERSION,
  AccountLifecycleConflictError,
  accountClosureRecoveryDeadline,
  accountExportExpiresAt,
  assertAccountClosureCanBeCancelled,
  assertAccountClosureCanBeExecuted,
  assertAccountClosureCanBeRequested,
  assertAccountExportCanBePrepared,
  assertAccountExportCanBeRequested,
  assertAccountExportCanExpire,
  projectIdentityCapabilities,
  type AccountClosureBlockers,
  type AccountClosureState,
  type AccountExportState,
  type CommandEnvelope,
  type IdentityProjection,
} from '@molokh/core';
import { type Kysely, type Transaction, sql } from 'kysely';

import type { Database } from './index.js';
import { executeCriticalCommand, type ExecutedCommand } from './platform-command.js';

export interface RequestAccountClosurePayload {
  readonly userId: string;
  readonly exportRequested: boolean;
}

export interface CancelAccountClosurePayload { readonly closureId: string }
export interface ExecuteAccountClosurePayload {
  readonly closureId: string;
  readonly userId: string;
  readonly reason: string;
}
export interface RequestAccountExportPayload {
  readonly userId: string;
  readonly closureId: string | null;
}
export interface PrepareAccountExportPayload { readonly exportId: string }
export interface ExpireAccountExportPayload { readonly exportId: string }

export interface AccountClosureEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly exportId?: string;
  readonly exportEventId?: string;
  readonly exportOutboxMessageId?: string;
}

export interface AccountExportEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
}

export interface ExecuteAccountClosureEffectIds extends AccountClosureEffectIds {
  readonly closureEventId: string;
}

export interface AccountClosureProjection {
  readonly closureId: string;
  readonly userId: string;
  readonly state: AccountClosureState;
  readonly exportRequested: boolean;
  readonly requestedAt: string;
  readonly recoveryUntil: string;
  readonly cancelledAt: string | null;
  readonly executedAt: string | null;
  readonly version: number;
}

export interface AccountExportProjection {
  readonly exportId: string;
  readonly userId: string;
  readonly closureId: string | null;
  readonly state: AccountExportState;
  readonly requestedAt: string;
  readonly readyAt: string | null;
  readonly expiresAt: string | null;
  readonly payloadSha256: string | null;
  readonly version: number;
}

export interface AccountLifecycleProjection {
  readonly closure: AccountClosureProjection | null;
  readonly dataExport: AccountExportProjection | null;
}

export interface CentralAccountClosureProjection extends AccountClosureProjection {
  readonly displayName: string;
  readonly accountState: IdentityProjection['accountState'];
  readonly userVersion: number;
  readonly blockers: AccountClosureBlockers;
  readonly executable: boolean;
}

interface ClosureRow {
  readonly closure_id: string;
  readonly user_id: string;
  readonly state: AccountClosureState;
  readonly export_requested: boolean;
  readonly requested_at: Date;
  readonly recovery_until: Date;
  readonly cancelled_at: Date | null;
  readonly executed_at: Date | null;
  readonly version: string;
}

interface ExportRow {
  readonly export_id: string;
  readonly user_id: string;
  readonly closure_id: string | null;
  readonly state: AccountExportState;
  readonly requested_at: Date;
  readonly ready_at: Date | null;
  readonly expires_at: Date | null;
  readonly payload_sha256: string | null;
  readonly export_payload?: unknown;
  readonly version: string;
}

interface UserRow {
  readonly user_id: string;
  readonly display_name: string;
  readonly age_division: IdentityProjection['ageDivision'];
  readonly account_state: IdentityProjection['accountState'];
  readonly phone_verified: boolean;
  readonly verification_state: IdentityProjection['accountVerificationState'];
  readonly primary_sport: string;
  readonly secondary_sport: string | null;
  readonly discovery_radius_km: number;
  readonly version: string;
}

function requiredId(ids: AccountClosureEffectIds, key: keyof AccountClosureEffectIds): string {
  const value = ids[key];
  if (!value) throw new TypeError(`Account lifecycle effect ID ${key} is required`);
  return value;
}

function closureProjection(row: ClosureRow): AccountClosureProjection {
  return {
    closureId: row.closure_id, userId: row.user_id, state: row.state,
    exportRequested: row.export_requested, requestedAt: row.requested_at.toISOString(),
    recoveryUntil: row.recovery_until.toISOString(),
    cancelledAt: row.cancelled_at?.toISOString() ?? null,
    executedAt: row.executed_at?.toISOString() ?? null, version: Number(row.version),
  };
}

function exportProjection(row: ExportRow): AccountExportProjection {
  return {
    exportId: row.export_id, userId: row.user_id, closureId: row.closure_id,
    state: row.state, requestedAt: row.requested_at.toISOString(),
    readyAt: row.ready_at?.toISOString() ?? null,
    expiresAt: row.expires_at?.toISOString() ?? null,
    payloadSha256: row.payload_sha256, version: Number(row.version),
  };
}

function identityProjection(row: UserRow, displayName = row.display_name,
  accountState = row.account_state, version = Number(row.version)): IdentityProjection {
  return projectIdentityCapabilities({
    userId: row.user_id, displayName, ageDivision: row.age_division, accountState,
    phoneVerified: accountState === 'CLOSED' ? false : row.phone_verified,
    accountVerificationState: row.verification_state,
    primarySport: row.primary_sport, secondarySport: row.secondary_sport,
    discoveryRadiusKm: row.discovery_radius_km, version,
  });
}

async function userRow(database: Kysely<Database> | Transaction<Database>, userId: string,
  lock = false): Promise<UserRow | null> {
  const query = sql<UserRow>`
    select users.user_id, users.display_name, users.age_division, users.account_state,
      (users.phone_verified_at is not null) as phone_verified,
      coalesce(verification.state, 'NOT_STARTED') as verification_state,
      profile.primary_sport, profile.secondary_sport, profile.discovery_radius_km,
      users.version::text as version
    from identity.users as users
    join identity.athlete_profiles as profile on profile.user_id = users.user_id
    left join identity.account_verifications as verification
      on verification.user_id = users.user_id and verification.is_current
    where users.user_id = ${userId}::uuid
    ${lock ? sql`for update of users` : sql``}
  `;
  return (await query.execute(database)).rows[0] ?? null;
}

async function closureRow(database: Kysely<Database> | Transaction<Database>, closureId: string,
  lock = false): Promise<ClosureRow | null> {
  const result = await sql<ClosureRow>`
    select closure_id, user_id, state, export_requested, requested_at, recovery_until,
      cancelled_at, executed_at, version::text as version
    from identity.account_closure_requests
    where closure_id = ${closureId}::uuid
    ${lock ? sql`for update` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function exportRow(database: Kysely<Database> | Transaction<Database>, exportId: string,
  lock = false, includePayload = false): Promise<ExportRow | null> {
  const result = await sql<ExportRow>`
    select export_id, user_id, closure_id, state, requested_at, ready_at, expires_at,
      payload_sha256, ${includePayload ? sql`export_payload,` : sql``}
      version::text as version
    from identity.account_data_exports
    where export_id = ${exportId}::uuid
    ${lock ? sql`for update` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function liveExportRow(database: Kysely<Database> | Transaction<Database>, userId: string,
  lock = false): Promise<ExportRow | null> {
  const result = await sql<ExportRow>`
    select export_id, user_id, closure_id, state, requested_at, ready_at, expires_at,
      payload_sha256, version::text as version
    from identity.account_data_exports
    where user_id = ${userId}::uuid and state in ('REQUESTED', 'READY')
    order by requested_at desc, export_id desc
    limit 1
    ${lock ? sql`for update` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function assertCentralGrant(database: Kysely<Database> | Transaction<Database>,
  actorId: string): Promise<void> {
  const result = await sql<{ readonly allowed: boolean }>`
    select true as allowed from community.role_grants
    where user_id = ${actorId}::uuid and role = 'CENTRAL_ADMIN'
      and scope_type = 'GLOBAL' and scope_id is null and state = 'ACTIVE'
    limit 1
  `.execute(database);
  if (!result.rows[0]?.allowed) {
    throw new AccountLifecycleConflictError('ACCOUNT_LIFECYCLE_CENTRAL_REQUIRED');
  }
}

async function closureBlockers(database: Kysely<Database> | Transaction<Database>,
  userId: string): Promise<AccountClosureBlockers> {
  const result = await sql<{
    readonly active_obligations: string; readonly held_status: string;
    readonly active_sessions: string; readonly active_memberships: string;
    readonly active_roles: string; readonly active_queue_entries: string;
  }>`
    select
      (select count(*)::text from competition.challenge_participant_obligations
        where user_id = ${userId}::uuid and released_at is null) as active_obligations,
      (select count(*)::text from competition.competitions
        where champion_user_id = ${userId}::uuid or contender_user_id = ${userId}::uuid)
        as held_status,
      (select count(*)::text from scheduling.sessions
        where (${userId}::uuid in (pair_low_id, pair_high_id) or coach_user_id = ${userId}::uuid)
          and state in ('SCHEDULED', 'READY_FOR_COACH', 'IN_PROGRESS')) as active_sessions,
      (select count(*)::text from community.community_memberships
        where user_id = ${userId}::uuid and state in ('PENDING', 'ACTIVE', 'UNDER_REVIEW'))
        as active_memberships,
      (select count(*)::text from community.role_grants
        where user_id = ${userId}::uuid and state in ('PENDING', 'ACTIVE')) as active_roles,
      (select count(*)::text from competition.challenge_queue_entries
        where initiator_user_id = ${userId}::uuid
          and state in ('WAITING', 'PAIRED_PENDING_ACCEPTANCE', 'RECONFIRMATION_REQUIRED', 'ACTIVATED'))
        as active_queue_entries
  `.execute(database);
  const row = result.rows[0]!;
  return {
    activeObligationCount: Number(row.active_obligations),
    heldStatusCount: Number(row.held_status), activeSessionCount: Number(row.active_sessions),
    activeMembershipCount: Number(row.active_memberships), activeRoleCount: Number(row.active_roles),
    activeQueueEntryCount: Number(row.active_queue_entries),
  };
}

export async function readMyAccountLifecycle(
  database: Kysely<Database> | Transaction<Database>, userId: string,
):
Promise<AccountLifecycleProjection> {
  const closureResult = await sql<ClosureRow>`
    select closure_id, user_id, state, export_requested, requested_at, recovery_until,
      cancelled_at, executed_at, version::text as version
    from identity.account_closure_requests where user_id = ${userId}::uuid
    order by requested_at desc, closure_id desc limit 1
  `.execute(database);
  const exportResult = await sql<ExportRow>`
    select export_id, user_id, closure_id, state, requested_at, ready_at, expires_at,
      payload_sha256, version::text as version
    from identity.account_data_exports where user_id = ${userId}::uuid
    order by requested_at desc, export_id desc limit 1
  `.execute(database);
  return { closure: closureResult.rows[0] ? closureProjection(closureResult.rows[0]) : null,
    dataExport: exportResult.rows[0] ? exportProjection(exportResult.rows[0]) : null };
}

export async function requestAccountClosure(database: Kysely<Database>,
  command: CommandEnvelope<RequestAccountClosurePayload>, ids: AccountClosureEffectIds,
  now?: () => Date): Promise<ExecutedCommand<AccountLifecycleProjection>> {
  if (command.commandType !== 'REQUEST_ACCOUNT_CLOSURE'
    || command.aggregateType !== 'AccountClosureRequest'
    || command.payload.userId !== command.actor.id) {
    throw new AccountLifecycleConflictError('ACCOUNT_LIFECYCLE_USER_REQUIRED');
  }
  return executeCriticalCommand(database, { command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const user = await userRow(transaction, command.payload.userId, true);
      if (!user) throw new AccountLifecycleConflictError('ACCOUNT_NOT_CLOSABLE');
      assertAccountClosureCanBeRequested({ accountState: user.account_state,
        actor: command.actor, userId: user.user_id });
      const live = await sql<{ readonly present: boolean }>`select true as present
        from identity.account_closure_requests where user_id = ${user.user_id}::uuid
          and state = 'REQUESTED' limit 1`.execute(transaction);
      if (live.rows[0]?.present) {
        throw new AccountLifecycleConflictError('ACCOUNT_CLOSURE_INVALID_STATE');
      }
      const occurredAt = context.occurredAt.toISOString();
      const recoveryUntil = accountClosureRecoveryDeadline(context.occurredAt).toISOString();
      await sql`insert into identity.account_closure_requests (
        closure_id, user_id, state, export_requested, recovery_until, requested_at,
        policy_version, version, updated_at
      ) values (${command.aggregateId}::uuid, ${user.user_id}::uuid, 'REQUESTED',
        ${command.payload.exportRequested}, ${recoveryUntil}::timestamptz,
        ${occurredAt}::timestamptz, ${ACCOUNT_LIFECYCLE_POLICY_VERSION},
        ${context.nextVersion}, ${occurredAt}::timestamptz)`.execute(transaction);
      let dataExport: AccountExportProjection | null = null;
      let createdExport = false;
      if (command.payload.exportRequested) {
        const existingExport = await liveExportRow(transaction, user.user_id, true);
        if (existingExport) {
          dataExport = exportProjection(existingExport);
        } else {
          const exportId = requiredId(ids, 'exportId');
          await sql`insert into identity.account_data_exports (
            export_id, user_id, closure_id, state, requested_at, policy_version, version, updated_at
          ) values (${exportId}::uuid, ${user.user_id}::uuid, ${command.aggregateId}::uuid,
            'REQUESTED', ${occurredAt}::timestamptz, ${ACCOUNT_LIFECYCLE_POLICY_VERSION}, 1,
            ${occurredAt}::timestamptz)`.execute(transaction);
          dataExport = exportProjection((await exportRow(transaction, exportId))!);
          createdExport = true;
        }
      }
      const closure = closureProjection((await closureRow(transaction, command.aggregateId))!);
      return { responseStatus: 201, response: { closure, dataExport },
        event: { eventId: ids.eventId, eventName: 'AccountClosureRequested', schemaVersion: 1,
          transitionId: null, payload: { closureId: closure.closureId, userId: closure.userId,
            recoveryUntil: closure.recoveryUntil, exportRequested: closure.exportRequested },
          metadata: { policyVersion: ACCOUNT_LIFECYCLE_POLICY_VERSION } },
        ...(dataExport && createdExport ? { relatedEvents: [{ eventId: requiredId(ids, 'exportEventId'),
          eventName: 'AccountDataExportRequested', schemaVersion: 1,
          aggregateType: 'AccountDataExport', aggregateId: dataExport.exportId,
          aggregateVersion: 1, transitionId: null,
          payload: { exportId: dataExport.exportId, userId: user.user_id,
            closureId: closure.closureId },
          metadata: { policyVersion: ACCOUNT_LIFECYCLE_POLICY_VERSION } }] } : {}),
        audit: { auditId: ids.auditId, action: 'REQUEST_ACCOUNT_CLOSURE', transitionId: null,
          reasonCode: null, beforeState: user.account_state, afterState: user.account_state,
          metadata: { recoveryUntil, exportRequested: command.payload.exportRequested } },
        outbox: [{ messageId: ids.outboxMessageId, topic: 'identity.account-closure.requested.v1',
          payload: { closureId: closure.closureId, userId: user.user_id, recoveryUntil } },
        ...(dataExport && createdExport ? [{ messageId: requiredId(ids, 'exportOutboxMessageId'),
          sourceEventId: requiredId(ids, 'exportEventId'),
          topic: 'identity.account-export.requested.v1', payload: { exportId: dataExport.exportId,
            userId: user.user_id } }] : [])] };
    } });
}

export async function cancelAccountClosure(database: Kysely<Database>,
  command: CommandEnvelope<CancelAccountClosurePayload>, ids: AccountClosureEffectIds,
  now?: () => Date): Promise<ExecutedCommand<AccountLifecycleProjection>> {
  if (command.commandType !== 'CANCEL_ACCOUNT_CLOSURE'
    || command.aggregateType !== 'AccountClosureRequest'
    || command.aggregateId !== command.payload.closureId) {
    throw new AccountLifecycleConflictError('ACCOUNT_CLOSURE_INVALID_STATE');
  }
  return executeCriticalCommand(database, { command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await closureRow(transaction, command.aggregateId, true);
      if (!row) throw new AccountLifecycleConflictError('ACCOUNT_CLOSURE_INVALID_STATE');
      assertAccountClosureCanBeCancelled({ state: row.state, actor: command.actor,
        userId: row.user_id, recoveryUntil: row.recovery_until, occurredAt: context.occurredAt });
      await sql`update identity.account_closure_requests set state = 'CANCELLED',
        cancelled_at = ${context.occurredAt.toISOString()}::timestamptz,
        version = ${context.nextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where closure_id = ${row.closure_id}::uuid and state = 'REQUESTED'`.execute(transaction);
      const closure = closureProjection((await closureRow(transaction, row.closure_id))!);
      const lifecycle = await readMyAccountLifecycle(transaction, row.user_id);
      return { responseStatus: 200, response: { ...lifecycle, closure },
        event: { eventId: ids.eventId, eventName: 'AccountClosureCancelled', schemaVersion: 1,
          transitionId: null, payload: { closureId: row.closure_id, userId: row.user_id },
          metadata: { policyVersion: ACCOUNT_LIFECYCLE_POLICY_VERSION } },
        audit: { auditId: ids.auditId, action: 'CANCEL_ACCOUNT_CLOSURE', transitionId: null,
          reasonCode: null, beforeState: 'REQUESTED', afterState: 'CANCELLED', metadata: {} },
        outbox: [{ messageId: ids.outboxMessageId, topic: 'identity.account-closure.cancelled.v1',
          payload: { closureId: row.closure_id, userId: row.user_id } }] };
    } });
}

export async function requestAccountExport(database: Kysely<Database>,
  command: CommandEnvelope<RequestAccountExportPayload>, ids: AccountExportEffectIds,
  now?: () => Date): Promise<ExecutedCommand<AccountExportProjection>> {
  if (command.commandType !== 'REQUEST_ACCOUNT_EXPORT'
    || command.aggregateType !== 'AccountDataExport' || command.payload.userId !== command.actor.id) {
    throw new AccountLifecycleConflictError('ACCOUNT_LIFECYCLE_USER_REQUIRED');
  }
  return executeCriticalCommand(database, { command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const user = await userRow(transaction, command.payload.userId, true);
      if (!user) throw new AccountLifecycleConflictError('ACCOUNT_NOT_CLOSABLE');
      assertAccountExportCanBeRequested({ accountState: user.account_state,
        actor: command.actor, userId: user.user_id });
      if (await liveExportRow(transaction, user.user_id, true)) {
        throw new AccountLifecycleConflictError('ACCOUNT_EXPORT_INVALID_STATE');
      }
      if (command.payload.closureId) {
        const closure = await closureRow(transaction, command.payload.closureId);
        if (!closure || closure.user_id !== user.user_id) {
          throw new AccountLifecycleConflictError('ACCOUNT_CLOSURE_INVALID_STATE');
        }
      }
      await sql`insert into identity.account_data_exports (
        export_id, user_id, closure_id, state, requested_at, policy_version, version, updated_at
      ) values (${command.aggregateId}::uuid, ${user.user_id}::uuid,
        ${command.payload.closureId}::uuid, 'REQUESTED',
        ${context.occurredAt.toISOString()}::timestamptz,
        ${ACCOUNT_LIFECYCLE_POLICY_VERSION}, ${context.nextVersion},
        ${context.occurredAt.toISOString()}::timestamptz)`.execute(transaction);
      const response = exportProjection((await exportRow(transaction, command.aggregateId))!);
      return { responseStatus: 202, response,
        event: { eventId: ids.eventId, eventName: 'AccountDataExportRequested', schemaVersion: 1,
          transitionId: null, payload: { exportId: response.exportId, userId: response.userId,
            closureId: response.closureId },
          metadata: { policyVersion: ACCOUNT_LIFECYCLE_POLICY_VERSION } },
        audit: { auditId: ids.auditId, action: 'REQUEST_ACCOUNT_EXPORT', transitionId: null,
          reasonCode: null, beforeState: null, afterState: 'REQUESTED', metadata: {} },
        outbox: [{ messageId: ids.outboxMessageId, topic: 'identity.account-export.requested.v1',
          payload: { exportId: response.exportId, userId: response.userId } }] };
    } });
}

async function buildExportPayload(transaction: Transaction<Database>, userId: string,
  generatedAt: string): Promise<Record<string, unknown>> {
  const profile = await sql<Record<string, unknown>>`select users.user_id, users.display_name,
      users.age_division, users.account_state, users.locale, users.activated_at,
      profile.primary_sport, profile.secondary_sport, profile.discovery_radius_km,
      profile.experience_text
    from identity.users as users join identity.athlete_profiles as profile using (user_id)
    where users.user_id = ${userId}::uuid`.execute(transaction);
  const memberships = await sql<Record<string, unknown>>`select membership_id, community_id,
      age_division, state, competition_enabled, join_path, created_at, left_at, removed_at
    from community.community_memberships where user_id = ${userId}::uuid
    order by created_at, membership_id`.execute(transaction);
  const challenges = await sql<Record<string, unknown>>`select challenge_id, competition_id,
      response_policy, stake, state, created_at, accepted_at, decided_at
    from competition.challenges where initiator_user_id = ${userId}::uuid
      or recipient_user_id = ${userId}::uuid order by created_at, challenge_id`.execute(transaction);
  const sessions = await sql<Record<string, unknown>>`select session_id, venue_id, purpose, state,
      scheduled_start_at, scheduled_end_at, actual_start_at, actual_end_at
    from scheduling.sessions where pair_low_id = ${userId}::uuid or pair_high_id = ${userId}::uuid
      or coach_user_id = ${userId}::uuid order by scheduled_start_at, session_id`.execute(transaction);
  const events = await sql<Record<string, unknown>>`select event_id, event_name, aggregate_type,
      aggregate_id, aggregate_version, occurred_at
    from platform.domain_events where actor_id = ${userId}::uuid
      or (aggregate_type = 'User' and aggregate_id = ${userId}::uuid)
    order by occurred_at, event_id`.execute(transaction);
  return { schemaVersion: 1, generatedAt, policyVersion: ACCOUNT_LIFECYCLE_POLICY_VERSION,
    userId, profile: profile.rows[0] ?? null, memberships: memberships.rows,
    challenges: challenges.rows, sessions: sessions.rows, accountEvents: events.rows };
}

export async function prepareAccountExport(database: Kysely<Database>,
  command: CommandEnvelope<PrepareAccountExportPayload>, ids: AccountExportEffectIds,
  now?: () => Date): Promise<ExecutedCommand<AccountExportProjection>> {
  if (command.commandType !== 'PREPARE_ACCOUNT_EXPORT'
    || command.aggregateType !== 'AccountDataExport'
    || command.aggregateId !== command.payload.exportId) {
    throw new AccountLifecycleConflictError('ACCOUNT_EXPORT_INVALID_STATE');
  }
  return executeCriticalCommand(database, { command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await exportRow(transaction, command.aggregateId, true);
      if (!row) throw new AccountLifecycleConflictError('ACCOUNT_EXPORT_INVALID_STATE');
      assertAccountExportCanBePrepared({ state: row.state, actor: command.actor });
      const readyAt = context.occurredAt.toISOString();
      const expiresAt = accountExportExpiresAt(context.occurredAt).toISOString();
      const payload = await buildExportPayload(transaction, row.user_id, readyAt);
      const payloadSha256 = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      await sql`update identity.account_data_exports set state = 'READY',
        ready_at = ${readyAt}::timestamptz, expires_at = ${expiresAt}::timestamptz,
        export_payload = ${JSON.stringify(payload)}::jsonb, payload_sha256 = ${payloadSha256},
        version = ${context.nextVersion}, updated_at = ${readyAt}::timestamptz
        where export_id = ${row.export_id}::uuid and state = 'REQUESTED'`.execute(transaction);
      const response = exportProjection((await exportRow(transaction, row.export_id))!);
      return { responseStatus: 200, response,
        event: { eventId: ids.eventId, eventName: 'AccountDataExportPrepared', schemaVersion: 1,
          transitionId: null, payload: { exportId: row.export_id, userId: row.user_id,
            expiresAt, payloadSha256 },
          metadata: { policyVersion: ACCOUNT_LIFECYCLE_POLICY_VERSION } },
        audit: { auditId: ids.auditId, action: 'PREPARE_ACCOUNT_EXPORT', transitionId: null,
          reasonCode: null, beforeState: 'REQUESTED', afterState: 'READY',
          metadata: { expiresAt, payloadSha256 } },
        outbox: [{ messageId: ids.outboxMessageId, topic: 'identity.account-export.prepared.v1',
          payload: { exportId: row.export_id, userId: row.user_id, expiresAt, timer: {
            commandType: 'EXPIRE_ACCOUNT_EXPORT', aggregateType: 'AccountDataExport',
            aggregateId: row.export_id, expectedState: 'READY', expectedVersion: context.nextVersion,
            deadlineAt: expiresAt, policyVersion: ACCOUNT_LIFECYCLE_POLICY_VERSION,
            idempotencyKey: `account-export:${row.export_id}:expire:v${context.nextVersion}` } } }] };
    } });
}

export async function expireAccountExport(database: Kysely<Database>,
  command: CommandEnvelope<ExpireAccountExportPayload>, ids: AccountExportEffectIds,
  now?: () => Date): Promise<ExecutedCommand<AccountExportProjection>> {
  if (command.commandType !== 'EXPIRE_ACCOUNT_EXPORT'
    || command.aggregateType !== 'AccountDataExport'
    || command.aggregateId !== command.payload.exportId) {
    throw new AccountLifecycleConflictError('ACCOUNT_EXPORT_INVALID_STATE');
  }
  return executeCriticalCommand(database, { command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await exportRow(transaction, command.aggregateId, true);
      if (!row) throw new AccountLifecycleConflictError('ACCOUNT_EXPORT_INVALID_STATE');
      assertAccountExportCanExpire({ state: row.state, actor: command.actor,
        expiresAt: row.expires_at, occurredAt: context.occurredAt });
      await sql`update identity.account_data_exports set state = 'EXPIRED', export_payload = null,
        expired_at = ${context.occurredAt.toISOString()}::timestamptz,
        version = ${context.nextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where export_id = ${row.export_id}::uuid and state = 'READY'`.execute(transaction);
      const response = exportProjection((await exportRow(transaction, row.export_id))!);
      return { responseStatus: 200, response,
        event: { eventId: ids.eventId, eventName: 'AccountDataExportExpired', schemaVersion: 1,
          transitionId: null, payload: { exportId: row.export_id, userId: row.user_id,
            payloadDeleted: true }, metadata: { policyVersion: ACCOUNT_LIFECYCLE_POLICY_VERSION } },
        audit: { auditId: ids.auditId, action: 'EXPIRE_ACCOUNT_EXPORT', transitionId: null,
          reasonCode: 'RETENTION_EXPIRED', beforeState: 'READY', afterState: 'EXPIRED',
          metadata: { payloadDeleted: true, payloadSha256: row.payload_sha256 } },
        outbox: [{ messageId: ids.outboxMessageId, topic: 'identity.account-export.expired.v1',
          payload: { exportId: row.export_id, userId: row.user_id, payloadDeleted: true } }] };
    } });
}

export async function readAccountExportPayload(database: Kysely<Database>, userId: string,
  exportId: string, occurredAt = new Date()): Promise<unknown> {
  const row = await exportRow(database, exportId, false, true);
  if (!row || row.user_id !== userId || row.state !== 'READY' || !row.expires_at
    || occurredAt >= row.expires_at || row.export_payload === undefined) {
    throw new AccountLifecycleConflictError('ACCOUNT_EXPORT_INVALID_STATE');
  }
  return row.export_payload;
}

export async function readAccountExportTimerSnapshot(
  database: Kysely<Database>, exportId: string,
): Promise<{ readonly state: string; readonly version: number; readonly deadlineAt?: string }> {
  const row = await exportRow(database, exportId);
  return row
    ? { state: row.state, version: Number(row.version),
        ...(row.expires_at ? { deadlineAt: row.expires_at.toISOString() } : {}) }
    : { state: 'MISSING', version: 0 };
}

export async function executeAccountClosure(database: Kysely<Database>,
  command: CommandEnvelope<ExecuteAccountClosurePayload>, ids: ExecuteAccountClosureEffectIds,
  now?: () => Date): Promise<ExecutedCommand<IdentityProjection>> {
  if (command.commandType !== 'CLOSE_ACCOUNT' || command.aggregateType !== 'User'
    || command.aggregateId !== command.payload.userId) {
    throw new AccountLifecycleConflictError('ACCOUNT_CLOSURE_INVALID_STATE');
  }
  return executeCriticalCommand(database, { command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      if (!command.actor.id) {
        throw new AccountLifecycleConflictError('ACCOUNT_LIFECYCLE_CENTRAL_REQUIRED');
      }
      await assertCentralGrant(transaction, command.actor.id);
      const closure = await closureRow(transaction, command.payload.closureId, true);
      const user = await userRow(transaction, command.payload.userId, true);
      if (!closure || !user || closure.user_id !== user.user_id || user.account_state === 'CLOSED') {
        throw new AccountLifecycleConflictError('ACCOUNT_CLOSURE_INVALID_STATE');
      }
      const blockers = await closureBlockers(transaction, user.user_id);
      assertAccountClosureCanBeExecuted({ state: closure.state, actor: command.actor,
        recoveryUntil: closure.recovery_until, occurredAt: context.occurredAt, blockers });
      const reason = command.payload.reason.trim();
      if (reason.length < 3 || reason.length > 500) {
        throw new AccountLifecycleConflictError('ACCOUNT_CLOSURE_INVALID_STATE');
      }
      const occurredAt = context.occurredAt.toISOString();
      await sql`update identity.users set account_state = 'CLOSED',
        display_name = 'Удалённый участник', avatar_asset_id = null,
        phone_e164 = ${`closed:${user.user_id}`}, phone_verified_at = null,
        discovery_paused = true, version = ${context.nextVersion},
        updated_at = ${occurredAt}::timestamptz where user_id = ${user.user_id}::uuid`
        .execute(transaction);
      await sql`update identity.account_verifications set is_current = false
        where user_id = ${user.user_id}::uuid and is_current`.execute(transaction);
      await sql`update identity.account_closure_requests set state = 'EXECUTED',
        executed_at = ${occurredAt}::timestamptz, executed_by = ${command.actor.id}::uuid,
        execution_reason = ${reason}, pseudonymization_event_id = ${ids.eventId}::uuid,
        version = 2, updated_at = ${occurredAt}::timestamptz
        where closure_id = ${closure.closure_id}::uuid and state = 'REQUESTED'`.execute(transaction);
      const response = identityProjection(user, 'Удалённый участник', 'CLOSED', context.nextVersion);
      return { responseStatus: 200, response,
        event: { eventId: ids.eventId, eventName: 'UserAccountClosed', schemaVersion: 1,
          transitionId: 'U-04', payload: { userId: user.user_id,
            closureId: closure.closure_id, publicIdentityPseudonymized: true },
          metadata: { policyVersion: ACCOUNT_LIFECYCLE_POLICY_VERSION } },
        relatedEvents: [{ eventId: ids.closureEventId, eventName: 'AccountClosureExecuted',
          schemaVersion: 1, aggregateType: 'AccountClosureRequest',
          aggregateId: closure.closure_id, aggregateVersion: 2, transitionId: null,
          payload: { closureId: closure.closure_id, userId: user.user_id,
            pseudonymizationEventId: ids.eventId },
          metadata: { policyVersion: ACCOUNT_LIFECYCLE_POLICY_VERSION } }],
        audit: { auditId: ids.auditId, action: 'CLOSE_ACCOUNT', transitionId: 'U-04',
          reasonCode: 'RECOVERY_WINDOW_ELAPSED', beforeState: user.account_state,
          afterState: 'CLOSED', metadata: { closureId: closure.closure_id, reason,
            blockers, publicIdentityPseudonymized: true } },
        outbox: [{ messageId: ids.outboxMessageId, topic: 'identity.account.closed.v1',
          payload: { userId: user.user_id, closureId: closure.closure_id,
            version: context.nextVersion, revokeSessions: true } }] };
    } });
}

export async function listAccountClosuresForCentral(database: Kysely<Database>,
  centralUserId: string, occurredAt = new Date()): Promise<readonly CentralAccountClosureProjection[]> {
  await assertCentralGrant(database, centralUserId);
  const result = await sql<(ClosureRow & { readonly display_name: string;
    readonly account_state: IdentityProjection['accountState']; readonly user_version: string })>`
    select closure.closure_id, closure.user_id, closure.state, closure.export_requested,
      closure.requested_at, closure.recovery_until, closure.cancelled_at, closure.executed_at,
      closure.version::text as version, users.display_name, users.account_state,
      users.version::text as user_version
    from identity.account_closure_requests as closure
    join identity.users as users on users.user_id = closure.user_id
    where closure.state = 'REQUESTED'
    order by closure.recovery_until, closure.closure_id
  `.execute(database);
  return Promise.all(result.rows.map(async (row) => {
    const blockers = await closureBlockers(database, row.user_id);
    return { ...closureProjection(row), displayName: row.display_name,
      accountState: row.account_state, userVersion: Number(row.user_version), blockers,
      executable: occurredAt >= row.recovery_until && Object.values(blockers).every((v) => v === 0) };
  }));
}
