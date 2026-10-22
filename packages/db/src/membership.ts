import { createHash } from 'node:crypto';

import {
  MEMBERSHIP_POLICY_VERSION,
  MEMBERSHIP_REQUEST_ESCALATION_HOURS,
  MEMBERSHIP_REQUEST_REMINDER_HOURS,
  membershipReapplyNotBefore,
  MembershipConflictError,
  assertMembershipTransition,
  membershipRequestDeadline,
  type AgeDivision,
  type CommandEnvelope,
  type MembershipJoinPath,
  type MembershipInternalRejectionReasonCode,
  type MembershipPublicRejectionReasonCode,
  type MembershipState,
  type TimerAggregateSnapshot,
} from '@molokh/core';
import { type Kysely, type Transaction, sql } from 'kysely';

import type { Database } from './index.js';
import { executeCriticalCommand, type ExecutedCommand } from './platform-command.js';

export interface MembershipProjection {
  readonly membershipId: string;
  readonly communityId: string;
  readonly userId: string;
  readonly ageDivision: AgeDivision;
  readonly state: MembershipState;
  readonly competitionEnabled: boolean;
  readonly joinPath: MembershipJoinPath;
  readonly requestedAt: string | null;
  readonly decidedAt: string | null;
  readonly decidedBy: string | null;
  readonly publicRejectionReasonCode: MembershipPublicRejectionReasonCode | null;
  readonly reapplyNotBeforeAt: string | null;
  readonly version: number;
}

export interface PendingMembershipProjection extends MembershipProjection {
  readonly displayName: string;
}

export interface RequestMembershipPayload { readonly communityId: string }
export interface ActivateMembershipPayload { readonly token: string }
export interface ApproveMembershipPayload { readonly membershipId: string }
export interface RejectMembershipPayload {
  readonly membershipId: string;
  readonly publicRejectionReasonCode: MembershipPublicRejectionReasonCode;
  readonly internalRejectionReasonCode: MembershipInternalRejectionReasonCode;
  readonly internalCaseRef?: string | null;
}
export interface WithdrawMembershipRequestPayload { readonly membershipId: string }

export interface MembershipEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly notificationIds: readonly string[];
  readonly reminderTimerOutboxMessageId?: string;
  readonly escalationTimerOutboxMessageId?: string;
}

interface MembershipRow {
  readonly membership_id: string;
  readonly community_id: string;
  readonly user_id: string;
  readonly age_division: AgeDivision;
  readonly state: MembershipState;
  readonly competition_enabled: boolean;
  readonly join_path: MembershipJoinPath;
  readonly requested_at: Date | null;
  readonly decided_at: Date | null;
  readonly decided_by: string | null;
  readonly public_rejection_reason_code: MembershipPublicRejectionReasonCode | null;
  readonly reapply_not_before_at: Date | null;
  readonly version: string;
}

interface CreationContextRow {
  readonly account_state: 'ACTIVE' | 'RESTRICTED' | 'CLOSED';
  readonly age_division: AgeDivision;
  readonly community_state: 'ACTIVE' | 'PAUSED' | 'CLOSING' | 'CLOSED';
  readonly venue_id: string;
  readonly current_membership_state: MembershipState | null;
  readonly reapply_not_before_at: Date | null;
  readonly has_other_active_competitive_membership: boolean;
}

interface InviteRow {
  readonly invite_id: string;
  readonly community_id: string;
  readonly join_path: Exclude<MembershipJoinPath, 'SELF_REQUEST'>;
  readonly age_division: AgeDivision | null;
  readonly state: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  readonly expires_at: Date;
  readonly max_uses: number | null;
  readonly used_count: number;
  readonly version: string;
}

export class MembershipNotFoundError extends MembershipConflictError {
  constructor() {
    super('MEMBERSHIP_NOT_FOUND');
    this.name = 'MembershipNotFoundError';
  }
}

function project(row: MembershipRow): MembershipProjection {
  return {
    membershipId: row.membership_id,
    communityId: row.community_id,
    userId: row.user_id,
    ageDivision: row.age_division,
    state: row.state,
    competitionEnabled: row.competition_enabled,
    joinPath: row.join_path,
    requestedAt: row.requested_at?.toISOString() ?? null,
    decidedAt: row.decided_at?.toISOString() ?? null,
    decidedBy: row.decided_by,
    publicRejectionReasonCode: row.public_rejection_reason_code,
    reapplyNotBeforeAt: row.reapply_not_before_at?.toISOString() ?? null,
    version: Number(row.version),
  };
}

async function selectMembership(
  database: Kysely<Database> | Transaction<Database>,
  membershipId: string,
  forUpdate = false,
): Promise<MembershipRow | null> {
  const lock = forUpdate ? sql`for update` : sql``;
  const result = await sql<MembershipRow>`
    select membership_id, community_id, user_id, age_division, state,
      competition_enabled, join_path, requested_at, decided_at, decided_by,
      public_rejection_reason_code, reapply_not_before_at,
      version::text as version
    from community.community_memberships
    where membership_id = ${membershipId}::uuid
    ${lock}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function lockRelationship(
  transaction: Transaction<Database>,
  communityId: string,
  userId: string,
): Promise<void> {
  await sql`select pg_advisory_xact_lock(
    hashtextextended(${'membership:' + communityId + ':' + userId}, 0)
  )`.execute(transaction);
}

async function creationContext(
  transaction: Transaction<Database>,
  userId: string,
  communityId: string,
): Promise<CreationContextRow | null> {
  const result = await sql<CreationContextRow>`
    select users.account_state, users.age_division,
      target_community.state as community_state, target_community.venue_id,
      (
        select membership.state
        from community.community_memberships as membership
        where membership.community_id = target_community.community_id
          and membership.user_id = users.user_id
          and membership.state in ('PENDING', 'ACTIVE', 'UNDER_REVIEW')
        limit 1
      ) as current_membership_state,
      (
        select membership.reapply_not_before_at
        from community.community_memberships as membership
        where membership.community_id = target_community.community_id
          and membership.user_id = users.user_id
          and membership.state = 'REJECTED'
          and membership.join_path = 'SELF_REQUEST'
        order by membership.decided_at desc nulls last, membership.created_at desc
        limit 1
      ) as reapply_not_before_at,
      exists (
        select 1
        from community.community_memberships as active_membership
        where active_membership.user_id = users.user_id
          and active_membership.state = 'ACTIVE'
          and active_membership.competition_enabled
          and active_membership.community_id <> target_community.community_id
      ) as has_other_active_competitive_membership
    from identity.users as users
    cross join community.communities as target_community
    where users.user_id = ${userId}::uuid
      and target_community.community_id = ${communityId}::uuid
    for update of users, target_community
  `.execute(transaction);
  return result.rows[0] ?? null;
}

async function actorControlsVenue(
  transaction: Transaction<Database>,
  actorId: string,
  venueId: string,
): Promise<boolean> {
  const result = await sql<{ readonly grant_id: string }>`
    select grant_id
    from community.role_grants
    where user_id = ${actorId}::uuid and state = 'ACTIVE'
      and (
        (role = 'CENTRAL_ADMIN' and scope_type = 'GLOBAL' and scope_id is null)
        or (
          role in ('PRIMARY_ADMIN', 'GYM_ADMIN')
          and scope_type = 'VENUE' and scope_id = ${venueId}::uuid
        )
      )
    limit 1
    for share
  `.execute(transaction);
  return result.rows.length === 1;
}

async function notificationRecipients(
  transaction: Transaction<Database>,
  venueId: string,
  kind: 'ADMIN' | 'CENTRAL',
): Promise<readonly string[]> {
  const result = kind === 'ADMIN'
    ? await sql<{ readonly user_id: string }>`
        select distinct user_id
        from community.role_grants
        where state = 'ACTIVE' and role in ('PRIMARY_ADMIN', 'GYM_ADMIN')
          and scope_type = 'VENUE' and scope_id = ${venueId}::uuid
        order by user_id
      `.execute(transaction)
    : await sql<{ readonly user_id: string }>`
        select distinct user_id
        from community.role_grants
        where state = 'ACTIVE' and role = 'CENTRAL_ADMIN'
          and scope_type = 'GLOBAL' and scope_id is null
        order by user_id
      `.execute(transaction);
  return result.rows.map((row) => row.user_id);
}

function notificationDrafts(
  recipients: readonly string[],
  ids: readonly string[],
  renderKey: string,
  membershipId: string,
  communityId: string,
  deadlineAt: string | null,
  extraPayload: Readonly<Record<string, unknown>> = {},
) {
  if (ids.length < recipients.length) throw new RangeError('Not enough notification IDs');
  return recipients.map((recipientUserId, index) => ({
    notificationId: ids[index]!, recipientUserId, category: 'SERVICE', renderKey,
    actionTarget: { type: 'MEMBERSHIP', id: membershipId },
    payload: { membershipId, communityId, ...extraPayload }, deadlineAt,
  }));
}

function membershipTimer(
  commandType: 'REMIND_MEMBERSHIP_REQUEST' | 'ESCALATE_MEMBERSHIP_REQUEST',
  membershipId: string,
  deadlineAt: string,
) {
  return {
    commandType, aggregateType: 'CommunityMembership', aggregateId: membershipId,
    expectedState: 'PENDING', expectedVersion: 1, deadlineAt,
    policyVersion: MEMBERSHIP_POLICY_VERSION,
    idempotencyKey: `membership:${membershipId}:${commandType.toLowerCase()}:v1`,
  };
}

export async function requestMembership(
  database: Kysely<Database>,
  command: CommandEnvelope<RequestMembershipPayload>,
  ids: MembershipEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<MembershipProjection>> {
  const userId = command.actor.id;
  if (!userId) throw new MembershipConflictError('MEMBERSHIP_ACCOUNT_NOT_ACTIVE');
  if (!ids.reminderTimerOutboxMessageId || !ids.escalationTimerOutboxMessageId) {
    throw new TypeError('Membership request timer IDs are required');
  }
  const reminderTimerOutboxMessageId = ids.reminderTimerOutboxMessageId;
  const escalationTimerOutboxMessageId = ids.escalationTimerOutboxMessageId;
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      await lockRelationship(transaction, command.payload.communityId, userId);
      const current = await creationContext(transaction, userId, command.payload.communityId);
      if (!current) throw new MembershipNotFoundError();
      assertMembershipTransition({
        transition: 'REQUEST', accountState: current.account_state,
        communityState: current.community_state, userAgeDivision: current.age_division,
        currentMembershipState: current.current_membership_state,
        hasCurrentRelationship: current.current_membership_state !== null,
        hasOtherActiveCompetitiveMembership: current.has_other_active_competitive_membership,
        reapplyNotBeforeAt: current.reapply_not_before_at?.toISOString() ?? null,
        now: context.occurredAt,
      });
      const requestedAt = context.occurredAt.toISOString();
      const reminderAt = membershipRequestDeadline(
        context.occurredAt, MEMBERSHIP_REQUEST_REMINDER_HOURS,
      );
      const escalationAt = membershipRequestDeadline(
        context.occurredAt, MEMBERSHIP_REQUEST_ESCALATION_HOURS,
      );
      await sql`
        insert into community.community_memberships (
          membership_id, community_id, user_id, age_division, state,
          competition_enabled, join_path, requested_at, version
        ) values (
          ${command.aggregateId}::uuid, ${command.payload.communityId}::uuid,
          ${userId}::uuid, ${current.age_division}, 'PENDING', false,
          'SELF_REQUEST', ${requestedAt}::timestamptz, ${context.nextVersion}
        )
      `.execute(transaction);
      const response: MembershipProjection = {
        membershipId: command.aggregateId, communityId: command.payload.communityId,
        userId, ageDivision: current.age_division, state: 'PENDING',
        competitionEnabled: false, joinPath: 'SELF_REQUEST', requestedAt,
        decidedAt: null, decidedBy: null, version: context.nextVersion,
        publicRejectionReasonCode: null, reapplyNotBeforeAt: null,
      };
      const admins = await notificationRecipients(transaction, current.venue_id, 'ADMIN');
      const notifications = notificationDrafts(
        admins, ids.notificationIds, 'community.membership_requested', command.aggregateId,
        command.payload.communityId, escalationAt,
      );
      return {
        responseStatus: 201, response,
        event: { eventId: ids.eventId, eventName: 'MembershipRequested', schemaVersion: 1,
          transitionId: 'M-02', payload: { membershipId: command.aggregateId,
            communityId: command.payload.communityId, userId, reminderAt, escalationAt },
          metadata: { policyVersion: MEMBERSHIP_POLICY_VERSION } },
        audit: { auditId: ids.auditId, action: 'REQUEST_MEMBERSHIP', transitionId: 'M-02',
          reasonCode: 'SELF_REQUEST', beforeState: null, afterState: 'PENDING',
          metadata: { communityId: command.payload.communityId } },
        outbox: [
          ...(notifications.length > 0 ? [{ messageId: ids.outboxMessageId,
            topic: 'notification.in_app.v1', payload: { notifications } }] : []),
          { messageId: reminderTimerOutboxMessageId,
            topic: 'community.membership.request-reminder-timer.v1',
            payload: { timer: membershipTimer('REMIND_MEMBERSHIP_REQUEST',
              command.aggregateId, reminderAt) } },
          { messageId: escalationTimerOutboxMessageId,
            topic: 'community.membership.request-escalation-timer.v1',
            payload: { timer: membershipTimer('ESCALATE_MEMBERSHIP_REQUEST',
              command.aggregateId, escalationAt) } },
        ],
      };
    },
  });
}

export async function activateMembershipByInvite(
  database: Kysely<Database>,
  command: CommandEnvelope<ActivateMembershipPayload>,
  ids: MembershipEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<MembershipProjection>> {
  const userId = command.actor.id;
  if (!userId) throw new MembershipConflictError('MEMBERSHIP_ACCOUNT_NOT_ACTIVE');
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const tokenHash = createHash('sha256').update(command.payload.token, 'utf8').digest('hex');
      const inviteResult = await sql<InviteRow>`
        select invite_id, community_id, join_path, age_division, state, expires_at,
          max_uses, used_count, version::text as version
        from community.membership_invites
        where token_sha256 = ${tokenHash}
        for update
      `.execute(transaction);
      const invite = inviteResult.rows[0];
      if (!invite) throw new MembershipConflictError('MEMBERSHIP_INVITE_INVALID');
      await lockRelationship(transaction, invite.community_id, userId);
      const current = await creationContext(transaction, userId, invite.community_id);
      if (!current) throw new MembershipNotFoundError();
      const inviteValid = invite.state === 'ACTIVE'
        && invite.expires_at.getTime() > context.occurredAt.getTime()
        && (invite.max_uses === null || invite.used_count < invite.max_uses);
      assertMembershipTransition({
        transition: 'ACTIVATE', accountState: current.account_state,
        communityState: current.community_state, userAgeDivision: current.age_division,
        inviteAgeDivision: invite.age_division, inviteValid,
        currentMembershipState: current.current_membership_state,
        hasCurrentRelationship: current.current_membership_state !== null,
        hasOtherActiveCompetitiveMembership: current.has_other_active_competitive_membership,
        now: context.occurredAt,
      });
      const decidedAt = context.occurredAt.toISOString();
      await sql`
        insert into community.community_memberships (
          membership_id, community_id, user_id, age_division, state,
          competition_enabled, join_path, decided_at, decided_by, version
        ) values (
          ${command.aggregateId}::uuid, ${invite.community_id}::uuid, ${userId}::uuid,
          ${current.age_division}, 'ACTIVE', true, ${invite.join_path},
          ${decidedAt}::timestamptz, ${userId}::uuid, ${context.nextVersion}
        )
      `.execute(transaction);
      const nextUsedCount = invite.used_count + 1;
      const exhausted = invite.max_uses !== null && nextUsedCount >= invite.max_uses;
      await sql`
        update community.membership_invites
        set used_count = ${nextUsedCount}, state = ${exhausted ? 'EXPIRED' : 'ACTIVE'},
          version = version + 1, updated_at = ${decidedAt}::timestamptz
        where invite_id = ${invite.invite_id}::uuid
      `.execute(transaction);
      const response: MembershipProjection = {
        membershipId: command.aggregateId, communityId: invite.community_id, userId,
        ageDivision: current.age_division, state: 'ACTIVE', competitionEnabled: true,
        joinPath: invite.join_path, requestedAt: null, decidedAt, decidedBy: userId,
        publicRejectionReasonCode: null, reapplyNotBeforeAt: null,
        version: context.nextVersion,
      };
      const notifications = notificationDrafts(
        [userId], ids.notificationIds, 'community.membership_activated', command.aggregateId,
        invite.community_id, null,
      );
      return {
        responseStatus: 201, response,
        event: { eventId: ids.eventId, eventName: 'MembershipActivated', schemaVersion: 1,
          transitionId: 'M-01', payload: { membershipId: command.aggregateId,
            communityId: invite.community_id, userId, joinPath: invite.join_path },
          metadata: { policyVersion: MEMBERSHIP_POLICY_VERSION, inviteId: invite.invite_id } },
        audit: { auditId: ids.auditId, action: 'JOIN_BY_QR_OR_INVITE', transitionId: 'M-01',
          reasonCode: invite.join_path, beforeState: null, afterState: 'ACTIVE',
          metadata: { communityId: invite.community_id, inviteId: invite.invite_id } },
        outbox: [{ messageId: ids.outboxMessageId, topic: 'notification.in_app.v1',
          payload: { notifications } }],
      };
    },
  });
}

export async function approveMembership(
  database: Kysely<Database>,
  command: CommandEnvelope<ApproveMembershipPayload>,
  ids: MembershipEffectIds,
): Promise<ExecutedCommand<MembershipProjection>> {
  const actorId = command.actor.id;
  if (!actorId) throw new MembershipConflictError('MEMBERSHIP_ADMIN_REQUIRED');
  return executeCriticalCommand(database, {
    command,
    mutate: async (transaction, context) => {
      const current = await selectMembership(transaction, command.payload.membershipId, true);
      if (!current) throw new MembershipNotFoundError();
      const resourceResult = await sql<{
        readonly account_state: CreationContextRow['account_state'];
        readonly community_state: CreationContextRow['community_state'];
        readonly venue_id: string;
        readonly age_division: AgeDivision;
        readonly has_other_active_competitive_membership: boolean;
      }>`
        select users.account_state, target_community.state as community_state,
          target_community.venue_id, users.age_division,
          exists (
            select 1 from community.community_memberships as other_membership
            where other_membership.user_id = users.user_id
              and other_membership.membership_id <> ${current.membership_id}::uuid
              and other_membership.state = 'ACTIVE'
              and other_membership.competition_enabled
          ) as has_other_active_competitive_membership
        from identity.users as users
        join community.communities as target_community
          on target_community.community_id = ${current.community_id}::uuid
        where users.user_id = ${current.user_id}::uuid
        for update of users, target_community
      `.execute(transaction);
      const resource = resourceResult.rows[0];
      if (!resource) throw new MembershipNotFoundError();
      const controlsVenue = await actorControlsVenue(transaction, actorId, resource.venue_id);
      assertMembershipTransition({
        transition: 'APPROVE', accountState: resource.account_state,
        communityState: resource.community_state, userAgeDivision: resource.age_division,
        currentMembershipState: current.state, hasCurrentRelationship: true,
        hasOtherActiveCompetitiveMembership: resource.has_other_active_competitive_membership,
        actorControlsVenue: controlsVenue, now: context.occurredAt,
      });
      const decidedAt = context.occurredAt.toISOString();
      await sql`
        update community.community_memberships
        set state = 'ACTIVE', competition_enabled = true,
          decided_at = ${decidedAt}::timestamptz, decided_by = ${actorId}::uuid,
          version = ${context.nextVersion}, updated_at = ${decidedAt}::timestamptz
        where membership_id = ${current.membership_id}::uuid
      `.execute(transaction);
      const response: MembershipProjection = { ...project(current), state: 'ACTIVE',
        competitionEnabled: true, decidedAt, decidedBy: actorId, version: context.nextVersion };
      const notifications = notificationDrafts(
        [current.user_id], ids.notificationIds, 'community.membership_approved',
        current.membership_id, current.community_id, null,
      );
      return {
        responseStatus: 200, response,
        event: { eventId: ids.eventId, eventName: 'MembershipApproved', schemaVersion: 1,
          transitionId: 'M-03', payload: { membershipId: current.membership_id,
            communityId: current.community_id, userId: current.user_id },
          metadata: { policyVersion: MEMBERSHIP_POLICY_VERSION } },
        audit: { auditId: ids.auditId, action: 'APPROVE_MEMBERSHIP', transitionId: 'M-03',
          reasonCode: 'ADMIN_APPROVED', beforeState: current.state, afterState: 'ACTIVE',
          metadata: { communityId: current.community_id, userId: current.user_id } },
        outbox: [{ messageId: ids.outboxMessageId, topic: 'notification.in_app.v1',
          payload: { notifications } }],
      };
    },
  });
}

export async function rejectMembership(
  database: Kysely<Database>,
  command: CommandEnvelope<RejectMembershipPayload>,
  ids: MembershipEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<MembershipProjection>> {
  const actorId = command.actor.id;
  if (!actorId) throw new MembershipConflictError('MEMBERSHIP_ADMIN_REQUIRED');
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const current = await selectMembership(transaction, command.payload.membershipId, true);
      if (!current) throw new MembershipNotFoundError();
      const resourceResult = await sql<{
        readonly account_state: CreationContextRow['account_state'];
        readonly community_state: CreationContextRow['community_state'];
        readonly venue_id: string;
        readonly age_division: AgeDivision;
      }>`
        select users.account_state, target_community.state as community_state,
          target_community.venue_id, users.age_division
        from identity.users as users
        join community.communities as target_community
          on target_community.community_id = ${current.community_id}::uuid
        where users.user_id = ${current.user_id}::uuid
        for update of users, target_community
      `.execute(transaction);
      const resource = resourceResult.rows[0];
      if (!resource) throw new MembershipNotFoundError();
      const controlsVenue = await actorControlsVenue(transaction, actorId, resource.venue_id);
      assertMembershipTransition({
        transition: 'REJECT', accountState: resource.account_state,
        communityState: resource.community_state, userAgeDivision: resource.age_division,
        currentMembershipState: current.state, hasCurrentRelationship: true,
        hasOtherActiveCompetitiveMembership: false, actorControlsVenue: controlsVenue,
        publicRejectionReasonCode: command.payload.publicRejectionReasonCode,
        internalRejectionReasonCode: command.payload.internalRejectionReasonCode,
        ...(command.payload.internalCaseRef !== undefined
          ? { internalCaseRef: command.payload.internalCaseRef } : {}),
        now: context.occurredAt,
      });
      const decidedAt = context.occurredAt.toISOString();
      const reapplyNotBeforeAt = membershipReapplyNotBefore(context.occurredAt);
      await sql`
        update community.community_memberships
        set state = 'REJECTED', competition_enabled = false,
          decided_at = ${decidedAt}::timestamptz, decided_by = ${actorId}::uuid,
          reason_code = ${command.payload.internalRejectionReasonCode},
          public_rejection_reason_code = ${command.payload.publicRejectionReasonCode},
          internal_case_ref = ${command.payload.internalCaseRef?.trim() || null},
          reapply_not_before_at = ${reapplyNotBeforeAt}::timestamptz,
          version = ${context.nextVersion}, updated_at = ${decidedAt}::timestamptz
        where membership_id = ${current.membership_id}::uuid
      `.execute(transaction);
      const response: MembershipProjection = {
        ...project(current), state: 'REJECTED', competitionEnabled: false,
        decidedAt, decidedBy: actorId,
        publicRejectionReasonCode: command.payload.publicRejectionReasonCode,
        reapplyNotBeforeAt, version: context.nextVersion,
      };
      const notifications = notificationDrafts(
        [current.user_id], ids.notificationIds, 'community.membership_rejected',
        current.membership_id, current.community_id, reapplyNotBeforeAt,
        { publicRejectionReasonCode: command.payload.publicRejectionReasonCode,
          reapplyNotBeforeAt },
      );
      return {
        responseStatus: 200, response,
        event: {
          eventId: ids.eventId, eventName: 'MembershipRejected', schemaVersion: 1,
          transitionId: 'M-04', payload: {
            membershipId: current.membership_id, communityId: current.community_id,
            userId: current.user_id,
            publicRejectionReasonCode: command.payload.publicRejectionReasonCode,
            reapplyNotBeforeAt,
          }, metadata: { policyVersion: MEMBERSHIP_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId, action: 'REJECT_MEMBERSHIP', transitionId: 'M-04',
          reasonCode: command.payload.internalRejectionReasonCode,
          beforeState: current.state, afterState: 'REJECTED', metadata: {
            communityId: current.community_id, userId: current.user_id,
            publicRejectionReasonCode: command.payload.publicRejectionReasonCode,
            internalCaseRef: command.payload.internalCaseRef?.trim() || null,
          },
        },
        outbox: [{ messageId: ids.outboxMessageId, topic: 'notification.in_app.v1',
          payload: { notifications } }],
      };
    },
  });
}

export async function withdrawMembershipRequest(
  database: Kysely<Database>,
  command: CommandEnvelope<WithdrawMembershipRequestPayload>,
  ids: MembershipEffectIds,
): Promise<ExecutedCommand<MembershipProjection>> {
  const actorId = command.actor.id;
  if (!actorId) throw new MembershipConflictError('MEMBERSHIP_REQUESTER_REQUIRED');
  return executeCriticalCommand(database, {
    command,
    mutate: async (transaction, context) => {
      const current = await selectMembership(transaction, command.payload.membershipId, true);
      if (!current) throw new MembershipNotFoundError();
      const resourceResult = await sql<{
        readonly account_state: CreationContextRow['account_state'];
        readonly community_state: CreationContextRow['community_state'];
      }>`
        select users.account_state, target_community.state as community_state
        from identity.users as users
        join community.communities as target_community
          on target_community.community_id = ${current.community_id}::uuid
        where users.user_id = ${current.user_id}::uuid
      `.execute(transaction);
      const resource = resourceResult.rows[0];
      if (!resource) throw new MembershipNotFoundError();
      assertMembershipTransition({
        transition: 'WITHDRAW', accountState: resource.account_state,
        communityState: resource.community_state,
        userAgeDivision: current.age_division, currentMembershipState: current.state,
        hasCurrentRelationship: true, hasOtherActiveCompetitiveMembership: false,
        actorIsRequester: current.user_id === actorId, now: context.occurredAt,
      });
      const decidedAt = context.occurredAt.toISOString();
      await sql`
        update community.community_memberships
        set state = 'LEFT', competition_enabled = false,
          decided_at = ${decidedAt}::timestamptz, decided_by = ${actorId}::uuid,
          reason_code = 'WITHDRAWN_BY_REQUESTER', left_at = ${decidedAt}::timestamptz,
          version = ${context.nextVersion}, updated_at = ${decidedAt}::timestamptz
        where membership_id = ${current.membership_id}::uuid
      `.execute(transaction);
      const response: MembershipProjection = {
        ...project(current), state: 'LEFT', competitionEnabled: false,
        decidedAt, decidedBy: actorId, version: context.nextVersion,
      };
      const notifications = notificationDrafts(
        [current.user_id], ids.notificationIds, 'community.membership_request_withdrawn',
        current.membership_id, current.community_id, null,
      );
      return {
        responseStatus: 200, response,
        event: {
          eventId: ids.eventId, eventName: 'MembershipRequestWithdrawn', schemaVersion: 1,
          transitionId: 'M-05', payload: {
            membershipId: current.membership_id, communityId: current.community_id,
            userId: current.user_id,
          }, metadata: { policyVersion: MEMBERSHIP_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId, action: 'WITHDRAW_MEMBERSHIP_REQUEST', transitionId: 'M-05',
          reasonCode: 'WITHDRAWN_BY_REQUESTER', beforeState: current.state,
          afterState: 'LEFT', metadata: { communityId: current.community_id },
        },
        outbox: [{ messageId: ids.outboxMessageId, topic: 'notification.in_app.v1',
          payload: { notifications } }],
      };
    },
  });
}

export async function listPendingMemberships(
  database: Kysely<Database>,
  actorId: string,
  communityId: string,
): Promise<readonly PendingMembershipProjection[]> {
  const context = await sql<{ readonly venue_id: string }>`
    select venue_id from community.communities where community_id = ${communityId}::uuid
  `.execute(database);
  const venueId = context.rows[0]?.venue_id;
  if (!venueId) throw new MembershipNotFoundError();
  const controlled = await database.transaction().execute((transaction) =>
    actorControlsVenue(transaction, actorId, venueId));
  if (!controlled) throw new MembershipConflictError('MEMBERSHIP_ADMIN_REQUIRED');
  const result = await sql<MembershipRow & { readonly display_name: string }>`
    select membership.membership_id, membership.community_id, membership.user_id,
      membership.age_division, membership.state, membership.competition_enabled,
      membership.join_path, membership.requested_at, membership.decided_at,
      membership.decided_by, membership.public_rejection_reason_code,
      membership.reapply_not_before_at, membership.version::text as version,
      users.display_name
    from community.community_memberships as membership
    join identity.users as users on users.user_id = membership.user_id
    where membership.community_id = ${communityId}::uuid and membership.state = 'PENDING'
    order by membership.requested_at, membership.membership_id
  `.execute(database);
  return result.rows.map((row) => ({ ...project(row), displayName: row.display_name }));
}

export async function readMembershipTimerSnapshot(
  database: Kysely<Database>,
  membershipId: string,
): Promise<TimerAggregateSnapshot> {
  const row = await selectMembership(database, membershipId);
  if (!row) throw new MembershipNotFoundError();
  return { state: row.state, version: Number(row.version) };
}

export async function projectPendingMembershipNotification(
  database: Kysely<Database>,
  membershipId: string,
  kind: 'REMINDER' | 'ESCALATION',
  notificationIds: readonly string[],
): Promise<number> {
  return database.transaction().execute(async (transaction) => {
    const current = await selectMembership(transaction, membershipId, true);
    if (!current || current.state !== 'PENDING') return 0;
    const venue = await sql<{ readonly venue_id: string }>`
      select venue_id from community.communities where community_id = ${current.community_id}::uuid
    `.execute(transaction);
    const venueId = venue.rows[0]?.venue_id;
    if (!venueId) throw new MembershipNotFoundError();
    const recipients = await notificationRecipients(
      transaction, venueId, kind === 'REMINDER' ? 'ADMIN' : 'CENTRAL',
    );
    if (notificationIds.length < recipients.length) {
      throw new RangeError('Not enough membership timer notification IDs');
    }
    const event = await sql<{ readonly event_id: string }>`
      select event_id from platform.domain_events
      where aggregate_type = 'CommunityMembership'
        and aggregate_id = ${membershipId}::uuid and transition_id = 'M-02'
      order by aggregate_version limit 1
    `.execute(transaction);
    const sourceEventId = event.rows[0]?.event_id;
    if (!sourceEventId) throw new MembershipNotFoundError();
    let createdCount = 0;
    for (const [index, recipientUserId] of recipients.entries()) {
      const inserted = await sql<{ readonly notification_id: string }>`
        insert into platform.notifications (
          notification_id, recipient_user_id, source_event_id, category, render_key,
          action_target, payload, deadline_at
        ) values (
          ${notificationIds[index]!}::uuid, ${recipientUserId}::uuid,
          ${sourceEventId}::uuid, 'SERVICE',
          ${kind === 'REMINDER' ? 'community.membership_request_reminder' :
            'community.membership_request_escalated'},
          ${JSON.stringify({ type: 'MEMBERSHIP', id: membershipId })}::jsonb,
          ${JSON.stringify({ membershipId, communityId: current.community_id })}::jsonb,
          null
        ) on conflict (recipient_user_id, source_event_id, render_key) do nothing
        returning notification_id
      `.execute(transaction);
      createdCount += inserted.rows.length;
    }
    return createdCount;
  });
}
