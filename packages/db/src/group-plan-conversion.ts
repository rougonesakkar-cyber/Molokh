import {
  CHALLENGE_POLICY_VERSION,
  SCHEDULING_POLICY_VERSION,
  SchedulingConflictError,
  SchedulingPermissionDeniedError,
  acceptedChallengeSchedulingDeadline,
  assertGroupPlanOfficialConversionCanBeRequested,
  assertOfficialConversionCanExpire,
  assertOfficialConversionDecisionCanBeRecorded,
  type CommandEnvelope,
  type OfficialConversionRequiredRole,
  type TimerAggregateSnapshot,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import {
  executeCriticalCommand,
  type ExecutedCommand,
  type OutboxDraft,
} from './platform-command.js';

export interface RequestGroupPlanOfficialConversionPayload {
  readonly groupPlanId: string;
  readonly explicitRulesetAcknowledged?: boolean;
}

export interface DecideGroupPlanOfficialConversionPayload {
  readonly conversionId: string;
  readonly decision: 'ACCEPT' | 'DECLINE';
  readonly explicitRulesetAcknowledged?: boolean;
}

export interface ExpireGroupPlanOfficialConversionPayload {
  readonly conversionId: string;
}

export interface GroupPlanOfficialConversionEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly conversionId?: string;
  readonly conversionEventId?: string;
  readonly confirmationId?: string;
  readonly timerOutboxMessageId?: string;
  readonly groupPlanEventId?: string;
  readonly challengeId?: string;
  readonly challengeEventId?: string;
  readonly serviceChatId?: string;
  readonly serviceChatEventId?: string;
  readonly rulesetSnapshotId?: string;
  readonly acknowledgmentIds?: readonly [string, string];
  readonly obligationIds?: readonly [string, string];
  readonly slotId?: string;
  readonly slotEventId?: string;
  readonly bookingId?: string;
  readonly bookingEventId?: string;
  readonly sessionId?: string;
  readonly sessionEventId?: string;
  readonly sessionTimerOutboxMessageId?: string;
  readonly groupPlanTimerOutboxMessageId?: string;
  readonly notificationOutboxMessageId: string;
  readonly notificationIds: readonly [string, string, string];
}

export interface GroupPlanOfficialConversionConfirmationProjection {
  readonly actorUserId: string;
  readonly requiredRole: OfficialConversionRequiredRole;
  readonly decision: 'ACCEPT' | 'DECLINE';
  readonly decidedAt: string;
}

export interface GroupPlanOfficialConversionProjection {
  readonly conversionId: string;
  readonly groupPlanId: string;
  readonly chatId: string;
  readonly requestedByUserId: string;
  readonly coachUserId: string;
  readonly coachDisplayName: string;
  readonly state: 'PENDING_CONFIRMATION' | 'CONVERTED' | 'DECLINED' | 'EXPIRED' | 'INVALIDATED';
  readonly confirmationDeadlineAt: string;
  readonly challengeId: string | null;
  readonly bookingId: string | null;
  readonly sessionId: string | null;
  readonly confirmations: readonly GroupPlanOfficialConversionConfirmationProjection[];
  readonly viewerRequiredRole: OfficialConversionRequiredRole | null;
  readonly viewerHasDecided: boolean;
  readonly viewerCanConfirm: boolean;
  readonly viewerCanDecline: boolean;
  readonly version: number;
}

interface GroupConversionContextRow {
  readonly group_plan_id: string;
  readonly plan_version: string;
  readonly plan_state: string;
  readonly chat_id: string;
  readonly chat_state: string;
  readonly match_id: string;
  readonly match_state: string;
  readonly group_offering_id: string;
  readonly offering_state: string;
  readonly offering_snapshot: Readonly<Record<string, unknown>>;
  readonly start_at: Date;
  readonly end_at: Date;
  readonly venue_id: string;
  readonly venue_display_name: string;
  readonly coach_user_id: string;
  readonly coach_display_name: string;
  readonly pair_low_id: string;
  readonly pair_high_id: string;
  readonly competition_id: string;
  readonly community_id: string;
  readonly community_configuration_id: string;
  readonly ruleset_ref: string;
  readonly ruleset_ack_mode: 'IMPLICIT_ON_ACCEPT' | 'EXPLICIT_ACK_REQUIRED';
  readonly competition_availability: string;
  readonly champion_user_id: string | null;
  readonly contender_user_id: string | null;
  readonly status_lock_result_id: string | null;
  readonly community_state: string;
  readonly venue_state: string;
  readonly low_account_active: boolean;
  readonly high_account_active: boolean;
  readonly low_age_division: 'YOUTH' | 'ADULT';
  readonly high_age_division: 'YOUTH' | 'ADULT';
  readonly low_verified: boolean;
  readonly high_verified: boolean;
  readonly low_membership_active: boolean;
  readonly high_membership_active: boolean;
  readonly pair_blocked: boolean;
  readonly active_obligation_count: string;
  readonly live_pair_challenge: boolean;
  readonly pair_cooldown_active: boolean;
  readonly coach_authorized: boolean;
  readonly coach_account_active: boolean;
  readonly athlete_schedule_conflict: boolean;
  readonly has_live_conversion: boolean;
}

interface GroupConversionRow {
  readonly conversion_id: string;
  readonly group_plan_id: string;
  readonly competition_id: string;
  readonly requested_by_user_id: string;
  readonly coach_user_id: string;
  readonly state: GroupPlanOfficialConversionProjection['state'];
  readonly confirmation_deadline_at: Date;
  readonly challenge_id: string | null;
  readonly booking_id: string | null;
  readonly session_id: string | null;
  readonly version: string;
}

interface GroupConfirmationRow {
  readonly actor_user_id: string;
  readonly required_role: OfficialConversionRequiredRole;
  readonly decision: 'ACCEPT' | 'DECLINE';
  readonly decided_at: Date;
}

function requiredId(
  ids: GroupPlanOfficialConversionEffectIds,
  key: keyof GroupPlanOfficialConversionEffectIds,
): string {
  const value = ids[key];
  if (typeof value !== 'string') throw new TypeError(`Group conversion effect ID ${key} is required`);
  return value;
}

function requiredPair(
  ids: GroupPlanOfficialConversionEffectIds,
  key: 'acknowledgmentIds' | 'obligationIds',
): readonly [string, string] {
  const value = ids[key];
  if (!value) throw new TypeError(`Group conversion effect IDs ${key} are required`);
  return value;
}

function timer(input: {
  readonly conversionId: string;
  readonly expectedVersion: number;
  readonly deadlineAt: string;
}) {
  return {
    commandType: 'EXPIRE_GROUP_PLAN_OFFICIAL_CONVERSION',
    aggregateType: 'GroupPlanOfficialConversion',
    aggregateId: input.conversionId,
    expectedState: 'PENDING_CONFIRMATION',
    expectedVersion: input.expectedVersion,
    deadlineAt: input.deadlineAt,
    policyVersion: SCHEDULING_POLICY_VERSION,
    idempotencyKey: `group-plan-conversion:${input.conversionId}:expire:v${input.expectedVersion}`,
  };
}

async function contextForPlan(
  database: Kysely<Database> | Transaction<Database>,
  groupPlanId: string,
  lock = false,
): Promise<GroupConversionContextRow | null> {
  const result = await sql<GroupConversionContextRow>`
    select plan.group_plan_id, plan.version::text as plan_version, plan.state as plan_state,
      plan.chat_id, chat.state as chat_state, plan.match_id, matched.state as match_state,
      plan.group_offering_id, offering.state as offering_state, plan.offering_snapshot,
      plan.start_at, (plan.offering_snapshot->>'endAt')::timestamptz as end_at,
      (plan.offering_snapshot->>'venueId')::uuid as venue_id,
      plan.offering_snapshot->>'venueDisplayName' as venue_display_name,
      (plan.offering_snapshot->>'coachUserId')::uuid as coach_user_id,
      plan.offering_snapshot->>'coachDisplayName' as coach_display_name,
      plan.pair_low_id, plan.pair_high_id,
      competition.competition_id, competition.community_id,
      configuration.configuration_id as community_configuration_id,
      configuration.ruleset_ref, configuration.ruleset_ack_mode,
      competition.availability as competition_availability,
      competition.champion_user_id, competition.contender_user_id,
      competition.status_lock_result_id, community.state as community_state,
      venue.state as venue_state,
      low_user.account_state = 'ACTIVE' as low_account_active,
      high_user.account_state = 'ACTIVE' as high_account_active,
      low_user.age_division as low_age_division,
      high_user.age_division as high_age_division,
      exists (
        select 1 from identity.account_verifications verification
        where verification.user_id = plan.pair_low_id
          and verification.is_current and verification.state = 'VERIFIED'
          and (verification.expires_at is null or verification.expires_at > clock_timestamp())
      ) as low_verified,
      exists (
        select 1 from identity.account_verifications verification
        where verification.user_id = plan.pair_high_id
          and verification.is_current and verification.state = 'VERIFIED'
          and (verification.expires_at is null or verification.expires_at > clock_timestamp())
      ) as high_verified,
      exists (
        select 1 from community.community_memberships membership
        where membership.community_id = competition.community_id
          and membership.user_id = plan.pair_low_id
          and membership.state = 'ACTIVE' and membership.competition_enabled
      ) as low_membership_active,
      exists (
        select 1 from community.community_memberships membership
        where membership.community_id = competition.community_id
          and membership.user_id = plan.pair_high_id
          and membership.state = 'ACTIVE' and membership.competition_enabled
      ) as high_membership_active,
      exists (
        select 1 from social.blocks blocked
        where blocked.state = 'ACTIVE' and (
          (blocked.blocker_user_id = plan.pair_low_id and blocked.blocked_user_id = plan.pair_high_id)
          or (blocked.blocker_user_id = plan.pair_high_id and blocked.blocked_user_id = plan.pair_low_id)
        )
      ) as pair_blocked,
      (select count(*)::text from competition.challenge_participant_obligations obligation
        where obligation.user_id in (plan.pair_low_id, plan.pair_high_id)
          and obligation.released_at is null) as active_obligation_count,
      exists (
        select 1 from competition.challenges challenge
        where challenge.competition_id = competition.competition_id
          and challenge.pair_low_id = plan.pair_low_id
          and challenge.pair_high_id = plan.pair_high_id
          and challenge.state in (
            'AWAITING_RESPONSE', 'ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED',
            'IN_SESSION', 'RESULT_PENDING', 'RESULT_RECORDED', 'UNDER_APPEAL'
          )
      ) as live_pair_challenge,
      exists (
        select 1 from competition.pair_cooldowns cooldown
        where cooldown.competition_id = competition.competition_id
          and cooldown.pair_low_id = plan.pair_low_id
          and cooldown.pair_high_id = plan.pair_high_id
          and cooldown.invalidated_at is null and cooldown.ends_at > clock_timestamp()
      ) as pair_cooldown_active,
      exists (
        select 1 from community.role_grants role_grant
        where role_grant.user_id = (plan.offering_snapshot->>'coachUserId')::uuid
          and role_grant.role = 'COACH' and role_grant.scope_type = 'COMMUNITY'
          and role_grant.scope_id = competition.community_id
          and role_grant.state = 'ACTIVE'
          and (role_grant.expires_at is null or role_grant.expires_at > clock_timestamp())
      ) as coach_authorized,
      coach.account_state = 'ACTIVE' as coach_account_active,
      exists (
        select 1 from scheduling.sessions scheduled
        where scheduled.state in ('SCHEDULED', 'READY_FOR_COACH', 'IN_PROGRESS')
          and (scheduled.pair_low_id in (plan.pair_low_id, plan.pair_high_id)
            or scheduled.pair_high_id in (plan.pair_low_id, plan.pair_high_id))
          and tstzrange(scheduled.scheduled_start_at, scheduled.scheduled_end_at, '[)')
            && tstzrange(plan.start_at, (plan.offering_snapshot->>'endAt')::timestamptz, '[)')
      ) as athlete_schedule_conflict,
      exists (
        select 1 from scheduling.group_plan_official_conversions conversion
        where conversion.group_plan_id = plan.group_plan_id
          and conversion.state = 'PENDING_CONFIRMATION'
      ) as has_live_conversion
    from scheduling.group_plans plan
    join scheduling.group_offerings offering on offering.group_offering_id = plan.group_offering_id
    join identity.users coach on coach.user_id = (plan.offering_snapshot->>'coachUserId')::uuid
    join identity.users low_user on low_user.user_id = plan.pair_low_id
    join identity.users high_user on high_user.user_id = plan.pair_high_id
    join social.matches matched on matched.match_id = plan.match_id
    join social.chats chat on chat.chat_id = plan.chat_id
    join community.venues venue on venue.venue_id = (plan.offering_snapshot->>'venueId')::uuid
    join community.communities community on community.venue_id = venue.venue_id
      and community.state <> 'CLOSED'
    join community.community_configuration_versions configuration
      on configuration.configuration_id = community.configuration_id
    join competition.competitions competition on competition.community_id = community.community_id
      and competition.age_division = low_user.age_division
      and competition.discipline_key is null
    where plan.group_plan_id = ${groupPlanId}::uuid
      and high_user.age_division = low_user.age_division
    order by competition.created_at
    limit 1
    ${lock ? sql`for update of plan, competition` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

function roleFor(context: GroupConversionContextRow, actorUserId: string): OfficialConversionRequiredRole | null {
  if (actorUserId === context.pair_low_id) return 'ATHLETE_LOW';
  if (actorUserId === context.pair_high_id) return 'ATHLETE_HIGH';
  if (actorUserId === context.coach_user_id) return 'COACH';
  return null;
}

function assertEligible(context: GroupConversionContextRow): void {
  const pair = new Set([context.pair_low_id, context.pair_high_id]);
  if (
    context.chat_state !== 'OPEN' || context.match_state !== 'ACTIVE'
    || context.offering_state !== 'PUBLISHED'
    || context.community_state !== 'ACTIVE' || context.venue_state !== 'ACTIVE'
    || context.competition_availability !== 'ACTIVE'
    || !context.low_account_active || !context.high_account_active
    || !context.low_verified || !context.high_verified
    || !context.low_membership_active || !context.high_membership_active
    || context.low_age_division === 'YOUTH' || context.high_age_division === 'YOUTH'
    || pair.has(context.coach_user_id)
    || context.pair_blocked || !context.coach_authorized || !context.coach_account_active
    || Number(context.active_obligation_count) > 0 || context.live_pair_challenge
    || context.pair_cooldown_active || context.athlete_schedule_conflict
    || context.status_lock_result_id !== null
    || (context.champion_user_id !== null && pair.has(context.champion_user_id))
    || (context.contender_user_id !== null && pair.has(context.contender_user_id))
  ) {
    throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
  }
}

async function conversionRow(
  database: Kysely<Database> | Transaction<Database>,
  conversionId: string,
  lock = false,
): Promise<GroupConversionRow | null> {
  const result = await sql<GroupConversionRow>`
    select conversion_id, group_plan_id, competition_id, requested_by_user_id,
      coach_user_id, state, confirmation_deadline_at, challenge_id, booking_id,
      session_id, version::text as version
    from scheduling.group_plan_official_conversions
    where conversion_id = ${conversionId}::uuid
    ${lock ? sql`for update` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function confirmationRows(
  database: Kysely<Database> | Transaction<Database>,
  conversionId: string,
): Promise<readonly GroupConfirmationRow[]> {
  const result = await sql<GroupConfirmationRow>`
    select actor_user_id, required_role, decision, decided_at
    from scheduling.group_plan_conversion_confirmations
    where conversion_id = ${conversionId}::uuid
    order by decided_at, required_role
  `.execute(database);
  return result.rows;
}

async function projection(
  database: Kysely<Database> | Transaction<Database>,
  row: GroupConversionRow,
  viewerUserId: string,
): Promise<GroupPlanOfficialConversionProjection> {
  const [context, confirmations] = await Promise.all([
    contextForPlan(database, row.group_plan_id),
    confirmationRows(database, row.conversion_id),
  ]);
  if (!context) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
  const viewerRequiredRole = roleFor(context, viewerUserId);
  const viewerHasDecided = confirmations.some((item) => item.actor_user_id === viewerUserId);
  const pending = row.state === 'PENDING_CONFIRMATION';
  return {
    conversionId: row.conversion_id,
    groupPlanId: row.group_plan_id,
    chatId: context.chat_id,
    requestedByUserId: row.requested_by_user_id,
    coachUserId: row.coach_user_id,
    coachDisplayName: context.coach_display_name,
    state: row.state,
    confirmationDeadlineAt: row.confirmation_deadline_at.toISOString(),
    challengeId: row.challenge_id,
    bookingId: row.booking_id,
    sessionId: row.session_id,
    confirmations: confirmations.map((item) => ({
      actorUserId: item.actor_user_id,
      requiredRole: item.required_role,
      decision: item.decision,
      decidedAt: item.decided_at.toISOString(),
    })),
    viewerRequiredRole,
    viewerHasDecided,
    viewerCanConfirm: pending && viewerRequiredRole !== null && !viewerHasDecided,
    viewerCanDecline: pending && viewerRequiredRole !== null && !viewerHasDecided,
    version: Number(row.version),
  };
}

export async function listGroupPlanOfficialConversionsForViewer(
  database: Kysely<Database>,
  viewerUserId: string,
): Promise<readonly GroupPlanOfficialConversionProjection[]> {
  const result = await sql<{ readonly conversion_id: string }>`
    select conversion.conversion_id
    from scheduling.group_plan_official_conversions conversion
    join scheduling.group_plans plan on plan.group_plan_id = conversion.group_plan_id
    where conversion.state = 'PENDING_CONFIRMATION'
      and ${viewerUserId}::uuid in (plan.pair_low_id, plan.pair_high_id, conversion.coach_user_id)
    order by conversion.created_at, conversion.conversion_id
  `.execute(database);
  const projections: GroupPlanOfficialConversionProjection[] = [];
  for (const item of result.rows) {
    const row = await conversionRow(database, item.conversion_id);
    if (row) projections.push(await projection(database, row, viewerUserId));
  }
  return projections;
}

export async function requestGroupPlanOfficialConversion(
  database: Kysely<Database>,
  command: CommandEnvelope<RequestGroupPlanOfficialConversionPayload>,
  ids: GroupPlanOfficialConversionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<GroupPlanOfficialConversionProjection>> {
  if (!command.actor.id || command.aggregateType !== 'GroupPlan'
    || command.aggregateId !== command.payload.groupPlanId) {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, eventContext) => {
      const context = await contextForPlan(transaction, command.aggregateId, true);
      if (!context) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
      const actorRole = roleFor(context, command.actor.id!);
      const deadline = assertGroupPlanOfficialConversionCanBeRequested({
        groupPlanState: context.plan_state,
        actorIsAthlete: actorRole === 'ATHLETE_LOW' || actorRole === 'ATHLETE_HIGH',
        coachAssigned: Boolean(context.coach_user_id),
        hasLiveConversion: context.has_live_conversion,
        scheduledStartAt: context.start_at.toISOString(),
        occurredAt: eventContext.occurredAt,
      });
      if (Number(context.plan_version) !== command.expectedVersion
        || context.start_at > acceptedChallengeSchedulingDeadline(eventContext.occurredAt)) {
        throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
      }
      assertEligible(context);
      if (context.ruleset_ack_mode === 'EXPLICIT_ACK_REQUIRED'
        && command.payload.explicitRulesetAcknowledged !== true) {
        throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
      }
      const conversionId = requiredId(ids, 'conversionId');
      await sql`
        insert into scheduling.group_plan_official_conversions (
          conversion_id, group_plan_id, competition_id, requested_by_user_id,
          coach_user_id, state, confirmation_deadline_at, version, created_at, updated_at
        ) values (
          ${conversionId}::uuid, ${context.group_plan_id}::uuid,
          ${context.competition_id}::uuid, ${command.actor.id}::uuid,
          ${context.coach_user_id}::uuid, 'PENDING_CONFIRMATION',
          ${deadline.toISOString()}::timestamptz, 1,
          ${eventContext.occurredAt.toISOString()}::timestamptz,
          ${eventContext.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        insert into scheduling.group_plan_conversion_confirmations (
          confirmation_id, conversion_id, actor_user_id, required_role, decision,
          ruleset_acknowledged, decided_at, policy_version
        ) values (
          ${requiredId(ids, 'confirmationId')}::uuid, ${conversionId}::uuid,
          ${command.actor.id}::uuid, ${actorRole}, 'ACCEPT',
          ${command.payload.explicitRulesetAcknowledged === true},
          ${eventContext.occurredAt.toISOString()}::timestamptz,
          ${SCHEDULING_POLICY_VERSION}
        )
      `.execute(transaction);
      await sql`
        update scheduling.group_plans
        set state = 'CONVERSION_PENDING', version = ${eventContext.nextVersion},
          updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
        where group_plan_id = ${context.group_plan_id}::uuid and state = 'NOTIFIED'
      `.execute(transaction);
      const row = await conversionRow(transaction, conversionId);
      if (!row) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
      const response = await projection(transaction, row, command.actor.id!);
      return {
        responseStatus: 201,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'GroupPlanChallengeConversionRequested',
          schemaVersion: 1,
          transitionId: 'GP-05',
          payload: { groupPlanId: context.group_plan_id, conversionId, coachUserId: context.coach_user_id },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        relatedEvents: [{
          eventId: requiredId(ids, 'conversionEventId'),
          eventName: 'GroupPlanChallengeConversionRequested',
          schemaVersion: 1,
          aggregateType: 'GroupPlanOfficialConversion',
          aggregateId: conversionId,
          aggregateVersion: 1,
          transitionId: 'GP-05',
          payload: { conversionId, groupPlanId: context.group_plan_id },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        }],
        audit: {
          auditId: ids.auditId,
          action: 'REQUEST_GROUP_PLAN_OFFICIAL_CONVERSION',
          transitionId: 'GP-05',
          reasonCode: null,
          beforeState: 'NOTIFIED',
          afterState: 'CONVERSION_PENDING',
          metadata: { conversionId, venueId: context.venue_id, coachUserId: context.coach_user_id },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'scheduling.group-plan.official-conversion-requested.v1',
            payload: { conversionId, groupPlanId: context.group_plan_id, coachUserId: context.coach_user_id },
          },
          {
            messageId: requiredId(ids, 'timerOutboxMessageId'),
            topic: 'scheduling.group-plan.official-conversion-timer.v1',
            payload: { conversionId, timer: timer({ conversionId, expectedVersion: 1, deadlineAt: deadline.toISOString() }) },
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: {
              notifications: [context.pair_low_id, context.pair_high_id, context.coach_user_id]
                .filter((userId) => userId !== command.actor.id)
                .map((recipientUserId, index) => ({
                  notificationId: ids.notificationIds[index]!, recipientUserId,
                  category: 'MANDATORY', renderKey: 'group-plan.official-conversion-required',
                  actionTarget: { type: 'GROUP_PLAN', groupPlanId: context.group_plan_id },
                  payload: { conversionId, groupPlanId: context.group_plan_id },
                  deadlineAt: deadline.toISOString(),
                })),
            },
          },
        ],
      };
    },
  });
}

export async function decideGroupPlanOfficialConversion(
  database: Kysely<Database>,
  command: CommandEnvelope<DecideGroupPlanOfficialConversionPayload>,
  ids: GroupPlanOfficialConversionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<GroupPlanOfficialConversionProjection>> {
  if (!command.actor.id || command.aggregateType !== 'GroupPlanOfficialConversion'
    || command.aggregateId !== command.payload.conversionId) {
    throw new SchedulingPermissionDeniedError();
  }
  try {
    return await executeCriticalCommand(database, {
      command,
      ...(now ? { now } : {}),
      mutate: async (transaction, eventContext) => {
        const existing = await conversionRow(transaction, command.aggregateId, true);
        if (!existing) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_PENDING');
        const context = await contextForPlan(transaction, existing.group_plan_id, true);
        if (!context) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
        const actorRole = roleFor(context, command.actor.id!);
        const prior = await confirmationRows(transaction, existing.conversion_id);
        assertOfficialConversionDecisionCanBeRecorded({
          state: existing.state === 'PENDING_CONFIRMATION' ? 'PENDING_CONFIRMATION' : existing.state,
          actorRequired: actorRole !== null,
          actorAlreadyDecided: prior.some((item) => item.actor_user_id === command.actor.id),
          confirmationDeadlineAt: existing.confirmation_deadline_at.toISOString(),
          occurredAt: eventContext.occurredAt,
        });
        if (context.plan_state !== 'CONVERSION_PENDING'
          || context.start_at <= eventContext.occurredAt
          || !context.coach_authorized || !context.coach_account_active) {
          throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
        }
        if (context.ruleset_ack_mode === 'EXPLICIT_ACK_REQUIRED'
          && actorRole !== 'COACH'
          && command.payload.decision === 'ACCEPT'
          && command.payload.explicitRulesetAcknowledged !== true) {
          throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
        }
        await sql`
          insert into scheduling.group_plan_conversion_confirmations (
            confirmation_id, conversion_id, actor_user_id, required_role, decision,
            ruleset_acknowledged, decided_at, policy_version
          ) values (
            ${requiredId(ids, 'confirmationId')}::uuid, ${existing.conversion_id}::uuid,
            ${command.actor.id}::uuid, ${actorRole}, ${command.payload.decision},
            ${command.payload.explicitRulesetAcknowledged === true},
            ${eventContext.occurredAt.toISOString()}::timestamptz,
            ${SCHEDULING_POLICY_VERSION}
          )
        `.execute(transaction);
        if (command.payload.decision === 'DECLINE') {
          await sql`
            update scheduling.group_plan_official_conversions
            set state = 'DECLINED', terminal_reason = 'REQUIRED_PARTY_DECLINED',
              decided_at = ${eventContext.occurredAt.toISOString()}::timestamptz,
              version = ${eventContext.nextVersion}, updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
            where conversion_id = ${existing.conversion_id}::uuid and state = 'PENDING_CONFIRMATION'
          `.execute(transaction);
          await sql`
            update scheduling.group_plans
            set state = 'NOTIFIED', version = version + 1,
              updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
            where group_plan_id = ${context.group_plan_id}::uuid and state = 'CONVERSION_PENDING'
          `.execute(transaction);
          const row = await conversionRow(transaction, existing.conversion_id);
          if (!row) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_PENDING');
          const response = await projection(transaction, row, command.actor.id!);
          return {
            responseStatus: 200, response,
            event: { eventId: ids.eventId, eventName: 'GroupPlanConversionDeclined', schemaVersion: 1,
              transitionId: 'GP-08', payload: { conversionId: existing.conversion_id,
                groupPlanId: context.group_plan_id, declinedRole: actorRole },
              metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
            relatedEvents: [{ eventId: requiredId(ids, 'groupPlanEventId'),
              eventName: 'GroupPlanConversionDeclined', schemaVersion: 1,
              aggregateType: 'GroupPlan', aggregateId: context.group_plan_id,
              aggregateVersion: Number(context.plan_version) + 1, transitionId: 'GP-08',
              payload: { groupPlanId: context.group_plan_id, conversionId: existing.conversion_id },
              metadata: { policyVersion: SCHEDULING_POLICY_VERSION } }],
            audit: { auditId: ids.auditId, action: 'DECLINE_GROUP_PLAN_OFFICIAL_CONVERSION',
              transitionId: 'GP-08', reasonCode: 'REQUIRED_PARTY_DECLINED',
              beforeState: 'PENDING_CONFIRMATION', afterState: 'DECLINED',
              metadata: { groupPlanId: context.group_plan_id, requiredRole: actorRole } },
            outbox: [
              { messageId: ids.outboxMessageId, topic: 'scheduling.group-plan.official-conversion-declined.v1',
                payload: { conversionId: existing.conversion_id, groupPlanId: context.group_plan_id,
                  socialPlanPreserved: true } },
              { messageId: requiredId(ids, 'groupPlanTimerOutboxMessageId'),
                topic: 'scheduling.group-plan.mutually-confirmed.v1', payload: {
                  groupPlanId: context.group_plan_id,
                  timer: { commandType: 'EXPIRE_GROUP_PLAN', aggregateType: 'GroupPlan',
                    aggregateId: context.group_plan_id, expectedState: 'NOTIFIED',
                    expectedVersion: Number(context.plan_version) + 1,
                    deadlineAt: context.start_at.toISOString(), policyVersion: SCHEDULING_POLICY_VERSION,
                    idempotencyKey: `groupplan:${context.group_plan_id}:expire:v${Number(context.plan_version) + 1}` },
                } },
              { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1', payload: {
                notifications: [context.pair_low_id, context.pair_high_id, context.coach_user_id]
                  .filter((userId) => userId !== command.actor.id)
                  .map((recipientUserId, index) => ({ notificationId: ids.notificationIds[index]!,
                    recipientUserId, category: 'SERVICE', renderKey: 'group-plan.official-conversion-declined',
                    actionTarget: { type: 'GROUP_PLAN', groupPlanId: context.group_plan_id },
                    payload: { conversionId: existing.conversion_id, socialPlanPreserved: true }, deadlineAt: null })) } },
            ],
          };
        }

        const acceptCount = prior.filter((item) => item.decision === 'ACCEPT').length + 1;
        if (acceptCount < 3) {
          await sql`
            update scheduling.group_plan_official_conversions
            set version = ${eventContext.nextVersion}, updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
            where conversion_id = ${existing.conversion_id}::uuid and state = 'PENDING_CONFIRMATION'
          `.execute(transaction);
          const row = await conversionRow(transaction, existing.conversion_id);
          if (!row) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_PENDING');
          const response = await projection(transaction, row, command.actor.id!);
          return {
            responseStatus: 200, response,
            event: { eventId: ids.eventId, eventName: 'GroupPlanConversionPartyConfirmed', schemaVersion: 1,
              transitionId: 'GP-06', payload: { conversionId: existing.conversion_id,
                groupPlanId: context.group_plan_id, requiredRole: actorRole, acceptedCount: acceptCount },
              metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
            audit: { auditId: ids.auditId, action: 'CONFIRM_GROUP_PLAN_OFFICIAL_CONVERSION_PARTY',
              transitionId: 'GP-06', reasonCode: null, beforeState: 'PENDING_CONFIRMATION',
              afterState: 'PENDING_CONFIRMATION', metadata: { groupPlanId: context.group_plan_id,
                requiredRole: actorRole, acceptedCount: acceptCount } },
            outbox: [
              { messageId: ids.outboxMessageId, topic: 'scheduling.group-plan.official-conversion-party-confirmed.v1',
                payload: { conversionId: existing.conversion_id, groupPlanId: context.group_plan_id,
                  requiredRole: actorRole, acceptedCount: acceptCount } },
              { messageId: requiredId(ids, 'timerOutboxMessageId'),
                topic: 'scheduling.group-plan.official-conversion-timer.v1', payload: {
                  conversionId: existing.conversion_id,
                  timer: timer({ conversionId: existing.conversion_id,
                    expectedVersion: eventContext.nextVersion,
                    deadlineAt: existing.confirmation_deadline_at.toISOString() }),
                } },
              { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1', payload: {
                notifications: [context.pair_low_id, context.pair_high_id, context.coach_user_id]
                  .filter((userId) => userId !== command.actor.id)
                  .map((recipientUserId, index) => ({ notificationId: ids.notificationIds[index]!,
                    recipientUserId, category: 'SERVICE', renderKey: 'group-plan.official-conversion-party-confirmed',
                    actionTarget: { type: 'GROUP_PLAN', groupPlanId: context.group_plan_id },
                    payload: { conversionId: existing.conversion_id, acceptedCount: acceptCount },
                    deadlineAt: existing.confirmation_deadline_at.toISOString() })) } },
            ],
          };
        }

        assertEligible(context);
        if (context.start_at > acceptedChallengeSchedulingDeadline(eventContext.occurredAt)) {
          throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
        }
        for (const userId of [context.pair_low_id, context.pair_high_id].sort()) {
          await sql`select pg_advisory_xact_lock(hashtextextended(${`challenge-obligation:${userId}`}, 0))`
            .execute(transaction);
        }
        const challengeId = requiredId(ids, 'challengeId');
        const serviceChatId = requiredId(ids, 'serviceChatId');
        const rulesetSnapshotId = requiredId(ids, 'rulesetSnapshotId');
        const slotId = requiredId(ids, 'slotId');
        const bookingId = requiredId(ids, 'bookingId');
        const sessionId = requiredId(ids, 'sessionId');
        const acknowledgmentIds = requiredPair(ids, 'acknowledgmentIds');
        const obligationIds = requiredPair(ids, 'obligationIds');
        const allConfirmations = [...prior, { actor_user_id: command.actor.id!, required_role: actorRole!,
          decision: 'ACCEPT' as const, decided_at: eventContext.occurredAt }];
        const athleteConfirmations = allConfirmations.filter((item) => item.required_role !== 'COACH');
        const snapshot = {
          slotId, groupOfferingId: context.group_offering_id, venueId: context.venue_id,
          venueDisplayName: context.venue_display_name, coachUserId: context.coach_user_id,
          coachDisplayName: context.coach_display_name, startAt: context.start_at.toISOString(),
          endAt: context.end_at.toISOString(), priceAmount: null, priceCurrency: null,
          priceText: typeof context.offering_snapshot.priceText === 'string'
            ? context.offering_snapshot.priceText : null,
          cancellationTermsText: 'Место и оплата подтверждаются напрямую с залом',
          commercialVersion: Number(context.offering_snapshot.offeringVersion ?? 1),
          capacityReserved: false,
        };
        await sql`
          insert into social.chats (chat_id, scope, state, version, created_at, updated_at)
          values (${serviceChatId}::uuid, 'CHALLENGE_SERVICE', 'OPEN', 1,
            ${eventContext.occurredAt.toISOString()}::timestamptz,
            ${eventContext.occurredAt.toISOString()}::timestamptz)
        `.execute(transaction);
        await sql`
          insert into social.chat_participants (chat_id, user_id, joined_at) values
            (${serviceChatId}::uuid, ${context.pair_low_id}::uuid, ${eventContext.occurredAt.toISOString()}::timestamptz),
            (${serviceChatId}::uuid, ${context.pair_high_id}::uuid, ${eventContext.occurredAt.toISOString()}::timestamptz)
        `.execute(transaction);
        await sql`
          insert into competition.ruleset_snapshots (
            ruleset_snapshot_id, competition_id, community_configuration_id,
            ruleset_ref, ruleset_ack_mode, policy_version, created_at
          ) values (${rulesetSnapshotId}::uuid, ${context.competition_id}::uuid,
            ${context.community_configuration_id}::uuid, ${context.ruleset_ref},
            ${context.ruleset_ack_mode}, ${CHALLENGE_POLICY_VERSION},
            ${eventContext.occurredAt.toISOString()}::timestamptz)
        `.execute(transaction);
        await sql`
          insert into competition.challenges (
            challenge_id, competition_id, source_match_id, source_chat_id, service_chat_id,
            initiator_user_id, recipient_user_id, pair_low_id, pair_high_id,
            response_policy, stake, state, ruleset_snapshot_id, response_deadline_at,
            accepted_at, scheduling_deadline_at, version, created_at, updated_at
          ) values (${challengeId}::uuid, ${context.competition_id}::uuid,
            ${context.match_id}::uuid, ${context.chat_id}::uuid, ${serviceChatId}::uuid,
            ${existing.requested_by_user_id}::uuid,
            ${existing.requested_by_user_id === context.pair_low_id ? context.pair_high_id : context.pair_low_id}::uuid,
            ${context.pair_low_id}::uuid, ${context.pair_high_id}::uuid,
            'OPTIONAL', 'NONE', 'BOOKED', ${rulesetSnapshotId}::uuid,
            ${eventContext.occurredAt.toISOString()}::timestamptz,
            ${eventContext.occurredAt.toISOString()}::timestamptz,
            ${context.start_at.toISOString()}::timestamptz, 1,
            ${eventContext.occurredAt.toISOString()}::timestamptz,
            ${eventContext.occurredAt.toISOString()}::timestamptz)
        `.execute(transaction);
        for (let index = 0; index < athleteConfirmations.length; index += 1) {
          const item = athleteConfirmations[index]!;
          await sql`
            insert into competition.challenge_ruleset_acknowledgments (
              acknowledgment_id, challenge_id, user_id, ruleset_snapshot_id, mode, acknowledged_at
            ) values (${acknowledgmentIds[index]}::uuid, ${challengeId}::uuid,
              ${item.actor_user_id}::uuid, ${rulesetSnapshotId}::uuid,
              ${context.ruleset_ack_mode === 'EXPLICIT_ACK_REQUIRED' ? 'EXPLICIT' : 'IMPLICIT_ON_ACCEPT'},
              ${item.decided_at.toISOString()}::timestamptz)
          `.execute(transaction);
        }
        for (let index = 0; index < 2; index += 1) {
          const userId = index === 0 ? context.pair_low_id : context.pair_high_id;
          await sql`
            insert into competition.challenge_participant_obligations (
              obligation_id, challenge_id, user_id, accepted_at
            ) values (${obligationIds[index]}::uuid, ${challengeId}::uuid,
              ${userId}::uuid, ${eventContext.occurredAt.toISOString()}::timestamptz)
          `.execute(transaction);
        }
        await sql`
          insert into scheduling.slots (
            slot_id, venue_id, coach_user_id, start_at, end_at, slot_type, state,
            price_amount, price_currency, price_text, cancellation_terms_text,
            commercial_version, booking_id, published_by, version, created_at, updated_at
          ) values (${slotId}::uuid, ${context.venue_id}::uuid, ${context.coach_user_id}::uuid,
            ${context.start_at.toISOString()}::timestamptz, ${context.end_at.toISOString()}::timestamptz,
            'GROUP_REFERENCE', 'BOOKED', null, null, ${snapshot.priceText},
            ${snapshot.cancellationTermsText}, ${snapshot.commercialVersion}, ${bookingId}::uuid,
            ${context.coach_user_id}::uuid, 1, ${eventContext.occurredAt.toISOString()}::timestamptz,
            ${eventContext.occurredAt.toISOString()}::timestamptz)
        `.execute(transaction);
        await sql`
          insert into scheduling.bookings (
            booking_id, chat_id, match_id, slot_id, pair_low_id, pair_high_id,
            purpose, state, initiated_by, selected_by_low_at, selected_by_high_at,
            selection_expires_at, host_confirmation_deadline_at, commercial_terms_snapshot,
            host_confirmed_by, host_confirmed_at, challenge_id, version, created_at, updated_at
          ) values (${bookingId}::uuid, ${context.chat_id}::uuid, ${context.match_id}::uuid,
            ${slotId}::uuid, ${context.pair_low_id}::uuid, ${context.pair_high_id}::uuid,
            'OFFICIAL_CHALLENGE', 'CONFIRMED_PAIR', ${existing.requested_by_user_id}::uuid,
            ${athleteConfirmations.find((item) => item.required_role === 'ATHLETE_LOW')!.decided_at.toISOString()}::timestamptz,
            ${athleteConfirmations.find((item) => item.required_role === 'ATHLETE_HIGH')!.decided_at.toISOString()}::timestamptz,
            ${eventContext.occurredAt.toISOString()}::timestamptz,
            ${eventContext.occurredAt.toISOString()}::timestamptz, ${JSON.stringify(snapshot)}::jsonb,
            ${context.coach_user_id}::uuid, ${eventContext.occurredAt.toISOString()}::timestamptz,
            ${challengeId}::uuid, 1, ${eventContext.occurredAt.toISOString()}::timestamptz,
            ${eventContext.occurredAt.toISOString()}::timestamptz)
        `.execute(transaction);
        await sql`
          insert into scheduling.sessions (
            session_id, booking_id, venue_id, coach_user_id, pair_low_id, pair_high_id,
            purpose, state, scheduled_start_at, scheduled_end_at, commercial_terms_snapshot,
            challenge_id, version, created_at, updated_at
          ) values (${sessionId}::uuid, ${bookingId}::uuid, ${context.venue_id}::uuid,
            ${context.coach_user_id}::uuid, ${context.pair_low_id}::uuid, ${context.pair_high_id}::uuid,
            'OFFICIAL_CHALLENGE', 'SCHEDULED', ${context.start_at.toISOString()}::timestamptz,
            ${context.end_at.toISOString()}::timestamptz, ${JSON.stringify(snapshot)}::jsonb,
            ${challengeId}::uuid, 1, ${eventContext.occurredAt.toISOString()}::timestamptz,
            ${eventContext.occurredAt.toISOString()}::timestamptz)
        `.execute(transaction);
        await sql`
          update scheduling.group_plans set state = 'CONVERTED', version = version + 1,
            updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
          where group_plan_id = ${context.group_plan_id}::uuid and state = 'CONVERSION_PENDING'
        `.execute(transaction);
        await sql`
          update scheduling.group_plan_official_conversions
          set state = 'CONVERTED', challenge_id = ${challengeId}::uuid,
            booking_id = ${bookingId}::uuid, session_id = ${sessionId}::uuid,
            decided_at = ${eventContext.occurredAt.toISOString()}::timestamptz,
            version = ${eventContext.nextVersion}, updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
          where conversion_id = ${existing.conversion_id}::uuid and state = 'PENDING_CONFIRMATION'
        `.execute(transaction);
        const row = await conversionRow(transaction, existing.conversion_id);
        if (!row) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_PENDING');
        const response = await projection(transaction, row, command.actor.id!);
        return {
          responseStatus: 200, response,
          event: { eventId: ids.eventId, eventName: 'GroupPlanConversionPartyConfirmed', schemaVersion: 1,
            transitionId: 'GP-07', payload: { conversionId: existing.conversion_id,
              groupPlanId: context.group_plan_id, requiredRole: actorRole, acceptedCount: 3 },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
          relatedEvents: [
            { eventId: requiredId(ids, 'groupPlanEventId'), eventName: 'GroupPlanConvertedToChallenge',
              schemaVersion: 1, aggregateType: 'GroupPlan', aggregateId: context.group_plan_id,
              aggregateVersion: Number(context.plan_version) + 1, transitionId: 'GP-07',
              payload: { groupPlanId: context.group_plan_id, conversionId: existing.conversion_id,
                challengeId, bookingId, sessionId, capacityReserved: false },
              metadata: { policyVersion: SCHEDULING_POLICY_VERSION, rulesetSnapshotId } },
            { eventId: requiredId(ids, 'challengeEventId'), eventName: 'ChallengeCreated',
              schemaVersion: 1, aggregateType: 'Challenge', aggregateId: challengeId,
              aggregateVersion: 1, transitionId: 'CH-28',
              payload: { challengeId, groupPlanId: context.group_plan_id, bookingId, sessionId, stake: 'NONE' },
              metadata: { policyVersion: CHALLENGE_POLICY_VERSION, rulesetSnapshotId } },
            { eventId: requiredId(ids, 'serviceChatEventId'), eventName: 'ChatOpened', schemaVersion: 1,
              aggregateType: 'Chat', aggregateId: serviceChatId, aggregateVersion: 1,
              transitionId: 'CT-01', payload: { chatId: serviceChatId, scope: 'CHALLENGE_SERVICE',
                challengeId, participants: [context.pair_low_id, context.pair_high_id] },
              metadata: { policyVersion: CHALLENGE_POLICY_VERSION } },
            { eventId: requiredId(ids, 'slotEventId'), eventName: 'SlotBooked',
              schemaVersion: 1, aggregateType: 'Slot', aggregateId: slotId, aggregateVersion: 1,
              transitionId: 'SL-02', payload: { slotId, groupOfferingId: context.group_offering_id,
                bookingId, capacityReserved: false }, metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
            { eventId: requiredId(ids, 'bookingEventId'), eventName: 'BookingConfirmed',
              schemaVersion: 1, aggregateType: 'Booking', aggregateId: bookingId, aggregateVersion: 1,
              transitionId: 'B-03', payload: { bookingId, groupPlanId: context.group_plan_id,
                challengeId, sessionId, capacityReserved: false },
              metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
            { eventId: requiredId(ids, 'sessionEventId'), eventName: 'SessionScheduled',
              schemaVersion: 1, aggregateType: 'Session', aggregateId: sessionId, aggregateVersion: 1,
              transitionId: 'S-01', payload: { sessionId, bookingId, challengeId,
                groupPlanId: context.group_plan_id }, metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
          ],
          audit: { auditId: ids.auditId, action: 'CONVERT_GROUP_PLAN_TO_OFFICIAL',
            transitionId: 'GP-07', reasonCode: null, beforeState: 'PENDING_CONFIRMATION',
            afterState: 'CONVERTED', metadata: { groupPlanId: context.group_plan_id,
              venueId: context.venue_id, coachUserId: context.coach_user_id,
              challengeId, bookingId, sessionId, capacityReserved: false } },
          outbox: [
            { messageId: ids.outboxMessageId, topic: 'scheduling.group-plan.converted-to-official.v1',
              payload: { conversionId: existing.conversion_id, groupPlanId: context.group_plan_id,
                challengeId, bookingId, sessionId, competitionId: context.competition_id,
                capacityReserved: false } },
            { messageId: requiredId(ids, 'sessionTimerOutboxMessageId'),
              topic: 'scheduling.session.scheduled.v1', sourceEventId: requiredId(ids, 'sessionEventId'),
              payload: { sessionId, timer: { commandType: 'OPEN_SESSION_WINDOW',
                aggregateType: 'Session', aggregateId: sessionId, expectedState: 'SCHEDULED',
                expectedVersion: 1, deadlineAt: context.start_at.toISOString(),
                policyVersion: SCHEDULING_POLICY_VERSION,
                idempotencyKey: `session:${sessionId}:open-session-window:v1` } } },
            { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1', payload: {
              notifications: [context.pair_low_id, context.pair_high_id, context.coach_user_id]
                .map((recipientUserId, index) => ({ notificationId: ids.notificationIds[index]!,
                  recipientUserId, category: 'MANDATORY', renderKey: 'group-plan.converted-to-official',
                  actionTarget: { type: 'SESSION', sessionId },
                  payload: { conversionId: existing.conversion_id, challengeId, sessionId,
                    capacityReserved: false }, deadlineAt: context.start_at.toISOString() })) } },
          ],
        };
      },
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error
      && (error as { readonly code?: string }).code === '23P01') {
      throw new SchedulingConflictError('COACH_CONFLICT');
    }
    throw error;
  }
}

export async function readGroupPlanOfficialConversionTimerSnapshot(
  database: Kysely<Database>,
  conversionId: string,
): Promise<TimerAggregateSnapshot> {
  const row = await conversionRow(database, conversionId);
  return row ? { state: row.state, version: Number(row.version) } : { state: 'MISSING', version: 0 };
}

export async function expireGroupPlanOfficialConversion(
  database: Kysely<Database>,
  command: CommandEnvelope<ExpireGroupPlanOfficialConversionPayload>,
  ids: GroupPlanOfficialConversionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<GroupPlanOfficialConversionProjection>> {
  if (command.actor.type !== 'SYSTEM' || command.aggregateType !== 'GroupPlanOfficialConversion'
    || command.aggregateId !== command.payload.conversionId) {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, eventContext) => {
      const existing = await conversionRow(transaction, command.aggregateId, true);
      if (!existing) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_PENDING');
      assertOfficialConversionCanExpire({
        state: existing.state === 'PENDING_CONFIRMATION' ? 'PENDING_CONFIRMATION' : existing.state,
        confirmationDeadlineAt: existing.confirmation_deadline_at.toISOString(),
        occurredAt: eventContext.occurredAt,
      });
      const context = await contextForPlan(transaction, existing.group_plan_id, true);
      if (!context || context.plan_state !== 'CONVERSION_PENDING') {
        throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_PENDING');
      }
      const groupStarted = context.start_at <= eventContext.occurredAt;
      const nextPlanState = groupStarted ? 'EXPIRED' : 'NOTIFIED';
      await sql`
        update scheduling.group_plan_official_conversions
        set state = 'EXPIRED', terminal_reason = ${groupStarted ? 'GROUP_START_REACHED' : 'CONFIRMATION_DEADLINE'},
          decided_at = ${eventContext.occurredAt.toISOString()}::timestamptz,
          version = ${eventContext.nextVersion}, updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
        where conversion_id = ${existing.conversion_id}::uuid and state = 'PENDING_CONFIRMATION'
      `.execute(transaction);
      await sql`
        update scheduling.group_plans set state = ${nextPlanState}, version = version + 1,
          updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
        where group_plan_id = ${context.group_plan_id}::uuid and state = 'CONVERSION_PENDING'
      `.execute(transaction);
      const row = await conversionRow(transaction, existing.conversion_id);
      if (!row) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_PENDING');
      const response = await projection(transaction, row, context.pair_low_id);
      const outbox: OutboxDraft[] = [
        { messageId: ids.outboxMessageId, topic: 'scheduling.group-plan.official-conversion-closed.v1',
          payload: { conversionId: existing.conversion_id, groupPlanId: context.group_plan_id,
            reasonCode: groupStarted ? 'GROUP_START_REACHED' : 'CONFIRMATION_DEADLINE',
            socialPlanPreserved: !groupStarted } },
        { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1', payload: {
          notifications: [context.pair_low_id, context.pair_high_id, context.coach_user_id]
            .map((recipientUserId, index) => ({ notificationId: ids.notificationIds[index]!,
              recipientUserId, category: 'SERVICE', renderKey: groupStarted
                ? 'group-plan.expired' : 'group-plan.official-conversion-expired',
              actionTarget: { type: 'GROUP_PLAN', groupPlanId: context.group_plan_id },
              payload: { conversionId: existing.conversion_id, socialPlanPreserved: !groupStarted },
              deadlineAt: null })) } },
      ];
      if (!groupStarted) {
        outbox.push({ messageId: requiredId(ids, 'groupPlanTimerOutboxMessageId'),
          topic: 'scheduling.group-plan.mutually-confirmed.v1', payload: {
            groupPlanId: context.group_plan_id,
            timer: { commandType: 'EXPIRE_GROUP_PLAN', aggregateType: 'GroupPlan',
              aggregateId: context.group_plan_id, expectedState: 'NOTIFIED',
              expectedVersion: Number(context.plan_version) + 1,
              deadlineAt: context.start_at.toISOString(), policyVersion: SCHEDULING_POLICY_VERSION,
              idempotencyKey: `groupplan:${context.group_plan_id}:expire:v${Number(context.plan_version) + 1}` },
          } });
      }
      return {
        responseStatus: 200, response,
        event: { eventId: ids.eventId, eventName: 'GroupPlanConversionClosed', schemaVersion: 1,
          transitionId: 'GP-12', payload: { conversionId: existing.conversion_id,
            groupPlanId: context.group_plan_id, reasonCode: groupStarted
              ? 'GROUP_START_REACHED' : 'CONFIRMATION_DEADLINE' },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
        relatedEvents: [{ eventId: requiredId(ids, 'groupPlanEventId'),
          eventName: groupStarted ? 'GroupPlanExpired' : 'GroupPlanConversionClosed', schemaVersion: 1,
          aggregateType: 'GroupPlan', aggregateId: context.group_plan_id,
          aggregateVersion: Number(context.plan_version) + 1,
          transitionId: groupStarted ? 'GP-09' : 'GP-12',
          payload: { groupPlanId: context.group_plan_id, conversionId: existing.conversion_id },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION } }],
        audit: { auditId: ids.auditId, action: 'EXPIRE_GROUP_PLAN_OFFICIAL_CONVERSION',
          transitionId: 'GP-12', reasonCode: groupStarted ? 'GROUP_START_REACHED' : 'CONFIRMATION_DEADLINE',
          beforeState: 'PENDING_CONFIRMATION', afterState: 'EXPIRED',
          metadata: { groupPlanId: context.group_plan_id, socialPlanPreserved: !groupStarted } },
        outbox,
      };
    },
  });
}
