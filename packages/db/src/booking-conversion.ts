import {
  CHALLENGE_POLICY_VERSION,
  SCHEDULING_POLICY_VERSION,
  SchedulingConflictError,
  SchedulingPermissionDeniedError,
  acceptedChallengeSchedulingDeadline,
  assertOfficialConversionCanExpire,
  assertOfficialConversionDecisionCanBeRecorded,
  assertTrainingOfficialConversionCanBeRequested,
  type CommandEnvelope,
  type OfficialConversionRequiredRole,
  type OfficialConversionState,
  type TimerAggregateSnapshot,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import { executeCriticalCommand, type ExecutedCommand } from './platform-command.js';

export interface RequestBookingOfficialConversionPayload {
  readonly sessionId: string;
  readonly explicitRulesetAcknowledged?: boolean;
}

export interface DecideBookingOfficialConversionPayload {
  readonly conversionId: string;
  readonly decision: 'ACCEPT' | 'DECLINE';
  readonly explicitRulesetAcknowledged?: boolean;
}

export interface ExpireBookingOfficialConversionPayload {
  readonly conversionId: string;
}

export interface BookingOfficialConversionEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly conversionId?: string;
  readonly queueEntryId?: string;
  readonly queueEventId?: string;
  readonly queueConsumedEventId?: string;
  readonly timerOutboxMessageId?: string;
  readonly confirmationId?: string;
  readonly challengeId?: string;
  readonly challengeEventId?: string;
  readonly serviceChatId?: string;
  readonly serviceChatEventId?: string;
  readonly rulesetSnapshotId?: string;
  readonly acknowledgmentIds?: readonly [string, string];
  readonly obligationIds?: readonly [string, string];
  readonly bookingEventId?: string;
  readonly sessionEventId?: string;
  readonly notificationOutboxMessageId: string;
  readonly notificationIds: readonly [string, string, string];
}

export interface BookingOfficialConversionConfirmationProjection {
  readonly actorUserId: string;
  readonly requiredRole: OfficialConversionRequiredRole;
  readonly decision: 'ACCEPT' | 'DECLINE';
  readonly decidedAt: string;
}

export interface BookingOfficialConversionProjection {
  readonly conversionId: string;
  readonly bookingId: string;
  readonly sessionId: string;
  readonly competitionId: string;
  readonly requestedByUserId: string;
  readonly stake: 'NONE' | 'CONTENDER' | 'TITLE';
  readonly state: OfficialConversionState;
  readonly boundHolderUserId: string | null;
  readonly queueEntryId: string | null;
  readonly queuePosition: number | null;
  readonly challengeId: string | null;
  readonly confirmationDeadlineAt: string | null;
  readonly confirmations: readonly BookingOfficialConversionConfirmationProjection[];
  readonly viewerRequiredRole: OfficialConversionRequiredRole | null;
  readonly viewerHasDecided: boolean;
  readonly viewerCanRequest: boolean;
  readonly viewerCanConfirm: boolean;
  readonly viewerCanDecline: boolean;
  readonly version: number;
}

export interface BookingOfficialConversionActivationCandidate {
  readonly conversionId: string;
  readonly competitionId: string;
  readonly queueEntryId: string;
  readonly version: number;
}

export interface InvalidBookingOfficialConversionCandidate
  extends BookingOfficialConversionActivationCandidate {
  readonly reasonCode: 'BOUND_HOLDER_CHANGED' | 'PREBOOKED_SOURCE_UNAVAILABLE';
}

export type ActiveBookingOfficialConversionInvalidationReason =
  | 'BOUND_HOLDER_CHANGED'
  | 'OFFICIAL_ELIGIBILITY_LOST'
  | 'STATUS_SLOT_UNAVAILABLE';

export interface InvalidActiveBookingOfficialConversionCandidate {
  readonly conversionId: string;
  readonly competitionId: string;
  readonly version: number;
  readonly reasonCode: ActiveBookingOfficialConversionInvalidationReason;
}

export interface InvalidateActiveBookingOfficialConversionPayload {
  readonly conversionId: string;
  readonly reasonCode: ActiveBookingOfficialConversionInvalidationReason;
}

interface ConversionContextRow {
  readonly booking_id: string;
  readonly booking_version: string;
  readonly booking_state: string;
  readonly booking_purpose: string;
  readonly chat_id: string;
  readonly match_id: string | null;
  readonly session_id: string;
  readonly session_version: string;
  readonly session_state: 'SCHEDULED' | 'READY_FOR_COACH' | 'IN_PROGRESS' | 'ENDED' | 'CANCELLED';
  readonly session_purpose: string;
  readonly window_opened_at: Date | null;
  readonly actual_start_at: Date | null;
  readonly scheduled_start_at: Date;
  readonly scheduled_end_at: Date;
  readonly venue_id: string;
  readonly coach_user_id: string;
  readonly pair_low_id: string;
  readonly pair_high_id: string;
  readonly competition_id: string;
  readonly community_id: string;
  readonly community_configuration_id: string;
  readonly ruleset_ref: string;
  readonly ruleset_ack_mode: 'IMPLICIT_ON_ACCEPT' | 'EXPLICIT_ACK_REQUIRED';
  readonly competition_phase: string;
  readonly competition_availability: string;
  readonly status_lock_result_id: string | null;
  readonly champion_user_id: string | null;
  readonly contender_user_id: string | null;
  readonly community_state: string;
  readonly low_account_active: boolean;
  readonly high_account_active: boolean;
  readonly low_age_division: 'YOUTH' | 'ADULT';
  readonly high_age_division: 'YOUTH' | 'ADULT';
  readonly low_verified: boolean;
  readonly high_verified: boolean;
  readonly low_membership_active: boolean;
  readonly high_membership_active: boolean;
  readonly active_obligation_count: string;
  readonly live_pair_challenge: boolean;
  readonly pair_cooldown_active: boolean;
  readonly active_status_challenge: boolean;
  readonly coach_authorized: boolean;
  readonly has_live_conversion: boolean;
}

interface ConversionRow {
  readonly conversion_id: string;
  readonly booking_id: string;
  readonly session_id: string;
  readonly competition_id: string;
  readonly requested_by_user_id: string;
  readonly stake: 'NONE' | 'CONTENDER' | 'TITLE';
  readonly state: OfficialConversionState;
  readonly bound_holder_user_id: string | null;
  readonly queue_entry_id: string | null;
  readonly challenge_id: string | null;
  readonly confirmation_deadline_at: Date | null;
  readonly version: string;
}

interface ConfirmationRow {
  readonly actor_user_id: string;
  readonly required_role: OfficialConversionRequiredRole;
  readonly decision: 'ACCEPT' | 'DECLINE';
  readonly decided_at: Date;
}

function requiredId(ids: BookingOfficialConversionEffectIds, key: keyof BookingOfficialConversionEffectIds): string {
  const value = ids[key];
  if (typeof value !== 'string') throw new TypeError(`Booking conversion effect ID ${key} is required`);
  return value;
}

function requiredPair(
  ids: BookingOfficialConversionEffectIds,
  key: 'acknowledgmentIds' | 'obligationIds',
): readonly [string, string] {
  const value = ids[key];
  if (!value) throw new TypeError(`Booking conversion effect IDs ${key} are required`);
  return value;
}

async function conversionContext(
  database: Kysely<Database> | Transaction<Database>,
  sessionId: string,
  lock = false,
): Promise<ConversionContextRow | null> {
  const result = await sql<ConversionContextRow>`
    select booking.booking_id, booking.version::text as booking_version,
      booking.state as booking_state, booking.purpose as booking_purpose,
      booking.chat_id, booking.match_id,
      session.session_id, session.version::text as session_version,
      session.state as session_state, session.purpose as session_purpose,
      session.window_opened_at, session.actual_start_at,
      session.scheduled_start_at, session.scheduled_end_at,
      session.venue_id, session.coach_user_id,
      session.pair_low_id, session.pair_high_id,
      competitive.competition_id, competitive.community_id,
      configuration.configuration_id as community_configuration_id,
      configuration.ruleset_ref, configuration.ruleset_ack_mode,
      competitive.phase as competition_phase,
      competitive.availability as competition_availability,
      competitive.status_lock_result_id,
      competitive.champion_user_id, competitive.contender_user_id,
      community.state as community_state,
      low_user.account_state = 'ACTIVE' as low_account_active,
      high_user.account_state = 'ACTIVE' as high_account_active,
      low_user.age_division as low_age_division,
      high_user.age_division as high_age_division,
      exists (
        select 1 from identity.account_verifications verification
        where verification.user_id = session.pair_low_id
          and verification.is_current and verification.state = 'VERIFIED'
          and (verification.expires_at is null or verification.expires_at > clock_timestamp())
      ) as low_verified,
      exists (
        select 1 from identity.account_verifications verification
        where verification.user_id = session.pair_high_id
          and verification.is_current and verification.state = 'VERIFIED'
          and (verification.expires_at is null or verification.expires_at > clock_timestamp())
      ) as high_verified,
      exists (
        select 1 from community.community_memberships membership
        where membership.community_id = competitive.community_id
          and membership.user_id = session.pair_low_id
          and membership.state = 'ACTIVE' and membership.competition_enabled
      ) as low_membership_active,
      exists (
        select 1 from community.community_memberships membership
        where membership.community_id = competitive.community_id
          and membership.user_id = session.pair_high_id
          and membership.state = 'ACTIVE' and membership.competition_enabled
      ) as high_membership_active,
      (select count(*)::text from competition.challenge_participant_obligations obligation
        where obligation.user_id in (session.pair_low_id, session.pair_high_id)
          and obligation.released_at is null) as active_obligation_count,
      exists (
        select 1 from competition.challenges challenge
        where challenge.competition_id = competitive.competition_id
          and challenge.pair_low_id = session.pair_low_id
          and challenge.pair_high_id = session.pair_high_id
          and challenge.state in (
            'AWAITING_RESPONSE', 'ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED',
            'IN_SESSION', 'RESULT_PENDING', 'RESULT_RECORDED', 'UNDER_APPEAL'
          )
      ) as live_pair_challenge,
      exists (
        select 1 from competition.pair_cooldowns cooldown
        where cooldown.competition_id = competitive.competition_id
          and cooldown.pair_low_id = session.pair_low_id
          and cooldown.pair_high_id = session.pair_high_id
          and cooldown.invalidated_at is null and cooldown.ends_at > clock_timestamp()
      ) as pair_cooldown_active,
      exists (
        select 1 from competition.challenges challenge
        where challenge.competition_id = competitive.competition_id
          and challenge.stake <> 'NONE'
          and challenge.state in (
            'AWAITING_RESPONSE', 'ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED',
            'IN_SESSION', 'RESULT_PENDING', 'RESULT_RECORDED', 'UNDER_APPEAL'
          )
      ) as active_status_challenge,
      exists (
        select 1 from community.role_grants role_grant
        where role_grant.user_id = session.coach_user_id
          and role_grant.role = 'COACH' and role_grant.state = 'ACTIVE'
          and (role_grant.expires_at is null or role_grant.expires_at > clock_timestamp())
          and (
            (role_grant.scope_type = 'SESSION' and role_grant.scope_id = session.session_id)
            or (role_grant.scope_type = 'COMMUNITY' and role_grant.scope_id = competitive.community_id)
          )
      ) as coach_authorized,
      exists (
        select 1 from scheduling.booking_official_conversions conversion
        where conversion.booking_id = booking.booking_id
          and conversion.state in ('WAITING_FIFO', 'PENDING_CONFIRMATION')
      ) as has_live_conversion
    from scheduling.sessions session
    join scheduling.bookings booking on booking.booking_id = session.booking_id
    join identity.users low_user on low_user.user_id = session.pair_low_id
    join identity.users high_user on high_user.user_id = session.pair_high_id
    join community.communities community
      on community.venue_id = session.venue_id and community.state <> 'CLOSED'
    join community.community_configuration_versions configuration
      on configuration.configuration_id = community.configuration_id
    join competition.competitions competitive
      on competitive.community_id = community.community_id
      and competitive.age_division = low_user.age_division
      and competitive.discipline_key is null
    where session.session_id = ${sessionId}::uuid
      and high_user.age_division = low_user.age_division
    order by competitive.created_at
    limit 1
    ${lock ? sql`for update of session, booking, competitive` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

function stakeFor(context: ConversionContextRow): 'NONE' | 'CONTENDER' | 'TITLE' {
  const pair = new Set([context.pair_low_id, context.pair_high_id]);
  if (
    context.champion_user_id && context.contender_user_id
    && pair.has(context.champion_user_id) && pair.has(context.contender_user_id)
  ) return 'TITLE';
  if (context.contender_user_id && pair.has(context.contender_user_id)) return 'CONTENDER';
  return 'NONE';
}

function contextEligibilityFailure(
  context: ConversionContextRow,
  stake: 'NONE' | 'CONTENDER' | 'TITLE',
): string | null {
  if (
    context.community_state !== 'ACTIVE'
    || context.competition_availability !== 'ACTIVE'
    || !context.low_account_active || !context.high_account_active
    || !context.low_verified || !context.high_verified
    || !context.low_membership_active || !context.high_membership_active
    || context.low_age_division === 'YOUTH' || context.high_age_division === 'YOUTH'
    || !context.coach_authorized
    || Number(context.active_obligation_count) > 0
    || context.live_pair_challenge
    || context.pair_cooldown_active
  ) return 'OFFICIAL_ELIGIBILITY_LOST';
  if (stake !== 'NONE' && (context.status_lock_result_id !== null || context.active_status_challenge)) {
    return 'STATUS_SLOT_UNAVAILABLE';
  }
  return null;
}

function activeConversionInvalidationReason(
  conversion: Pick<ConversionRow, 'stake' | 'bound_holder_user_id'>,
  context: ConversionContextRow,
): ActiveBookingOfficialConversionInvalidationReason | null {
  const currentStake = stakeFor(context);
  if (
    conversion.stake === 'CONTENDER'
    && conversion.bound_holder_user_id !== context.contender_user_id
  ) return 'BOUND_HOLDER_CHANGED';
  if (currentStake !== conversion.stake) return 'OFFICIAL_ELIGIBILITY_LOST';
  const failure = contextEligibilityFailure(context, conversion.stake);
  if (failure === 'OFFICIAL_ELIGIBILITY_LOST' || failure === 'STATUS_SLOT_UNAVAILABLE') {
    return failure;
  }
  return null;
}

function assertContextEligible(context: ConversionContextRow, stake: 'NONE' | 'CONTENDER' | 'TITLE'): void {
  if (contextEligibilityFailure(context, stake) !== null) {
    throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
  }
}

function roleFor(context: ConversionContextRow, actorUserId: string): OfficialConversionRequiredRole | null {
  if (actorUserId === context.pair_low_id) return 'ATHLETE_LOW';
  if (actorUserId === context.pair_high_id) return 'ATHLETE_HIGH';
  if (actorUserId === context.coach_user_id) return 'COACH';
  return null;
}

async function conversionRow(
  database: Kysely<Database> | Transaction<Database>,
  conversionId: string,
  lock = false,
): Promise<ConversionRow | null> {
  const result = await sql<ConversionRow>`
    select conversion_id, booking_id, session_id, competition_id,
      requested_by_user_id, stake, state, bound_holder_user_id,
      queue_entry_id, challenge_id, confirmation_deadline_at,
      version::text as version
    from scheduling.booking_official_conversions
    where conversion_id = ${conversionId}::uuid
    ${lock ? sql`for update` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function confirmations(
  database: Kysely<Database> | Transaction<Database>,
  conversionId: string,
): Promise<readonly ConfirmationRow[]> {
  const result = await sql<ConfirmationRow>`
    select actor_user_id, required_role, decision, decided_at
    from scheduling.booking_conversion_confirmations
    where conversion_id = ${conversionId}::uuid
    order by decided_at, required_role
  `.execute(database);
  return result.rows;
}

async function queuePosition(
  database: Kysely<Database> | Transaction<Database>,
  queueEntryId: string | null,
): Promise<number | null> {
  if (!queueEntryId) return null;
  const result = await sql<{ readonly position: string | null }>`
    select case when target.state in ('WAITING', 'RECONFIRMATION_REQUIRED', 'ACTIVATED')
      then (select count(*)::text
        from competition.challenge_queue_entries entry
        where entry.competition_id = target.competition_id
          and entry.target_status = target.target_status
          and entry.state in ('WAITING', 'PAIRED_PENDING_ACCEPTANCE', 'RECONFIRMATION_REQUIRED', 'ACTIVATED')
          and (entry.submitted_at, entry.queue_entry_id) <= (target.submitted_at, target.queue_entry_id))
      else null end as position
    from competition.challenge_queue_entries target
    where target.queue_entry_id = ${queueEntryId}::uuid
  `.execute(database);
  const value = result.rows[0]?.position;
  return value === null || value === undefined ? null : Number(value);
}

async function projection(
  database: Kysely<Database> | Transaction<Database>,
  row: ConversionRow,
  viewerUserId: string,
): Promise<BookingOfficialConversionProjection> {
  const [items, context, position] = await Promise.all([
    confirmations(database, row.conversion_id),
    conversionContext(database, row.session_id),
    queuePosition(database, row.queue_entry_id),
  ]);
  if (!context) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
  const viewerRequiredRole = roleFor(context, viewerUserId);
  const viewerHasDecided = items.some((item) => item.actor_user_id === viewerUserId);
  const pending = row.state === 'PENDING_CONFIRMATION';
  return {
    conversionId: row.conversion_id,
    bookingId: row.booking_id,
    sessionId: row.session_id,
    competitionId: row.competition_id,
    requestedByUserId: row.requested_by_user_id,
    stake: row.stake,
    state: row.state,
    boundHolderUserId: row.bound_holder_user_id,
    queueEntryId: row.queue_entry_id,
    queuePosition: position,
    challengeId: row.challenge_id,
    confirmationDeadlineAt: row.confirmation_deadline_at?.toISOString() ?? null,
    confirmations: items.map((item) => ({
      actorUserId: item.actor_user_id,
      requiredRole: item.required_role,
      decision: item.decision,
      decidedAt: item.decided_at.toISOString(),
    })),
    viewerRequiredRole,
    viewerHasDecided,
    viewerCanRequest: false,
    viewerCanConfirm: pending && viewerRequiredRole !== null && !viewerHasDecided,
    viewerCanDecline: pending && viewerRequiredRole !== null && !viewerHasDecided,
    version: Number(row.version),
  };
}

export async function readBookingOfficialConversionForSession(
  database: Kysely<Database> | Transaction<Database>,
  sessionId: string,
  viewerUserId: string,
): Promise<BookingOfficialConversionProjection | null> {
  const context = await conversionContext(database, sessionId);
  if (!context || roleFor(context, viewerUserId) === null) return null;
  const result = await sql<{ readonly conversion_id: string }>`
    select conversion_id from scheduling.booking_official_conversions
    where session_id = ${sessionId}::uuid
    order by created_at desc, conversion_id desc
    limit 1
  `.execute(database);
  const id = result.rows[0]?.conversion_id;
  if (!id) return null;
  const row = await conversionRow(database, id);
  return row ? projection(database, row, viewerUserId) : null;
}

export async function readInvalidActiveBookingOfficialConversionCandidate(
  database: Kysely<Database>,
  competitionId: string,
): Promise<InvalidActiveBookingOfficialConversionCandidate | null> {
  const result = await sql<{
    readonly conversion_id: string;
    readonly session_id: string;
    readonly stake: 'NONE' | 'CONTENDER' | 'TITLE';
    readonly bound_holder_user_id: string | null;
    readonly version: string;
  }>`
    select conversion_id, session_id, stake, bound_holder_user_id,
      version::text as version
    from scheduling.booking_official_conversions
    where competition_id = ${competitionId}::uuid
      and state = 'PENDING_CONFIRMATION'
    order by created_at, conversion_id
  `.execute(database);
  for (const row of result.rows) {
    const context = await conversionContext(database, row.session_id);
    if (!context) continue;
    const reasonCode = activeConversionInvalidationReason({
      stake: row.stake,
      bound_holder_user_id: row.bound_holder_user_id,
    }, context);
    if (reasonCode) {
      return {
        conversionId: row.conversion_id,
        competitionId,
        version: Number(row.version),
        reasonCode,
      };
    }
  }
  return null;
}

export async function invalidateActiveBookingOfficialConversion(
  database: Kysely<Database>,
  command: CommandEnvelope<InvalidateActiveBookingOfficialConversionPayload>,
  ids: BookingOfficialConversionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<BookingOfficialConversionProjection>> {
  if (command.actor.type !== 'SYSTEM' || command.aggregateType !== 'BookingOfficialConversion'
    || command.aggregateId !== command.payload.conversionId) {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, eventContext) => {
      const existing = await conversionRow(transaction, command.aggregateId, true);
      if (!existing || existing.state !== 'PENDING_CONFIRMATION') {
        throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_PENDING');
      }
      const context = await conversionContext(transaction, existing.session_id, true);
      if (!context) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
      const reasonCode = activeConversionInvalidationReason(existing, context);
      if (!reasonCode || reasonCode !== command.payload.reasonCode) {
        throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
      }
      await sql`
        update scheduling.booking_official_conversions
        set state = 'INVALIDATED', terminal_reason = ${reasonCode},
          decided_at = ${eventContext.occurredAt.toISOString()}::timestamptz,
          version = ${eventContext.nextVersion},
          updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
        where conversion_id = ${existing.conversion_id}::uuid
          and state = 'PENDING_CONFIRMATION'
      `.execute(transaction);
      await sql`
        update scheduling.bookings set state = 'CONFIRMED_PAIR', version = version + 1,
          updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
        where booking_id = ${existing.booking_id}::uuid
          and state = 'OFFICIAL_CONVERSION_PENDING'
      `.execute(transaction);
      const closed = await conversionRow(transaction, existing.conversion_id);
      if (!closed) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_PENDING');
      const response = await projection(transaction, closed, existing.requested_by_user_id);
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId, eventName: 'TrainingOfficialConversionClosed',
          schemaVersion: 1, transitionId: 'B-23', payload: {
            conversionId: existing.conversion_id, reason: reasonCode,
            sourcePreservedAsTraining: true,
          }, metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        relatedEvents: [{
          eventId: requiredId(ids, 'bookingEventId'), eventName: 'TrainingOfficialConversionClosed',
          schemaVersion: 1, aggregateType: 'Booking', aggregateId: existing.booking_id,
          aggregateVersion: Number(context.booking_version) + 1, transitionId: 'B-23',
          payload: { bookingId: existing.booking_id, conversionId: existing.conversion_id,
            reason: reasonCode, sourcePreservedAsTraining: true },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        }],
        audit: {
          auditId: ids.auditId, action: 'CLOSE_INVALID_TRAINING_OFFICIAL_CONVERSION',
          transitionId: 'B-23', reasonCode, beforeState: existing.state,
          afterState: 'INVALIDATED', metadata: {
            bookingId: existing.booking_id, eventDriven: true, noLoss: true,
          },
        },
        outbox: [
          { messageId: ids.outboxMessageId,
            topic: 'scheduling.booking.official-conversion-closed.v1', payload: {
              conversionId: existing.conversion_id, bookingId: existing.booking_id,
              competitionId: existing.competition_id, reason: reasonCode,
              sourcePreservedAsTraining: true,
            } },
          { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1',
            payload: { notifications: [context.pair_low_id, context.pair_high_id,
              context.coach_user_id].map((recipientUserId, index) => ({
                notificationId: ids.notificationIds[index]!, recipientUserId,
                category: 'SERVICE', renderKey: 'booking.official-conversion-invalidated',
                actionTarget: { type: 'BOOKING', bookingId: existing.booking_id },
                payload: { conversionId: existing.conversion_id, reason: reasonCode },
                deadlineAt: null,
              })) } },
        ],
      };
    },
  });
}

export async function readBookingOfficialConversionActivationCandidate(
  database: Kysely<Database>,
  competitionId: string,
  now?: () => Date,
): Promise<BookingOfficialConversionActivationCandidate | null> {
  const observedAt = now?.().toISOString() ?? null;
  const result = await sql<{
    readonly conversion_id: string;
    readonly competition_id: string;
    readonly queue_entry_id: string;
    readonly version: string;
  }>`
    select conversion.conversion_id, conversion.competition_id,
      entry.queue_entry_id, conversion.version::text as version
    from competition.competitions competitive
    join community.communities community on community.community_id = competitive.community_id
    cross join lateral (
      select queue_entry_id, kind, state, bound_holder_user_id, source_id,
        submitted_at
      from competition.challenge_queue_entries
      where competition_id = competitive.competition_id
        and target_status = 'CONTENDER'
        and state in ('WAITING', 'PAIRED_PENDING_ACCEPTANCE', 'RECONFIRMATION_REQUIRED', 'ACTIVATED')
      order by submitted_at, queue_entry_id
      limit 1
    ) entry
    join scheduling.booking_official_conversions conversion
      on conversion.queue_entry_id = entry.queue_entry_id
      and conversion.state = 'WAITING_FIFO'
    join scheduling.sessions session on session.session_id = conversion.session_id
    where competitive.competition_id = ${competitionId}::uuid
      and competitive.phase = 'RUNNING' and competitive.availability = 'ACTIVE'
      and competitive.integrity_hold_case_id is null
      and not exists (
        select 1 from competition.process_holds as process_hold
        where process_hold.aggregate_type = 'COMPETITION'
          and process_hold.aggregate_id = competitive.competition_id
          and process_hold.reason = 'STATUS_REVIEW' and process_hold.state = 'ACTIVE'
      )
      and competitive.status_lock_result_id is null
      and competitive.contender_user_id is not null
      and community.state = 'ACTIVE'
      and entry.kind = 'PREBOOKED_CONVERSION' and entry.state = 'WAITING'
      and entry.bound_holder_user_id = competitive.contender_user_id
      and session.state = 'SCHEDULED' and session.window_opened_at is null
      and session.actual_start_at is null
      and session.scheduled_start_at > coalesce(${observedAt}::timestamptz, clock_timestamp())
      and not exists (
        select 1 from scheduling.booking_official_conversions other_conversion
        where other_conversion.competition_id = competitive.competition_id
          and other_conversion.stake = 'CONTENDER'
          and other_conversion.state = 'PENDING_CONFIRMATION'
      )
      and not exists (
        select 1 from competition.challenges challenge
        where challenge.competition_id = competitive.competition_id
          and challenge.stake <> 'NONE'
          and challenge.state in (
            'AWAITING_RESPONSE', 'ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED',
            'IN_SESSION', 'RESULT_PENDING', 'RESULT_RECORDED', 'UNDER_APPEAL'
          )
      )
    limit 1
  `.execute(database);
  const row = result.rows[0];
  return row ? {
    conversionId: row.conversion_id,
    competitionId: row.competition_id,
    queueEntryId: row.queue_entry_id,
    version: Number(row.version),
  } : null;
}

export async function readInvalidBookingOfficialConversionCandidate(
  database: Kysely<Database>,
  competitionId: string,
): Promise<InvalidBookingOfficialConversionCandidate | null> {
  const result = await sql<{
    readonly conversion_id: string;
    readonly competition_id: string;
    readonly queue_entry_id: string;
    readonly version: string;
    readonly reason_code: 'BOUND_HOLDER_CHANGED' | 'PREBOOKED_SOURCE_UNAVAILABLE';
  }>`
    select conversion.conversion_id, conversion.competition_id,
      entry.queue_entry_id, conversion.version::text as version,
      case
        when entry.bound_holder_user_id is distinct from competitive.contender_user_id
          then 'BOUND_HOLDER_CHANGED'
        else 'PREBOOKED_SOURCE_UNAVAILABLE'
      end as reason_code
    from scheduling.booking_official_conversions conversion
    join competition.challenge_queue_entries entry
      on entry.queue_entry_id = conversion.queue_entry_id and entry.state = 'WAITING'
    join competition.competitions competitive
      on competitive.competition_id = conversion.competition_id
    join scheduling.sessions session on session.session_id = conversion.session_id
    join scheduling.bookings booking on booking.booking_id = conversion.booking_id
    where conversion.competition_id = ${competitionId}::uuid
      and conversion.state = 'WAITING_FIFO'
      and (
        entry.bound_holder_user_id is distinct from competitive.contender_user_id
        or session.state <> 'SCHEDULED' or session.window_opened_at is not null
        or session.actual_start_at is not null or session.scheduled_start_at <= clock_timestamp()
        or booking.state <> 'CONFIRMED_PAIR' or booking.purpose <> 'TRAINING'
      )
    order by entry.submitted_at, entry.queue_entry_id
    limit 1
  `.execute(database);
  const row = result.rows[0];
  return row ? {
    conversionId: row.conversion_id,
    competitionId: row.competition_id,
    queueEntryId: row.queue_entry_id,
    version: Number(row.version),
    reasonCode: row.reason_code,
  } : null;
}

export async function invalidateBookingOfficialConversionFromQueue(
  database: Kysely<Database>,
  command: CommandEnvelope<{
    readonly conversionId: string;
    readonly queueEntryId: string;
    readonly reasonCode: 'BOUND_HOLDER_CHANGED' | 'PREBOOKED_SOURCE_UNAVAILABLE';
  }>,
  ids: BookingOfficialConversionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<BookingOfficialConversionProjection>> {
  if (command.actor.type !== 'SYSTEM' || command.aggregateType !== 'BookingOfficialConversion'
    || command.aggregateId !== command.payload.conversionId) {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command, ...(now ? { now } : {}),
    mutate: async (transaction, eventContext) => {
      const existing = await conversionRow(transaction, command.aggregateId, true);
      if (!existing || existing.state !== 'WAITING_FIFO'
        || existing.queue_entry_id !== command.payload.queueEntryId) {
        throw new SchedulingConflictError('OFFICIAL_CONVERSION_FIFO_REQUIRED');
      }
      const context = await conversionContext(transaction, existing.session_id, true);
      if (!context) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
      await sql`
        update competition.challenge_queue_entries
        set state = 'INVALIDATED', decided_at = ${eventContext.occurredAt.toISOString()}::timestamptz,
          terminal_reason = ${command.payload.reasonCode}, version = version + 1,
          updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
        where queue_entry_id = ${existing.queue_entry_id}::uuid and state = 'WAITING'
      `.execute(transaction);
      await sql`
        update scheduling.booking_official_conversions
        set state = 'INVALIDATED', terminal_reason = ${command.payload.reasonCode},
          decided_at = ${eventContext.occurredAt.toISOString()}::timestamptz,
          version = ${eventContext.nextVersion}, updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
        where conversion_id = ${existing.conversion_id}::uuid and state = 'WAITING_FIFO'
      `.execute(transaction);
      const invalidated = await conversionRow(transaction, existing.conversion_id);
      if (!invalidated) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
      const response = await projection(transaction, invalidated, existing.requested_by_user_id);
      return {
        responseStatus: 200, response,
        event: { eventId: ids.eventId, eventName: 'TrainingOfficialConversionClosed',
          schemaVersion: 1, transitionId: 'B-23', payload: {
            conversionId: existing.conversion_id, bookingId: existing.booking_id,
            reason: command.payload.reasonCode, sourcePreservedAsTraining: true,
          }, metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
        relatedEvents: [{
          eventId: requiredId(ids, 'queueEventId'), eventName: 'QueueEntryInvalidated',
          schemaVersion: 1, aggregateType: 'ChallengeQueueEntry',
          aggregateId: existing.queue_entry_id, aggregateVersion: 2, transitionId: 'Q-08',
          payload: { queueEntryId: existing.queue_entry_id,
            competitionId: existing.competition_id, reasonCode: command.payload.reasonCode,
            noLoss: true, sourcePreservedAsTraining: true },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        }],
        audit: { auditId: ids.auditId, action: 'INVALIDATE_PREBOOKED_OFFICIAL_CONVERSION',
          transitionId: 'B-23', reasonCode: command.payload.reasonCode,
          beforeState: existing.state, afterState: 'INVALIDATED', metadata: {
            bookingId: existing.booking_id, queueEntryId: existing.queue_entry_id,
            noLoss: true, sourcePreservedAsTraining: true,
          } },
        outbox: [
          { messageId: ids.outboxMessageId, topic: 'competition.status-queue.head-released.v1',
            payload: { conversionId: existing.conversion_id, bookingId: existing.booking_id,
              queueEntryId: existing.queue_entry_id, competitionId: existing.competition_id,
              reasonCode: command.payload.reasonCode } },
          { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1', payload: {
            notifications: [context.pair_low_id, context.pair_high_id, context.coach_user_id]
              .map((recipientUserId, index) => ({ notificationId: ids.notificationIds[index]!, recipientUserId,
                category: 'SERVICE', renderKey: 'booking.official-conversion-invalidated',
                actionTarget: { type: 'BOOKING', bookingId: existing.booking_id },
                payload: { conversionId: existing.conversion_id, reasonCode: command.payload.reasonCode },
                deadlineAt: null })) } },
        ],
      };
    },
  });
}

export async function activateBookingOfficialConversionFromQueue(
  database: Kysely<Database>,
  command: CommandEnvelope<{ readonly conversionId: string; readonly queueEntryId: string }>,
  ids: BookingOfficialConversionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<BookingOfficialConversionProjection>> {
  if (command.actor.type !== 'SYSTEM' || command.aggregateType !== 'BookingOfficialConversion'
    || command.aggregateId !== command.payload.conversionId) {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command, ...(now ? { now } : {}),
    mutate: async (transaction, eventContext) => {
      const existing = await conversionRow(transaction, command.aggregateId, true);
      if (!existing || existing.state !== 'WAITING_FIFO'
        || existing.queue_entry_id !== command.payload.queueEntryId) {
        throw new SchedulingConflictError('OFFICIAL_CONVERSION_FIFO_REQUIRED');
      }
      const context = await conversionContext(transaction, existing.session_id, true);
      if (!context) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
      const deadline = officialConversionActivationDeadline(context, eventContext.occurredAt);
      const headResult = await sql<{ readonly queue_entry_id: string }>`
        select queue_entry_id from competition.challenge_queue_entries
        where competition_id = ${existing.competition_id}::uuid and target_status = 'CONTENDER'
          and state in ('WAITING', 'PAIRED_PENDING_ACCEPTANCE', 'RECONFIRMATION_REQUIRED', 'ACTIVATED')
        order by submitted_at, queue_entry_id limit 1 for update
      `.execute(transaction);
      if (headResult.rows[0]?.queue_entry_id !== existing.queue_entry_id
        || existing.bound_holder_user_id !== context.contender_user_id
        || stakeFor(context) !== 'CONTENDER') {
        throw new SchedulingConflictError('OFFICIAL_CONVERSION_FIFO_REQUIRED');
      }
      assertContextEligible(context, 'CONTENDER');
      if (context.booking_state !== 'CONFIRMED_PAIR' || context.booking_purpose !== 'TRAINING'
        || context.session_state !== 'SCHEDULED' || context.window_opened_at !== null
        || context.actual_start_at !== null) {
        throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
      }
      await sql`
        update competition.challenge_queue_entries
        set state = 'CONSUMED', decided_at = ${eventContext.occurredAt.toISOString()}::timestamptz,
          terminal_reason = 'CONVERSION_FLOW_ACTIVATED', version = version + 2,
          updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
        where queue_entry_id = ${existing.queue_entry_id}::uuid and state = 'WAITING'
      `.execute(transaction);
      await sql`
        update scheduling.bookings
        set state = 'OFFICIAL_CONVERSION_PENDING', version = version + 1,
          updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
        where booking_id = ${existing.booking_id}::uuid and state = 'CONFIRMED_PAIR'
      `.execute(transaction);
      await sql`
        update scheduling.booking_official_conversions
        set state = 'PENDING_CONFIRMATION', confirmation_deadline_at = ${deadline.toISOString()}::timestamptz,
          version = ${eventContext.nextVersion}, updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
        where conversion_id = ${existing.conversion_id}::uuid and state = 'WAITING_FIFO'
      `.execute(transaction);
      const active = await conversionRow(transaction, existing.conversion_id);
      if (!active) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_PENDING');
      const response = await projection(transaction, active, existing.requested_by_user_id);
      return {
        responseStatus: 200, response,
        event: { eventId: ids.eventId, eventName: 'TrainingOfficialConversionRequested',
          schemaVersion: 1, transitionId: 'B-22', payload: {
            conversionId: existing.conversion_id, bookingId: existing.booking_id,
            queueEntryId: existing.queue_entry_id, confirmationDeadlineAt: deadline.toISOString(),
          }, metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
        relatedEvents: [
          { eventId: requiredId(ids, 'queueEventId'), eventName: 'QueueEntryActivated',
            schemaVersion: 1, aggregateType: 'ChallengeQueueEntry', aggregateId: existing.queue_entry_id,
            aggregateVersion: 2, transitionId: 'Q-09', payload: {
              queueEntryId: existing.queue_entry_id, competitionId: existing.competition_id,
              conversionId: existing.conversion_id,
            }, metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
          { eventId: requiredId(ids, 'queueConsumedEventId'), eventName: 'QueueEntryConsumed',
            schemaVersion: 1, aggregateType: 'ChallengeQueueEntry', aggregateId: existing.queue_entry_id,
            aggregateVersion: 3, transitionId: 'Q-10', payload: {
              queueEntryId: existing.queue_entry_id, competitionId: existing.competition_id,
              conversionId: existing.conversion_id, statusSlotHeld: true,
            }, metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
          { eventId: requiredId(ids, 'bookingEventId'), eventName: 'BookingOfficialConversionPending',
            schemaVersion: 1, aggregateType: 'Booking', aggregateId: existing.booking_id,
            aggregateVersion: Number(context.booking_version) + 1, transitionId: 'B-22',
            payload: { bookingId: existing.booking_id, conversionId: existing.conversion_id,
              queueEntryId: existing.queue_entry_id },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
        ],
        audit: { auditId: ids.auditId, action: 'ACTIVATE_PREBOOKED_OFFICIAL_CONVERSION',
          transitionId: 'B-22', reasonCode: null, beforeState: existing.state,
          afterState: 'PENDING_CONFIRMATION', metadata: {
            bookingId: existing.booking_id, queueEntryId: existing.queue_entry_id,
            strictFifo: true, statusSlotHeld: true,
          } },
        outbox: [
          { messageId: ids.outboxMessageId, topic: 'scheduling.booking.official-conversion-requested.v1',
            payload: { conversionId: existing.conversion_id, bookingId: existing.booking_id,
              sessionId: existing.session_id, competitionId: existing.competition_id,
              queueEntryId: existing.queue_entry_id, statusSlotHeld: true } },
          { messageId: requiredId(ids, 'timerOutboxMessageId'),
            topic: 'scheduling.booking.official-conversion-timer.v1', payload: {
              conversionId: existing.conversion_id,
              timer: { commandType: 'EXPIRE_BOOKING_OFFICIAL_CONVERSION',
                aggregateType: 'BookingOfficialConversion', aggregateId: existing.conversion_id,
                expectedState: 'PENDING_CONFIRMATION', expectedVersion: eventContext.nextVersion,
                deadlineAt: deadline.toISOString(), policyVersion: SCHEDULING_POLICY_VERSION,
                idempotencyKey: `booking-conversion:${existing.conversion_id}:expire:v${eventContext.nextVersion}` },
            } },
          { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1', payload: {
            notifications: [context.pair_low_id, context.pair_high_id, context.coach_user_id]
              .filter((userId) => userId !== existing.requested_by_user_id)
              .map((recipientUserId, index) => ({ notificationId: ids.notificationIds[index]!, recipientUserId,
                category: 'MANDATORY', renderKey: 'booking.official-conversion-required',
                actionTarget: { type: 'BOOKING', bookingId: existing.booking_id },
                payload: { conversionId: existing.conversion_id, sessionId: existing.session_id,
                  queueEntryId: existing.queue_entry_id }, deadlineAt: deadline.toISOString() })) } },
        ],
      };
    },
  });
}

function officialConversionActivationDeadline(context: ConversionContextRow, occurredAt: Date): Date {
  return assertTrainingOfficialConversionCanBeRequested({
    bookingState: context.booking_state,
    bookingPurpose: context.booking_purpose,
    sessionState: context.session_state,
    windowOpenedAt: context.window_opened_at?.toISOString() ?? null,
    actualStartAt: context.actual_start_at?.toISOString() ?? null,
    scheduledStartAt: context.scheduled_start_at.toISOString(),
    actorIsAthlete: true,
    hasLiveConversion: false,
    occurredAt,
  });
}

export async function requestBookingOfficialConversion(
  database: Kysely<Database>,
  command: CommandEnvelope<RequestBookingOfficialConversionPayload>,
  ids: BookingOfficialConversionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<BookingOfficialConversionProjection>> {
  if (!command.actor.id || command.aggregateType !== 'BookingOfficialConversion') {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, eventContext) => {
      const context = await conversionContext(transaction, command.payload.sessionId, true);
      if (!context) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
      const actorRole = roleFor(context, command.actor.id!);
      const deadline = assertTrainingOfficialConversionCanBeRequested({
        bookingState: context.booking_state,
        bookingPurpose: context.booking_purpose,
        sessionState: context.session_state,
        windowOpenedAt: context.window_opened_at?.toISOString() ?? null,
        actualStartAt: context.actual_start_at?.toISOString() ?? null,
        scheduledStartAt: context.scheduled_start_at.toISOString(),
        actorIsAthlete: actorRole === 'ATHLETE_LOW' || actorRole === 'ATHLETE_HIGH',
        hasLiveConversion: context.has_live_conversion,
        occurredAt: eventContext.occurredAt,
      });
      if (context.scheduled_start_at > acceptedChallengeSchedulingDeadline(eventContext.occurredAt)) {
        throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
      }
      const stake = stakeFor(context);
      assertContextEligible(context, stake);
      if (
        context.ruleset_ack_mode === 'EXPLICIT_ACK_REQUIRED'
        && command.payload.explicitRulesetAcknowledged !== true
      ) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');

      const conversionId = requiredId(ids, 'conversionId');
      const waitingFifo = stake === 'CONTENDER';
      const queueEntryId = waitingFifo ? requiredId(ids, 'queueEntryId') : null;
      const boundHolder = waitingFifo ? context.contender_user_id : null;
      if (waitingFifo && !boundHolder) {
        throw new SchedulingConflictError('OFFICIAL_CONVERSION_FIFO_REQUIRED');
      }
      if (waitingFifo) {
        await sql`
          insert into competition.challenge_queue_entries (
            queue_entry_id, competition_id, initiator_user_id, target_status,
            kind, state, bound_holder_user_id, source_type, source_id,
            version, created_at, updated_at
          ) values (
            ${queueEntryId}::uuid, ${context.competition_id}::uuid,
            ${command.actor.id}::uuid, 'CONTENDER', 'PREBOOKED_CONVERSION', 'WAITING',
            ${boundHolder}::uuid, 'BOOKING', ${context.booking_id}::uuid,
            1, ${eventContext.occurredAt.toISOString()}::timestamptz,
            ${eventContext.occurredAt.toISOString()}::timestamptz
          )
        `.execute(transaction);
      }
      await sql`
        insert into scheduling.booking_official_conversions (
          conversion_id, booking_id, session_id, competition_id,
          requested_by_user_id, stake, state, bound_holder_user_id,
          queue_entry_id, confirmation_deadline_at, version, created_at, updated_at
        ) values (
          ${conversionId}::uuid, ${context.booking_id}::uuid, ${context.session_id}::uuid,
          ${context.competition_id}::uuid, ${command.actor.id}::uuid, ${stake},
          ${waitingFifo ? 'WAITING_FIFO' : 'PENDING_CONFIRMATION'},
          ${boundHolder}::uuid, ${queueEntryId}::uuid,
          ${waitingFifo ? null : deadline.toISOString()}::timestamptz,
          1, ${eventContext.occurredAt.toISOString()}::timestamptz,
          ${eventContext.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        insert into scheduling.booking_conversion_confirmations (
          confirmation_id, conversion_id, actor_user_id, required_role,
          decision, ruleset_acknowledged, decided_at, policy_version
        ) values (
          ${requiredId(ids, 'confirmationId')}::uuid, ${conversionId}::uuid,
          ${command.actor.id}::uuid, ${actorRole}, 'ACCEPT',
          ${context.ruleset_ack_mode !== 'EXPLICIT_ACK_REQUIRED' || command.payload.explicitRulesetAcknowledged === true},
          ${eventContext.occurredAt.toISOString()}::timestamptz, ${SCHEDULING_POLICY_VERSION}
        )
      `.execute(transaction);
      if (!waitingFifo) {
        await sql`
          update scheduling.bookings
          set state = 'OFFICIAL_CONVERSION_PENDING', version = version + 1,
            updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
          where booking_id = ${context.booking_id}::uuid and state = 'CONFIRMED_PAIR'
        `.execute(transaction);
      }
      const row = await conversionRow(transaction, conversionId);
      if (!row) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
      const response = await projection(transaction, row, command.actor.id!);
      return {
        responseStatus: 201,
        response,
        event: {
          eventId: ids.eventId,
          eventName: waitingFifo ? 'TrainingOfficialConversionQueued' : 'TrainingOfficialConversionRequested',
          schemaVersion: 1,
          transitionId: waitingFifo ? 'B-21' : 'B-17',
          payload: {
            conversionId, bookingId: context.booking_id, sessionId: context.session_id,
            competitionId: context.competition_id, stake, queueEntryId,
            confirmationDeadlineAt: response.confirmationDeadlineAt,
          },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        relatedEvents: waitingFifo ? [{
            eventId: requiredId(ids, 'queueEventId'), eventName: 'ChallengeQueued', schemaVersion: 1,
            aggregateType: 'ChallengeQueueEntry', aggregateId: queueEntryId!, aggregateVersion: 1,
            transitionId: 'Q-01', payload: {
              queueEntryId, competitionId: context.competition_id, kind: 'PREBOOKED_CONVERSION',
              sourceType: 'BOOKING', sourceId: context.booking_id,
            }, metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          }] : [{
            eventId: requiredId(ids, 'bookingEventId'),
            eventName: 'BookingOfficialConversionPending', schemaVersion: 1,
            aggregateType: 'Booking', aggregateId: context.booking_id,
            aggregateVersion: Number(context.booking_version) + 1, transitionId: 'B-17',
            payload: { bookingId: context.booking_id, conversionId, sessionId: context.session_id },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          }],
        audit: {
          auditId: ids.auditId,
          action: waitingFifo ? 'QUEUE_TRAINING_OFFICIAL_CONVERSION' : 'REQUEST_TRAINING_OFFICIAL_CONVERSION',
          transitionId: waitingFifo ? 'B-21' : 'B-17', reasonCode: null,
          beforeState: 'CONFIRMED_PAIR', afterState: waitingFifo ? 'CONFIRMED_PAIR' : 'OFFICIAL_CONVERSION_PENDING',
          metadata: { conversionId, competitionId: context.competition_id, stake, queueEntryId },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: waitingFifo
              ? 'competition.status-queue.submitted.v1'
              : 'scheduling.booking.official-conversion-requested.v1',
            payload: {
              conversionId, bookingId: context.booking_id, sessionId: context.session_id,
              competitionId: context.competition_id, queueEntryId,
            },
          },
          ...(!waitingFifo ? [{
            messageId: requiredId(ids, 'timerOutboxMessageId'),
            topic: 'scheduling.booking.official-conversion-timer.v1',
            payload: {
              conversionId,
              timer: {
                commandType: 'EXPIRE_BOOKING_OFFICIAL_CONVERSION', aggregateType: 'BookingOfficialConversion',
                aggregateId: conversionId, expectedState: 'PENDING_CONFIRMATION', expectedVersion: 1,
                deadlineAt: deadline.toISOString(), policyVersion: SCHEDULING_POLICY_VERSION,
                idempotencyKey: `booking-conversion:${conversionId}:expire:v1`,
              },
            },
          }] : []),
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: { notifications: [context.pair_low_id, context.pair_high_id, context.coach_user_id]
              .filter((userId) => userId !== command.actor.id)
              .map((recipientUserId, index) => ({
                notificationId: ids.notificationIds[index]!, recipientUserId,
                category: 'MANDATORY',
                renderKey: waitingFifo ? 'booking.official-conversion-queued' : 'booking.official-conversion-required',
                actionTarget: { type: 'BOOKING', bookingId: context.booking_id },
                payload: { conversionId, sessionId: context.session_id, stake, queueEntryId },
                deadlineAt: waitingFifo ? null : deadline.toISOString(),
              })) },
          },
        ],
      };
    },
  });
}

export async function decideBookingOfficialConversion(
  database: Kysely<Database>,
  command: CommandEnvelope<DecideBookingOfficialConversionPayload>,
  ids: BookingOfficialConversionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<BookingOfficialConversionProjection>> {
  if (!command.actor.id || command.aggregateType !== 'BookingOfficialConversion'
    || command.aggregateId !== command.payload.conversionId) {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, eventContext) => {
      const existing = await conversionRow(transaction, command.aggregateId, true);
      if (!existing || !existing.confirmation_deadline_at) {
        throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_PENDING');
      }
      const context = await conversionContext(transaction, existing.session_id, true);
      if (!context) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
      const actorRole = roleFor(context, command.actor.id!);
      const prior = await confirmations(transaction, existing.conversion_id);
      assertOfficialConversionDecisionCanBeRecorded({
        state: existing.state,
        actorRequired: actorRole !== null,
        actorAlreadyDecided: prior.some((item) => item.actor_user_id === command.actor.id),
        confirmationDeadlineAt: existing.confirmation_deadline_at.toISOString(),
        occurredAt: eventContext.occurredAt,
      });
      const eligibilityFailure = contextEligibilityFailure(context, existing.stake);
      if (eligibilityFailure !== null) {
        await sql`
          update scheduling.booking_official_conversions
          set state = 'INVALIDATED', terminal_reason = ${eligibilityFailure},
            decided_at = ${eventContext.occurredAt.toISOString()}::timestamptz,
            version = ${eventContext.nextVersion},
            updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
          where conversion_id = ${existing.conversion_id}::uuid
            and state = 'PENDING_CONFIRMATION'
        `.execute(transaction);
        await sql`
          update scheduling.bookings set state = 'CONFIRMED_PAIR', version = version + 1,
            updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
          where booking_id = ${existing.booking_id}::uuid
            and state = 'OFFICIAL_CONVERSION_PENDING'
        `.execute(transaction);
        const closed = await conversionRow(transaction, existing.conversion_id);
        if (!closed) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_PENDING');
        const response = await projection(transaction, closed, command.actor.id!);
        return {
          responseStatus: 200,
          response,
          event: {
            eventId: ids.eventId, eventName: 'TrainingOfficialConversionClosed',
            schemaVersion: 1, transitionId: 'B-23', payload: {
              conversionId: existing.conversion_id, reason: eligibilityFailure,
              sourcePreservedAsTraining: true,
            }, metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          },
          relatedEvents: [{
            eventId: requiredId(ids, 'bookingEventId'), eventName: 'TrainingOfficialConversionClosed',
            schemaVersion: 1, aggregateType: 'Booking', aggregateId: existing.booking_id,
            aggregateVersion: Number(context.booking_version) + 1, transitionId: 'B-23',
            payload: { bookingId: existing.booking_id, conversionId: existing.conversion_id,
              reason: eligibilityFailure, sourcePreservedAsTraining: true },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          }],
          audit: {
            auditId: ids.auditId, action: 'CLOSE_INVALID_TRAINING_OFFICIAL_CONVERSION',
            transitionId: 'B-23', reasonCode: eligibilityFailure,
            beforeState: existing.state, afterState: 'INVALIDATED',
            metadata: { bookingId: existing.booking_id, noLoss: true },
          },
          outbox: [
            { messageId: ids.outboxMessageId,
              topic: 'scheduling.booking.official-conversion-closed.v1', payload: {
                conversionId: existing.conversion_id, bookingId: existing.booking_id,
                competitionId: existing.competition_id, reason: eligibilityFailure,
                sourcePreservedAsTraining: true,
              } },
            { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1',
              payload: { notifications: [context.pair_low_id, context.pair_high_id,
                context.coach_user_id].map((recipientUserId, index) => ({
                  notificationId: ids.notificationIds[index]!, recipientUserId,
                  category: 'SERVICE', renderKey: 'booking.official-conversion-invalidated',
                  actionTarget: { type: 'BOOKING', bookingId: existing.booking_id },
                  payload: { conversionId: existing.conversion_id, reason: eligibilityFailure },
                  deadlineAt: null,
                })) } },
          ],
        };
      }
      if (
        actorRole !== 'COACH'
        && context.ruleset_ack_mode === 'EXPLICIT_ACK_REQUIRED'
        && command.payload.decision === 'ACCEPT'
        && command.payload.explicitRulesetAcknowledged !== true
      ) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
      await sql`
        insert into scheduling.booking_conversion_confirmations (
          confirmation_id, conversion_id, actor_user_id, required_role,
          decision, ruleset_acknowledged, decided_at, policy_version
        ) values (
          ${requiredId(ids, 'confirmationId')}::uuid, ${existing.conversion_id}::uuid,
          ${command.actor.id}::uuid, ${actorRole}, ${command.payload.decision},
          ${actorRole === 'COACH' || context.ruleset_ack_mode !== 'EXPLICIT_ACK_REQUIRED'
            || command.payload.explicitRulesetAcknowledged === true},
          ${eventContext.occurredAt.toISOString()}::timestamptz, ${SCHEDULING_POLICY_VERSION}
        )
      `.execute(transaction);
      if (command.payload.decision === 'DECLINE') {
        await sql`
          update scheduling.booking_official_conversions
          set state = 'DECLINED', terminal_reason = 'REQUIRED_PARTY_DECLINED',
            decided_at = ${eventContext.occurredAt.toISOString()}::timestamptz,
            version = ${eventContext.nextVersion}, updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
          where conversion_id = ${existing.conversion_id}::uuid
        `.execute(transaction);
        await sql`
          update scheduling.bookings set state = 'CONFIRMED_PAIR', version = version + 1,
            updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
          where booking_id = ${existing.booking_id}::uuid and state = 'OFFICIAL_CONVERSION_PENDING'
        `.execute(transaction);
        const closed = await conversionRow(transaction, existing.conversion_id);
        if (!closed) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_PENDING');
        const response = await projection(transaction, closed, command.actor.id!);
        return {
          responseStatus: 200, response,
          event: { eventId: ids.eventId, eventName: 'TrainingOfficialConversionClosed', schemaVersion: 1,
            transitionId: 'B-20', payload: { conversionId: existing.conversion_id, reason: 'DECLINED',
              actorUserId: command.actor.id, sourcePreservedAsTraining: true },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
          relatedEvents: [{
            eventId: requiredId(ids, 'bookingEventId'), eventName: 'TrainingOfficialConversionClosed',
            schemaVersion: 1, aggregateType: 'Booking', aggregateId: existing.booking_id,
            aggregateVersion: Number(context.booking_version) + 1, transitionId: 'B-20',
            payload: { bookingId: existing.booking_id, conversionId: existing.conversion_id,
              reason: 'DECLINED', sourcePreservedAsTraining: true },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          }],
          audit: { auditId: ids.auditId, action: 'DECLINE_TRAINING_OFFICIAL_CONVERSION',
            transitionId: 'B-20', reasonCode: 'REQUIRED_PARTY_DECLINED', beforeState: existing.state,
            afterState: 'DECLINED', metadata: { bookingId: existing.booking_id, noLoss: true } },
          outbox: [
            { messageId: ids.outboxMessageId, topic: 'scheduling.booking.official-conversion-closed.v1',
              payload: { conversionId: existing.conversion_id, bookingId: existing.booking_id,
                competitionId: existing.competition_id, reason: 'DECLINED', sourcePreservedAsTraining: true } },
            { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1', payload: {
              notifications: [context.pair_low_id, context.pair_high_id, context.coach_user_id]
                .filter((userId) => userId !== command.actor.id)
                .map((recipientUserId, index) => ({ notificationId: ids.notificationIds[index]!, recipientUserId,
                  category: 'SERVICE', renderKey: 'booking.official-conversion-declined',
                  actionTarget: { type: 'BOOKING', bookingId: existing.booking_id },
                  payload: { conversionId: existing.conversion_id }, deadlineAt: null })) } },
          ],
        };
      }

      const acceptCount = prior.filter((item) => item.decision === 'ACCEPT').length + 1;
      if (acceptCount < 3) {
        await sql`
          update scheduling.booking_official_conversions
          set version = ${eventContext.nextVersion}, updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
          where conversion_id = ${existing.conversion_id}::uuid
        `.execute(transaction);
        const pending = await conversionRow(transaction, existing.conversion_id);
        if (!pending) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_PENDING');
        const response = await projection(transaction, pending, command.actor.id!);
        return {
          responseStatus: 200, response,
          event: { eventId: ids.eventId, eventName: 'TrainingOfficialConversionPartyConfirmed',
            schemaVersion: 1, transitionId: 'B-18', payload: { conversionId: existing.conversion_id,
              actorUserId: command.actor.id, requiredRole: actorRole, acceptedCount: acceptCount },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
          audit: { auditId: ids.auditId, action: 'CONFIRM_TRAINING_OFFICIAL_CONVERSION_PARTY',
            transitionId: 'B-18', reasonCode: null, beforeState: existing.state,
            afterState: existing.state, metadata: { bookingId: existing.booking_id, acceptedCount: acceptCount } },
          outbox: [
            { messageId: ids.outboxMessageId, topic: 'scheduling.booking.official-conversion-party-confirmed.v1',
              payload: { conversionId: existing.conversion_id, bookingId: existing.booking_id,
                actorUserId: command.actor.id, acceptedCount: acceptCount } },
            { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1', payload: {
              notifications: [context.pair_low_id, context.pair_high_id, context.coach_user_id]
                .filter((userId) => userId !== command.actor.id)
                .map((recipientUserId, index) => ({ notificationId: ids.notificationIds[index]!, recipientUserId,
                  category: 'SERVICE', renderKey: 'booking.official-conversion-party-confirmed',
                  actionTarget: { type: 'BOOKING', bookingId: existing.booking_id },
                  payload: { conversionId: existing.conversion_id, acceptedCount: acceptCount },
                  deadlineAt: existing.confirmation_deadline_at!.toISOString() })) } },
          ],
        };
      }

      assertContextEligible(context, existing.stake);
      if (context.booking_state !== 'OFFICIAL_CONVERSION_PENDING'
        || context.booking_purpose !== 'TRAINING' || context.session_state !== 'SCHEDULED'
        || context.window_opened_at !== null || context.actual_start_at !== null
        || context.scheduled_start_at <= eventContext.occurredAt) {
        throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
      }
      if (stakeFor(context) !== existing.stake) {
        throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
      }
      for (const userId of [context.pair_low_id, context.pair_high_id].sort()) {
        await sql`select pg_advisory_xact_lock(hashtextextended(${`challenge-obligation:${userId}`}, 0))`
          .execute(transaction);
      }
      const challengeId = requiredId(ids, 'challengeId');
      const serviceChatId = requiredId(ids, 'serviceChatId');
      const rulesetSnapshotId = requiredId(ids, 'rulesetSnapshotId');
      const acknowledgmentIds = requiredPair(ids, 'acknowledgmentIds');
      const obligationIds = requiredPair(ids, 'obligationIds');
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
          'OPTIONAL', ${existing.stake}, 'BOOKED', ${rulesetSnapshotId}::uuid,
          ${eventContext.occurredAt.toISOString()}::timestamptz,
          ${eventContext.occurredAt.toISOString()}::timestamptz,
          ${acceptedChallengeSchedulingDeadline(eventContext.occurredAt).toISOString()}::timestamptz,
          1, ${eventContext.occurredAt.toISOString()}::timestamptz,
          ${eventContext.occurredAt.toISOString()}::timestamptz)
      `.execute(transaction);
      const allConfirmations = [...prior, {
        actor_user_id: command.actor.id!, required_role: actorRole!, decision: 'ACCEPT' as const,
        decided_at: eventContext.occurredAt,
      }];
      const athleteConfirmations = allConfirmations.filter((item) => item.required_role !== 'COACH');
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
          ) values (${obligationIds[index]}::uuid, ${challengeId}::uuid, ${userId}::uuid,
            ${eventContext.occurredAt.toISOString()}::timestamptz)
        `.execute(transaction);
      }
      await sql`
        update scheduling.bookings set purpose = 'OFFICIAL_CHALLENGE', challenge_id = ${challengeId}::uuid,
          state = 'CONFIRMED_PAIR', version = version + 1,
          updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
        where booking_id = ${context.booking_id}::uuid and state = 'OFFICIAL_CONVERSION_PENDING'
      `.execute(transaction);
      await sql`
        update scheduling.sessions set purpose = 'OFFICIAL_CHALLENGE', challenge_id = ${challengeId}::uuid,
          version = version + 1, updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
        where session_id = ${context.session_id}::uuid and state = 'SCHEDULED'
      `.execute(transaction);
      await sql`
        update scheduling.booking_official_conversions
        set state = 'CONVERTED', challenge_id = ${challengeId}::uuid,
          decided_at = ${eventContext.occurredAt.toISOString()}::timestamptz,
          version = ${eventContext.nextVersion}, updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
        where conversion_id = ${existing.conversion_id}::uuid
      `.execute(transaction);
      const converted = await conversionRow(transaction, existing.conversion_id);
      if (!converted) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_PENDING');
      const response = await projection(transaction, converted, command.actor.id!);
      return {
        responseStatus: 200, response,
        event: { eventId: ids.eventId, eventName: 'BookingConvertedToOfficial', schemaVersion: 1,
          transitionId: 'B-19', payload: { conversionId: existing.conversion_id,
            bookingId: context.booking_id, sessionId: context.session_id, challengeId,
            stake: existing.stake, participantObligationsCreated: true },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION, rulesetSnapshotId } },
        relatedEvents: [
          { eventId: requiredId(ids, 'bookingEventId'), eventName: 'BookingConvertedToOfficial',
            schemaVersion: 1, aggregateType: 'Booking', aggregateId: context.booking_id,
            aggregateVersion: Number(context.booking_version) + 1, transitionId: 'B-19',
            payload: { bookingId: context.booking_id, conversionId: existing.conversion_id,
              sessionId: context.session_id, challengeId },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION, rulesetSnapshotId } },
          { eventId: requiredId(ids, 'challengeEventId'), eventName: 'ChallengeCreatedFromConfirmedTraining',
            schemaVersion: 1, aggregateType: 'Challenge', aggregateId: challengeId,
            aggregateVersion: 1, transitionId: 'CH-27', payload: { challengeId,
              bookingId: context.booking_id, sessionId: context.session_id, stake: existing.stake },
            metadata: { policyVersion: CHALLENGE_POLICY_VERSION, rulesetSnapshotId } },
          { eventId: requiredId(ids, 'serviceChatEventId'), eventName: 'ChatOpened', schemaVersion: 1,
            aggregateType: 'Chat', aggregateId: serviceChatId, aggregateVersion: 1,
            transitionId: 'CT-01', payload: { chatId: serviceChatId, scope: 'CHALLENGE_SERVICE',
              challengeId, participants: [context.pair_low_id, context.pair_high_id] },
            metadata: { policyVersion: CHALLENGE_POLICY_VERSION } },
          { eventId: requiredId(ids, 'sessionEventId'), eventName: 'SessionConvertedToOfficial',
            schemaVersion: 1, aggregateType: 'Session', aggregateId: context.session_id,
            aggregateVersion: Number(context.session_version) + 1, transitionId: 'S-07',
            payload: { sessionId: context.session_id, bookingId: context.booking_id, challengeId },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
        ],
        audit: { auditId: ids.auditId, action: 'CONVERT_TRAINING_TO_OFFICIAL',
          transitionId: 'B-19', reasonCode: null, beforeState: existing.state,
          afterState: 'CONVERTED', metadata: { bookingId: context.booking_id,
            sessionId: context.session_id, challengeId, stake: existing.stake } },
        outbox: [
          { messageId: ids.outboxMessageId, topic: 'scheduling.booking.converted-to-official.v1',
            payload: { conversionId: existing.conversion_id, bookingId: context.booking_id,
              sessionId: context.session_id, challengeId, competitionId: context.competition_id } },
          { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1', payload: {
            notifications: [context.pair_low_id, context.pair_high_id, context.coach_user_id]
              .map((recipientUserId, index) => ({ notificationId: ids.notificationIds[index]!, recipientUserId,
                category: 'MANDATORY', renderKey: 'booking.converted-to-official',
                actionTarget: { type: 'BOOKING', bookingId: context.booking_id },
                payload: { conversionId: existing.conversion_id, challengeId, sessionId: context.session_id },
                deadlineAt: context.scheduled_start_at.toISOString() })) } },
        ],
      };
    },
  });
}

export async function expireBookingOfficialConversion(
  database: Kysely<Database>,
  command: CommandEnvelope<ExpireBookingOfficialConversionPayload>,
  ids: BookingOfficialConversionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<BookingOfficialConversionProjection>> {
  if (command.actor.type !== 'SYSTEM' || command.aggregateType !== 'BookingOfficialConversion'
    || command.aggregateId !== command.payload.conversionId) {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command, ...(now ? { now } : {}),
    mutate: async (transaction, eventContext) => {
      const existing = await conversionRow(transaction, command.aggregateId, true);
      if (!existing || !existing.confirmation_deadline_at) {
        throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_PENDING');
      }
      assertOfficialConversionCanExpire({ state: existing.state,
        confirmationDeadlineAt: existing.confirmation_deadline_at.toISOString(),
        occurredAt: eventContext.occurredAt });
      const context = await conversionContext(transaction, existing.session_id, true);
      if (!context) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
      await sql`
        update scheduling.booking_official_conversions
        set state = 'EXPIRED', terminal_reason = 'CONFIRMATION_DEADLINE',
          decided_at = ${eventContext.occurredAt.toISOString()}::timestamptz,
          version = ${eventContext.nextVersion}, updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
        where conversion_id = ${existing.conversion_id}::uuid
      `.execute(transaction);
      await sql`
        update scheduling.bookings set state = 'CONFIRMED_PAIR', version = version + 1,
          updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
        where booking_id = ${existing.booking_id}::uuid and state = 'OFFICIAL_CONVERSION_PENDING'
      `.execute(transaction);
      const expired = await conversionRow(transaction, existing.conversion_id);
      if (!expired) throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_PENDING');
      const response = await projection(transaction, expired, existing.requested_by_user_id);
      return {
        responseStatus: 200, response,
        event: { eventId: ids.eventId, eventName: 'TrainingOfficialConversionClosed', schemaVersion: 1,
          transitionId: 'B-20', payload: { conversionId: existing.conversion_id,
            reason: 'EXPIRED', sourcePreservedAsTraining: true },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
        relatedEvents: [{
          eventId: requiredId(ids, 'bookingEventId'), eventName: 'TrainingOfficialConversionClosed',
          schemaVersion: 1, aggregateType: 'Booking', aggregateId: existing.booking_id,
          aggregateVersion: Number(context.booking_version) + 1, transitionId: 'B-20',
          payload: { bookingId: existing.booking_id, conversionId: existing.conversion_id,
            reason: 'EXPIRED', sourcePreservedAsTraining: true },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        }],
        audit: { auditId: ids.auditId, action: 'EXPIRE_TRAINING_OFFICIAL_CONVERSION',
          transitionId: 'B-20', reasonCode: 'CONFIRMATION_DEADLINE', beforeState: existing.state,
          afterState: 'EXPIRED', metadata: { bookingId: existing.booking_id, noLoss: true } },
        outbox: [
          { messageId: ids.outboxMessageId, topic: 'scheduling.booking.official-conversion-closed.v1',
            payload: { conversionId: existing.conversion_id, bookingId: existing.booking_id,
              competitionId: existing.competition_id, reason: 'EXPIRED', sourcePreservedAsTraining: true } },
          { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1', payload: {
            notifications: [context.pair_low_id, context.pair_high_id, context.coach_user_id]
              .map((recipientUserId, index) => ({ notificationId: ids.notificationIds[index]!, recipientUserId,
                category: 'SERVICE', renderKey: 'booking.official-conversion-expired',
                actionTarget: { type: 'BOOKING', bookingId: existing.booking_id },
                payload: { conversionId: existing.conversion_id }, deadlineAt: null })) } },
        ],
      };
    },
  });
}

export async function readBookingOfficialConversionTimerSnapshot(
  database: Kysely<Database>,
  conversionId: string,
): Promise<TimerAggregateSnapshot> {
  const row = await conversionRow(database, conversionId);
  return row ? { state: row.state, version: Number(row.version) } : { state: 'MISSING', version: 0 };
}
