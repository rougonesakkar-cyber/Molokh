import {
  CHALLENGE_POLICY_VERSION,
  SCHEDULING_POLICY_VERSION,
  ChallengeConflictError,
  SchedulingConflictError,
  SchedulingPermissionDeniedError,
  SchedulingValidationError,
  assertAcceptedChallengeCanStartBooking,
  assertAthleteScheduleAvailable,
  assertBookingRequestCanBeWithdrawn,
  assertChallengeBookingCanBeConfirmed,
  assertHostConfirmationWindow,
  bookingSelectionExpiresAt,
  hostConfirmationDeadline,
  normalizeScheduleMutationReason,
  type CommandEnvelope,
  type ScheduleMutationReasonCode,
  type TimerAggregateSnapshot,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import { executeCriticalCommand, type ExecutedCommand } from './platform-command.js';
import { assertNoActivePlatformIncidentForTimer } from './platform-incident.js';
import { assertYouthChallengeConsentReady } from './youth-consent.js';

export type BookingIntentState =
  | 'SELECTING'
  | 'HOST_CONFIRMATION_PENDING'
  | 'CONFIRMED_PAIR'
  | 'CANCELLED'
  | 'REJECTED'
  | 'EXPIRED';

export type GroupPlanState =
  | 'PROPOSED'
  | 'NOTIFIED'
  | 'CONVERSION_PENDING'
  | 'CONVERTED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface SelectSlotPayload {
  readonly chatId: string;
  readonly slotId: string;
  readonly commercialVersion: number;
  readonly challengeId?: string;
}

export interface SelectSameSlotPayload {
  readonly bookingId: string;
  readonly commercialVersion: number;
}

export interface ConfirmBookingHostPayload {
  readonly bookingId: string;
}

export interface WithdrawBookingRequestPayload {
  readonly bookingId: string;
}

export interface RejectBookingHostPayload {
  readonly bookingId: string;
  readonly reasonCode: ScheduleMutationReasonCode;
  readonly reasonNote: string | null;
}

export interface ProposeGroupPlanPayload {
  readonly chatId: string;
  readonly groupOfferingId: string;
  readonly offeringVersion: number;
}

export interface ConfirmGroupPlanPayload {
  readonly groupPlanId: string;
}

export interface ExpireBookingIntentPayload {
  readonly bookingId: string;
}

export interface ExpireGroupPlanPayload {
  readonly groupPlanId: string;
}

export interface PairIntentEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly challengeEventId?: string;
  readonly challengeOutboxMessageId?: string;
}

export interface PairIntentNotificationEffectIds extends PairIntentEffectIds {
  readonly notificationId: string;
  readonly notificationOutboxMessageId: string;
}

export interface HostConfirmationEffectIds extends PairIntentEffectIds {
  readonly slotEventId: string;
  readonly sessionEventId: string;
  readonly sessionId: string;
  readonly sessionTimerOutboxMessageId: string;
  readonly notificationIds: readonly [string, string];
  readonly notificationOutboxMessageId: string;
}

export interface HostRejectionEffectIds extends PairIntentEffectIds {
  readonly notificationIds: readonly [string, string];
  readonly notificationOutboxMessageId: string;
}

export interface BookingWithdrawalEffectIds extends PairIntentEffectIds {
  readonly notificationIds: readonly [string, string];
  readonly notificationOutboxMessageId: string;
}

export interface CommercialTermsSnapshot {
  readonly slotId: string;
  readonly venueId: string;
  readonly venueDisplayName: string;
  readonly coachUserId: string;
  readonly coachDisplayName: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly priceAmount: string | null;
  readonly priceCurrency: string | null;
  readonly priceText: string | null;
  readonly cancellationTermsText: string | null;
  readonly commercialVersion: number;
}

export interface GroupOfferingSnapshot {
  readonly groupOfferingId: string;
  readonly venueId: string;
  readonly venueDisplayName: string;
  readonly sportCode: string;
  readonly classLabel: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly coachUserId: string | null;
  readonly coachDisplayName: string | null;
  readonly priceText: string | null;
  readonly externalInfoUrl: string | null;
  readonly contact: Readonly<Record<string, unknown>>;
  readonly offeringVersion: number;
}

export interface BookingIntentProjection {
  readonly bookingId: string;
  readonly chatId: string;
  readonly slotId: string;
  readonly purpose: 'TRAINING' | 'OFFICIAL_CHALLENGE';
  readonly challengeId: string | null;
  readonly state: BookingIntentState;
  readonly selectedByUserIds: readonly string[];
  readonly selectionExpiresAt: string;
  readonly hostConfirmationDeadlineAt: string;
  readonly commercialTermsSnapshot: CommercialTermsSnapshot | null;
  readonly hostConfirmedAt: string | null;
  readonly sessionId: string | null;
  readonly version: number;
}

export interface SessionProjection {
  readonly sessionId: string;
  readonly bookingId: string;
  readonly challengeId: string | null;
  readonly venueId: string;
  readonly coachUserId: string;
  readonly athleteUserIds: readonly [string, string];
  readonly purpose: 'TRAINING' | 'OFFICIAL_CHALLENGE';
  readonly state: 'SCHEDULED';
  readonly scheduledStartAt: string;
  readonly scheduledEndAt: string;
  readonly version: number;
}

export interface HostConfirmationProjection {
  readonly outcome: 'CONFIRMED' | 'REJECTED_SLOT_UNAVAILABLE';
  readonly booking: BookingIntentProjection;
  readonly session: SessionProjection | null;
}

export interface HostRejectionProjection {
  readonly booking: BookingIntentProjection;
  readonly rejectedAt: string;
  readonly reasonCode: ScheduleMutationReasonCode;
  readonly reasonNote: string | null;
}

export interface HostConfirmationQueueItem {
  readonly booking: BookingIntentProjection;
  readonly athleteDisplayNames: readonly [string, string];
}

export interface GroupPlanProjection {
  readonly groupPlanId: string;
  readonly chatId: string;
  readonly groupOfferingId: string;
  readonly proposedByUserId: string;
  readonly confirmedByPeer: boolean;
  readonly state: GroupPlanState;
  readonly offeringSnapshot: GroupOfferingSnapshot;
  readonly version: number;
}

export interface ActivePairIntentProjection {
  readonly booking: BookingIntentProjection | null;
  readonly groupPlan: GroupPlanProjection | null;
}

interface PairContextRow {
  readonly match_id: string | null;
  readonly pair_low_id: string;
  readonly pair_high_id: string;
}

interface SlotChoiceRow {
  readonly slot_id: string;
  readonly venue_id: string;
  readonly venue_display_name: string;
  readonly coach_user_id: string;
  readonly coach_display_name: string;
  readonly start_at: Date;
  readonly end_at: Date;
  readonly state: string;
  readonly price_amount: string | null;
  readonly price_currency: string | null;
  readonly price_text: string | null;
  readonly cancellation_terms_text: string | null;
  readonly commercial_version: number;
  readonly minimum_booking_notice_hours: number;
}

interface HostSlotRow extends SlotChoiceRow {
  readonly booking_id: string | null;
  readonly version: string;
}

interface BookingIntentRow {
  readonly booking_id: string;
  readonly chat_id: string;
  readonly match_id: string | null;
  readonly slot_id: string;
  readonly purpose: BookingIntentProjection['purpose'];
  readonly challenge_id: string | null;
  readonly pair_low_id: string;
  readonly pair_high_id: string;
  readonly initiated_by: string;
  readonly selected_by_low_at: Date | null;
  readonly selected_by_high_at: Date | null;
  readonly selection_expires_at: Date;
  readonly host_confirmation_deadline_at: Date;
  readonly commercial_terms_snapshot: CommercialTermsSnapshot | null;
  readonly host_confirmed_at?: Date | null;
  readonly session_id?: string | null;
  readonly state: BookingIntentState;
  readonly version: string;
}

interface ChallengeBookingRow {
  readonly challenge_id: string;
  readonly competition_id: string;
  readonly source_match_id: string | null;
  readonly source_chat_id: string;
  readonly pair_low_id: string;
  readonly pair_high_id: string;
  readonly state: import('@molokh/core').ChallengeState;
  readonly scheduling_deadline_at: Date | null;
  readonly version: string;
  readonly active_obligation_count: string;
  readonly active_account_count: string;
  readonly verified_account_count: string;
  readonly active_membership_count: string;
  readonly distinct_age_divisions: string;
  readonly competition_availability: string;
  readonly community_state: string;
}

interface GroupOfferingChoiceRow {
  readonly group_offering_id: string;
  readonly venue_id: string;
  readonly venue_display_name: string;
  readonly sport_code: string;
  readonly class_label: string;
  readonly start_at: Date;
  readonly end_at: Date;
  readonly coach_user_id: string | null;
  readonly coach_display_name: string | null;
  readonly price_text: string | null;
  readonly external_info_url: string | null;
  readonly contact_snapshot: unknown;
  readonly state: string;
  readonly version: string;
}

interface GroupPlanRow {
  readonly group_plan_id: string;
  readonly chat_id: string;
  readonly match_id: string;
  readonly group_offering_id: string;
  readonly pair_low_id: string;
  readonly pair_high_id: string;
  readonly proposed_by: string;
  readonly confirmed_by_peer_at: Date | null;
  readonly offering_snapshot: GroupOfferingSnapshot;
  readonly start_at: Date;
  readonly state: GroupPlanState;
  readonly version: string;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function commercialSnapshot(row: SlotChoiceRow): CommercialTermsSnapshot {
  return {
    slotId: row.slot_id,
    venueId: row.venue_id,
    venueDisplayName: row.venue_display_name,
    coachUserId: row.coach_user_id,
    coachDisplayName: row.coach_display_name,
    startAt: row.start_at.toISOString(),
    endAt: row.end_at.toISOString(),
    priceAmount: row.price_amount,
    priceCurrency: row.price_currency,
    priceText: row.price_text,
    cancellationTermsText: row.cancellation_terms_text,
    commercialVersion: row.commercial_version,
  };
}

function offeringSnapshot(row: GroupOfferingChoiceRow): GroupOfferingSnapshot {
  return {
    groupOfferingId: row.group_offering_id,
    venueId: row.venue_id,
    venueDisplayName: row.venue_display_name,
    sportCode: row.sport_code,
    classLabel: row.class_label,
    startAt: row.start_at.toISOString(),
    endAt: row.end_at.toISOString(),
    coachUserId: row.coach_user_id,
    coachDisplayName: row.coach_display_name,
    priceText: row.price_text,
    externalInfoUrl: row.external_info_url,
    contact: record(row.contact_snapshot),
    offeringVersion: Number(row.version),
  };
}

function bookingProjection(row: BookingIntentRow): BookingIntentProjection {
  const selectedByUserIds: string[] = [];
  if (row.selected_by_low_at) selectedByUserIds.push(row.pair_low_id);
  if (row.selected_by_high_at) selectedByUserIds.push(row.pair_high_id);
  return {
    bookingId: row.booking_id,
    chatId: row.chat_id,
    slotId: row.slot_id,
    purpose: row.purpose,
    challengeId: row.challenge_id,
    state: row.state,
    selectedByUserIds,
    selectionExpiresAt: row.selection_expires_at.toISOString(),
    hostConfirmationDeadlineAt: row.host_confirmation_deadline_at.toISOString(),
    commercialTermsSnapshot: row.commercial_terms_snapshot,
    hostConfirmedAt: row.host_confirmed_at?.toISOString() ?? null,
    sessionId: row.session_id ?? null,
    version: Number(row.version),
  };
}

function requiredChallengeEffectIds(ids: PairIntentEffectIds): {
  readonly eventId: string;
  readonly outboxMessageId: string;
} {
  if (!ids.challengeEventId || !ids.challengeOutboxMessageId) {
    throw new TypeError('Official Challenge transition effect IDs are required');
  }
  return { eventId: ids.challengeEventId, outboxMessageId: ids.challengeOutboxMessageId };
}

async function challengeForBooking(
  transaction: Transaction<Database>,
  challengeId: string,
): Promise<ChallengeBookingRow> {
  const result = await sql<ChallengeBookingRow>`
    select challenge.challenge_id, challenge.competition_id,
      challenge.source_match_id, challenge.source_chat_id,
      challenge.pair_low_id, challenge.pair_high_id, challenge.state,
      challenge.scheduling_deadline_at, challenge.version::text as version,
      (select count(*)::text
        from competition.challenge_participant_obligations as obligation
        where obligation.challenge_id = challenge.challenge_id
          and obligation.released_at is null) as active_obligation_count,
      (select count(*)::text from identity.users as athlete
        where athlete.user_id in (challenge.pair_low_id, challenge.pair_high_id)
          and athlete.account_state = 'ACTIVE') as active_account_count,
      (select count(*)::text from identity.users as athlete
        where athlete.user_id in (challenge.pair_low_id, challenge.pair_high_id)
          and exists (
            select 1 from identity.account_verifications as verification
            where verification.user_id = athlete.user_id
              and verification.is_current and verification.state = 'VERIFIED'
              and (verification.expires_at is null or verification.expires_at > clock_timestamp())
          )) as verified_account_count,
      (select count(*)::text
        from community.community_memberships as membership
        where membership.community_id = competition.community_id
          and membership.user_id in (challenge.pair_low_id, challenge.pair_high_id)
          and membership.state = 'ACTIVE' and membership.competition_enabled) as active_membership_count,
      (select count(distinct athlete.age_division)::text from identity.users as athlete
        where athlete.user_id in (challenge.pair_low_id, challenge.pair_high_id)) as distinct_age_divisions,
      competition.availability as competition_availability,
      community.state as community_state
    from competition.challenges as challenge
    join competition.competitions as competition
      on competition.competition_id = challenge.competition_id
    join community.communities as community
      on community.community_id = competition.community_id
    where challenge.challenge_id = ${challengeId}::uuid
    for update of challenge, competition, community
  `.execute(transaction);
  const challenge = result.rows[0];
  if (!challenge) throw new ChallengeConflictError('CHALLENGE_NOT_ACCEPTED');
  return challenge;
}

function assertChallengeEligibility(challenge: ChallengeBookingRow): void {
  if (Number(challenge.active_account_count) !== 2) {
    throw new ChallengeConflictError('ACCOUNT_NOT_ACTIVE');
  }
  if (Number(challenge.verified_account_count) !== 2) {
    throw new ChallengeConflictError('ACCOUNT_NOT_VERIFIED');
  }
  if (Number(challenge.distinct_age_divisions) !== 1) {
    throw new ChallengeConflictError('AGE_CONTOUR_MISMATCH');
  }
  if (Number(challenge.active_membership_count) !== 2) {
    throw new ChallengeConflictError('MEMBERSHIP_NOT_ACTIVE');
  }
  if (challenge.competition_availability !== 'ACTIVE') {
    throw new ChallengeConflictError('COMPETITION_NOT_ACTIVE');
  }
  if (challenge.community_state !== 'ACTIVE') {
    throw new ChallengeConflictError('COMMUNITY_NOT_ACTIVE');
  }
}

function groupPlanProjection(row: GroupPlanRow): GroupPlanProjection {
  return {
    groupPlanId: row.group_plan_id,
    chatId: row.chat_id,
    groupOfferingId: row.group_offering_id,
    proposedByUserId: row.proposed_by,
    confirmedByPeer: row.confirmed_by_peer_at !== null,
    state: row.state,
    offeringSnapshot: row.offering_snapshot,
    version: Number(row.version),
  };
}

async function matchedPairForChat(
  transaction: Transaction<Database>,
  chatId: string,
  actorId: string,
): Promise<PairContextRow> {
  const result = await sql<PairContextRow>`
    select matched.match_id, matched.pair_low_id, matched.pair_high_id
    from social.matches as matched
    join social.chats as chat on chat.chat_id = matched.chat_id
    where matched.chat_id = ${chatId}::uuid
      and matched.state = 'ACTIVE'
      and chat.scope = 'PERSONAL_MATCH'
      and chat.state = 'OPEN'
      and ${actorId}::uuid in (matched.pair_low_id, matched.pair_high_id)
      and not exists (
        select 1 from social.blocks as blocked
        where blocked.state = 'ACTIVE'
          and blocked.blocker_user_id in (matched.pair_low_id, matched.pair_high_id)
          and blocked.blocked_user_id in (matched.pair_low_id, matched.pair_high_id)
      )
    for update of matched
  `.execute(transaction);
  const pair = result.rows[0];
  if (!pair) throw new SchedulingPermissionDeniedError();

  const eligible = await sql<{ readonly eligible_count: string }>`
    select count(*)::text as eligible_count
    from identity.users
    where user_id in (${pair.pair_low_id}::uuid, ${pair.pair_high_id}::uuid)
      and account_state = 'ACTIVE'
      and phone_verified_at is not null
  `.execute(transaction);
  if (Number(eligible.rows[0]?.eligible_count ?? '0') !== 2) {
    throw new SchedulingPermissionDeniedError();
  }
  return pair;
}

async function slotForChoice(
  transaction: Transaction<Database>,
  slotId: string,
): Promise<SlotChoiceRow> {
  const result = await sql<SlotChoiceRow>`
    select slot.slot_id, slot.venue_id, venue.display_name as venue_display_name,
      slot.coach_user_id, coach.display_name as coach_display_name,
      slot.start_at, slot.end_at, slot.state,
      slot.price_amount::text as price_amount, slot.price_currency,
      slot.price_text, slot.cancellation_terms_text, slot.commercial_version,
      venue.minimum_booking_notice_hours
    from scheduling.slots as slot
    join community.venues as venue on venue.venue_id = slot.venue_id
    join identity.users as coach on coach.user_id = slot.coach_user_id
    where slot.slot_id = ${slotId}::uuid
    for share of slot, venue
  `.execute(transaction);
  const slot = result.rows[0];
  if (!slot || slot.state !== 'PUBLISHED') {
    throw new SchedulingConflictError('SLOT_UNAVAILABLE');
  }
  return slot;
}

function intentTimer(input: {
  readonly commandType: string;
  readonly aggregateType: 'Booking' | 'GroupPlan';
  readonly aggregateId: string;
  readonly expectedState: string;
  readonly expectedVersion: number;
  readonly deadlineAt: string;
}) {
  return {
    ...input,
    policyVersion: SCHEDULING_POLICY_VERSION,
    idempotencyKey: `${input.aggregateType.toLowerCase()}:${input.aggregateId}:${input.commandType.toLowerCase()}:v${input.expectedVersion}`,
  } as const;
}

function otherPairUser(pair: PairContextRow, actorId: string): string {
  return actorId === pair.pair_low_id ? pair.pair_high_id : pair.pair_low_id;
}

async function venueNotificationRecipient(
  transaction: Transaction<Database>,
  venueId: string,
): Promise<string> {
  const result = await sql<{ readonly user_id: string }>`
    select user_id from community.role_grants
    where scope_type = 'VENUE' and scope_id = ${venueId}::uuid
      and role in ('PRIMARY_ADMIN', 'GYM_ADMIN') and state = 'ACTIVE'
      and (expires_at is null or expires_at > clock_timestamp())
    order by case role when 'PRIMARY_ADMIN' then 0 else 1 end, authorized_at, grant_id
    limit 1
  `.execute(transaction);
  const recipient = result.rows[0]?.user_id;
  if (!recipient) throw new SchedulingPermissionDeniedError();
  return recipient;
}

async function assertHostConfirmationActor(
  transaction: Transaction<Database>,
  actorId: string,
  slot: Pick<HostSlotRow, 'coach_user_id' | 'venue_id'>,
): Promise<void> {
  const allowed = await sql<{ readonly allowed: boolean }>`
    select true as allowed
    where (
      ${actorId}::uuid = ${slot.coach_user_id}::uuid
      and exists (
        select 1 from community.role_grants
        where user_id = ${actorId}::uuid and role = 'COACH'
          and state = 'ACTIVE'
          and (expires_at is null or expires_at > clock_timestamp())
      )
    ) or exists (
      select 1 from community.role_grants
      where user_id = ${actorId}::uuid
        and role in ('PRIMARY_ADMIN', 'GYM_ADMIN')
        and scope_type = 'VENUE' and scope_id = ${slot.venue_id}::uuid
        and state = 'ACTIVE'
        and (expires_at is null or expires_at > clock_timestamp())
    )
  `.execute(transaction);
  if (!allowed.rows[0]?.allowed) throw new SchedulingPermissionDeniedError();
}

async function slotForHostConfirmation(
  transaction: Transaction<Database>,
  slotId: string,
): Promise<HostSlotRow> {
  const result = await sql<HostSlotRow>`
    select slot.slot_id, slot.venue_id, venue.display_name as venue_display_name,
      slot.coach_user_id, coach.display_name as coach_display_name,
      slot.start_at, slot.end_at, slot.state,
      slot.price_amount::text as price_amount, slot.price_currency,
      slot.price_text, slot.cancellation_terms_text, slot.commercial_version,
      venue.minimum_booking_notice_hours, slot.booking_id,
      slot.version::text as version
    from scheduling.slots as slot
    join community.venues as venue on venue.venue_id = slot.venue_id
    join identity.users as coach on coach.user_id = slot.coach_user_id
    where slot.slot_id = ${slotId}::uuid
    for update of slot
  `.execute(transaction);
  const slot = result.rows[0];
  if (!slot) throw new SchedulingConflictError('SLOT_UNAVAILABLE');
  return slot;
}

async function assertAthletesHaveNoConfirmedOverlap(
  transaction: Transaction<Database>,
  athleteUserIds: readonly [string, string],
  startAt: Date,
  endAt: Date,
): Promise<void> {
  for (const athleteUserId of [...athleteUserIds].sort()) {
    await sql`
      select user_id from identity.users
      where user_id = ${athleteUserId}::uuid
      for update
    `.execute(transaction);
  }
  const overlap = await sql<{ readonly present: boolean }>`
    select true as present
    from scheduling.sessions
    where state in ('SCHEDULED', 'READY_FOR_COACH', 'IN_PROGRESS')
      and tstzrange(scheduled_start_at, scheduled_end_at, '[)')
        && tstzrange(${startAt.toISOString()}::timestamptz, ${endAt.toISOString()}::timestamptz, '[)')
      and (
        solo_athlete_user_id in (${athleteUserIds[0]}::uuid, ${athleteUserIds[1]}::uuid)
        or (
          solo_athlete_user_id is null
          and (
            pair_low_id in (${athleteUserIds[0]}::uuid, ${athleteUserIds[1]}::uuid)
            or pair_high_id in (${athleteUserIds[0]}::uuid, ${athleteUserIds[1]}::uuid)
          )
        )
      )
    limit 1
  `.execute(transaction);
  assertAthleteScheduleAvailable({
    hasOverlappingConfirmedSession: overlap.rows[0]?.present === true,
  });
}

export async function selectSlot(
  database: Kysely<Database>,
  command: CommandEnvelope<SelectSlotPayload>,
  ids: PairIntentNotificationEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<BookingIntentProjection>> {
  if (!command.actor.id || command.aggregateType !== 'Booking') {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const challenge = command.payload.challengeId
        ? await challengeForBooking(transaction, command.payload.challengeId)
        : null;
      const pair: PairContextRow = challenge
        ? {
            match_id: challenge.source_match_id,
            pair_low_id: challenge.pair_low_id,
            pair_high_id: challenge.pair_high_id,
          }
        : await matchedPairForChat(transaction, command.payload.chatId, command.actor.id!);
      if (challenge) {
        if (
          challenge.source_chat_id !== command.payload.chatId
        ) {
          throw new ChallengeConflictError('MATCH_REQUIRED');
        }
        assertChallengeEligibility(challenge);
        await assertYouthChallengeConsentReady(
          transaction,
          challenge.challenge_id,
          [challenge.pair_low_id, challenge.pair_high_id],
          context.occurredAt,
        );
        assertAcceptedChallengeCanStartBooking({
          state: challenge.state,
          actorUserId: command.actor.id!,
          participantUserIds: [challenge.pair_low_id, challenge.pair_high_id],
          schedulingDeadlineAt: challenge.scheduling_deadline_at,
          occurredAt: context.occurredAt,
          activeObligationCount: Number(challenge.active_obligation_count),
        });
      }
      const live = await sql<{ readonly booking_id: string }>`
        select booking_id from scheduling.bookings
        where pair_low_id = ${pair.pair_low_id}::uuid
          and pair_high_id = ${pair.pair_high_id}::uuid
          and state in ('SELECTING', 'HOST_CONFIRMATION_PENDING')
        limit 1 for update
      `.execute(transaction);
      if (live.rows[0]) throw new SchedulingConflictError('PAIR_REQUEST_EXISTS');
      const slot = await slotForChoice(transaction, command.payload.slotId);
      if (slot.commercial_version !== command.payload.commercialVersion) {
        throw new SchedulingConflictError('COMMERCIAL_TERMS_CHANGED');
      }
      const hostDeadline = hostConfirmationDeadline({
        startAt: slot.start_at.toISOString(),
        minimumBookingNoticeHours: slot.minimum_booking_notice_hours,
        occurredAt: context.occurredAt,
      });
      const selectionExpiry = bookingSelectionExpiresAt(context.occurredAt);
      const selectedLow = command.actor.id === pair.pair_low_id;
      const purpose = challenge ? 'OFFICIAL_CHALLENGE' : 'TRAINING';
      await sql`
        insert into scheduling.bookings (
          booking_id, chat_id, match_id, slot_id, pair_low_id, pair_high_id,
          purpose, challenge_id, state, initiated_by, selected_by_low_at, selected_by_high_at,
          selection_expires_at, host_confirmation_deadline_at,
          commercial_terms_snapshot, version, created_at, updated_at
        ) values (
          ${command.aggregateId}::uuid, ${command.payload.chatId}::uuid,
          ${pair.match_id}::uuid, ${slot.slot_id}::uuid,
          ${pair.pair_low_id}::uuid, ${pair.pair_high_id}::uuid,
          ${purpose}, ${challenge?.challenge_id ?? null}::uuid,
          'SELECTING', ${command.actor.id}::uuid,
          ${selectedLow ? context.occurredAt.toISOString() : null}::timestamptz,
          ${selectedLow ? null : context.occurredAt.toISOString()}::timestamptz,
          ${selectionExpiry.toISOString()}::timestamptz,
          ${hostDeadline.toISOString()}::timestamptz, null, 1,
          ${context.occurredAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      const challengeNextVersion = challenge ? Number(challenge.version) + 1 : null;
      if (challenge && challengeNextVersion !== null) {
        await sql`
          update competition.challenges
          set state = 'BOOKING_PENDING', version = ${challengeNextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where challenge_id = ${challenge.challenge_id}::uuid
            and state = 'ACCEPTED_UNSCHEDULED'
        `.execute(transaction);
      }
      const response: BookingIntentProjection = {
        bookingId: command.aggregateId,
        chatId: command.payload.chatId,
        slotId: slot.slot_id,
        purpose,
        challengeId: challenge?.challenge_id ?? null,
        state: 'SELECTING',
        selectedByUserIds: [command.actor.id!],
        selectionExpiresAt: selectionExpiry.toISOString(),
        hostConfirmationDeadlineAt: hostDeadline.toISOString(),
        commercialTermsSnapshot: null,
        hostConfirmedAt: null,
        sessionId: null,
        version: 1,
      };
      return {
        responseStatus: 201,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'SlotSelectedByAthlete',
          schemaVersion: 1,
          transitionId: 'B-01',
          payload: { bookingId: response.bookingId, chatId: response.chatId, slotId: response.slotId, commercialVersion: command.payload.commercialVersion },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        ...(challenge && challengeNextVersion !== null
          ? {
              relatedEvents: [{
                eventId: requiredChallengeEffectIds(ids).eventId,
                eventName: 'ChallengeBookingStarted',
                schemaVersion: 1,
                aggregateType: 'Challenge',
                aggregateId: challenge.challenge_id,
                aggregateVersion: challengeNextVersion,
                transitionId: 'CH-08',
                payload: {
                  challengeId: challenge.challenge_id,
                  bookingId: response.bookingId,
                  slotId: response.slotId,
                },
                metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
              }],
            }
          : {}),
        audit: {
          auditId: ids.auditId,
          action: 'SELECT_SLOT',
          transitionId: 'B-01',
          reasonCode: null,
          beforeState: null,
          afterState: 'SELECTING',
          metadata: { matchId: pair.match_id, slotId: slot.slot_id },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'scheduling.booking.selection-started.v1',
            payload: {
              bookingId: response.bookingId,
              chatId: response.chatId,
              selectedByUserId: command.actor.id,
              timer: intentTimer({ commandType: 'EXPIRE_BOOKING_SELECTION', aggregateType: 'Booking', aggregateId: response.bookingId, expectedState: 'SELECTING', expectedVersion: 1, deadlineAt: response.selectionExpiresAt }),
            },
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: { notifications: [{ notificationId: ids.notificationId, recipientUserId: otherPairUser(pair, command.actor.id!), category: 'SOCIAL', renderKey: 'booking.slot-selected-by-partner', actionTarget: { type: 'CHAT', chatId: response.chatId }, payload: { bookingId: response.bookingId, slotId: response.slotId }, deadlineAt: response.selectionExpiresAt }] },
          },
          ...(challenge
            ? [{
                messageId: requiredChallengeEffectIds(ids).outboxMessageId,
                topic: 'competition.challenge.booking-started.v1',
                sourceEventId: requiredChallengeEffectIds(ids).eventId,
                payload: {
                  challengeId: challenge.challenge_id,
                  bookingId: response.bookingId,
                  state: 'BOOKING_PENDING',
                },
              }]
            : []),
        ],
      };
    },
  });
}

export async function selectSameSlot(
  database: Kysely<Database>,
  command: CommandEnvelope<SelectSameSlotPayload>,
  ids: PairIntentNotificationEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<BookingIntentProjection>> {
  if (!command.actor.id || command.aggregateType !== 'Booking' || command.payload.bookingId !== command.aggregateId) {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const result = await sql<BookingIntentRow>`
        select booking_id, chat_id, match_id, slot_id, purpose, challenge_id,
          pair_low_id, pair_high_id,
          initiated_by, selected_by_low_at, selected_by_high_at,
          selection_expires_at, host_confirmation_deadline_at,
          commercial_terms_snapshot, state, version::text as version
        from scheduling.bookings where booking_id = ${command.aggregateId}::uuid
        for update
      `.execute(transaction);
      const booking = result.rows[0];
      if (!booking || booking.state !== 'SELECTING') {
        throw new SchedulingConflictError('SLOT_UNAVAILABLE');
      }
      let pair: PairContextRow;
      if (booking.challenge_id) {
        const challenge = await challengeForBooking(transaction, booking.challenge_id);
        if (
          booking.purpose !== 'OFFICIAL_CHALLENGE'
          || challenge.source_chat_id !== booking.chat_id
          || challenge.source_match_id !== booking.match_id
          || challenge.pair_low_id !== booking.pair_low_id
          || challenge.pair_high_id !== booking.pair_high_id
        ) {
          throw new ChallengeConflictError('CHALLENGE_BOOKING_NOT_PENDING');
        }
        assertChallengeEligibility(challenge);
        await assertYouthChallengeConsentReady(
          transaction,
          challenge.challenge_id,
          [challenge.pair_low_id, challenge.pair_high_id],
          context.occurredAt,
        );
        assertChallengeBookingCanBeConfirmed({
          state: challenge.state,
          activeObligationCount: Number(challenge.active_obligation_count),
        });
        if (![booking.pair_low_id, booking.pair_high_id].includes(command.actor.id!)) {
          throw new ChallengeConflictError('CHALLENGE_PARTICIPANT_REQUIRED');
        }
        pair = {
          match_id: booking.match_id,
          pair_low_id: booking.pair_low_id,
          pair_high_id: booking.pair_high_id,
        };
      } else {
        pair = await matchedPairForChat(transaction, booking.chat_id, command.actor.id!);
      }
      if (pair.match_id !== booking.match_id || command.actor.id === booking.initiated_by) {
        throw new SchedulingConflictError('ACTOR_ALREADY_SELECTED');
      }
      if (context.occurredAt >= booking.selection_expires_at) {
        throw new SchedulingConflictError('SELECTION_EXPIRED');
      }
      const slot = await slotForChoice(transaction, booking.slot_id);
      if (slot.commercial_version !== command.payload.commercialVersion) {
        throw new SchedulingConflictError('COMMERCIAL_TERMS_CHANGED');
      }
      if (context.occurredAt >= booking.host_confirmation_deadline_at) {
        throw new SchedulingConflictError('SLOT_UNAVAILABLE');
      }
      const snapshot = commercialSnapshot(slot);
      const selectedLow = command.actor.id === booking.pair_low_id;
      await sql`
        update scheduling.bookings
        set state = 'HOST_CONFIRMATION_PENDING',
          selected_by_low_at = case when ${selectedLow} then ${context.occurredAt.toISOString()}::timestamptz else selected_by_low_at end,
          selected_by_high_at = case when ${selectedLow} then selected_by_high_at else ${context.occurredAt.toISOString()}::timestamptz end,
          commercial_terms_snapshot = ${JSON.stringify(snapshot)}::jsonb,
          version = ${context.nextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where booking_id = ${command.aggregateId}::uuid and state = 'SELECTING'
      `.execute(transaction);
      const response = bookingProjection({
        ...booking,
        state: 'HOST_CONFIRMATION_PENDING',
        selected_by_low_at: selectedLow ? context.occurredAt : booking.selected_by_low_at,
        selected_by_high_at: selectedLow ? booking.selected_by_high_at : context.occurredAt,
        commercial_terms_snapshot: snapshot,
        version: String(context.nextVersion),
      });
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'SlotMutuallySelected',
          schemaVersion: 1,
          transitionId: 'B-02',
          payload: { bookingId: response.bookingId, slotId: response.slotId, commercialVersion: snapshot.commercialVersion },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId,
          action: 'SELECT_SAME_SLOT',
          transitionId: 'B-02',
          reasonCode: null,
          beforeState: 'SELECTING',
          afterState: 'HOST_CONFIRMATION_PENDING',
          metadata: { slotId: response.slotId },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'scheduling.booking.mutually-selected.v1',
            payload: {
              bookingId: response.bookingId,
              venueId: snapshot.venueId,
              coachUserId: snapshot.coachUserId,
              timer: intentTimer({ commandType: 'EXPIRE_HOST_CONFIRMATION', aggregateType: 'Booking', aggregateId: response.bookingId, expectedState: 'HOST_CONFIRMATION_PENDING', expectedVersion: context.nextVersion, deadlineAt: response.hostConfirmationDeadlineAt }),
            },
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: { notifications: [{ notificationId: ids.notificationId, recipientUserId: snapshot.coachUserId, category: 'MANDATORY', renderKey: 'booking.host-confirmation-required', actionTarget: { type: 'BOOKING', bookingId: response.bookingId }, payload: { venueId: snapshot.venueId, slotId: snapshot.slotId, athleteUserIds: response.selectedByUserIds }, deadlineAt: response.hostConfirmationDeadlineAt }] },
          },
        ],
      };
    },
  });
}

export async function withdrawBookingRequest(
  database: Kysely<Database>,
  command: CommandEnvelope<WithdrawBookingRequestPayload>,
  ids: BookingWithdrawalEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<BookingIntentProjection>> {
  if (
    !command.actor.id
    || command.aggregateType !== 'Booking'
    || command.payload.bookingId !== command.aggregateId
  ) {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const result = await sql<BookingIntentRow>`
        select booking.booking_id, booking.chat_id, booking.match_id, booking.slot_id,
          booking.purpose, booking.challenge_id,
          booking.pair_low_id, booking.pair_high_id, booking.initiated_by,
          booking.selected_by_low_at, booking.selected_by_high_at,
          booking.selection_expires_at, booking.host_confirmation_deadline_at,
          booking.commercial_terms_snapshot, booking.host_confirmed_at,
          session.session_id, booking.state, booking.version::text as version
        from scheduling.bookings as booking
        left join scheduling.sessions as session on session.booking_id = booking.booking_id
        where booking.booking_id = ${command.aggregateId}::uuid
        for update of booking
      `.execute(transaction);
      const booking = result.rows[0];
      if (!booking) throw new SchedulingConflictError('BOOKING_WITHDRAWAL_NOT_ALLOWED');
      assertBookingRequestCanBeWithdrawn({
        state: booking.state,
        actorUserId: command.actor.id!,
        participantUserIds: [booking.pair_low_id, booking.pair_high_id],
      });
      const challenge = booking.challenge_id
        ? await challengeForBooking(transaction, booking.challenge_id)
        : null;
      if (
        challenge
        && (
          booking.purpose !== 'OFFICIAL_CHALLENGE'
          || challenge.source_chat_id !== booking.chat_id
          || challenge.source_match_id !== booking.match_id
          || challenge.pair_low_id !== booking.pair_low_id
          || challenge.pair_high_id !== booking.pair_high_id
          || challenge.state !== 'BOOKING_PENDING'
        )
      ) {
        throw new ChallengeConflictError('CHALLENGE_BOOKING_NOT_PENDING');
      }
      await sql`
        update scheduling.bookings
        set state = 'CANCELLED', version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where booking_id = ${command.aggregateId}::uuid
          and state in ('SELECTING', 'HOST_CONFIRMATION_PENDING')
      `.execute(transaction);
      const challengeNextVersion = challenge ? Number(challenge.version) + 1 : null;
      if (challenge && challengeNextVersion !== null) {
        await sql`
          update competition.challenges
          set state = 'ACCEPTED_UNSCHEDULED', version = ${challengeNextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where challenge_id = ${challenge.challenge_id}::uuid
            and state = 'BOOKING_PENDING'
        `.execute(transaction);
      }
      const cancelled = bookingProjection({
        ...booking,
        state: 'CANCELLED',
        version: String(context.nextVersion),
      });
      const peerUserId = otherPairUser(booking, command.actor.id!);
      const coachUserId = booking.state === 'HOST_CONFIRMATION_PENDING'
        ? booking.commercial_terms_snapshot?.coachUserId ?? null
        : null;
      const notifications = [
        {
          notificationId: ids.notificationIds[0],
          recipientUserId: peerUserId,
          category: 'SERVICE',
          renderKey: 'booking.request-withdrawn',
          actionTarget: { type: 'CHAT', chatId: booking.chat_id },
          payload: {
            bookingId: booking.booking_id,
            slotId: booking.slot_id,
            withdrawnByUserId: command.actor.id,
          },
          deadlineAt: null,
        },
        ...(coachUserId
          ? [{
              notificationId: ids.notificationIds[1],
              recipientUserId: coachUserId,
              category: 'SERVICE',
              renderKey: 'booking.host-request-withdrawn',
              actionTarget: { type: 'BOOKING', bookingId: booking.booking_id },
              payload: {
                bookingId: booking.booking_id,
                slotId: booking.slot_id,
                withdrawnByUserId: command.actor.id,
              },
              deadlineAt: null,
            }]
          : []),
      ];
      return {
        responseStatus: 200,
        response: cancelled,
        event: {
          eventId: ids.eventId,
          eventName: 'BookingRequestWithdrawn',
          schemaVersion: 1,
          transitionId: 'B-04',
          payload: {
            bookingId: booking.booking_id,
            slotId: booking.slot_id,
            withdrawnByUserId: command.actor.id,
            previousState: booking.state,
          },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        ...(challenge && challengeNextVersion !== null
          ? {
              relatedEvents: [{
                eventId: requiredChallengeEffectIds(ids).eventId,
                eventName: 'ChallengeReturnedToScheduling',
                schemaVersion: 1,
                aggregateType: 'Challenge',
                aggregateId: challenge.challenge_id,
                aggregateVersion: challengeNextVersion,
                transitionId: 'CH-09',
                payload: {
                  challengeId: challenge.challenge_id,
                  bookingId: booking.booking_id,
                  reason: 'ATHLETE_WITHDREW_SLOT_REQUEST',
                },
                metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
              }],
            }
          : {}),
        audit: {
          auditId: ids.auditId,
          action: 'WITHDRAW_SLOT_REQUEST',
          transitionId: 'B-04',
          reasonCode: null,
          beforeState: booking.state,
          afterState: 'CANCELLED',
          metadata: {
            slotId: booking.slot_id,
            challengeId: booking.challenge_id,
          },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'scheduling.booking.request-withdrawn.v1',
            payload: {
              bookingId: booking.booking_id,
              chatId: booking.chat_id,
              slotId: booking.slot_id,
              withdrawnByUserId: command.actor.id,
              previousState: booking.state,
            },
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: { notifications },
          },
          ...(challenge
            ? [{
                messageId: requiredChallengeEffectIds(ids).outboxMessageId,
                topic: 'competition.challenge.returned-to-scheduling.v1',
                sourceEventId: requiredChallengeEffectIds(ids).eventId,
                payload: {
                  challengeId: challenge.challenge_id,
                  bookingId: booking.booking_id,
                  reason: 'ATHLETE_WITHDREW_SLOT_REQUEST',
                },
              }]
            : []),
        ],
      };
    },
  });
}

export async function confirmBookingHost(
  database: Kysely<Database>,
  command: CommandEnvelope<ConfirmBookingHostPayload>,
  ids: HostConfirmationEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<HostConfirmationProjection>> {
  if (
    !command.actor.id ||
    command.aggregateType !== 'Booking' ||
    command.payload.bookingId !== command.aggregateId
  ) {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand<ConfirmBookingHostPayload, HostConfirmationProjection>(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const bookingResult = await sql<BookingIntentRow>`
        select booking.booking_id, booking.chat_id, booking.match_id, booking.slot_id,
          booking.purpose, booking.challenge_id,
          booking.pair_low_id, booking.pair_high_id, booking.initiated_by,
          booking.selected_by_low_at, booking.selected_by_high_at,
          booking.selection_expires_at, booking.host_confirmation_deadline_at,
          booking.commercial_terms_snapshot, booking.host_confirmed_at,
          session.session_id, booking.state, booking.version::text as version
        from scheduling.bookings as booking
        left join scheduling.sessions as session on session.booking_id = booking.booking_id
        where booking.booking_id = ${command.aggregateId}::uuid
        for update of booking
      `.execute(transaction);
      const booking = bookingResult.rows[0];
      if (!booking || !booking.commercial_terms_snapshot) {
        throw new SchedulingConflictError('SLOT_UNAVAILABLE');
      }
      const selectedAthleteCount = Number(booking.selected_by_low_at !== null) +
        Number(booking.selected_by_high_at !== null);
      assertHostConfirmationWindow({
        state: booking.state,
        selectedAthleteCount,
        deadlineAt: booking.host_confirmation_deadline_at.toISOString(),
        occurredAt: context.occurredAt,
      });
      const slot = await slotForHostConfirmation(transaction, booking.slot_id);
      await assertHostConfirmationActor(transaction, command.actor.id!, slot);
      const challenge = booking.challenge_id
        ? await challengeForBooking(transaction, booking.challenge_id)
        : null;
      if (challenge) {
        if (
          booking.purpose !== 'OFFICIAL_CHALLENGE'
          || challenge.source_chat_id !== booking.chat_id
          || challenge.source_match_id !== booking.match_id
          || challenge.pair_low_id !== booking.pair_low_id
          || challenge.pair_high_id !== booking.pair_high_id
        ) {
          throw new ChallengeConflictError('CHALLENGE_BOOKING_NOT_PENDING');
        }
        assertChallengeEligibility(challenge);
        await assertYouthChallengeConsentReady(
          transaction,
          challenge.challenge_id,
          [challenge.pair_low_id, challenge.pair_high_id],
          context.occurredAt,
        );
        assertChallengeBookingCanBeConfirmed({
          state: challenge.state,
          activeObligationCount: Number(challenge.active_obligation_count),
        });
      }

      if (slot.state !== 'PUBLISHED' || slot.booking_id !== null) {
        await sql`
          update scheduling.bookings
          set state = 'REJECTED', version = ${context.nextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where booking_id = ${command.aggregateId}::uuid
            and state = 'HOST_CONFIRMATION_PENDING'
        `.execute(transaction);
        const challengeNextVersion = challenge ? Number(challenge.version) + 1 : null;
        if (challenge && challengeNextVersion !== null) {
          await sql`
            update competition.challenges
            set state = 'ACCEPTED_UNSCHEDULED', version = ${challengeNextVersion},
              updated_at = ${context.occurredAt.toISOString()}::timestamptz
            where challenge_id = ${challenge.challenge_id}::uuid
              and state = 'BOOKING_PENDING'
          `.execute(transaction);
        }
        const rejectedBooking = bookingProjection({
          ...booking,
          state: 'REJECTED',
          version: String(context.nextVersion),
        });
        return {
          responseStatus: 200,
          response: {
            outcome: 'REJECTED_SLOT_UNAVAILABLE',
            booking: rejectedBooking,
            session: null,
          },
          event: {
            eventId: ids.eventId,
            eventName: 'BookingRejectedByResourceConflict',
            schemaVersion: 1,
            transitionId: 'B-08',
            payload: { bookingId: rejectedBooking.bookingId, slotId: rejectedBooking.slotId },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          },
          ...(challenge && challengeNextVersion !== null
            ? {
                relatedEvents: [{
                  eventId: requiredChallengeEffectIds(ids).eventId,
                  eventName: 'ChallengeReturnedToScheduling',
                  schemaVersion: 1,
                  aggregateType: 'Challenge',
                  aggregateId: challenge.challenge_id,
                  aggregateVersion: challengeNextVersion,
                  transitionId: 'CH-09',
                  payload: {
                    challengeId: challenge.challenge_id,
                    bookingId: rejectedBooking.bookingId,
                    reason: 'SLOT_ALREADY_CLAIMED',
                  },
                  metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
                }],
              }
            : {}),
          audit: {
            auditId: ids.auditId,
            action: 'CONFIRM_BOOKING_HOST',
            transitionId: 'B-08',
            reasonCode: 'SLOT_ALREADY_CLAIMED',
            beforeState: 'HOST_CONFIRMATION_PENDING',
            afterState: 'REJECTED',
            metadata: { slotId: rejectedBooking.slotId },
          },
          outbox: [
            {
              messageId: ids.outboxMessageId,
              topic: 'scheduling.booking.rejected-resource-conflict.v1',
              payload: { bookingId: rejectedBooking.bookingId, chatId: rejectedBooking.chatId },
            },
            {
              messageId: ids.notificationOutboxMessageId,
              topic: 'notification.in_app.v1',
              payload: {
                notifications: [booking.pair_low_id, booking.pair_high_id].map(
                  (recipientUserId, index) => ({
                    notificationId: ids.notificationIds[index]!,
                    recipientUserId,
                    category: 'SERVICE',
                    renderKey: 'booking.slot-unavailable',
                    actionTarget: { type: 'CHAT', chatId: booking.chat_id },
                    payload: { bookingId: booking.booking_id, slotId: booking.slot_id },
                    deadlineAt: null,
                  }),
                ),
              },
            },
            ...(challenge
              ? [{
                  messageId: requiredChallengeEffectIds(ids).outboxMessageId,
                  topic: 'competition.challenge.returned-to-scheduling.v1',
                  sourceEventId: requiredChallengeEffectIds(ids).eventId,
                  payload: {
                    challengeId: challenge.challenge_id,
                    bookingId: rejectedBooking.bookingId,
                    reason: 'SLOT_ALREADY_CLAIMED',
                  },
                }]
              : []),
          ],
        };
      }

      const snapshot = booking.commercial_terms_snapshot;
      await assertAthletesHaveNoConfirmedOverlap(
        transaction,
        [booking.pair_low_id, booking.pair_high_id],
        slot.start_at,
        slot.end_at,
      );
      const slotNextVersion = Number(slot.version) + 1;
      await sql`
        update scheduling.slots
        set state = 'BOOKED', booking_id = ${booking.booking_id}::uuid,
          version = ${slotNextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where slot_id = ${slot.slot_id}::uuid and state = 'PUBLISHED' and booking_id is null
      `.execute(transaction);
      await sql`
        insert into scheduling.sessions (
          session_id, booking_id, challenge_id, venue_id, coach_user_id,
          pair_low_id, pair_high_id, purpose, state,
          scheduled_start_at, scheduled_end_at, commercial_terms_snapshot,
          version, created_at, updated_at
        ) values (
          ${ids.sessionId}::uuid, ${booking.booking_id}::uuid,
          ${booking.challenge_id}::uuid, ${slot.venue_id}::uuid,
          ${slot.coach_user_id}::uuid, ${booking.pair_low_id}::uuid,
          ${booking.pair_high_id}::uuid, ${booking.purpose}, 'SCHEDULED',
          ${slot.start_at.toISOString()}::timestamptz,
          ${slot.end_at.toISOString()}::timestamptz,
          ${JSON.stringify(snapshot)}::jsonb, 1,
          ${context.occurredAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      const challengeNextVersion = challenge ? Number(challenge.version) + 1 : null;
      if (challenge && challengeNextVersion !== null) {
        await sql`
          update competition.challenges
          set state = 'BOOKED', version = ${challengeNextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where challenge_id = ${challenge.challenge_id}::uuid
            and state = 'BOOKING_PENDING'
        `.execute(transaction);
        await sql`
          update governance.youth_challenge_consents
          set expires_at = ${slot.start_at.toISOString()}::timestamptz,
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where challenge_id = ${challenge.challenge_id}::uuid and state = 'GRANTED'
        `.execute(transaction);
      }
      await sql`
        update scheduling.bookings
        set state = 'CONFIRMED_PAIR', host_confirmed_by = ${command.actor.id}::uuid,
          host_confirmed_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where booking_id = ${command.aggregateId}::uuid
          and state = 'HOST_CONFIRMATION_PENDING'
      `.execute(transaction);
      const confirmedBooking = bookingProjection({
        ...booking,
        state: 'CONFIRMED_PAIR',
        host_confirmed_at: context.occurredAt,
        session_id: ids.sessionId,
        version: String(context.nextVersion),
      });
      const session: SessionProjection = {
        sessionId: ids.sessionId,
        bookingId: booking.booking_id,
        challengeId: booking.challenge_id,
        venueId: slot.venue_id,
        coachUserId: slot.coach_user_id,
        athleteUserIds: [booking.pair_low_id, booking.pair_high_id],
        purpose: booking.purpose,
        state: 'SCHEDULED',
        scheduledStartAt: slot.start_at.toISOString(),
        scheduledEndAt: slot.end_at.toISOString(),
        version: 1,
      };
      return {
        responseStatus: 200,
        response: { outcome: 'CONFIRMED', booking: confirmedBooking, session },
        event: {
          eventId: ids.eventId,
          eventName: 'BookingHostConfirmed',
          schemaVersion: 1,
          transitionId: 'B-06',
          payload: {
            bookingId: booking.booking_id,
            slotId: slot.slot_id,
            sessionId: session.sessionId,
            confirmedBy: command.actor.id,
          },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        relatedEvents: [
          {
            eventId: ids.slotEventId,
            eventName: 'SlotClaimed',
            schemaVersion: 1,
            aggregateType: 'Slot',
            aggregateId: slot.slot_id,
            aggregateVersion: slotNextVersion,
            transitionId: 'SL-02',
            payload: { slotId: slot.slot_id, bookingId: booking.booking_id },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          },
          {
            eventId: ids.sessionEventId,
            eventName: 'SessionScheduled',
            schemaVersion: 1,
            aggregateType: 'Session',
            aggregateId: session.sessionId,
            aggregateVersion: 1,
            transitionId: 'S-01',
            payload: {
              sessionId: session.sessionId,
              bookingId: session.bookingId,
              state: session.state,
            },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          },
          ...(challenge && challengeNextVersion !== null
            ? [{
                eventId: requiredChallengeEffectIds(ids).eventId,
                eventName: 'ChallengeBooked',
                schemaVersion: 1,
                aggregateType: 'Challenge',
                aggregateId: challenge.challenge_id,
                aggregateVersion: challengeNextVersion,
                transitionId: 'CH-10',
                payload: {
                  challengeId: challenge.challenge_id,
                  bookingId: booking.booking_id,
                  sessionId: session.sessionId,
                },
                metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
              }]
            : []),
        ],
        audit: {
          auditId: ids.auditId,
          action: 'CONFIRM_BOOKING_HOST',
          transitionId: 'B-06',
          reasonCode: null,
          beforeState: 'HOST_CONFIRMATION_PENDING',
          afterState: 'CONFIRMED_PAIR',
          metadata: { slotId: slot.slot_id, sessionId: session.sessionId },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'scheduling.booking.host-confirmed.v1',
            payload: {
              bookingId: booking.booking_id,
              chatId: booking.chat_id,
              sessionId: session.sessionId,
            },
          },
          {
            messageId: ids.sessionTimerOutboxMessageId,
            topic: 'scheduling.session.scheduled.v1',
            payload: {
              sessionId: session.sessionId,
              timer: {
                commandType: 'OPEN_SESSION_WINDOW',
                aggregateType: 'Session',
                aggregateId: session.sessionId,
                expectedState: 'SCHEDULED',
                expectedVersion: 1,
                deadlineAt: session.scheduledStartAt,
                policyVersion: SCHEDULING_POLICY_VERSION,
                idempotencyKey: `session:${session.sessionId}:open-session-window:v1`,
              },
            },
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: {
              notifications: [booking.pair_low_id, booking.pair_high_id].map(
                (recipientUserId, index) => ({
                  notificationId: ids.notificationIds[index]!,
                  recipientUserId,
                  category: 'SERVICE',
                  renderKey: 'booking.confirmed',
                  actionTarget: { type: 'CHAT', chatId: booking.chat_id },
                  payload: { bookingId: booking.booking_id, sessionId: session.sessionId },
                  deadlineAt: session.scheduledStartAt,
                }),
              ),
            },
          },
          ...(challenge
            ? [{
                messageId: requiredChallengeEffectIds(ids).outboxMessageId,
                topic: 'competition.challenge.booked.v1',
                sourceEventId: requiredChallengeEffectIds(ids).eventId,
                payload: {
                  challengeId: challenge.challenge_id,
                  bookingId: booking.booking_id,
                  sessionId: session.sessionId,
                },
              }]
            : []),
        ],
      };
    },
  });
}

export async function rejectBookingHost(
  database: Kysely<Database>,
  command: CommandEnvelope<RejectBookingHostPayload>,
  ids: HostRejectionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<HostRejectionProjection>> {
  if (
    !command.actor.id
    || command.aggregateType !== 'Booking'
    || command.payload.bookingId !== command.aggregateId
  ) {
    throw new SchedulingPermissionDeniedError();
  }
  const reason = normalizeScheduleMutationReason(command.payload);
  return executeCriticalCommand(database, {
    command: { ...command, payload: { ...command.payload, ...reason } },
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const bookingResult = await sql<BookingIntentRow>`
        select booking.booking_id, booking.chat_id, booking.match_id, booking.slot_id,
          booking.purpose, booking.challenge_id,
          booking.pair_low_id, booking.pair_high_id, booking.initiated_by,
          booking.selected_by_low_at, booking.selected_by_high_at,
          booking.selection_expires_at, booking.host_confirmation_deadline_at,
          booking.commercial_terms_snapshot, booking.host_confirmed_at,
          session.session_id, booking.state, booking.version::text as version
        from scheduling.bookings as booking
        left join scheduling.sessions as session on session.booking_id = booking.booking_id
        where booking.booking_id = ${command.aggregateId}::uuid
        for update of booking
      `.execute(transaction);
      const booking = bookingResult.rows[0];
      if (!booking || !booking.commercial_terms_snapshot) {
        throw new SchedulingConflictError('SLOT_UNAVAILABLE');
      }
      assertHostConfirmationWindow({
        state: booking.state,
        selectedAthleteCount: Number(booking.selected_by_low_at !== null)
          + Number(booking.selected_by_high_at !== null),
        deadlineAt: booking.host_confirmation_deadline_at.toISOString(),
        occurredAt: context.occurredAt,
      });
      const slot = await slotForHostConfirmation(transaction, booking.slot_id);
      await assertHostConfirmationActor(transaction, command.actor.id!, slot);
      const challenge = booking.challenge_id
        ? await challengeForBooking(transaction, booking.challenge_id)
        : null;
      if (
        challenge
        && (
          booking.purpose !== 'OFFICIAL_CHALLENGE'
          || challenge.source_chat_id !== booking.chat_id
          || challenge.source_match_id !== booking.match_id
          || challenge.pair_low_id !== booking.pair_low_id
          || challenge.pair_high_id !== booking.pair_high_id
          || challenge.state !== 'BOOKING_PENDING'
        )
      ) {
        throw new ChallengeConflictError('CHALLENGE_BOOKING_NOT_PENDING');
      }
      await sql`
        update scheduling.bookings
        set state = 'REJECTED', version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where booking_id = ${command.aggregateId}::uuid
          and state = 'HOST_CONFIRMATION_PENDING'
      `.execute(transaction);
      await sql`
        insert into scheduling.booking_host_rejections (
          booking_id, rejected_by, reason_code, reason_note, rejected_at
        ) values (
          ${booking.booking_id}::uuid, ${command.actor.id}::uuid,
          ${reason.reasonCode}, ${reason.reasonNote},
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      const challengeNextVersion = challenge ? Number(challenge.version) + 1 : null;
      if (challenge && challengeNextVersion !== null) {
        await sql`
          update competition.challenges
          set state = 'ACCEPTED_UNSCHEDULED', version = ${challengeNextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where challenge_id = ${challenge.challenge_id}::uuid
            and state = 'BOOKING_PENDING'
        `.execute(transaction);
      }
      const rejectedBooking = bookingProjection({
        ...booking, state: 'REJECTED', version: String(context.nextVersion),
      });
      const response: HostRejectionProjection = {
        booking: rejectedBooking,
        rejectedAt: context.occurredAt.toISOString(),
        reasonCode: reason.reasonCode,
        reasonNote: reason.reasonNote,
      };
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'BookingRejectedByHost',
          schemaVersion: 1,
          transitionId: 'B-07',
          payload: {
            bookingId: booking.booking_id,
            slotId: booking.slot_id,
            rejectedBy: command.actor.id,
            reasonCode: reason.reasonCode,
          },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        ...(challenge && challengeNextVersion !== null
          ? {
              relatedEvents: [{
                eventId: requiredChallengeEffectIds(ids).eventId,
                eventName: 'ChallengeReturnedToScheduling',
                schemaVersion: 1,
                aggregateType: 'Challenge',
                aggregateId: challenge.challenge_id,
                aggregateVersion: challengeNextVersion,
                transitionId: 'CH-09',
                payload: {
                  challengeId: challenge.challenge_id,
                  bookingId: booking.booking_id,
                  reason: 'HOST_REJECTED',
                },
                metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
              }],
            }
          : {}),
        audit: {
          auditId: ids.auditId,
          action: 'REJECT_BOOKING_HOST',
          transitionId: 'B-07',
          reasonCode: reason.reasonCode,
          beforeState: 'HOST_CONFIRMATION_PENDING',
          afterState: 'REJECTED',
          metadata: { reasonNote: reason.reasonNote, slotId: booking.slot_id },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'scheduling.booking.host-rejected.v1',
            payload: {
              bookingId: booking.booking_id,
              chatId: booking.chat_id,
              reasonCode: reason.reasonCode,
              reasonNote: reason.reasonNote,
            },
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: {
              notifications: [booking.pair_low_id, booking.pair_high_id].map(
                (recipientUserId, index) => ({
                  notificationId: ids.notificationIds[index]!,
                  recipientUserId,
                  category: 'SERVICE',
                  renderKey: 'booking.host-rejected',
                  actionTarget: { type: 'CHAT', chatId: booking.chat_id },
                  payload: {
                    bookingId: booking.booking_id,
                    slotId: booking.slot_id,
                    reasonCode: reason.reasonCode,
                    reasonNote: reason.reasonNote,
                  },
                  deadlineAt: null,
                }),
              ),
            },
          },
          ...(challenge
            ? [{
                messageId: requiredChallengeEffectIds(ids).outboxMessageId,
                topic: 'competition.challenge.returned-to-scheduling.v1',
                sourceEventId: requiredChallengeEffectIds(ids).eventId,
                payload: {
                  challengeId: challenge.challenge_id,
                  bookingId: booking.booking_id,
                  reason: 'HOST_REJECTED',
                },
              }]
            : []),
        ],
      };
    },
  });
}

export async function readHostConfirmationQueue(
  database: Kysely<Database>,
  actorId: string,
  now: Date = new Date(),
): Promise<readonly HostConfirmationQueueItem[]> {
  if (!Number.isFinite(now.getTime())) throw new SchedulingValidationError('now');
  const result = await sql<BookingIntentRow & {
    readonly athlete_low_name: string;
    readonly athlete_high_name: string;
  }>`
    select booking.booking_id, booking.chat_id, booking.match_id, booking.slot_id,
      booking.purpose, booking.challenge_id,
      booking.pair_low_id, booking.pair_high_id, booking.initiated_by,
      booking.selected_by_low_at, booking.selected_by_high_at,
      booking.selection_expires_at, booking.host_confirmation_deadline_at,
      booking.commercial_terms_snapshot, booking.host_confirmed_at,
      null::uuid as session_id, booking.state, booking.version::text as version,
      athlete_low.display_name as athlete_low_name,
      athlete_high.display_name as athlete_high_name
    from scheduling.bookings as booking
    join scheduling.slots as slot on slot.slot_id = booking.slot_id
    join identity.users as athlete_low on athlete_low.user_id = booking.pair_low_id
    join identity.users as athlete_high on athlete_high.user_id = booking.pair_high_id
    where booking.state = 'HOST_CONFIRMATION_PENDING'
      and booking.host_confirmation_deadline_at > ${now.toISOString()}::timestamptz
      and slot.state = 'PUBLISHED' and slot.booking_id is null
      and (
        (
          slot.coach_user_id = ${actorId}::uuid
          and exists (
            select 1 from community.role_grants
            where user_id = ${actorId}::uuid and role = 'COACH'
              and state = 'ACTIVE'
              and (expires_at is null or expires_at > ${now.toISOString()}::timestamptz)
          )
        ) or exists (
          select 1 from community.role_grants
          where user_id = ${actorId}::uuid
            and role in ('PRIMARY_ADMIN', 'GYM_ADMIN')
            and scope_type = 'VENUE' and scope_id = slot.venue_id
            and state = 'ACTIVE'
            and (expires_at is null or expires_at > ${now.toISOString()}::timestamptz)
        )
      )
    order by slot.start_at, booking.created_at, booking.booking_id
    limit 50
  `.execute(database);
  return result.rows.map((row) => ({
    booking: bookingProjection(row),
    athleteDisplayNames: [row.athlete_low_name, row.athlete_high_name],
  }));
}

export async function proposeGroupPlan(
  database: Kysely<Database>,
  command: CommandEnvelope<ProposeGroupPlanPayload>,
  ids: PairIntentNotificationEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<GroupPlanProjection>> {
  if (!command.actor.id || command.aggregateType !== 'GroupPlan') {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const pair = await matchedPairForChat(transaction, command.payload.chatId, command.actor.id!);
      const live = await sql<{ readonly group_plan_id: string }>`
        select group_plan_id from scheduling.group_plans
        where pair_low_id = ${pair.pair_low_id}::uuid
          and pair_high_id = ${pair.pair_high_id}::uuid
          and state in ('PROPOSED', 'NOTIFIED', 'CONVERSION_PENDING')
        limit 1 for update
      `.execute(transaction);
      if (live.rows[0]) throw new SchedulingConflictError('PAIR_PLAN_EXISTS');
      const offeringResult = await sql<GroupOfferingChoiceRow>`
        select offering.group_offering_id, offering.venue_id,
          venue.display_name as venue_display_name, offering.sport_code,
          offering.class_label, offering.start_at, offering.end_at,
          offering.coach_user_id, offering.coach_display_name,
          offering.price_text, offering.external_info_url,
          offering.contact_snapshot, offering.state, offering.version::text as version
        from scheduling.group_offerings as offering
        join community.venues as venue on venue.venue_id = offering.venue_id
        where offering.group_offering_id = ${command.payload.groupOfferingId}::uuid
        for share of offering, venue
      `.execute(transaction);
      const offering = offeringResult.rows[0];
      if (
        !offering ||
        offering.state !== 'PUBLISHED' ||
        offering.start_at <= context.occurredAt ||
        Number(offering.version) !== command.payload.offeringVersion
      ) {
        throw new SchedulingConflictError('OFFERING_UNAVAILABLE');
      }
      const snapshot = offeringSnapshot(offering);
      await sql`
        insert into scheduling.group_plans (
          group_plan_id, chat_id, match_id, group_offering_id,
          pair_low_id, pair_high_id, proposed_by, confirmed_by_peer_at,
          offering_snapshot, start_at, state, version, created_at, updated_at
        ) values (
          ${command.aggregateId}::uuid, ${command.payload.chatId}::uuid,
          ${pair.match_id}::uuid, ${offering.group_offering_id}::uuid,
          ${pair.pair_low_id}::uuid, ${pair.pair_high_id}::uuid,
          ${command.actor.id}::uuid, null, ${JSON.stringify(snapshot)}::jsonb,
          ${snapshot.startAt}::timestamptz, 'PROPOSED', 1,
          ${context.occurredAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      const response: GroupPlanProjection = {
        groupPlanId: command.aggregateId,
        chatId: command.payload.chatId,
        groupOfferingId: snapshot.groupOfferingId,
        proposedByUserId: command.actor.id!,
        confirmedByPeer: false,
        state: 'PROPOSED',
        offeringSnapshot: snapshot,
        version: 1,
      };
      return {
        responseStatus: 201,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'GroupPlanProposed',
          schemaVersion: 1,
          transitionId: 'GP-01',
          payload: { groupPlanId: response.groupPlanId, groupOfferingId: response.groupOfferingId, chatId: response.chatId },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId,
          action: 'PROPOSE_GROUP_PLAN',
          transitionId: 'GP-01',
          reasonCode: null,
          beforeState: null,
          afterState: 'PROPOSED',
          metadata: { matchId: pair.match_id, groupOfferingId: response.groupOfferingId },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'scheduling.group-plan.proposed.v1',
            payload: {
              groupPlanId: response.groupPlanId,
              chatId: response.chatId,
              proposedByUserId: response.proposedByUserId,
              timer: intentTimer({ commandType: 'EXPIRE_GROUP_PLAN', aggregateType: 'GroupPlan', aggregateId: response.groupPlanId, expectedState: 'PROPOSED', expectedVersion: 1, deadlineAt: snapshot.startAt }),
            },
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: { notifications: [{ notificationId: ids.notificationId, recipientUserId: otherPairUser(pair, command.actor.id!), category: 'SOCIAL', renderKey: 'group-plan.proposed-by-partner', actionTarget: { type: 'CHAT', chatId: response.chatId }, payload: { groupPlanId: response.groupPlanId, groupOfferingId: response.groupOfferingId }, deadlineAt: snapshot.startAt }] },
          },
        ],
      };
    },
  });
}

export async function confirmGroupPlan(
  database: Kysely<Database>,
  command: CommandEnvelope<ConfirmGroupPlanPayload>,
  ids: PairIntentNotificationEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<GroupPlanProjection>> {
  if (!command.actor.id || command.aggregateType !== 'GroupPlan' || command.payload.groupPlanId !== command.aggregateId) {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const locator = await sql<{ readonly chat_id: string }>`
        select chat_id from scheduling.group_plans
        where group_plan_id = ${command.aggregateId}::uuid
      `.execute(transaction);
      const chatId = locator.rows[0]?.chat_id;
      if (!chatId) throw new SchedulingConflictError('OFFERING_UNAVAILABLE');
      const pair = await matchedPairForChat(transaction, chatId, command.actor.id!);
      const result = await sql<GroupPlanRow>`
        select group_plan_id, chat_id, match_id, group_offering_id,
          pair_low_id, pair_high_id, proposed_by, confirmed_by_peer_at,
          offering_snapshot, start_at, state, version::text as version
        from scheduling.group_plans where group_plan_id = ${command.aggregateId}::uuid
        for update
      `.execute(transaction);
      const plan = result.rows[0];
      if (!plan || plan.state !== 'PROPOSED' || plan.start_at <= context.occurredAt) {
        throw new SchedulingConflictError('OFFERING_UNAVAILABLE');
      }
      if (pair.match_id !== plan.match_id || command.actor.id === plan.proposed_by) {
        throw new SchedulingConflictError('ACTOR_ALREADY_SELECTED');
      }
      const venueRecipient = await venueNotificationRecipient(
        transaction,
        plan.offering_snapshot.venueId,
      );
      await sql`
        update scheduling.group_plans
        set state = 'NOTIFIED', confirmed_by_peer_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = ${context.nextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where group_plan_id = ${command.aggregateId}::uuid and state = 'PROPOSED'
      `.execute(transaction);
      const response = groupPlanProjection({
        ...plan,
        confirmed_by_peer_at: context.occurredAt,
        state: 'NOTIFIED',
        version: String(context.nextVersion),
      });
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'GroupPlanMutuallyConfirmed',
          schemaVersion: 1,
          transitionId: 'GP-02',
          payload: { groupPlanId: response.groupPlanId, groupOfferingId: response.groupOfferingId },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId,
          action: 'CONFIRM_GROUP_PLAN',
          transitionId: 'GP-02',
          reasonCode: null,
          beforeState: 'PROPOSED',
          afterState: 'NOTIFIED',
          metadata: { venueId: response.offeringSnapshot.venueId },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'scheduling.group-plan.mutually-confirmed.v1',
            payload: {
              groupPlanId: response.groupPlanId,
              venueId: response.offeringSnapshot.venueId,
              contact: response.offeringSnapshot.contact,
              capacityReserved: false,
              timer: intentTimer({ commandType: 'EXPIRE_GROUP_PLAN', aggregateType: 'GroupPlan', aggregateId: response.groupPlanId, expectedState: 'NOTIFIED', expectedVersion: context.nextVersion, deadlineAt: response.offeringSnapshot.startAt }),
            },
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: { notifications: [{ notificationId: ids.notificationId, recipientUserId: venueRecipient, category: 'SERVICE', renderKey: 'group-plan.venue-interest-notice', actionTarget: { type: 'GROUP_PLAN', groupPlanId: response.groupPlanId }, payload: { groupOfferingId: response.groupOfferingId, athleteUserIds: [plan.pair_low_id, plan.pair_high_id], capacityReserved: false }, deadlineAt: response.offeringSnapshot.startAt }] },
          },
        ],
      };
    },
  });
}

export async function readActivePairIntents(
  database: Kysely<Database>,
  chatId: string,
  viewerUserId: string,
): Promise<ActivePairIntentProjection> {
  const allowed = await sql<{ readonly allowed: boolean }>`
    select true as allowed from social.chats as chat
    join social.chat_participants as participant on participant.chat_id = chat.chat_id
    left join social.matches as matched on matched.chat_id = chat.chat_id
    where chat.chat_id = ${chatId}::uuid and participant.user_id = ${viewerUserId}::uuid
      and chat.state = 'OPEN'
      and (
        matched.state = 'ACTIVE'
        or exists (
          select 1 from competition.challenges as challenge
          where challenge.service_chat_id = chat.chat_id
            and challenge.response_policy = 'MUTUAL_GENESIS'
            and challenge.state in ('ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED')
            and ${viewerUserId}::uuid in (challenge.initiator_user_id, challenge.recipient_user_id)
        )
      )
    limit 1
  `.execute(database);
  if (!allowed.rows[0]?.allowed) throw new SchedulingPermissionDeniedError();
  const [bookings, groupPlans] = await Promise.all([
    sql<BookingIntentRow>`
      select booking.booking_id, booking.chat_id, booking.match_id, booking.slot_id,
        booking.purpose, booking.challenge_id,
        booking.pair_low_id, booking.pair_high_id, booking.initiated_by,
        booking.selected_by_low_at, booking.selected_by_high_at,
        booking.selection_expires_at, booking.host_confirmation_deadline_at,
        booking.commercial_terms_snapshot, booking.host_confirmed_at,
        session.session_id, booking.state, booking.version::text as version
      from scheduling.bookings as booking
      left join scheduling.sessions as session on session.booking_id = booking.booking_id
      where booking.chat_id = ${chatId}::uuid
        and booking.state in ('SELECTING', 'HOST_CONFIRMATION_PENDING', 'CONFIRMED_PAIR')
      order by
        case booking.state
          when 'HOST_CONFIRMATION_PENDING' then 0
          when 'SELECTING' then 1
          else 2
        end,
        booking.updated_at desc
      limit 1
    `.execute(database),
    sql<GroupPlanRow>`
      select group_plan_id, chat_id, match_id, group_offering_id,
        pair_low_id, pair_high_id, proposed_by, confirmed_by_peer_at,
        offering_snapshot, start_at, state, version::text as version
      from scheduling.group_plans where chat_id = ${chatId}::uuid
        and state in ('PROPOSED', 'NOTIFIED', 'CONVERSION_PENDING')
      order by updated_at desc limit 1
    `.execute(database),
  ]);
  return {
    booking: bookings.rows[0] ? bookingProjection(bookings.rows[0]) : null,
    groupPlan: groupPlans.rows[0] ? groupPlanProjection(groupPlans.rows[0]) : null,
  };
}

export async function readBookingIntentTimerSnapshot(
  database: Kysely<Database>,
  bookingId: string,
): Promise<TimerAggregateSnapshot> {
  const result = await sql<{ readonly state: string; readonly version: string }>`
    select state, version::text as version from scheduling.bookings where booking_id = ${bookingId}::uuid
  `.execute(database);
  const row = result.rows[0];
  return row ? { state: row.state, version: Number(row.version) } : { state: 'MISSING', version: 0 };
}

export async function expireBookingIntent(
  database: Kysely<Database>,
  command: CommandEnvelope<ExpireBookingIntentPayload>,
  ids: PairIntentEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<BookingIntentProjection>> {
  if (command.actor.type !== 'SYSTEM' || command.aggregateType !== 'Booking' || command.payload.bookingId !== command.aggregateId) {
    throw new SchedulingPermissionDeniedError();
  }
  const expectedState = command.commandType === 'EXPIRE_BOOKING_SELECTION'
    ? 'SELECTING'
    : command.commandType === 'EXPIRE_HOST_CONFIRMATION'
      ? 'HOST_CONFIRMATION_PENDING'
      : null;
  if (!expectedState) throw new SchedulingPermissionDeniedError();
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const result = await sql<BookingIntentRow>`
        select booking_id, chat_id, match_id, slot_id, purpose, challenge_id,
          pair_low_id, pair_high_id,
          initiated_by, selected_by_low_at, selected_by_high_at,
          selection_expires_at, host_confirmation_deadline_at,
          commercial_terms_snapshot, state, version::text as version
        from scheduling.bookings where booking_id = ${command.aggregateId}::uuid for update
      `.execute(transaction);
      const booking = result.rows[0];
      if (command.commandType === 'EXPIRE_BOOKING_SELECTION') {
        await assertNoActivePlatformIncidentForTimer(transaction, {
          commandType: command.commandType,
          aggregateId: command.aggregateId,
          occurredAt: context.occurredAt,
        });
      }
      const deadline = expectedState === 'SELECTING'
        ? booking?.selection_expires_at
        : booking?.host_confirmation_deadline_at;
      if (!booking || booking.state !== expectedState || !deadline || deadline > context.occurredAt) {
        throw new SchedulingConflictError('SELECTION_EXPIRED');
      }
      const challenge = booking.challenge_id
        ? await challengeForBooking(transaction, booking.challenge_id)
        : null;
      if (
        challenge
        && (
          booking.purpose !== 'OFFICIAL_CHALLENGE'
          || challenge.source_chat_id !== booking.chat_id
          || challenge.source_match_id !== booking.match_id
          || challenge.pair_low_id !== booking.pair_low_id
          || challenge.pair_high_id !== booking.pair_high_id
        )
      ) {
        throw new ChallengeConflictError('CHALLENGE_BOOKING_NOT_PENDING');
      }
      await sql`
        update scheduling.bookings set state = 'EXPIRED', version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where booking_id = ${command.aggregateId}::uuid and state = ${expectedState}
      `.execute(transaction);
      const returnChallengeToScheduling = challenge?.state === 'BOOKING_PENDING';
      const challengeNextVersion = returnChallengeToScheduling
        ? Number(challenge.version) + 1
        : null;
      if (challenge && challengeNextVersion !== null) {
        await sql`
          update competition.challenges
          set state = 'ACCEPTED_UNSCHEDULED', version = ${challengeNextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where challenge_id = ${challenge.challenge_id}::uuid
            and state = 'BOOKING_PENDING'
        `.execute(transaction);
      }
      const response = bookingProjection({ ...booking, state: 'EXPIRED', version: String(context.nextVersion) });
      const hostExpiry = expectedState === 'HOST_CONFIRMATION_PENDING';
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: hostExpiry ? 'BookingConfirmationExpired' : 'SlotSelectionExpired',
          schemaVersion: 1,
          transitionId: hostExpiry ? 'B-09' : 'B-05',
          payload: { bookingId: response.bookingId, slotId: response.slotId },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        ...(challenge && challengeNextVersion !== null
          ? {
              relatedEvents: [{
                eventId: requiredChallengeEffectIds(ids).eventId,
                eventName: 'ChallengeReturnedToScheduling',
                schemaVersion: 1,
                aggregateType: 'Challenge',
                aggregateId: challenge.challenge_id,
                aggregateVersion: challengeNextVersion,
                transitionId: 'CH-09',
                payload: {
                  challengeId: challenge.challenge_id,
                  bookingId: response.bookingId,
                  reason: hostExpiry ? 'HOST_CONFIRMATION_EXPIRED' : 'SELECTION_EXPIRED',
                },
                metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
              }],
            }
          : {}),
        audit: {
          auditId: ids.auditId,
          action: command.commandType,
          transitionId: hostExpiry ? 'B-09' : 'B-05',
          reasonCode: hostExpiry ? 'HOST_DEADLINE_REACHED' : 'SELECTION_TTL_REACHED',
          beforeState: expectedState,
          afterState: 'EXPIRED',
          metadata: {},
        },
        outbox: [
          { messageId: ids.outboxMessageId, topic: hostExpiry ? 'scheduling.booking.host-confirmation-expired.v1' : 'scheduling.booking.selection-expired.v1', payload: { bookingId: response.bookingId, chatId: response.chatId } },
          ...(challenge && challengeNextVersion !== null
            ? [{
                messageId: requiredChallengeEffectIds(ids).outboxMessageId,
                topic: 'competition.challenge.returned-to-scheduling.v1',
                sourceEventId: requiredChallengeEffectIds(ids).eventId,
                payload: {
                  challengeId: challenge.challenge_id,
                  bookingId: response.bookingId,
                  reason: hostExpiry ? 'HOST_CONFIRMATION_EXPIRED' : 'SELECTION_EXPIRED',
                },
              }]
            : []),
        ],
      };
    },
  });
}

export async function readGroupPlanTimerSnapshot(
  database: Kysely<Database>,
  groupPlanId: string,
): Promise<TimerAggregateSnapshot> {
  const result = await sql<{ readonly state: string; readonly version: string }>`
    select state, version::text as version from scheduling.group_plans where group_plan_id = ${groupPlanId}::uuid
  `.execute(database);
  const row = result.rows[0];
  return row ? { state: row.state, version: Number(row.version) } : { state: 'MISSING', version: 0 };
}

export async function expireGroupPlan(
  database: Kysely<Database>,
  command: CommandEnvelope<ExpireGroupPlanPayload>,
  ids: PairIntentEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<GroupPlanProjection>> {
  if (command.actor.type !== 'SYSTEM' || command.commandType !== 'EXPIRE_GROUP_PLAN' || command.aggregateType !== 'GroupPlan' || command.payload.groupPlanId !== command.aggregateId) {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const result = await sql<GroupPlanRow>`
        select group_plan_id, chat_id, match_id, group_offering_id,
          pair_low_id, pair_high_id, proposed_by, confirmed_by_peer_at,
          offering_snapshot, start_at, state, version::text as version
        from scheduling.group_plans where group_plan_id = ${command.aggregateId}::uuid for update
      `.execute(transaction);
      const plan = result.rows[0];
      if (!plan || !['PROPOSED', 'NOTIFIED'].includes(plan.state) || plan.start_at > context.occurredAt) {
        throw new SchedulingConflictError('OFFERING_UNAVAILABLE');
      }
      await sql`
        update scheduling.group_plans set state = 'EXPIRED', version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where group_plan_id = ${command.aggregateId}::uuid and state = ${plan.state}
      `.execute(transaction);
      const response = groupPlanProjection({ ...plan, state: 'EXPIRED', version: String(context.nextVersion) });
      return {
        responseStatus: 200,
        response,
        event: { eventId: ids.eventId, eventName: 'GroupPlanExpired', schemaVersion: 1, transitionId: 'GP-09', payload: { groupPlanId: response.groupPlanId }, metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
        audit: { auditId: ids.auditId, action: 'EXPIRE_GROUP_PLAN', transitionId: 'GP-09', reasonCode: 'START_REACHED', beforeState: plan.state, afterState: 'EXPIRED', metadata: {} },
        outbox: [{ messageId: ids.outboxMessageId, topic: 'scheduling.group-plan.expired.v1', payload: { groupPlanId: response.groupPlanId, chatId: response.chatId } }],
      };
    },
  });
}
