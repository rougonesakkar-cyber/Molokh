import {
  MEMBERSHIP_REMOVAL_POLICY_VERSION,
  MembershipRemovalConflictError,
  assertMembershipRemovalAppeal,
  assertMembershipRemovalDecision,
  assertMembershipRemovalRequest,
  deriveConfirmedRemovalStatusPlan,
  membershipRemovalAppealDeadline,
  membershipRemovalSubjectStatus,
  type CommandEnvelope,
  type MembershipRemovalCaseState,
  type MembershipRemovalDecision,
  type MembershipRemovalSubjectStatus,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import {
  executeCriticalCommand,
  type ExecutedCommand,
  type RelatedDomainEventDraft,
} from './platform-command.js';

export interface RequestMembershipRemovalPayload {
  readonly membershipId: string;
  readonly reason: string;
}

export interface AppealMembershipRemovalPayload {
  readonly caseId: string;
  readonly reason: string;
}

export interface DecideMembershipRemovalPayload {
  readonly caseId: string;
  readonly decision: MembershipRemovalDecision;
  readonly reason: string;
  readonly cancelConfirmedSessions: boolean;
}

export interface MembershipRemovalEffectIds {
  readonly caseId?: string;
  readonly holdId?: string;
  readonly replacementMembershipId?: string;
  readonly eventId: string;
  readonly membershipEventId: string;
  readonly statusEventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly notificationOutboxMessageId: string;
}

export interface MembershipRemovalProjection {
  readonly caseId: string;
  readonly membershipId: string;
  readonly communityId: string;
  readonly competitionId: string;
  readonly subjectUserId: string;
  readonly subjectDisplayName: string;
  readonly requestedByUserId: string;
  readonly requestedByDisplayName: string;
  readonly subjectStatus: MembershipRemovalSubjectStatus;
  readonly state: MembershipRemovalCaseState;
  readonly requestReason: string;
  readonly requestedAt: string;
  readonly appealDeadlineAt: string | null;
  readonly appealReason: string | null;
  readonly appealedAt: string | null;
  readonly reviewedByUserId: string | null;
  readonly decisionReason: string | null;
  readonly decidedAt: string | null;
  readonly replacementMembershipId: string | null;
  readonly cancelledChallengeCount: number;
  readonly cancelledBookingCount: number;
  readonly invalidatedQueueEntryCount: number;
  readonly version: number;
}

export interface VenueMemberProjection {
  readonly membershipId: string;
  readonly userId: string;
  readonly displayName: string;
  readonly ageDivision: 'YOUTH' | 'ADULT';
  readonly membershipState: 'ACTIVE' | 'UNDER_REVIEW';
  readonly status: MembershipRemovalSubjectStatus;
  readonly latestRemovalCase: MembershipRemovalProjection | null;
}

interface RemovalContextRow {
  readonly membership_id: string;
  readonly membership_version: string;
  readonly membership_state: string;
  readonly community_id: string;
  readonly community_state: string;
  readonly venue_id: string;
  readonly subject_user_id: string;
  readonly subject_display_name: string;
  readonly age_division: 'YOUTH' | 'ADULT';
  readonly join_path: 'QR' | 'INVITE' | 'SELF_REQUEST';
  readonly competition_id: string;
  readonly competition_version: string;
  readonly competition_phase: string;
  readonly competition_availability: string;
  readonly champion_user_id: string | null;
  readonly contender_user_id: string | null;
  readonly status_version: string;
}

interface RemovalCaseRow {
  readonly case_id: string;
  readonly membership_id: string;
  readonly community_id: string;
  readonly competition_id: string;
  readonly subject_user_id: string;
  readonly subject_display_name: string;
  readonly requested_by: string;
  readonly requested_by_display_name: string;
  readonly subject_status: MembershipRemovalSubjectStatus;
  readonly state: MembershipRemovalCaseState;
  readonly request_reason: string;
  readonly requested_at: Date;
  readonly appeal_deadline_at: Date | null;
  readonly appeal_reason: string | null;
  readonly appealed_at: Date | null;
  readonly reviewed_by: string | null;
  readonly decision_reason: string | null;
  readonly decided_at: Date | null;
  readonly before_membership_version: string;
  readonly after_membership_version: string | null;
  readonly before_champion_user_id: string | null;
  readonly before_contender_user_id: string | null;
  readonly before_status_version: string;
  readonly after_champion_user_id: string | null;
  readonly after_contender_user_id: string | null;
  readonly after_status_version: string | null;
  readonly replacement_membership_id: string | null;
  readonly cancelled_challenge_count: number;
  readonly cancelled_booking_count: number;
  readonly invalidated_queue_entry_count: number;
  readonly version: string;
}

interface CancellationCounts {
  readonly challengeCount: number;
  readonly bookingCount: number;
  readonly invalidatedQueueEntryCount: number;
}

async function removalContext(
  database: Kysely<Database> | Transaction<Database>,
  membershipId: string,
  lock = false,
): Promise<RemovalContextRow | null> {
  const result = await sql<RemovalContextRow>`
    select membership.membership_id, membership.version::text as membership_version,
      membership.state as membership_state, membership.community_id,
      community.state as community_state, community.venue_id,
      membership.user_id as subject_user_id, subject.display_name as subject_display_name,
      membership.age_division, membership.join_path,
      competition.competition_id, competition.version::text as competition_version,
      competition.phase as competition_phase,
      competition.availability as competition_availability,
      competition.champion_user_id, competition.contender_user_id,
      competition.status_version::text as status_version
    from community.community_memberships as membership
    join community.communities as community on community.community_id = membership.community_id
    join identity.users as subject on subject.user_id = membership.user_id
    join competition.competitions as competition
      on competition.community_id = membership.community_id
      and competition.age_division = membership.age_division
      and competition.discipline_key is null
    where membership.membership_id = ${membershipId}::uuid
    ${lock ? sql`for update of membership, competition` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function removalCaseRow(
  database: Kysely<Database> | Transaction<Database>,
  caseId: string,
  lock = false,
): Promise<RemovalCaseRow | null> {
  const result = await sql<RemovalCaseRow>`
    select removal.*, subject.display_name as subject_display_name,
      requester.display_name as requested_by_display_name
    from community.membership_removal_cases as removal
    join identity.users as subject on subject.user_id = removal.subject_user_id
    join identity.users as requester on requester.user_id = removal.requested_by
    where removal.case_id = ${caseId}::uuid
    ${lock ? sql`for update of removal` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

function projection(row: RemovalCaseRow): MembershipRemovalProjection {
  return {
    caseId: row.case_id,
    membershipId: row.membership_id,
    communityId: row.community_id,
    competitionId: row.competition_id,
    subjectUserId: row.subject_user_id,
    subjectDisplayName: row.subject_display_name,
    requestedByUserId: row.requested_by,
    requestedByDisplayName: row.requested_by_display_name,
    subjectStatus: row.subject_status,
    state: row.state,
    requestReason: row.request_reason,
    requestedAt: row.requested_at.toISOString(),
    appealDeadlineAt: row.appeal_deadline_at?.toISOString() ?? null,
    appealReason: row.appeal_reason,
    appealedAt: row.appealed_at?.toISOString() ?? null,
    reviewedByUserId: row.reviewed_by,
    decisionReason: row.decision_reason,
    decidedAt: row.decided_at?.toISOString() ?? null,
    replacementMembershipId: row.replacement_membership_id,
    cancelledChallengeCount: row.cancelled_challenge_count,
    cancelledBookingCount: row.cancelled_booking_count,
    invalidatedQueueEntryCount: row.invalidated_queue_entry_count,
    version: Number(row.version),
  };
}

async function actorIsScopedAdmin(
  database: Kysely<Database> | Transaction<Database>,
  actorUserId: string,
  venueId: string,
): Promise<boolean> {
  const result = await sql<{ readonly allowed: boolean }>`
    select exists (
      select 1 from community.role_grants
      where user_id = ${actorUserId}::uuid
        and role in ('PRIMARY_ADMIN', 'GYM_ADMIN')
        and scope_type = 'VENUE' and scope_id = ${venueId}::uuid
        and state = 'ACTIVE' and (expires_at is null or expires_at > clock_timestamp())
    ) as allowed
  `.execute(database);
  return result.rows[0]?.allowed === true;
}

async function actorIsCentral(
  database: Kysely<Database> | Transaction<Database>,
  actorUserId: string,
): Promise<boolean> {
  const result = await sql<{ readonly allowed: boolean }>`
    select exists (
      select 1 from community.role_grants
      where user_id = ${actorUserId}::uuid and role = 'CENTRAL_ADMIN'
        and scope_type = 'GLOBAL' and scope_id is null and state = 'ACTIVE'
        and (expires_at is null or expires_at > clock_timestamp())
    ) as allowed
  `.execute(database);
  return result.rows[0]?.allowed === true;
}

async function cancelIncompleteProcesses(
  transaction: Transaction<Database>,
  context: RemovalContextRow,
  actorUserId: string,
  occurredAt: Date,
): Promise<CancellationCounts> {
  const timestamp = occurredAt.toISOString();
  const started = await sql<{ readonly session_id: string }>`
    select session.session_id
    from scheduling.sessions as session
    join competition.challenges as challenge on challenge.challenge_id = session.challenge_id
    where ${context.subject_user_id}::uuid in (session.pair_low_id, session.pair_high_id)
      and (
        session.state = 'IN_PROGRESS'
        or (session.state = 'ENDED' and challenge.state = 'RESULT_PENDING')
      )
      and session.purpose = 'OFFICIAL_CHALLENGE'
      and challenge.competition_id = ${context.competition_id}::uuid
    limit 1
  `.execute(transaction);
  if (started.rows.length > 0) {
    throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_STARTED_SESSION');
  }

  await sql`
    update scheduling.sessions
    set state = 'CANCELLED', cancelled_at = ${timestamp}::timestamptz,
      cancelled_by = ${actorUserId}::uuid,
      cancellation_reason_code = 'MEMBERSHIP_REMOVAL_NO_FAULT',
      version = version + 1, updated_at = ${timestamp}::timestamptz
    where ${context.subject_user_id}::uuid in (pair_low_id, pair_high_id)
      and state in ('SCHEDULED', 'READY_FOR_COACH') and actual_start_at is null
      and challenge_id in (
        select challenge_id from competition.challenges
        where competition_id = ${context.competition_id}::uuid
      )
  `.execute(transaction);

  const bookings = await sql<{ readonly booking_id: string; readonly slot_id: string }>`
    update scheduling.bookings
    set state = 'CANCELLED', cancelled_at = ${timestamp}::timestamptz,
      cancel_actor = ${actorUserId}::uuid,
      cancel_reason = 'MEMBERSHIP_REMOVAL_NO_FAULT',
      version = version + 1, updated_at = ${timestamp}::timestamptz
    where ${context.subject_user_id}::uuid in (pair_low_id, pair_high_id)
      and purpose = 'OFFICIAL_CHALLENGE'
      and challenge_id in (
        select challenge_id from competition.challenges
        where competition_id = ${context.competition_id}::uuid
      )
      and state not in ('EXPIRED', 'REJECTED', 'CANCELLED', 'COMPLETED')
    returning booking_id, slot_id
  `.execute(transaction);
  if (bookings.rows.length > 0) {
    await sql`
      update scheduling.slots
      set state = 'CANCELLED', version = version + 1, updated_at = ${timestamp}::timestamptz
      where booking_id = any(${bookings.rows.map((row) => row.booking_id)}::uuid[])
        and state = 'BOOKED'
    `.execute(transaction);
  }

  const challenges = await sql<{ readonly challenge_id: string }>`
    update competition.challenges
    set state = 'CANCELLED_NO_FAULT', decided_at = ${timestamp}::timestamptz,
      version = version + 1, updated_at = ${timestamp}::timestamptz
    where competition_id = ${context.competition_id}::uuid
      and ${context.subject_user_id}::uuid in (initiator_user_id, recipient_user_id)
      and state in ('AWAITING_RESPONSE', 'ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED')
    returning challenge_id
  `.execute(transaction);
  if (challenges.rows.length > 0) {
    await sql`
      update competition.challenge_participant_obligations
      set released_at = ${timestamp}::timestamptz,
        release_reason = 'MEMBERSHIP_REMOVAL_NO_FAULT'
      where challenge_id = any(${challenges.rows.map((row) => row.challenge_id)}::uuid[])
        and released_at is null
    `.execute(transaction);
  }
  const queueEntries = await sql<{ readonly queue_entry_id: string }>`
    update competition.challenge_queue_entries
    set state = 'INVALIDATED', terminal_reason = 'MEMBERSHIP_REMOVED',
      decided_at = ${timestamp}::timestamptz, reconfirmation_deadline_at = null,
      version = version + 1, updated_at = ${timestamp}::timestamptz
    where competition_id = ${context.competition_id}::uuid
      and initiator_user_id = ${context.subject_user_id}::uuid
      and state in ('WAITING', 'PAIRED_PENDING_ACCEPTANCE', 'RECONFIRMATION_REQUIRED', 'ACTIVATED')
    returning queue_entry_id
  `.execute(transaction);
  return {
    challengeCount: challenges.rows.length,
    bookingCount: bookings.rows.length,
    invalidatedQueueEntryCount: queueEntries.rows.length,
  };
}

function notificationOutbox(
  ids: MembershipRemovalEffectIds,
  recipientUserId: string,
  caseId: string,
  kind: string,
  sourceEventId: string,
) {
  return {
    messageId: ids.notificationOutboxMessageId,
    topic: 'notification.in_app.v1',
    sourceEventId,
    payload: {
      notifications: [{
        notificationId: ids.notificationOutboxMessageId,
        recipientUserId,
        kind,
        payload: { caseId },
      }],
    },
  };
}

export async function requestMembershipRemoval(
  database: Kysely<Database>,
  command: CommandEnvelope<RequestMembershipRemovalPayload>,
  ids: MembershipRemovalEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<MembershipRemovalProjection>> {
  if (
    !command.actor.id || command.actor.type !== 'USER'
    || command.aggregateType !== 'MembershipRemovalCase'
    || command.commandType !== 'REQUEST_MEMBERSHIP_REMOVAL'
    || command.aggregateId !== ids.caseId
  ) throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_ADMIN_REQUIRED');
  if (!ids.caseId || !ids.holdId) throw new TypeError('Removal case and hold IDs are required');
  const caseId = ids.caseId;
  const holdId = ids.holdId;

  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, mutation) => {
      const current = await removalContext(transaction, command.payload.membershipId, true);
      if (!current) throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_NOT_FOUND');
      const scopedAdmin = await actorIsScopedAdmin(
        transaction, command.actor.id!, current.venue_id,
      );
      assertMembershipRemovalRequest({
        membershipActive: current.membership_state === 'ACTIVE',
        communityActive: current.community_state === 'ACTIVE',
        actorIsScopedAdmin: scopedAdmin,
        actorUserId: command.actor.id!, subjectUserId: current.subject_user_id,
        reason: command.payload.reason,
      });
      const subjectStatus = membershipRemovalSubjectStatus({
        subjectUserId: current.subject_user_id,
        championUserId: current.champion_user_id,
        contenderUserId: current.contender_user_id,
      });
      const ordinary = subjectStatus === 'ORDINARY';
      if (!ordinary) {
        const unresolvedSession = await sql<{ readonly session_id: string }>`
          select session.session_id
          from scheduling.sessions as session
          join competition.challenges as challenge
            on challenge.challenge_id = session.challenge_id
          where ${current.subject_user_id}::uuid in (session.pair_low_id, session.pair_high_id)
            and session.purpose = 'OFFICIAL_CHALLENGE'
            and challenge.competition_id = ${current.competition_id}::uuid
            and (
              session.state = 'IN_PROGRESS'
              or (session.state = 'ENDED' and challenge.state = 'RESULT_PENDING')
            )
          limit 1
        `.execute(transaction);
        if (unresolvedSession.rows.length > 0) {
          throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_STARTED_SESSION');
        }
      }
      const appealDeadlineAt = ordinary
        ? membershipRemovalAppealDeadline(mutation.occurredAt)
        : null;
      let counts: CancellationCounts = {
        challengeCount: 0, bookingCount: 0, invalidatedQueueEntryCount: 0,
      };
      if (ordinary) {
        counts = await cancelIncompleteProcesses(
          transaction, current, command.actor.id!, mutation.occurredAt,
        );
        await sql`
          update community.community_memberships
          set state = 'REMOVED', competition_enabled = false,
            reason_code = 'GYM_ADMIN_REMOVAL', decided_at = ${mutation.occurredAt.toISOString()}::timestamptz,
            decided_by = ${command.actor.id}::uuid,
            removed_at = ${mutation.occurredAt.toISOString()}::timestamptz,
            version = version + 1, updated_at = ${mutation.occurredAt.toISOString()}::timestamptz
          where membership_id = ${current.membership_id}::uuid and state = 'ACTIVE'
        `.execute(transaction);
      } else {
        await sql`
          update community.community_memberships
          set state = 'UNDER_REVIEW', competition_enabled = false,
            reason_code = 'STATUS_HOLDER_REMOVAL_REVIEW', decided_at = ${mutation.occurredAt.toISOString()}::timestamptz,
            decided_by = ${command.actor.id}::uuid,
            version = version + 1, updated_at = ${mutation.occurredAt.toISOString()}::timestamptz
          where membership_id = ${current.membership_id}::uuid and state = 'ACTIVE'
        `.execute(transaction);
      }
      await sql`
        insert into community.membership_removal_cases (
          case_id, membership_id, community_id, competition_id, subject_user_id,
          requested_by, subject_status, state, request_reason, request_event_id,
          requested_at, appeal_deadline_at, before_membership_version,
          after_membership_version, before_champion_user_id, before_contender_user_id,
          before_status_version, cancelled_challenge_count, cancelled_booking_count,
          invalidated_queue_entry_count, version
        ) values (
          ${caseId}::uuid, ${current.membership_id}::uuid, ${current.community_id}::uuid,
          ${current.competition_id}::uuid, ${current.subject_user_id}::uuid,
          ${command.actor.id}::uuid, ${subjectStatus},
          ${ordinary ? 'REMOVED_APPEALABLE' : 'UNDER_REVIEW'},
          ${command.payload.reason.trim()}, ${ids.eventId}::uuid,
          ${mutation.occurredAt.toISOString()}::timestamptz,
          ${appealDeadlineAt?.toISOString() ?? null}::timestamptz,
          ${Number(current.membership_version)}, ${Number(current.membership_version) + 1},
          ${current.champion_user_id}::uuid, ${current.contender_user_id}::uuid,
          ${Number(current.status_version)}, ${counts.challengeCount}, ${counts.bookingCount},
          ${counts.invalidatedQueueEntryCount}, 1
        )
      `.execute(transaction);
      if (!ordinary) {
        await sql`
          insert into competition.process_holds (
            hold_id, aggregate_type, aggregate_id, reason, state, deadline_policy,
            source_case_id, created_by, started_at, version
          ) values (
            ${holdId}::uuid, 'COMPETITION', ${current.competition_id}::uuid,
            'STATUS_REVIEW', 'ACTIVE', 'PAUSE', ${caseId}::uuid,
            ${command.actor.id}::uuid, ${mutation.occurredAt.toISOString()}::timestamptz, 1
          )
        `.execute(transaction);
      }
      const created = await removalCaseRow(transaction, caseId);
      if (!created) throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_NOT_FOUND');
      const eventName = ordinary ? 'MembershipRemoved' : 'StatusHolderRemovalReviewStarted';
      const transitionId = ordinary ? 'M-07' : 'M-08';
      return {
        responseStatus: 201,
        response: projection(created),
        event: {
          eventId: ids.eventId, eventName, schemaVersion: 1, transitionId,
          payload: {
            caseId, membershipId: current.membership_id,
            subjectUserId: current.subject_user_id, subjectStatus,
            reason: command.payload.reason.trim(), appealDeadlineAt: appealDeadlineAt?.toISOString() ?? null,
            cancelledChallengeCount: counts.challengeCount,
            cancelledBookingCount: counts.bookingCount,
          },
          metadata: { policyVersion: MEMBERSHIP_REMOVAL_POLICY_VERSION },
        },
        relatedEvents: [{
          eventId: ids.membershipEventId,
          eventName: ordinary ? 'MembershipRemoved' : 'StatusHolderRemovalReviewStarted',
          schemaVersion: 1, transitionId, aggregateType: 'CommunityMembership',
          aggregateId: current.membership_id,
          aggregateVersion: Number(current.membership_version) + 1,
          payload: { caseId, subjectStatus },
          metadata: { policyVersion: MEMBERSHIP_REMOVAL_POLICY_VERSION },
        }],
        audit: {
          auditId: ids.auditId, action: ordinary ? 'REMOVE_ORDINARY' : 'REQUEST_STATUS_HOLDER_REMOVAL',
          transitionId, reasonCode: 'GYM_ADMIN_REMOVAL',
          beforeState: 'ACTIVE', afterState: ordinary ? 'REMOVED' : 'UNDER_REVIEW',
          metadata: { membershipId: current.membership_id, subjectUserId: current.subject_user_id },
        },
        outbox: [
          { messageId: ids.outboxMessageId, topic: 'community.membership.removal.v1', payload: { caseId, eventName } },
          notificationOutbox(ids, current.subject_user_id, caseId, ordinary ? 'MEMBERSHIP_REMOVED' : 'MEMBERSHIP_REMOVAL_UNDER_REVIEW', ids.eventId),
        ],
      };
    },
  });
}

export async function appealMembershipRemoval(
  database: Kysely<Database>,
  command: CommandEnvelope<AppealMembershipRemovalPayload>,
  ids: MembershipRemovalEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<MembershipRemovalProjection>> {
  if (
    !command.actor.id || command.actor.type !== 'USER'
    || command.aggregateType !== 'MembershipRemovalCase'
    || command.aggregateId !== command.payload.caseId
    || command.commandType !== 'APPEAL_MEMBERSHIP_REMOVAL'
  ) throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_SUBJECT_REQUIRED');
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, mutation) => {
      const row = await removalCaseRow(transaction, command.aggregateId, true);
      if (!row) throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_NOT_FOUND');
      assertMembershipRemovalAppeal({
        state: row.state, actorUserId: command.actor.id!, subjectUserId: row.subject_user_id,
        appealDeadlineAt: row.appeal_deadline_at, occurredAt: mutation.occurredAt,
        reason: command.payload.reason,
      });
      await sql`
        update community.membership_removal_cases
        set state = 'APPEALED', appeal_reason = ${command.payload.reason.trim()},
          appealed_at = ${mutation.occurredAt.toISOString()}::timestamptz,
          appeal_event_id = ${ids.eventId}::uuid, version = version + 1,
          updated_at = ${mutation.occurredAt.toISOString()}::timestamptz
        where case_id = ${row.case_id}::uuid and state = 'REMOVED_APPEALABLE'
      `.execute(transaction);
      const updated = await removalCaseRow(transaction, row.case_id);
      if (!updated) throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_NOT_FOUND');
      return {
        responseStatus: 200, response: projection(updated),
        event: {
          eventId: ids.eventId, eventName: 'MembershipRemovalAppealed', schemaVersion: 1,
          transitionId: 'M-07-APPEAL', payload: { caseId: row.case_id, membershipId: row.membership_id },
          metadata: { policyVersion: MEMBERSHIP_REMOVAL_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId, action: 'APPEAL_MEMBERSHIP_REMOVAL',
          transitionId: 'M-07-APPEAL', reasonCode: 'SUBJECT_APPEAL',
          beforeState: row.state, afterState: 'APPEALED', metadata: {},
        },
        outbox: [{
          messageId: ids.outboxMessageId, topic: 'community.membership.removal.appealed.v1',
          payload: { caseId: row.case_id },
        }],
      };
    },
  });
}

export async function decideMembershipRemoval(
  database: Kysely<Database>,
  command: CommandEnvelope<DecideMembershipRemovalPayload>,
  ids: MembershipRemovalEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<MembershipRemovalProjection>> {
  if (
    !command.actor.id || command.actor.type !== 'USER'
    || command.aggregateType !== 'MembershipRemovalCase'
    || command.aggregateId !== command.payload.caseId
    || command.commandType !== 'DECIDE_MEMBERSHIP_REMOVAL'
  ) throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_CENTRAL_REQUIRED');
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, mutation) => {
      const row = await removalCaseRow(transaction, command.aggregateId, true);
      if (!row) throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_NOT_FOUND');
      assertMembershipRemovalDecision({
        actorIsCentral: await actorIsCentral(transaction, command.actor.id!),
        state: row.state, subjectStatus: row.subject_status,
        decision: command.payload.decision, reason: command.payload.reason,
      });
      const current = await removalContext(transaction, row.membership_id, true);
      if (!current) throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_NOT_FOUND');
      const confirming = command.payload.decision === 'CONFIRM_REMOVAL';
      let afterState: MembershipRemovalCaseState;
      let membershipEventName: string;
      let transitionId: 'M-09' | 'M-10' | 'M-07-DECISION';
      let replacementMembershipId: string | null = null;
      let afterChampion = row.before_champion_user_id;
      let afterContender = row.before_contender_user_id;
      let afterStatusVersion: number | null = null;
      let counts: CancellationCounts = {
        challengeCount: row.cancelled_challenge_count,
        bookingCount: row.cancelled_booking_count,
        invalidatedQueueEntryCount: row.invalidated_queue_entry_count,
      };
      const relatedEvents: RelatedDomainEventDraft[] = [];

      if (row.subject_status === 'ORDINARY') {
        transitionId = 'M-07-DECISION';
        if (confirming) {
          afterState = 'CONFIRMED';
          membershipEventName = 'MembershipRemovalConfirmed';
        } else {
          if (!ids.replacementMembershipId) {
            throw new TypeError('Replacement Membership ID is required for an overturned removal');
          }
          replacementMembershipId = ids.replacementMembershipId;
          afterState = 'OVERTURNED';
          membershipEventName = 'MembershipRemovalRejected';
          await sql`
            insert into community.community_memberships (
              membership_id, community_id, user_id, age_division, state,
              competition_enabled, join_path, decided_at, decided_by, version
            ) values (
              ${replacementMembershipId}::uuid, ${current.community_id}::uuid,
              ${current.subject_user_id}::uuid, ${current.age_division}, 'ACTIVE', true,
              ${current.join_path}, ${mutation.occurredAt.toISOString()}::timestamptz,
              ${command.actor.id}::uuid, 1
            )
          `.execute(transaction);
          relatedEvents.push({
            eventId: ids.membershipEventId, eventName: 'MembershipActivated', schemaVersion: 1,
            transitionId: 'M-03', aggregateType: 'CommunityMembership',
            aggregateId: replacementMembershipId, aggregateVersion: 1,
            payload: { restoredFromCaseId: row.case_id, previousMembershipId: row.membership_id },
            metadata: { policyVersion: MEMBERSHIP_REMOVAL_POLICY_VERSION },
          });
        }
      } else if (!confirming) {
        transitionId = 'M-09';
        afterState = 'REJECTED';
        membershipEventName = 'MembershipRemovalRejected';
        await sql`
          update community.community_memberships
          set state = 'ACTIVE', competition_enabled = true,
            reason_code = null, decided_at = ${mutation.occurredAt.toISOString()}::timestamptz,
            decided_by = ${command.actor.id}::uuid, version = version + 1,
            updated_at = ${mutation.occurredAt.toISOString()}::timestamptz
          where membership_id = ${current.membership_id}::uuid and state = 'UNDER_REVIEW'
        `.execute(transaction);
        await sql`
          update competition.process_holds
          set state = 'RELEASED', released_by = ${command.actor.id}::uuid,
            released_at = ${mutation.occurredAt.toISOString()}::timestamptz,
            version = version + 1, updated_at = ${mutation.occurredAt.toISOString()}::timestamptz
          where source_case_id = ${row.case_id}::uuid and state = 'ACTIVE'
        `.execute(transaction);
        relatedEvents.push({
          eventId: ids.membershipEventId, eventName: membershipEventName, schemaVersion: 1,
          transitionId, aggregateType: 'CommunityMembership', aggregateId: current.membership_id,
          aggregateVersion: Number(current.membership_version) + 1,
          payload: { caseId: row.case_id },
          metadata: { policyVersion: MEMBERSHIP_REMOVAL_POLICY_VERSION },
        });
      } else {
        transitionId = 'M-10';
        afterState = 'CONFIRMED';
        membershipEventName = 'MembershipRemovalConfirmed';
        if (!command.payload.cancelConfirmedSessions) {
          throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_STARTED_SESSION');
        }
        if (
          row.before_champion_user_id !== current.champion_user_id
          || row.before_contender_user_id !== current.contender_user_id
          || Number(row.before_status_version) !== Number(current.status_version)
        ) throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_CONTEXT_CHANGED');
        counts = await cancelIncompleteProcesses(
          transaction, current, command.actor.id!, mutation.occurredAt,
        );
        const statusPlan = deriveConfirmedRemovalStatusPlan({
          subjectUserId: current.subject_user_id, subjectStatus: row.subject_status,
          championUserId: current.champion_user_id, contenderUserId: current.contender_user_id,
        });
        if (!statusPlan) throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_CONTEXT_CHANGED');
        afterChampion = statusPlan.afterChampionUserId;
        afterContender = statusPlan.afterContenderUserId;
        afterStatusVersion = Number(current.status_version) + 1;
        await sql`
          update community.community_memberships
          set state = 'REMOVED', competition_enabled = false,
            reason_code = 'CENTRAL_CONFIRMED_REMOVAL',
            decided_at = ${mutation.occurredAt.toISOString()}::timestamptz,
            decided_by = ${command.actor.id}::uuid,
            removed_at = ${mutation.occurredAt.toISOString()}::timestamptz,
            version = version + 1, updated_at = ${mutation.occurredAt.toISOString()}::timestamptz
          where membership_id = ${current.membership_id}::uuid and state = 'UNDER_REVIEW'
        `.execute(transaction);
        await sql`
          update competition.competitions
          set champion_user_id = ${afterChampion}::uuid, contender_user_id = ${afterContender}::uuid,
            status_version = ${afterStatusVersion}, phase = ${statusPlan.afterPhase},
            version = version + 1, updated_at = ${mutation.occurredAt.toISOString()}::timestamptz
          where competition_id = ${current.competition_id}::uuid
            and status_version = ${Number(current.status_version)}
        `.execute(transaction);
        await sql`
          update competition.process_holds
          set state = 'RELEASED', released_by = ${command.actor.id}::uuid,
            released_at = ${mutation.occurredAt.toISOString()}::timestamptz,
            version = version + 1, updated_at = ${mutation.occurredAt.toISOString()}::timestamptz
          where source_case_id = ${row.case_id}::uuid and state = 'ACTIVE'
        `.execute(transaction);
        relatedEvents.push(
          {
            eventId: ids.membershipEventId, eventName: membershipEventName, schemaVersion: 1,
            transitionId, aggregateType: 'CommunityMembership', aggregateId: current.membership_id,
            aggregateVersion: Number(current.membership_version) + 1,
            payload: { caseId: row.case_id, subjectStatus: row.subject_status },
            metadata: { policyVersion: MEMBERSHIP_REMOVAL_POLICY_VERSION },
          },
          {
            eventId: ids.statusEventId, eventName: statusPlan.eventName, schemaVersion: 1,
            transitionId: statusPlan.transitionId, aggregateType: 'Competition',
            aggregateId: current.competition_id,
            aggregateVersion: Number(current.competition_version) + 1,
            payload: {
              sourceCaseId: row.case_id, administrative: true,
              before: {
                championUserId: current.champion_user_id,
                contenderUserId: current.contender_user_id,
                statusVersion: Number(current.status_version),
              },
              after: {
                championUserId: afterChampion,
                contenderUserId: afterContender,
                statusVersion: afterStatusVersion,
              },
            },
            metadata: { policyVersion: MEMBERSHIP_REMOVAL_POLICY_VERSION },
          },
        );
      }

      await sql`
        update community.membership_removal_cases
        set state = ${afterState}, reviewed_by = ${command.actor.id}::uuid,
          decision_reason = ${command.payload.reason.trim()},
          decision_event_id = ${ids.eventId}::uuid,
          decided_at = ${mutation.occurredAt.toISOString()}::timestamptz,
          after_membership_version = ${Number(current.membership_version) + (row.subject_status === 'ORDINARY' ? 0 : 1)},
          after_champion_user_id = ${afterChampion}::uuid,
          after_contender_user_id = ${afterContender}::uuid,
          after_status_version = ${afterStatusVersion},
          replacement_membership_id = ${replacementMembershipId}::uuid,
          cancelled_challenge_count = ${counts.challengeCount},
          cancelled_booking_count = ${counts.bookingCount},
          invalidated_queue_entry_count = ${counts.invalidatedQueueEntryCount},
          version = version + 1, updated_at = ${mutation.occurredAt.toISOString()}::timestamptz
        where case_id = ${row.case_id}::uuid and state = ${row.state}
      `.execute(transaction);
      const updated = await removalCaseRow(transaction, row.case_id);
      if (!updated) throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_NOT_FOUND');
      return {
        responseStatus: 200, response: projection(updated),
        event: {
          eventId: ids.eventId, eventName: membershipEventName, schemaVersion: 1,
          transitionId, payload: {
            caseId: row.case_id, membershipId: row.membership_id,
            decision: command.payload.decision, subjectStatus: row.subject_status,
            replacementMembershipId,
          },
          metadata: { policyVersion: MEMBERSHIP_REMOVAL_POLICY_VERSION },
        },
        relatedEvents,
        audit: {
          auditId: ids.auditId, action: 'DECIDE_MEMBERSHIP_REMOVAL', transitionId,
          reasonCode: command.payload.decision,
          beforeState: row.state, afterState,
          metadata: { membershipId: row.membership_id, subjectUserId: row.subject_user_id },
        },
        outbox: [
          { messageId: ids.outboxMessageId, topic: 'community.membership.removal.decided.v1', payload: { caseId: row.case_id, state: afterState } },
          notificationOutbox(ids, row.subject_user_id, row.case_id, membershipEventName, ids.eventId),
        ],
      };
    },
  });
}

export async function listMembershipRemovalsForSubject(
  database: Kysely<Database>,
  subjectUserId: string,
): Promise<readonly MembershipRemovalProjection[]> {
  const result = await sql<RemovalCaseRow>`
    select removal.*, subject.display_name as subject_display_name,
      requester.display_name as requested_by_display_name
    from community.membership_removal_cases as removal
    join identity.users as subject on subject.user_id = removal.subject_user_id
    join identity.users as requester on requester.user_id = removal.requested_by
    where removal.subject_user_id = ${subjectUserId}::uuid
    order by removal.requested_at desc, removal.case_id desc
    limit 20
  `.execute(database);
  return result.rows.map(projection);
}

export async function listMembershipRemovalsForCentral(
  database: Kysely<Database>,
  centralUserId: string,
): Promise<readonly MembershipRemovalProjection[]> {
  if (!await actorIsCentral(database, centralUserId)) {
    throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_CENTRAL_REQUIRED');
  }
  const result = await sql<RemovalCaseRow>`
    select removal.*, subject.display_name as subject_display_name,
      requester.display_name as requested_by_display_name
    from community.membership_removal_cases as removal
    join identity.users as subject on subject.user_id = removal.subject_user_id
    join identity.users as requester on requester.user_id = removal.requested_by
    where removal.state in ('UNDER_REVIEW', 'APPEALED')
    order by removal.requested_at, removal.case_id
    limit 100
  `.execute(database);
  return result.rows.map(projection);
}

export async function listVenueMembersForAdmin(
  database: Kysely<Database>,
  actorUserId: string,
  venueId: string,
): Promise<readonly VenueMemberProjection[]> {
  if (!await actorIsScopedAdmin(database, actorUserId, venueId)) {
    throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_ADMIN_REQUIRED');
  }
  const result = await sql<{
    readonly membership_id: string;
    readonly user_id: string;
    readonly display_name: string;
    readonly age_division: 'YOUTH' | 'ADULT';
    readonly membership_state: 'ACTIVE' | 'UNDER_REVIEW';
    readonly champion_user_id: string | null;
    readonly contender_user_id: string | null;
    readonly case_id: string | null;
  }>`
    select membership.membership_id, membership.user_id, subject.display_name,
      membership.age_division, membership.state as membership_state,
      competition.champion_user_id, competition.contender_user_id,
      latest.case_id
    from community.community_memberships as membership
    join community.communities as community on community.community_id = membership.community_id
    join identity.users as subject on subject.user_id = membership.user_id
    join competition.competitions as competition
      on competition.community_id = membership.community_id
      and competition.age_division = membership.age_division
      and competition.discipline_key is null
    left join lateral (
      select removal.case_id
      from community.membership_removal_cases as removal
      where removal.membership_id = membership.membership_id
      order by removal.requested_at desc, removal.case_id desc limit 1
    ) as latest on true
    where community.venue_id = ${venueId}::uuid
      and membership.state in ('ACTIVE', 'UNDER_REVIEW')
    order by
      case when membership.user_id = competition.champion_user_id then 0
        when membership.user_id = competition.contender_user_id then 1 else 2 end,
      subject.display_name, membership.membership_id
  `.execute(database);
  const cases = new Map<string, MembershipRemovalProjection>();
  for (const caseId of result.rows.map((row) => row.case_id).filter((id): id is string => id !== null)) {
    const item = await removalCaseRow(database, caseId);
    if (item) cases.set(caseId, projection(item));
  }
  return result.rows.map((row) => ({
    membershipId: row.membership_id,
    userId: row.user_id,
    displayName: row.display_name,
    ageDivision: row.age_division,
    membershipState: row.membership_state,
    status: membershipRemovalSubjectStatus({
      subjectUserId: row.user_id,
      championUserId: row.champion_user_id,
      contenderUserId: row.contender_user_id,
    }),
    latestRemovalCase: row.case_id ? cases.get(row.case_id) ?? null : null,
  }));
}
