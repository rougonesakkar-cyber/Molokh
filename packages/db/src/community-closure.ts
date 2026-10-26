import {
  COMMUNITY_LIFECYCLE_POLICY_VERSION,
  CommunityLifecycleConflictError,
  assertCommunityClosureTransition,
  type CommandEnvelope,
  type CommunityClosureSessionDisposition,
  type CommunityState,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import { executeCriticalCommand, type ExecutedCommand, type RelatedDomainEventDraft } from './platform-command.js';

export interface CommunityClosureSessionDecision {
  readonly sessionId: string;
  readonly disposition: CommunityClosureSessionDisposition;
}

export interface ScheduleCommunityClosurePayload {
  readonly communityId: string;
  readonly category: string;
  readonly reason: string;
  readonly emergency: boolean;
  readonly effectiveAt: string;
  readonly sessionDispositions: readonly CommunityClosureSessionDecision[];
}

export interface FinalizeCommunityClosurePayload {
  readonly communityId: string;
  readonly planId: string;
  readonly reason: string;
}

export interface ScheduleCommunityClosureEffectIds {
  readonly planId: string;
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly notificationOutboxMessageId: string;
  readonly notificationIds: readonly string[];
  readonly competitionEventIds: readonly string[];
  readonly challengeEventIds: readonly string[];
  readonly sessionEventIds: readonly string[];
}

export interface FinalizeCommunityClosureEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly competitionEventIds: readonly string[];
  readonly membershipEventIds: readonly string[];
  readonly statusDispositionIds: readonly string[];
  readonly statusEventIds: readonly string[];
  readonly challengeEventIds: readonly string[];
}

export interface CommunityClosureProjection {
  readonly planId: string;
  readonly communityId: string;
  readonly planVersion: number;
  readonly planState: 'SCHEDULED' | 'FINALIZED';
  readonly communityState: Extract<CommunityState, 'CLOSING' | 'CLOSED'>;
  readonly category: string;
  readonly reason: string;
  readonly emergency: boolean;
  readonly effectiveAt: string;
  readonly scheduledAt: string;
  readonly finalizedAt: string | null;
  readonly retainedSessionCount: number;
  readonly cancelledSessionCount: number;
  readonly communityVersion: number;
}

export interface CommunityClosureSessionCandidate {
  readonly sessionId: string;
  readonly state: 'SCHEDULED' | 'READY_FOR_COACH' | 'IN_PROGRESS' | 'ENDED';
  readonly scheduledStartAt: string;
  readonly scheduledEndAt: string;
  readonly athleteDisplayNames: readonly [string, string];
  readonly recommendedDisposition: CommunityClosureSessionDisposition;
  readonly cancellationAllowed: boolean;
}

export interface CommunityClosureCommandPreparation {
  readonly sessions: readonly CommunityClosureSessionCandidate[];
  readonly competitionCount: number;
  readonly liveChallengeCount: number;
  readonly memberCount: number;
  readonly statusHolderCount: number;
}

interface CommunityRow {
  readonly community_id: string;
  readonly venue_id: string;
  readonly state: CommunityState;
  readonly pause_started_at: Date | null;
  readonly version: string;
}

interface PlanRow {
  readonly plan_id: string;
  readonly community_id: string;
  readonly plan_version: number;
  readonly state: 'SCHEDULED' | 'FINALIZED';
  readonly category: string;
  readonly reason: string;
  readonly emergency: boolean;
  readonly effective_at: Date;
  readonly scheduled_at: Date;
  readonly finalized_at: Date | null;
}

interface VersionedRow {
  readonly id: string;
  readonly version: string;
}

interface CompetitionRow extends VersionedRow {
  readonly champion_user_id: string | null;
  readonly contender_user_id: string | null;
  readonly availability: 'ACTIVE' | 'PAUSED' | 'CLOSED';
}

interface SessionRow extends VersionedRow {
  readonly challenge_id: string;
  readonly state: 'SCHEDULED' | 'READY_FOR_COACH' | 'IN_PROGRESS' | 'ENDED';
}

interface MembershipRow extends VersionedRow {
  readonly user_id: string;
  readonly state: 'PENDING' | 'ACTIVE' | 'UNDER_REVIEW';
}

function uuidSet(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => value.toLowerCase()));
}

function assertIds(actual: number, provided: readonly string[], label: string): void {
  if (provided.length < actual) throw new TypeError(`${label} ID is required for every affected aggregate`);
}

async function communityRow(
  database: Kysely<Database> | Transaction<Database>,
  communityId: string,
  lock = false,
): Promise<CommunityRow | null> {
  const result = await sql<CommunityRow>`
    select community_id, venue_id, state, pause_started_at, version::text
    from community.communities
    where community_id = ${communityId}::uuid
    ${lock ? sql`for update` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function planRow(
  database: Kysely<Database> | Transaction<Database>,
  planId: string,
  lock = false,
): Promise<PlanRow | null> {
  const result = await sql<PlanRow>`
    select plan_id, community_id, plan_version, state, category, reason, emergency,
      effective_at, scheduled_at, finalized_at
    from community.community_closure_plans
    where plan_id = ${planId}::uuid
    ${lock ? sql`for update` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function actorIsCentral(
  database: Kysely<Database> | Transaction<Database>,
  actorUserId: string | null,
): Promise<boolean> {
  if (!actorUserId) return false;
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

async function closureProjection(
  database: Kysely<Database> | Transaction<Database>,
  plan: PlanRow,
): Promise<CommunityClosureProjection> {
  const community = await communityRow(database, plan.community_id);
  if (!community || (community.state !== 'CLOSING' && community.state !== 'CLOSED')) {
    throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_INVALID_STATE');
  }
  const counts = await sql<{
    readonly retained: string;
    readonly cancelled: string;
  }>`
    select
      count(*) filter (where disposition = 'RETAIN_TO_COMPLETION')::text as retained,
      count(*) filter (where disposition = 'CANCEL_NO_FAULT')::text as cancelled
    from community.community_closure_session_dispositions
    where plan_id = ${plan.plan_id}::uuid
  `.execute(database);
  return {
    planId: plan.plan_id,
    communityId: plan.community_id,
    planVersion: plan.plan_version,
    planState: plan.state,
    communityState: community.state,
    category: plan.category,
    reason: plan.reason,
    emergency: plan.emergency,
    effectiveAt: plan.effective_at.toISOString(),
    scheduledAt: plan.scheduled_at.toISOString(),
    finalizedAt: plan.finalized_at?.toISOString() ?? null,
    retainedSessionCount: Number(counts.rows[0]?.retained ?? '0'),
    cancelledSessionCount: Number(counts.rows[0]?.cancelled ?? '0'),
    communityVersion: Number(community.version),
  };
}

export async function readCommunityClosure(
  database: Kysely<Database>,
  communityId: string,
): Promise<CommunityClosureProjection | null> {
  const result = await sql<{ readonly plan_id: string }>`
    select plan_id from community.community_closure_plans
    where community_id = ${communityId}::uuid
    order by plan_version desc limit 1
  `.execute(database);
  const id = result.rows[0]?.plan_id;
  if (!id) return null;
  const plan = await planRow(database, id);
  return plan ? closureProjection(database, plan) : null;
}

export async function readCommunityClosureSessionCandidates(
  database: Kysely<Database>,
  communityId: string,
): Promise<readonly CommunityClosureSessionCandidate[]> {
  const result = await sql<{
    readonly session_id: string;
    readonly state: 'SCHEDULED' | 'READY_FOR_COACH' | 'IN_PROGRESS' | 'ENDED';
    readonly scheduled_start_at: Date;
    readonly scheduled_end_at: Date;
    readonly low_display_name: string;
    readonly high_display_name: string;
  }>`
    select session.session_id, session.state, session.scheduled_start_at, session.scheduled_end_at,
      low_user.display_name as low_display_name, high_user.display_name as high_display_name
    from scheduling.sessions as session
    join community.communities as community on community.venue_id = session.venue_id
    join competition.challenges as challenge on challenge.challenge_id = session.challenge_id
    join identity.users as low_user on low_user.user_id = session.pair_low_id
    join identity.users as high_user on high_user.user_id = session.pair_high_id
    where community.community_id = ${communityId}::uuid
      and community.state in ('ACTIVE', 'PAUSED')
      and session.purpose = 'OFFICIAL_CHALLENGE'
      and (
        session.state in ('SCHEDULED', 'READY_FOR_COACH', 'IN_PROGRESS')
        or (session.state = 'ENDED'
          and challenge.state in ('RESULT_PENDING', 'RESULT_RECORDED', 'UNDER_APPEAL'))
      )
    order by session.scheduled_start_at, session.session_id
  `.execute(database);
  return result.rows.map((row) => ({
    sessionId: row.session_id,
    state: row.state,
    scheduledStartAt: row.scheduled_start_at.toISOString(),
    scheduledEndAt: row.scheduled_end_at.toISOString(),
    athleteDisplayNames: [row.low_display_name, row.high_display_name],
    recommendedDisposition: 'RETAIN_TO_COMPLETION',
    cancellationAllowed: row.state === 'SCHEDULED' || row.state === 'READY_FOR_COACH',
  }));
}

export async function readCommunityClosureCommandPreparation(
  database: Kysely<Database>,
  communityId: string,
): Promise<CommunityClosureCommandPreparation> {
  const sessions = await readCommunityClosureSessionCandidates(database, communityId);
  const result = await sql<{
    readonly competition_count: string;
    readonly live_challenge_count: string;
    readonly member_count: string;
    readonly status_holder_count: string;
  }>`
    select
      (select count(*)::text from competition.competitions
        where community_id = ${communityId}::uuid and phase <> 'CLOSED') as competition_count,
      (select count(*)::text from competition.challenges as challenge
        join competition.competitions as competition
          on competition.competition_id = challenge.competition_id
        where competition.community_id = ${communityId}::uuid
          and challenge.state in (
            'AWAITING_RESPONSE', 'ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED',
            'IN_SESSION', 'RESULT_PENDING', 'RESULT_RECORDED', 'UNDER_APPEAL'
          )) as live_challenge_count,
      (select count(*)::text from community.community_memberships
        where community_id = ${communityId}::uuid
          and state in ('PENDING', 'ACTIVE', 'UNDER_REVIEW')) as member_count,
      (select coalesce(sum(
          (champion_user_id is not null)::integer + (contender_user_id is not null)::integer
        ), 0)::text
        from competition.competitions
        where community_id = ${communityId}::uuid and phase <> 'CLOSED') as status_holder_count
  `.execute(database);
  const counts = result.rows[0];
  return {
    sessions,
    competitionCount: Number(counts?.competition_count ?? '0'),
    liveChallengeCount: Number(counts?.live_challenge_count ?? '0'),
    memberCount: Number(counts?.member_count ?? '0'),
    statusHolderCount: Number(counts?.status_holder_count ?? '0'),
  };
}

function scheduleCommandActor(
  command: CommandEnvelope<ScheduleCommunityClosurePayload>,
): string {
  if (
    command.actor.type !== 'USER' || !command.actor.id
    || command.aggregateType !== 'Community'
    || command.aggregateId !== command.payload.communityId
    || command.commandType !== 'SCHEDULE_COMMUNITY_CLOSURE'
  ) {
    throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_CENTRAL_REQUIRED');
  }
  return command.actor.id;
}

function finalizationActor(
  command: CommandEnvelope<FinalizeCommunityClosurePayload>,
): { readonly actorId: string | null; readonly isSystem: boolean } {
  const user = command.actor.type === 'USER' && command.actor.id !== null;
  const system = command.actor.type === 'SYSTEM' && command.actor.id === null;
  if (
    (!user && !system) || command.aggregateType !== 'Community'
    || command.aggregateId !== command.payload.communityId
    || command.commandType !== 'FINALIZE_COMMUNITY_CLOSURE'
  ) {
    throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_CENTRAL_REQUIRED');
  }
  return { actorId: command.actor.id, isSystem: system };
}

function relatedEvent(
  row: VersionedRow,
  eventId: string,
  eventName: string,
  transitionId: string,
  aggregateType: string,
  payload: Readonly<Record<string, unknown>>,
): RelatedDomainEventDraft {
  return {
    eventId, eventName, schemaVersion: 1, transitionId, aggregateType,
    aggregateId: row.id, aggregateVersion: Number(row.version) + 1,
    payload, metadata: { policyVersion: COMMUNITY_LIFECYCLE_POLICY_VERSION },
  };
}

export async function scheduleCommunityClosure(
  database: Kysely<Database>,
  command: CommandEnvelope<ScheduleCommunityClosurePayload>,
  ids: ScheduleCommunityClosureEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<CommunityClosureProjection>> {
  const actorUserId = scheduleCommandActor(command);
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const community = await communityRow(transaction, command.payload.communityId, true);
      if (!community) throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_INVALID_STATE');
      const effectiveAt = new Date(command.payload.effectiveAt);
      assertCommunityClosureTransition({
        action: 'SCHEDULE_CLOSURE',
        actorIsCentral: await actorIsCentral(transaction, actorUserId),
        currentState: community.state,
        reason: command.payload.reason,
        effectiveAt,
        now: context.occurredAt,
        emergency: command.payload.emergency,
        dispositions: command.payload.sessionDispositions,
      });
      const category = command.payload.category.trim();
      if (category.length < 1 || category.length > 80) {
        throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_REASON_REQUIRED');
      }

      const competitionResult = await sql<{
        readonly competition_id: string;
        readonly availability: 'ACTIVE' | 'PAUSED' | 'CLOSED';
        readonly version: string;
        readonly champion_user_id: string | null;
        readonly contender_user_id: string | null;
      }>`
        select competition_id, availability, version::text, champion_user_id, contender_user_id
        from competition.competitions
        where community_id = ${community.community_id}::uuid and availability <> 'CLOSED'
        order by age_division, coalesce(discipline_key, ''), competition_id
        for update
      `.execute(transaction);
      const competitions: CompetitionRow[] = competitionResult.rows.map((row) => ({
        id: row.competition_id,
        availability: row.availability,
        version: row.version,
        champion_user_id: row.champion_user_id,
        contender_user_id: row.contender_user_id,
      }));
      if (competitions.length === 0) {
        throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_INVALID_STATE');
      }

      const sessionResult = await sql<{
        readonly session_id: string;
        readonly challenge_id: string;
        readonly state: 'SCHEDULED' | 'READY_FOR_COACH' | 'IN_PROGRESS' | 'ENDED';
        readonly version: string;
      }>`
        select session.session_id, session.challenge_id, session.state, session.version::text
        from scheduling.sessions as session
        join competition.challenges as challenge on challenge.challenge_id = session.challenge_id
        where session.venue_id = ${community.venue_id}::uuid
          and session.purpose = 'OFFICIAL_CHALLENGE'
          and (
            session.state in ('SCHEDULED', 'READY_FOR_COACH', 'IN_PROGRESS')
            or (session.state = 'ENDED'
              and challenge.state in ('RESULT_PENDING', 'RESULT_RECORDED', 'UNDER_APPEAL'))
          )
        order by session.scheduled_start_at, session.session_id
        for update
      `.execute(transaction);
      const sessions: SessionRow[] = sessionResult.rows.map((row) => ({
        id: row.session_id, challenge_id: row.challenge_id,
        state: row.state, version: row.version,
      }));
      const provided = uuidSet(command.payload.sessionDispositions.map((item) => item.sessionId));
      const expected = uuidSet(sessions.map((item) => item.id));
      if (
        provided.size !== command.payload.sessionDispositions.length
        || provided.size !== expected.size
        || [...expected].some((sessionId) => !provided.has(sessionId))
      ) {
        throw new CommunityLifecycleConflictError(
          'COMMUNITY_CLOSURE_SESSION_DISPOSITIONS_INVALID',
        );
      }
      const dispositionBySession = new Map(
        command.payload.sessionDispositions.map((item) => [item.sessionId.toLowerCase(), item.disposition]),
      );
      if (sessions.some((session) =>
        (session.state === 'IN_PROGRESS' || session.state === 'ENDED')
        && dispositionBySession.get(session.id.toLowerCase()) === 'CANCEL_NO_FAULT')) {
        throw new CommunityLifecycleConflictError(
          'COMMUNITY_CLOSURE_SESSION_DISPOSITIONS_INVALID',
        );
      }
      const retainedChallengeIds = uuidSet(sessions
        .filter((session) => dispositionBySession.get(session.id.toLowerCase()) === 'RETAIN_TO_COMPLETION')
        .map((session) => session.challenge_id));

      const challengeResult = await sql<{
        readonly challenge_id: string;
        readonly version: string;
      }>`
        select challenge.challenge_id, challenge.version::text
        from competition.challenges as challenge
        join competition.competitions as competition
          on competition.competition_id = challenge.competition_id
        where competition.community_id = ${community.community_id}::uuid
          and challenge.state in (
            'AWAITING_RESPONSE', 'ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED',
            'IN_SESSION', 'RESULT_PENDING', 'RESULT_RECORDED', 'UNDER_APPEAL'
          )
        order by challenge.challenge_id
        for update of challenge
      `.execute(transaction);
      const challenges: VersionedRow[] = challengeResult.rows
        .filter((row) => !retainedChallengeIds.has(row.challenge_id.toLowerCase()))
        .map((row) => ({ id: row.challenge_id, version: row.version }));
      const cancelledSessions = sessions.filter((session) =>
        dispositionBySession.get(session.id.toLowerCase()) === 'CANCEL_NO_FAULT');

      assertIds(competitions.length, ids.competitionEventIds, 'Competition event');
      assertIds(challenges.length, ids.challengeEventIds, 'Challenge event');
      assertIds(cancelledSessions.length, ids.sessionEventIds, 'Session event');

      const members = await sql<{ readonly user_id: string }>`
        select user_id from community.community_memberships
        where community_id = ${community.community_id}::uuid
          and state in ('PENDING', 'ACTIVE', 'UNDER_REVIEW')
        order by user_id
      `.execute(transaction);
      assertIds(members.rows.length, ids.notificationIds, 'Notification');

      await sql`
        insert into community.community_closure_plans (
          plan_id, community_id, plan_version, state, category, reason, emergency,
          effective_at, new_action_cutoff_at, notification_at,
          scheduled_by, reviewed_by, scheduled_at
        ) values (
          ${ids.planId}::uuid, ${community.community_id}::uuid, 1, 'SCHEDULED',
          ${category}, ${command.payload.reason.trim()}, ${command.payload.emergency},
          ${effectiveAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz,
          ${actorUserId}::uuid, ${actorUserId}::uuid,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      for (const decision of command.payload.sessionDispositions) {
        await sql`
          insert into community.community_closure_session_dispositions (
            plan_id, session_id, disposition, reason, recorded_at
          ) values (
            ${ids.planId}::uuid, ${decision.sessionId}::uuid, ${decision.disposition},
            ${command.payload.reason.trim()}, ${context.occurredAt.toISOString()}::timestamptz
          )
        `.execute(transaction);
      }

      if (community.state === 'PAUSED') {
        await sql`
          update community.community_pause_intervals
          set ended_by = ${actorUserId}::uuid,
            ended_at = ${context.occurredAt.toISOString()}::timestamptz,
            resolution_reason = 'Permanent Community closure scheduled',
            duration_seconds = greatest(0, floor(extract(epoch from
              (${context.occurredAt.toISOString()}::timestamptz - started_at)))::bigint)
          where community_id = ${community.community_id}::uuid and ended_at is null
        `.execute(transaction);
      }
      await sql`
        update community.communities
        set state = 'CLOSING', pause_started_at = null, version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where community_id = ${community.community_id}::uuid
          and state in ('ACTIVE', 'PAUSED')
      `.execute(transaction);
      await sql`
        update competition.competitions
        set availability = 'CLOSED', version = version + 1,
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where community_id = ${community.community_id}::uuid
          and availability in ('ACTIVE', 'PAUSED')
      `.execute(transaction);

      if (challenges.length > 0) {
        const challengeIds = challenges.map((row) => row.id);
        await sql`
          update competition.challenges
          set state = 'CANCELLED_NO_FAULT', decided_at = ${context.occurredAt.toISOString()}::timestamptz,
            version = version + 1, updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where challenge_id = any(${challengeIds}::uuid[])
        `.execute(transaction);
        await sql`
          update competition.challenge_participant_obligations
          set released_at = ${context.occurredAt.toISOString()}::timestamptz,
            release_reason = 'COMMUNITY_CLOSURE'
          where challenge_id = any(${challengeIds}::uuid[]) and released_at is null
        `.execute(transaction);
        await sql`
          update scheduling.bookings
          set state = 'CANCELLED', cancelled_at = ${context.occurredAt.toISOString()}::timestamptz,
            cancel_actor = ${actorUserId}::uuid, cancel_reason = 'COMMUNITY_CLOSURE',
            version = version + 1, updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where challenge_id = any(${challengeIds}::uuid[])
            and state not in ('EXPIRED', 'REJECTED', 'CANCELLED', 'COMPLETED')
        `.execute(transaction);
        await sql`
          update scheduling.slots as slot
          set state = 'CANCELLED', version = slot.version + 1,
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          from scheduling.bookings as booking
          where booking.slot_id = slot.slot_id
            and booking.challenge_id = any(${challengeIds}::uuid[])
            and slot.state = 'BOOKED'
        `.execute(transaction);
      }
      if (cancelledSessions.length > 0) {
        const sessionIds = cancelledSessions.map((row) => row.id);
        await sql`
          update scheduling.sessions
          set state = 'CANCELLED', cancelled_at = ${context.occurredAt.toISOString()}::timestamptz,
            cancelled_by = ${actorUserId}::uuid,
            cancellation_reason_code = 'COMMUNITY_CLOSURE', version = version + 1,
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where session_id = any(${sessionIds}::uuid[])
            and state in ('SCHEDULED', 'READY_FOR_COACH')
        `.execute(transaction);
      }
      await sql`
        update competition.challenge_queue_entries as entry
        set state = 'INVALIDATED', decided_at = ${context.occurredAt.toISOString()}::timestamptz,
          terminal_reason = 'COMMUNITY_CLOSURE', reconfirmation_deadline_at = null,
          version = entry.version + 1, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        from competition.competitions as competition
        where entry.competition_id = competition.competition_id
          and competition.community_id = ${community.community_id}::uuid
          and entry.state in ('WAITING', 'PAIRED_PENDING_ACCEPTANCE',
            'RECONFIRMATION_REQUIRED', 'ACTIVATED')
      `.execute(transaction);

      const plan = await planRow(transaction, ids.planId);
      if (!plan) throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_INVALID_STATE');
      const relatedEvents: RelatedDomainEventDraft[] = [
        ...competitions.map((competition, index) => relatedEvent(
          competition, ids.competitionEventIds[index]!, 'CompetitionAvailabilityClosed', 'CA-03',
          'Competition', { communityId: community.community_id, planId: ids.planId },
        )),
        ...challenges.map((challenge, index) => relatedEvent(
          challenge, ids.challengeEventIds[index]!, 'ChallengeCancelledNoFault', 'CH-26',
          'Challenge', { communityId: community.community_id, planId: ids.planId,
            reason: 'COMMUNITY_CLOSURE' },
        )),
        ...cancelledSessions.map((session, index) => relatedEvent(
          session, ids.sessionEventIds[index]!, 'SessionCancelled', 'S-04',
          'Session', { communityId: community.community_id, planId: ids.planId,
            reason: 'COMMUNITY_CLOSURE' },
        )),
      ];
      return {
        responseStatus: 200,
        response: await closureProjection(transaction, plan),
        event: {
          eventId: ids.eventId, eventName: 'CommunityClosureScheduled', schemaVersion: 1,
          transitionId: 'CO-04', payload: {
            communityId: community.community_id, planId: ids.planId, category,
            emergency: command.payload.emergency, effectiveAt: effectiveAt.toISOString(),
            retainedSessionCount: sessions.length - cancelledSessions.length,
            cancelledSessionCount: cancelledSessions.length,
            noFaultChallengeCount: challenges.length,
          }, metadata: { policyVersion: COMMUNITY_LIFECYCLE_POLICY_VERSION },
        },
        relatedEvents,
        audit: {
          auditId: ids.auditId, action: 'SCHEDULE_COMMUNITY_CLOSURE', transitionId: 'CO-04',
          reasonCode: category, beforeState: community.state, afterState: 'CLOSING',
          metadata: { planId: ids.planId, reason: command.payload.reason.trim(),
            emergency: command.payload.emergency, effectiveAt: effectiveAt.toISOString() },
        },
        outbox: [{
          messageId: ids.outboxMessageId, topic: 'community.closure-scheduled.v1',
          payload: { communityId: community.community_id, planId: ids.planId,
            effectiveAt: effectiveAt.toISOString() },
        }, {
          messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1',
          payload: { notifications: members.rows.map((member, index) => ({
            notificationId: ids.notificationIds[index]!, recipientUserId: member.user_id,
            category: 'SERVICE', renderKey: 'community.closure-scheduled',
            actionTarget: { type: 'COMMUNITY', communityId: community.community_id },
            payload: { planId: ids.planId, effectiveAt: effectiveAt.toISOString(), category },
            deadlineAt: effectiveAt.toISOString(),
          })) },
        }],
      };
    },
  });
}

export async function finalizeCommunityClosure(
  database: Kysely<Database>,
  command: CommandEnvelope<FinalizeCommunityClosurePayload>,
  ids: FinalizeCommunityClosureEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<CommunityClosureProjection>> {
  const actor = finalizationActor(command);
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const community = await communityRow(transaction, command.payload.communityId, true);
      const plan = await planRow(transaction, command.payload.planId, true);
      if (!community || !plan || plan.community_id !== community.community_id || plan.state !== 'SCHEDULED') {
        throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_INVALID_STATE');
      }
      const unresolved = await sql<{ readonly count: string }>`
        select count(*)::text as count
        from community.community_closure_session_dispositions as disposition
        join scheduling.sessions as session on session.session_id = disposition.session_id
        left join competition.challenges as challenge on challenge.challenge_id = session.challenge_id
        left join competition.results as result
          on result.challenge_id = challenge.challenge_id and result.cycle_no = challenge.cycle_no
        where disposition.plan_id = ${plan.plan_id}::uuid
          and disposition.disposition = 'RETAIN_TO_COMPLETION'
          and (
            session.state not in ('ENDED', 'CANCELLED')
            or (session.state = 'ENDED' and (
              challenge.state <> 'COMPLETED'
              or result.state is null
              or result.state in ('RECORDED', 'UNDER_APPEAL')
            ))
          )
      `.execute(transaction);
      assertCommunityClosureTransition({
        action: 'FINALIZE_CLOSURE',
        actorIsCentral: actor.isSystem ? false : await actorIsCentral(transaction, actor.actorId),
        actorIsSystem: actor.isSystem,
        currentState: community.state,
        reason: command.payload.reason,
        effectiveAt: plan.effective_at,
        now: context.occurredAt,
        emergency: plan.emergency,
        unresolvedRetainedSessionCount: Number(unresolved.rows[0]?.count ?? '0'),
      });

      const competitionResult = await sql<{
        readonly competition_id: string;
        readonly availability: 'ACTIVE' | 'PAUSED' | 'CLOSED';
        readonly version: string;
        readonly champion_user_id: string | null;
        readonly contender_user_id: string | null;
      }>`
        select competition_id, availability, version::text, champion_user_id, contender_user_id
        from competition.competitions
        where community_id = ${community.community_id}::uuid and phase <> 'CLOSED'
        order by age_division, coalesce(discipline_key, ''), competition_id
        for update
      `.execute(transaction);
      const competitions: CompetitionRow[] = competitionResult.rows.map((row) => ({
        id: row.competition_id, availability: row.availability, version: row.version,
        champion_user_id: row.champion_user_id, contender_user_id: row.contender_user_id,
      }));
      const membershipResult = await sql<{
        readonly membership_id: string;
        readonly user_id: string;
        readonly state: 'PENDING' | 'ACTIVE' | 'UNDER_REVIEW';
        readonly version: string;
      }>`
        select membership_id, user_id, state, version::text
        from community.community_memberships
        where community_id = ${community.community_id}::uuid
          and state in ('PENDING', 'ACTIVE', 'UNDER_REVIEW')
        order by membership_id for update
      `.execute(transaction);
      const memberships: MembershipRow[] = membershipResult.rows.map((row) => ({
        id: row.membership_id, user_id: row.user_id, state: row.state, version: row.version,
      }));
      const statusHolders = competitions.flatMap((competition) => [
        ...(competition.champion_user_id ? [{ competition, statusType: 'CHAMPION' as const,
          userId: competition.champion_user_id }] : []),
        ...(competition.contender_user_id ? [{ competition, statusType: 'CONTENDER' as const,
          userId: competition.contender_user_id }] : []),
      ]);
      const cancelledRetained = await sql<{
        readonly challenge_id: string;
        readonly version: string;
      }>`
        select challenge.challenge_id, challenge.version::text
        from community.community_closure_session_dispositions as disposition
        join scheduling.sessions as session on session.session_id = disposition.session_id
        join competition.challenges as challenge on challenge.challenge_id = session.challenge_id
        where disposition.plan_id = ${plan.plan_id}::uuid
          and disposition.disposition = 'RETAIN_TO_COMPLETION'
          and session.state = 'CANCELLED'
          and challenge.state not in ('COMPLETED', 'CANCELLED_NO_FAULT')
        order by challenge.challenge_id for update of challenge
      `.execute(transaction);
      const challenges: VersionedRow[] = cancelledRetained.rows.map((row) => ({
        id: row.challenge_id, version: row.version,
      }));

      assertIds(competitions.length, ids.competitionEventIds, 'Competition event');
      assertIds(memberships.length, ids.membershipEventIds, 'Membership event');
      assertIds(statusHolders.length, ids.statusDispositionIds, 'Status disposition');
      assertIds(statusHolders.length, ids.statusEventIds, 'Status event');
      assertIds(challenges.length, ids.challengeEventIds, 'Challenge event');

      if (challenges.length > 0) {
        const challengeIds = challenges.map((item) => item.id);
        await sql`
          update competition.challenges
          set state = 'CANCELLED_NO_FAULT', decided_at = ${context.occurredAt.toISOString()}::timestamptz,
            version = version + 1, updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where challenge_id = any(${challengeIds}::uuid[])
        `.execute(transaction);
        await sql`
          update competition.challenge_participant_obligations
          set released_at = ${context.occurredAt.toISOString()}::timestamptz,
            release_reason = 'COMMUNITY_CLOSURE'
          where challenge_id = any(${challengeIds}::uuid[]) and released_at is null
        `.execute(transaction);
      }
      for (const [index, holder] of statusHolders.entries()) {
        await sql`
          insert into community.community_closure_status_dispositions (
            status_disposition_id, plan_id, competition_id, status_type,
            user_id, closure_reason, closed_at
          ) values (
            ${ids.statusDispositionIds[index]}::uuid, ${plan.plan_id}::uuid,
            ${holder.competition.id}::uuid, ${holder.statusType}, ${holder.userId}::uuid,
            'COMMUNITY_CLOSED', ${context.occurredAt.toISOString()}::timestamptz
          )
        `.execute(transaction);
      }
      await sql`
        update competition.competitions
        set phase = 'CLOSED', availability = 'CLOSED', champion_user_id = null,
          contender_user_id = null, status_lock_result_id = null,
          status_version = status_version + 1, version = version + 1,
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where community_id = ${community.community_id}::uuid and phase <> 'CLOSED'
      `.execute(transaction);
      await sql`
        update community.community_memberships
        set state = 'ARCHIVED', competition_enabled = false,
          decided_at = ${context.occurredAt.toISOString()}::timestamptz,
          decided_by = ${actor.actorId}::uuid, reason_code = 'COMMUNITY_CLOSED',
          version = version + 1, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where community_id = ${community.community_id}::uuid
          and state in ('PENDING', 'ACTIVE', 'UNDER_REVIEW')
      `.execute(transaction);
      await sql`
        update community.communities
        set state = 'CLOSED', pause_started_at = null, version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where community_id = ${community.community_id}::uuid and state = 'CLOSING'
      `.execute(transaction);
      await sql`
        update community.community_closure_plans
        set state = 'FINALIZED', finalized_by = ${actor.actorId}::uuid,
          finalized_actor_type = ${actor.isSystem ? 'SYSTEM' : 'USER'},
          finalized_at = ${context.occurredAt.toISOString()}::timestamptz
        where plan_id = ${plan.plan_id}::uuid and state = 'SCHEDULED'
      `.execute(transaction);

      const updatedPlan = await planRow(transaction, plan.plan_id);
      if (!updatedPlan) throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_INVALID_STATE');
      const relatedEvents: RelatedDomainEventDraft[] = [
        ...competitions.map((competition, index) => relatedEvent(
          competition, ids.competitionEventIds[index]!, 'CompetitionClosed', 'C-11',
          'Competition', { communityId: community.community_id, planId: plan.plan_id,
            statusReason: 'COMMUNITY_CLOSED' },
        )),
        ...memberships.map((membership, index) => relatedEvent(
          membership, ids.membershipEventIds[index]!, 'MembershipArchivedByCommunityClosure',
          'M-11', 'Membership', { communityId: community.community_id, planId: plan.plan_id,
            userId: membership.user_id, previousState: membership.state },
        )),
        ...statusHolders.map((holder, index) => ({
          eventId: ids.statusEventIds[index]!, eventName: 'StatusTenureClosed', schemaVersion: 1,
          transitionId: 'TN-05', aggregateType: 'StatusTenure',
          aggregateId: ids.statusDispositionIds[index]!, aggregateVersion: 1,
          payload: { communityId: community.community_id, planId: plan.plan_id,
            competitionId: holder.competition.id, statusType: holder.statusType,
            userId: holder.userId, reason: 'COMMUNITY_CLOSED', successorUserId: null,
            winLossApplied: false },
          metadata: { policyVersion: COMMUNITY_LIFECYCLE_POLICY_VERSION },
        })),
        ...challenges.map((challenge, index) => relatedEvent(
          challenge, ids.challengeEventIds[index]!, 'ChallengeCancelledNoFault', 'CH-26',
          'Challenge', { communityId: community.community_id, planId: plan.plan_id,
            reason: 'COMMUNITY_CLOSURE' },
        )),
      ];
      return {
        responseStatus: 200,
        response: await closureProjection(transaction, updatedPlan),
        event: {
          eventId: ids.eventId, eventName: 'CommunityClosed', schemaVersion: 1,
          transitionId: 'CO-05', payload: {
            communityId: community.community_id, planId: plan.plan_id,
            archivedMembershipCount: memberships.length,
            closedCompetitionCount: competitions.length,
            closedStatusTenureCount: statusHolders.length,
            statusMigrationPerformed: false,
          }, metadata: { policyVersion: COMMUNITY_LIFECYCLE_POLICY_VERSION },
        },
        relatedEvents,
        audit: {
          auditId: ids.auditId, action: 'FINALIZE_COMMUNITY_CLOSURE', transitionId: 'CO-05',
          reasonCode: 'COMMUNITY_CLOSED', beforeState: 'CLOSING', afterState: 'CLOSED',
          metadata: { planId: plan.plan_id, reason: command.payload.reason.trim(),
            archivedMembershipCount: memberships.length,
            closedStatusTenureCount: statusHolders.length },
        },
        outbox: [{
          messageId: ids.outboxMessageId, topic: 'community.closed.v1',
          payload: { communityId: community.community_id, planId: plan.plan_id,
            closedAt: context.occurredAt.toISOString() },
        }],
      };
    },
  });
}
