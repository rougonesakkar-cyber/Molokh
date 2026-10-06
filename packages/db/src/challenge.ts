import {
  CHALLENGE_POLICY_VERSION,
  RESULT_POLICY_VERSION,
  ChallengeConflictError,
  YouthConsentConflictError,
  acceptedChallengeSchedulingDeadline,
  assertAcceptedChallengeSchedulingCanExpire,
  assertDirectOpenChallengeCanBeCreated,
  assertOptionalChallengeCanBeAccepted,
  assertOptionalChallengeCanBeDeclined,
  assertOptionalChallengeCanBeExpired,
  assertOptionalChallengeCanBeWithdrawn,
  assertMandatoryChallengeCanBeDeclined,
  assertMandatoryChallengeCanBeExpired,
  assertMutualChallengeRescheduleCanBeProposed,
  assertExpectedVersion,
  challengeRescheduleLimitForfeitWinner,
  nextAthleteChallengeRescheduleCount,
  nextMutualChallengeRescheduleCount,
  normalizeScheduleMutationReason,
  deriveProvisionalStatusTransition,
  extendedChallengeSchedulingDeadline,
  normalizeSocialPair,
  optionalChallengePairQuietEndsAt,
  optionalChallengeReminderDeadlines,
  optionalChallengeResponseDeadline,
  resultAppealDeadline,
  type ChallengeConflictCode,
  type ChallengeState,
  type CommandEnvelope,
  type ScheduleMutationReasonCode,
  type TimerAggregateSnapshot,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import { executeCriticalCommand, type ExecutedCommand } from './platform-command.js';
import { assertNoActivePlatformIncidentForTimer } from './platform-incident.js';
import { recordAdministrativeForfeit } from './result.js';
import {
  assertYouthChallengeConsentReady,
  assertYouthOfficialAvailableForUsers,
} from './youth-consent.js';

export interface CreateDirectChallengePayload {
  readonly sourceChatId: string;
}

export interface RespondToChallengePayload {
  readonly challengeId: string;
  readonly explicitRulesetAcknowledged?: boolean;
}

export interface ExpireOptionalChallengePayload {
  readonly challengeId: string;
}

export interface ExpireChallengeSchedulingPayload {
  readonly challengeId: string;
}

export interface RescheduleChallengeByAthletePayload {
  readonly challengeId: string;
  readonly reasonCode: ScheduleMutationReasonCode;
  readonly reasonNote: string | null;
  readonly confirmForfeit?: boolean;
}

export interface ProposeMutualChallengeReschedulePayload {
  readonly challengeId: string;
  readonly challengeVersion: number;
  readonly reasonCode: ScheduleMutationReasonCode;
  readonly reasonNote: string | null;
}

export interface ConfirmMutualChallengeReschedulePayload {
  readonly challengeId: string;
  readonly requestId: string;
  readonly requestVersion: number;
}

export interface ChallengeEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly notificationId: string;
  readonly notificationOutboxMessageId: string;
  readonly resultId?: string;
  readonly resultEventId?: string;
  readonly statusTransitionId?: string;
  readonly statusEventId?: string;
  readonly cooldownId?: string;
  readonly cooldownEventId?: string;
  readonly timerOutboxMessageId?: string;
  readonly notificationIds?: readonly [string, string];
}

export interface ExpireChallengeSchedulingEffectIds extends ChallengeEffectIds {
  readonly bookingEventId: string;
  readonly bookingOutboxMessageId: string;
  readonly notificationIds: readonly [string, string];
}

export interface AthleteChallengeRescheduleEffectIds extends ChallengeEffectIds {
  readonly rescheduleId: string;
  readonly bookingEventId: string;
  readonly bookingOutboxMessageId: string;
  readonly hostNotificationOutboxMessageId: string;
  readonly notificationIds: readonly [string, string];
}

export interface ProposeMutualChallengeRescheduleEffectIds extends ChallengeEffectIds {}

export interface ConfirmMutualChallengeRescheduleEffectIds
  extends Omit<ChallengeEffectIds, 'notificationIds'> {
  readonly rescheduleId: string;
  readonly requestEventId: string;
  readonly bookingEventId: string;
  readonly slotEventId: string;
  readonly sessionEventId: string;
  readonly bookingOutboxMessageId: string;
  readonly notificationIds: readonly [string, string, string];
}

export interface CreateChallengeEffectIds extends ChallengeEffectIds {
  readonly serviceChatId: string;
  readonly serviceChatEventId: string;
  readonly rulesetSnapshotId: string;
  readonly acknowledgmentId: string;
}

export interface AcceptChallengeEffectIds extends ChallengeEffectIds {
  readonly acknowledgmentId: string;
  readonly obligationIds: readonly [string, string];
}

export interface DeclineChallengeEffectIds extends ChallengeEffectIds {
  readonly quietPeriodId: string;
}

export interface ChallengeProjection {
  readonly challengeId: string;
  readonly competitionId: string;
  readonly sourceChatId: string;
  readonly serviceChatId: string;
  readonly initiatorUserId: string;
  readonly initiatorDisplayName: string;
  readonly recipientUserId: string;
  readonly recipientDisplayName: string;
  readonly responsePolicy: 'OPTIONAL' | 'MANDATORY' | 'MUTUAL_GENESIS';
  readonly stake: 'NONE' | 'CONTENDER' | 'TITLE' | 'GENESIS_CHAMPION' | 'GENESIS_CONTENDER';
  readonly state: ChallengeState;
  readonly rulesetRef: string;
  readonly rulesetAckMode: 'IMPLICIT_ON_ACCEPT' | 'EXPLICIT_ACK_REQUIRED';
  readonly responseDeadlineAt: string;
  readonly acceptedAt: string | null;
  readonly schedulingDeadlineAt: string | null;
  readonly userRescheduleCount: number;
  readonly pairQuietUntil: string | null;
  readonly viewerRole: 'INITIATOR' | 'RECIPIENT';
  readonly version: number;
}

export interface MutualChallengeRescheduleRequestProjection {
  readonly requestId: string;
  readonly challengeId: string;
  readonly bookingId: string | null;
  readonly sessionId: string | null;
  readonly proposedByUserId: string;
  readonly confirmedByUserId: string | null;
  readonly reasonCode: ScheduleMutationReasonCode;
  readonly state: 'PROPOSED' | 'CONFIRMED';
  readonly proposedAt: string;
  readonly confirmedAt: string | null;
  readonly version: number;
}

export interface ChatChallengeProjection {
  readonly challenge: ChallengeProjection | null;
  readonly mutualRescheduleRequest: MutualChallengeRescheduleRequestProjection | null;
  readonly canCreate: boolean;
  readonly createDenialCode: ChallengeConflictCode | null;
  readonly policyVersion: typeof CHALLENGE_POLICY_VERSION;
}

export interface LocalPilotCompetitionFixture {
  readonly competitionId: string;
  readonly communityId: string;
  readonly centralActorId: string;
  readonly occurredAt: string;
  readonly memberships: readonly {
    readonly membershipId: string;
    readonly userId: string;
  }[];
}

interface MatchContextRow {
  readonly match_id: string;
  readonly source_chat_id: string;
  readonly pair_low_id: string;
  readonly pair_high_id: string;
  readonly match_state: string;
  readonly chat_state: string;
}

interface CompetitionContextRow {
  readonly competition_id: string;
  readonly community_id: string;
  readonly competition_availability: string;
  readonly champion_user_id: string | null;
  readonly contender_user_id: string | null;
  readonly community_state: string;
  readonly configuration_id: string;
  readonly ruleset_ref: string;
  readonly ruleset_ack_mode: 'IMPLICIT_ON_ACCEPT' | 'EXPLICIT_ACK_REQUIRED';
}

interface AthleteEligibilityRow {
  readonly user_id: string;
  readonly display_name: string;
  readonly account_state: string;
  readonly age_division: 'YOUTH' | 'ADULT';
  readonly verified: boolean;
  readonly membership_active: boolean;
}

interface ChallengeRow {
  readonly challenge_id: string;
  readonly competition_id: string;
  readonly source_chat_id: string;
  readonly service_chat_id: string;
  readonly initiator_user_id: string;
  readonly initiator_display_name: string;
  readonly recipient_user_id: string;
  readonly recipient_display_name: string;
  readonly pair_low_id: string;
  readonly pair_high_id: string;
  readonly response_policy: 'OPTIONAL' | 'MANDATORY' | 'MUTUAL_GENESIS';
  readonly stake: 'NONE' | 'CONTENDER' | 'TITLE' | 'GENESIS_CHAMPION' | 'GENESIS_CONTENDER';
  readonly state: ChallengeState;
  readonly ruleset_snapshot_id: string;
  readonly ruleset_ref: string;
  readonly ruleset_ack_mode: 'IMPLICIT_ON_ACCEPT' | 'EXPLICIT_ACK_REQUIRED';
  readonly response_deadline_at: Date;
  readonly accepted_at: Date | null;
  readonly scheduling_deadline_at: Date | null;
  readonly scheduling_extension_count: number;
  readonly user_reschedule_count: number;
  readonly quiet_until: Date | null;
  readonly cycle_no: number;
  readonly version: string;
}

interface MutualChallengeRescheduleRequestRow {
  readonly request_id: string;
  readonly challenge_id: string;
  readonly booking_id: string | null;
  readonly session_id: string | null;
  readonly proposed_by_user_id: string;
  readonly confirmed_by_user_id: string | null;
  readonly reason_code: ScheduleMutationReasonCode;
  readonly reason_note: string | null;
  readonly state: 'PROPOSED' | 'CONFIRMED';
  readonly challenge_version_at_proposal: string;
  readonly booking_version_at_proposal: string | null;
  readonly session_version_at_proposal: string | null;
  readonly slot_version_at_proposal: string | null;
  readonly proposed_at: Date;
  readonly confirmed_at: Date | null;
  readonly version: string;
}

interface MutualChallengeRescheduleResourceRow {
  readonly booking_id: string;
  readonly booking_state: string;
  readonly booking_version: string;
  readonly slot_id: string;
  readonly slot_state: string;
  readonly slot_version: string;
  readonly session_id: string | null;
  readonly session_state: string | null;
  readonly session_version: string | null;
  readonly actual_start_at: Date | null;
  readonly coach_user_id: string;
}

interface CreationContext {
  readonly match: MatchContextRow;
  readonly competition: CompetitionContextRow;
  readonly initiator: AthleteEligibilityRow;
  readonly recipient: AthleteEligibilityRow;
  readonly outgoingAwaitingResponseCount: number;
  readonly pairBlocked: boolean;
  readonly pairCooldownActive: boolean;
  readonly pairQuietActive: boolean;
  readonly livePairChallengeExists: boolean;
}

interface AdministrativeForfeitContextRow {
  readonly competition_id: string;
  readonly competition_version: string;
  readonly status_version: string;
  readonly champion_user_id: string | null;
  readonly contender_user_id: string | null;
  readonly status_lock_result_id: string | null;
  readonly integrity_hold_case_id: string | null;
  readonly status_review_hold_active: boolean;
  readonly pair_cooldown_days: number;
}

interface AdministrativeForfeitIds {
  readonly resultId: string;
  readonly resultEventId: string;
  readonly statusTransitionId: string;
  readonly statusEventId: string;
  readonly cooldownId: string;
  readonly cooldownEventId: string;
  readonly timerOutboxMessageId: string;
  readonly notificationIds: readonly [string, string];
}

function administrativeForfeitIds(ids: ChallengeEffectIds): AdministrativeForfeitIds {
  const values = {
    resultId: ids.resultId,
    resultEventId: ids.resultEventId,
    statusTransitionId: ids.statusTransitionId,
    statusEventId: ids.statusEventId,
    cooldownId: ids.cooldownId,
    cooldownEventId: ids.cooldownEventId,
    timerOutboxMessageId: ids.timerOutboxMessageId,
    notificationIds: ids.notificationIds,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) throw new TypeError(`Mandatory Forfeit effect ID ${key} is required`);
  }
  return values as AdministrativeForfeitIds;
}

function otherParticipant(match: MatchContextRow, actorUserId: string): string {
  if (actorUserId === match.pair_low_id) return match.pair_high_id;
  if (actorUserId === match.pair_high_id) return match.pair_low_id;
  throw new ChallengeConflictError('MATCH_REQUIRED');
}

async function lockSocialPair(
  transaction: Transaction<Database>,
  pairLowId: string,
  pairHighId: string,
): Promise<void> {
  await sql`
    select pg_advisory_xact_lock(hashtextextended(${`SocialPair:${pairLowId}:${pairHighId}`}, 0))
  `.execute(transaction);
}

function participantStatus(
  competition: CompetitionContextRow,
  userId: string,
): 'ORDINARY' | 'CHAMPION' | 'CONTENDER' {
  if (competition.champion_user_id === userId) return 'CHAMPION';
  if (competition.contender_user_id === userId) return 'CONTENDER';
  return 'ORDINARY';
}

function projection(row: ChallengeRow, viewerUserId: string): ChallengeProjection {
  if (viewerUserId !== row.initiator_user_id && viewerUserId !== row.recipient_user_id) {
    throw new ChallengeConflictError('MATCH_REQUIRED');
  }
  return {
    challengeId: row.challenge_id,
    competitionId: row.competition_id,
    sourceChatId: row.source_chat_id,
    serviceChatId: row.service_chat_id,
    initiatorUserId: row.initiator_user_id,
    initiatorDisplayName: row.initiator_display_name,
    recipientUserId: row.recipient_user_id,
    recipientDisplayName: row.recipient_display_name,
    responsePolicy: row.response_policy,
    stake: row.stake,
    state: row.state,
    rulesetRef: row.ruleset_ref,
    rulesetAckMode: row.ruleset_ack_mode,
    responseDeadlineAt: row.response_deadline_at.toISOString(),
    acceptedAt: row.accepted_at?.toISOString() ?? null,
    schedulingDeadlineAt: row.scheduling_deadline_at?.toISOString() ?? null,
    userRescheduleCount: row.user_reschedule_count,
    pairQuietUntil: row.quiet_until?.toISOString() ?? null,
    viewerRole: viewerUserId === row.initiator_user_id ? 'INITIATOR' : 'RECIPIENT',
    version: Number(row.version),
  };
}

function mutualRescheduleRequestProjection(
  row: MutualChallengeRescheduleRequestRow,
): MutualChallengeRescheduleRequestProjection {
  return {
    requestId: row.request_id,
    challengeId: row.challenge_id,
    bookingId: row.booking_id,
    sessionId: row.session_id,
    proposedByUserId: row.proposed_by_user_id,
    confirmedByUserId: row.confirmed_by_user_id,
    reasonCode: row.reason_code,
    state: row.state,
    proposedAt: row.proposed_at.toISOString(),
    confirmedAt: row.confirmed_at?.toISOString() ?? null,
    version: Number(row.version),
  };
}

async function matchContext(
  database: Kysely<Database> | Transaction<Database>,
  sourceChatId: string,
  actorUserId: string,
): Promise<MatchContextRow> {
  const result = await sql<MatchContextRow>`
    select matched.match_id, matched.chat_id as source_chat_id,
      matched.pair_low_id, matched.pair_high_id,
      matched.state as match_state, chat.state as chat_state
    from social.matches as matched
    join social.chats as chat on chat.chat_id = matched.chat_id
    join social.chat_participants as participant
      on participant.chat_id = chat.chat_id and participant.user_id = ${actorUserId}::uuid
    where matched.chat_id = ${sourceChatId}::uuid
  `.execute(database);
  const match = result.rows[0];
  if (!match || match.match_state !== 'ACTIVE' || match.chat_state !== 'OPEN') {
    throw new ChallengeConflictError('MATCH_REQUIRED');
  }
  return match;
}

async function competitionContext(
  database: Kysely<Database> | Transaction<Database>,
  pairLowId: string,
  pairHighId: string,
): Promise<CompetitionContextRow> {
  const result = await sql<CompetitionContextRow>`
    select competitive.competition_id, competitive.community_id,
      competitive.availability as competition_availability,
      competitive.champion_user_id, competitive.contender_user_id,
      community.state as community_state, configuration.configuration_id,
      configuration.ruleset_ref, configuration.ruleset_ack_mode
    from community.community_memberships as low_membership
    join community.community_memberships as high_membership
      on high_membership.community_id = low_membership.community_id
      and high_membership.user_id = ${pairHighId}::uuid
      and high_membership.state = 'ACTIVE'
      and high_membership.competition_enabled
    join competition.competitions as competitive
      on competitive.community_id = low_membership.community_id
      and competitive.age_division = low_membership.age_division
      and competitive.discipline_key is null
      and competitive.availability in ('ACTIVE', 'PAUSED')
    join community.communities as community on community.community_id = competitive.community_id
    join community.community_configuration_versions as configuration
      on configuration.configuration_id = community.configuration_id
    where low_membership.user_id = ${pairLowId}::uuid
      and low_membership.state = 'ACTIVE'
      and low_membership.competition_enabled
    order by competitive.created_at
    limit 1
  `.execute(database);
  const context = result.rows[0];
  if (!context) throw new ChallengeConflictError('MEMBERSHIP_NOT_ACTIVE');
  return context;
}

async function athleteEligibility(
  database: Kysely<Database> | Transaction<Database>,
  userId: string,
  communityId: string,
): Promise<AthleteEligibilityRow> {
  const result = await sql<AthleteEligibilityRow>`
    select identity.user_id, identity.display_name, identity.account_state,
      identity.age_division,
      exists (
        select 1 from identity.account_verifications as verification
        where verification.user_id = identity.user_id
          and verification.is_current and verification.state = 'VERIFIED'
          and (verification.expires_at is null or verification.expires_at > clock_timestamp())
      ) as verified,
      exists (
        select 1 from community.community_memberships as membership
        where membership.community_id = ${communityId}::uuid
          and membership.user_id = identity.user_id
          and membership.state = 'ACTIVE' and membership.competition_enabled
      ) as membership_active
    from identity.users as identity
    where identity.user_id = ${userId}::uuid
  `.execute(database);
  const athlete = result.rows[0];
  if (!athlete) throw new ChallengeConflictError('ACCOUNT_NOT_ACTIVE');
  return athlete;
}

async function creationContext(
  database: Kysely<Database> | Transaction<Database>,
  sourceChatId: string,
  actorUserId: string,
): Promise<CreationContext> {
  const match = await matchContext(database, sourceChatId, actorUserId);
  const recipientUserId = otherParticipant(match, actorUserId);
  const competition = await competitionContext(database, match.pair_low_id, match.pair_high_id);
  const [initiator, recipient, counts] = await Promise.all([
    athleteEligibility(database, actorUserId, competition.community_id),
    athleteEligibility(database, recipientUserId, competition.community_id),
    sql<{
      readonly outgoing_count: string;
      readonly pair_blocked: boolean;
      readonly pair_cooldown_active: boolean;
      readonly pair_quiet_active: boolean;
      readonly live_pair_challenge_exists: boolean;
    }>`
      select
        (select count(*)::text from competition.challenges
          where initiator_user_id = ${actorUserId}::uuid and state = 'AWAITING_RESPONSE') as outgoing_count,
        exists (select 1 from social.blocks
          where state = 'ACTIVE' and (
            (blocker_user_id = ${match.pair_low_id}::uuid and blocked_user_id = ${match.pair_high_id}::uuid)
            or (blocker_user_id = ${match.pair_high_id}::uuid and blocked_user_id = ${match.pair_low_id}::uuid)
          )) as pair_blocked,
        exists (select 1 from competition.pair_cooldowns
          where competition_id = ${competition.competition_id}::uuid
            and pair_low_id = ${match.pair_low_id}::uuid and pair_high_id = ${match.pair_high_id}::uuid
            and invalidated_at is null and ends_at > clock_timestamp()) as pair_cooldown_active,
        exists (select 1 from competition.optional_pair_quiet_periods
          where competition_id = ${competition.competition_id}::uuid
            and pair_low_id = ${match.pair_low_id}::uuid and pair_high_id = ${match.pair_high_id}::uuid
            and ends_at > clock_timestamp()) as pair_quiet_active,
        exists (select 1 from competition.challenges
          where competition_id = ${competition.competition_id}::uuid
            and pair_low_id = ${match.pair_low_id}::uuid and pair_high_id = ${match.pair_high_id}::uuid
            and state in ('AWAITING_RESPONSE', 'ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED',
              'IN_SESSION', 'RESULT_PENDING', 'RESULT_RECORDED', 'UNDER_APPEAL')) as live_pair_challenge_exists
    `.execute(database),
  ]);
  const count = counts.rows[0];
  if (!count) throw new ChallengeConflictError('MATCH_REQUIRED');
  return {
    match,
    competition,
    initiator,
    recipient,
    outgoingAwaitingResponseCount: Number(count.outgoing_count),
    pairBlocked: count.pair_blocked,
    pairCooldownActive: count.pair_cooldown_active,
    pairQuietActive: count.pair_quiet_active,
    livePairChallengeExists: count.live_pair_challenge_exists,
  };
}

function assertCreationContext(context: CreationContext): void {
  assertDirectOpenChallengeCanBeCreated({
    initiatorAccountActive: context.initiator.account_state === 'ACTIVE',
    recipientAccountActive: context.recipient.account_state === 'ACTIVE',
    initiatorVerified: context.initiator.verified,
    recipientVerified: context.recipient.verified,
    sameAgeContour: context.initiator.age_division === context.recipient.age_division,
    communityActive: context.competition.community_state === 'ACTIVE',
    competitionActive: context.competition.competition_availability === 'ACTIVE',
    initiatorMembershipActive: context.initiator.membership_active,
    recipientMembershipActive: context.recipient.membership_active,
    activeMatch: context.match.match_state === 'ACTIVE' && context.match.chat_state === 'OPEN',
    pairBlocked: context.pairBlocked,
    pairCooldownActive: context.pairCooldownActive,
    pairQuietActive: context.pairQuietActive,
    livePairChallengeExists: context.livePairChallengeExists,
    outgoingAwaitingResponseCount: context.outgoingAwaitingResponseCount,
    initiatorStatus: participantStatus(context.competition, context.initiator.user_id),
    recipientStatus: participantStatus(context.competition, context.recipient.user_id),
  });
}

async function assertCreationYouthPolicy(
  database: Kysely<Database> | Transaction<Database>,
  context: CreationContext,
): Promise<void> {
  try {
    await assertYouthOfficialAvailableForUsers(database, [
      context.match.pair_low_id,
      context.match.pair_high_id,
    ]);
  } catch (error) {
    if (error instanceof YouthConsentConflictError
      && error.code === 'YOUTH_OFFICIAL_DISABLED') {
      throw new ChallengeConflictError('YOUTH_OFFICIAL_DISABLED');
    }
    throw error;
  }
}

async function challengeRow(
  database: Kysely<Database> | Transaction<Database>,
  challengeId: string,
  lock = false,
): Promise<ChallengeRow> {
  const result = await sql<ChallengeRow>`
    select challenge.challenge_id, challenge.competition_id,
      challenge.source_chat_id, challenge.service_chat_id,
      challenge.initiator_user_id, initiator.display_name as initiator_display_name,
      challenge.recipient_user_id, recipient.display_name as recipient_display_name,
      challenge.pair_low_id, challenge.pair_high_id,
      challenge.response_policy, challenge.stake, challenge.state,
      challenge.ruleset_snapshot_id, snapshot.ruleset_ref, snapshot.ruleset_ack_mode,
      challenge.response_deadline_at, challenge.accepted_at,
      challenge.scheduling_deadline_at, challenge.scheduling_extension_count,
      challenge.user_reschedule_count,
      challenge.cycle_no,
      (select max(quiet.ends_at) from competition.optional_pair_quiet_periods as quiet
        where quiet.source_challenge_id = challenge.challenge_id) as quiet_until,
      challenge.version::text as version
    from competition.challenges as challenge
    join identity.users as initiator on initiator.user_id = challenge.initiator_user_id
    join identity.users as recipient on recipient.user_id = challenge.recipient_user_id
    join competition.ruleset_snapshots as snapshot
      on snapshot.ruleset_snapshot_id = challenge.ruleset_snapshot_id
    where challenge.challenge_id = ${challengeId}::uuid
    ${lock ? sql`for update of challenge` : sql``}
  `.execute(database);
  const row = result.rows[0];
  if (!row) throw new ChallengeConflictError('PAIR_CHALLENGE_EXISTS');
  return row;
}

async function mutualRescheduleRequestRow(
  database: Kysely<Database> | Transaction<Database>,
  requestId: string,
  lock = false,
): Promise<MutualChallengeRescheduleRequestRow | null> {
  const result = await sql<MutualChallengeRescheduleRequestRow>`
    select request_id, challenge_id, booking_id, session_id,
      proposed_by_user_id, confirmed_by_user_id, reason_code, reason_note, state,
      challenge_version_at_proposal::text, booking_version_at_proposal::text,
      session_version_at_proposal::text, slot_version_at_proposal::text,
      proposed_at, confirmed_at, version::text
    from competition.challenge_mutual_reschedule_requests
    where request_id = ${requestId}::uuid
    ${lock ? sql`for update` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function currentMutualRescheduleRequest(
  database: Kysely<Database> | Transaction<Database>,
  challengeId: string,
  challengeVersion: number,
): Promise<MutualChallengeRescheduleRequestRow | null> {
  const result = await sql<MutualChallengeRescheduleRequestRow>`
    select request_id, challenge_id, booking_id, session_id,
      proposed_by_user_id, confirmed_by_user_id, reason_code, reason_note, state,
      challenge_version_at_proposal::text, booking_version_at_proposal::text,
      session_version_at_proposal::text, slot_version_at_proposal::text,
      proposed_at, confirmed_at, version::text
    from competition.challenge_mutual_reschedule_requests
    where challenge_id = ${challengeId}::uuid
      and challenge_version_at_proposal = ${challengeVersion}
      and state = 'PROPOSED'
    limit 1
  `.execute(database);
  return result.rows[0] ?? null;
}

async function mutualRescheduleResourceForUpdate(
  transaction: Transaction<Database>,
  challengeId: string,
  state: ChallengeState,
): Promise<MutualChallengeRescheduleResourceRow | null> {
  if (state === 'ACCEPTED_UNSCHEDULED') return null;
  if (state === 'BOOKING_PENDING') {
    const result = await sql<MutualChallengeRescheduleResourceRow>`
      select booking.booking_id, booking.state as booking_state,
        booking.version::text as booking_version,
        slot.slot_id, slot.state as slot_state, slot.version::text as slot_version,
        null::uuid as session_id, null::text as session_state,
        null::text as session_version, null::timestamptz as actual_start_at,
        (booking.commercial_terms_snapshot ->> 'coachUserId')::uuid as coach_user_id
      from scheduling.bookings booking
      join scheduling.slots slot on slot.slot_id = booking.slot_id
      where booking.challenge_id = ${challengeId}::uuid
        and booking.state in ('SELECTING', 'HOST_CONFIRMATION_PENDING')
      order by booking.created_at desc, booking.booking_id desc
      limit 1
      for update of booking
    `.execute(transaction);
    return result.rows[0] ?? null;
  }
  if (state === 'BOOKED') {
    const result = await sql<MutualChallengeRescheduleResourceRow>`
      select booking.booking_id, booking.state as booking_state,
        booking.version::text as booking_version,
        slot.slot_id, slot.state as slot_state, slot.version::text as slot_version,
        session.session_id, session.state as session_state,
        session.version::text as session_version, session.actual_start_at,
        session.coach_user_id
      from scheduling.sessions session
      join scheduling.bookings booking on booking.booking_id = session.booking_id
      join scheduling.slots slot on slot.slot_id = booking.slot_id
      where session.challenge_id = ${challengeId}::uuid
        and booking.challenge_id = ${challengeId}::uuid
        and booking.state = 'CONFIRMED_PAIR'
        and session.state in ('SCHEDULED', 'READY_FOR_COACH')
        and session.actual_start_at is null
        and slot.state = 'BOOKED'
      order by session.created_at desc, session.session_id desc
      limit 1
      for update of session, booking, slot
    `.execute(transaction);
    return result.rows[0] ?? null;
  }
  return null;
}

async function assertChallengeCompetitionOperational(
  database: Kysely<Database> | Transaction<Database>,
  competitionId: string,
): Promise<void> {
  const result = await sql<{
    readonly competition_availability: string;
    readonly community_state: string;
    readonly status_review_hold_active: boolean;
  }>`
    select competition.availability as competition_availability,
      community.state as community_state,
      exists (
        select 1 from competition.process_holds as process_hold
        where process_hold.aggregate_type = 'COMPETITION'
          and process_hold.aggregate_id = competition.competition_id
          and process_hold.reason = 'STATUS_REVIEW' and process_hold.state = 'ACTIVE'
      ) as status_review_hold_active
    from competition.competitions as competition
    join community.communities as community
      on community.community_id = competition.community_id
    where competition.competition_id = ${competitionId}::uuid
  `.execute(database);
  const state = result.rows[0];
  if (state?.community_state !== 'ACTIVE') {
    throw new ChallengeConflictError('COMMUNITY_NOT_ACTIVE');
  }
  if (state.competition_availability !== 'ACTIVE') {
    throw new ChallengeConflictError('COMPETITION_NOT_ACTIVE');
  }
  if (state.status_review_hold_active) {
    throw new ChallengeConflictError('COMPETITION_NOT_ACTIVE');
  }
}

export async function readChatChallenge(
  database: Kysely<Database>,
  sourceChatId: string,
  viewerUserId: string,
): Promise<ChatChallengeProjection> {
  const accessResult = await sql<{ readonly scope: 'PERSONAL_MATCH' | 'CHALLENGE_SERVICE' }>`
    select chat.scope
    from social.chats as chat
    join social.chat_participants as participant
      on participant.chat_id = chat.chat_id
      and participant.user_id = ${viewerUserId}::uuid
    where chat.chat_id = ${sourceChatId}::uuid and chat.state = 'OPEN'
  `.execute(database);
  const access = accessResult.rows[0];
  if (!access) throw new ChallengeConflictError('MATCH_REQUIRED');
  const latestResult = await sql<{ readonly challenge_id: string }>`
    select challenge_id from competition.challenges
    where source_chat_id = ${sourceChatId}::uuid
    order by created_at desc, challenge_id desc
    limit 1
  `.execute(database);
  const latestId = latestResult.rows[0]?.challenge_id;
  const latest = latestId ? projection(await challengeRow(database, latestId), viewerUserId) : null;
  const mutualRequest = latest
    ? await currentMutualRescheduleRequest(database, latest.challengeId, latest.version)
    : null;
  let createDenialCode: ChallengeConflictCode | null = null;
  if (access.scope === 'CHALLENGE_SERVICE') {
    createDenialCode = 'PAIR_CHALLENGE_EXISTS';
  } else {
    try {
      const creation = await creationContext(database, sourceChatId, viewerUserId);
      assertCreationContext(creation);
      await assertCreationYouthPolicy(database, creation);
    } catch (error) {
      if (!(error instanceof ChallengeConflictError)) throw error;
      createDenialCode = error.code;
    }
  }
  return {
    challenge: latest,
    mutualRescheduleRequest: mutualRequest
      ? mutualRescheduleRequestProjection(mutualRequest)
      : null,
    canCreate: createDenialCode === null,
    createDenialCode,
    policyVersion: CHALLENGE_POLICY_VERSION,
  };
}

export async function createDirectOpenChallenge(
  database: Kysely<Database>,
  command: CommandEnvelope<CreateDirectChallengePayload>,
  ids: CreateChallengeEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<ChallengeProjection>> {
  if (command.actor.id === null || command.aggregateType !== 'Challenge') {
    throw new ChallengeConflictError('MATCH_REQUIRED');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const preliminaryMatch = await matchContext(transaction, command.payload.sourceChatId, command.actor.id!);
      await lockSocialPair(transaction, preliminaryMatch.pair_low_id, preliminaryMatch.pair_high_id);
      const creation = await creationContext(transaction, command.payload.sourceChatId, command.actor.id!);
      assertCreationContext(creation);
      await assertCreationYouthPolicy(transaction, creation);
      const responseDeadline = optionalChallengeResponseDeadline(context.occurredAt);
      const reminderDeadlines = optionalChallengeReminderDeadlines(context.occurredAt);
      const pair = normalizeSocialPair(creation.initiator.user_id, creation.recipient.user_id);

      await sql`
        insert into social.chats (chat_id, scope, state, version, created_at, updated_at)
        values (${ids.serviceChatId}::uuid, 'CHALLENGE_SERVICE', 'OPEN', 1,
          ${context.occurredAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz)
      `.execute(transaction);
      await sql`
        insert into social.chat_participants (chat_id, user_id, joined_at)
        values
          (${ids.serviceChatId}::uuid, ${pair.lowUserId}::uuid, ${context.occurredAt.toISOString()}::timestamptz),
          (${ids.serviceChatId}::uuid, ${pair.highUserId}::uuid, ${context.occurredAt.toISOString()}::timestamptz)
      `.execute(transaction);
      await sql`
        insert into competition.ruleset_snapshots (
          ruleset_snapshot_id, competition_id, community_configuration_id,
          ruleset_ref, ruleset_ack_mode, policy_version, created_at
        ) values (
          ${ids.rulesetSnapshotId}::uuid, ${creation.competition.competition_id}::uuid,
          ${creation.competition.configuration_id}::uuid, ${creation.competition.ruleset_ref},
          ${creation.competition.ruleset_ack_mode}, ${CHALLENGE_POLICY_VERSION},
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        insert into competition.challenges (
          challenge_id, competition_id, source_match_id, source_chat_id, service_chat_id,
          initiator_user_id, recipient_user_id, pair_low_id, pair_high_id,
          response_policy, stake, state, ruleset_snapshot_id, response_deadline_at,
          version, created_at, updated_at
        ) values (
          ${command.aggregateId}::uuid, ${creation.competition.competition_id}::uuid,
          ${creation.match.match_id}::uuid, ${creation.match.source_chat_id}::uuid,
          ${ids.serviceChatId}::uuid, ${creation.initiator.user_id}::uuid,
          ${creation.recipient.user_id}::uuid, ${pair.lowUserId}::uuid, ${pair.highUserId}::uuid,
          'OPTIONAL', 'NONE', 'AWAITING_RESPONSE', ${ids.rulesetSnapshotId}::uuid,
          ${responseDeadline.toISOString()}::timestamptz, ${context.nextVersion},
          ${context.occurredAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        insert into competition.challenge_ruleset_acknowledgments (
          acknowledgment_id, challenge_id, user_id, ruleset_snapshot_id, mode, acknowledged_at
        ) values (
          ${ids.acknowledgmentId}::uuid, ${command.aggregateId}::uuid,
          ${creation.initiator.user_id}::uuid, ${ids.rulesetSnapshotId}::uuid,
          'IMPLICIT_ON_CREATE', ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      const response = projection(await challengeRow(transaction, command.aggregateId), command.actor.id!);
      return {
        responseStatus: 201,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'ChallengeCreated',
          schemaVersion: 1,
          transitionId: 'CH-01',
          payload: {
            challengeId: response.challengeId,
            competitionId: response.competitionId,
            participants: [response.initiatorUserId, response.recipientUserId],
            responsePolicy: 'OPTIONAL',
            stake: 'NONE',
            responseDeadlineAt: response.responseDeadlineAt,
          },
          metadata: { policyVersion: CHALLENGE_POLICY_VERSION, rulesetSnapshotId: ids.rulesetSnapshotId },
        },
        relatedEvents: [{
          eventId: ids.serviceChatEventId,
          eventName: 'ChatOpened',
          schemaVersion: 1,
          transitionId: 'CT-01',
          aggregateType: 'Chat',
          aggregateId: ids.serviceChatId,
          aggregateVersion: 1,
          payload: { chatId: ids.serviceChatId, scope: 'CHALLENGE_SERVICE', challengeId: response.challengeId, participants: [pair.lowUserId, pair.highUserId] },
          metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
        }],
        audit: {
          auditId: ids.auditId,
          action: 'CREATE_DIRECT_OPEN_CHALLENGE',
          transitionId: 'CH-01',
          reasonCode: null,
          beforeState: null,
          afterState: 'AWAITING_RESPONSE',
          metadata: { sourceChatId: response.sourceChatId, serviceChatId: response.serviceChatId },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'competition.challenge.created.v1',
            payload: {
              challengeId: response.challengeId,
              reminderDeadlines: reminderDeadlines.map((deadlineAt) => deadlineAt.toISOString()),
              timer: {
                commandType: 'EXPIRE_OPTIONAL_CHALLENGE',
                aggregateType: 'Challenge',
                aggregateId: response.challengeId,
                expectedState: 'AWAITING_RESPONSE',
                expectedVersion: response.version,
                deadlineAt: response.responseDeadlineAt,
                policyVersion: CHALLENGE_POLICY_VERSION,
                idempotencyKey: `challenge:${response.challengeId}:expire-optional:v${response.version}`,
              },
            },
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: { notifications: [{ notificationId: ids.notificationId, recipientUserId: response.recipientUserId, category: 'MANDATORY', renderKey: 'challenge.optional-received', actionTarget: { type: 'CHAT', chatId: response.sourceChatId }, payload: { challengeId: response.challengeId, initiatorDisplayName: response.initiatorDisplayName }, deadlineAt: response.responseDeadlineAt }] },
          },
        ],
      };
    },
  });
}

async function anyActiveObligation(
  transaction: Transaction<Database>,
  firstUserId: string,
  secondUserId: string,
): Promise<boolean> {
  const result = await sql<{ readonly active: boolean }>`
    select exists (
      select 1 from competition.challenge_participant_obligations
      where user_id in (${firstUserId}::uuid, ${secondUserId}::uuid) and released_at is null
    ) as active
  `.execute(transaction);
  return result.rows[0]?.active ?? false;
}

export async function acceptOptionalChallenge(
  database: Kysely<Database>,
  command: CommandEnvelope<RespondToChallengePayload>,
  ids: AcceptChallengeEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<ChallengeProjection>> {
  if (command.actor.id === null || command.aggregateType !== 'Challenge' || command.aggregateId !== command.payload.challengeId) {
    throw new ChallengeConflictError('CHALLENGE_RECIPIENT_REQUIRED');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await challengeRow(transaction, command.aggregateId, true);
      if (row.response_policy === 'MUTUAL_GENESIS') {
        throw new ChallengeConflictError('CHALLENGE_NOT_AWAITING_RESPONSE');
      }
      await lockSocialPair(transaction, row.pair_low_id, row.pair_high_id);
      for (const userId of [row.pair_low_id, row.pair_high_id]) {
        await sql`select pg_advisory_xact_lock(hashtextextended(${`challenge-obligation:${userId}`}, 0))`.execute(transaction);
      }
      const activeObligation = await anyActiveObligation(transaction, row.pair_low_id, row.pair_high_id);
      assertOptionalChallengeCanBeAccepted({
        state: row.state,
        actorUserId: command.actor.id!,
        recipientUserId: row.recipient_user_id,
        responseDeadlineAt: row.response_deadline_at,
        occurredAt: context.occurredAt,
        rulesetAckMode: row.ruleset_ack_mode,
        explicitRulesetAcknowledged: command.payload.explicitRulesetAcknowledged ?? false,
        participantHasActiveObligation: activeObligation,
      });
      const competition = await competitionContext(transaction, row.pair_low_id, row.pair_high_id);
      if (competition.competition_id !== row.competition_id) {
        throw new ChallengeConflictError('MEMBERSHIP_NOT_ACTIVE');
      }
      const initiator = await athleteEligibility(transaction, row.initiator_user_id, competition.community_id);
      const recipient = await athleteEligibility(transaction, row.recipient_user_id, competition.community_id);
      if (row.response_policy === 'OPTIONAL') {
        await matchContext(transaction, row.source_chat_id, command.actor.id!);
      }
      if (initiator.account_state !== 'ACTIVE' || recipient.account_state !== 'ACTIVE') throw new ChallengeConflictError('ACCOUNT_NOT_ACTIVE');
      if (!initiator.verified || !recipient.verified) throw new ChallengeConflictError('ACCOUNT_NOT_VERIFIED');
      if (initiator.age_division !== recipient.age_division) throw new ChallengeConflictError('AGE_CONTOUR_MISMATCH');
      if (!initiator.membership_active || !recipient.membership_active) throw new ChallengeConflictError('MEMBERSHIP_NOT_ACTIVE');
      if (competition.community_state !== 'ACTIVE') throw new ChallengeConflictError('COMMUNITY_NOT_ACTIVE');
      if (competition.competition_availability !== 'ACTIVE') throw new ChallengeConflictError('COMPETITION_NOT_ACTIVE');
      if (row.response_policy === 'OPTIONAL') {
        if (
          participantStatus(competition, initiator.user_id) === 'CONTENDER'
          || participantStatus(competition, recipient.user_id) !== 'ORDINARY'
        ) throw new ChallengeConflictError('PAIR_MATRIX_DENIED');
      } else if (
        row.stake !== 'CONTENDER'
        || participantStatus(competition, initiator.user_id) !== 'ORDINARY'
        || participantStatus(competition, recipient.user_id) !== 'CONTENDER'
      ) {
        throw new ChallengeConflictError('PAIR_MATRIX_DENIED');
      }
      const pairSafety = await sql<{
        readonly pair_blocked: boolean;
        readonly pair_cooldown_active: boolean;
      }>`
        select
          exists (select 1 from social.blocks where state = 'ACTIVE' and (
            (blocker_user_id = ${row.pair_low_id}::uuid and blocked_user_id = ${row.pair_high_id}::uuid)
            or (blocker_user_id = ${row.pair_high_id}::uuid and blocked_user_id = ${row.pair_low_id}::uuid)
          )) as pair_blocked,
          exists (select 1 from competition.pair_cooldowns
            where competition_id = ${row.competition_id}::uuid
              and pair_low_id = ${row.pair_low_id}::uuid and pair_high_id = ${row.pair_high_id}::uuid
              and invalidated_at is null and ends_at > clock_timestamp()) as pair_cooldown_active
      `.execute(transaction);
      if (row.response_policy === 'OPTIONAL' && pairSafety.rows[0]?.pair_blocked) {
        throw new ChallengeConflictError('PAIR_BLOCKED');
      }
      if (pairSafety.rows[0]?.pair_cooldown_active) throw new ChallengeConflictError('PAIR_COOLDOWN_ACTIVE');
      await assertYouthChallengeConsentReady(
        transaction,
        row.challenge_id,
        [row.pair_low_id, row.pair_high_id],
        context.occurredAt,
      );
      const schedulingDeadline = acceptedChallengeSchedulingDeadline(context.occurredAt);
      await sql`
        update competition.challenges
        set state = 'ACCEPTED_UNSCHEDULED', accepted_at = ${context.occurredAt.toISOString()}::timestamptz,
          scheduling_deadline_at = ${schedulingDeadline.toISOString()}::timestamptz,
          version = ${context.nextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where challenge_id = ${row.challenge_id}::uuid and state = 'AWAITING_RESPONSE'
      `.execute(transaction);
      await sql`
        update governance.youth_challenge_consents
        set expires_at = ${schedulingDeadline.toISOString()}::timestamptz,
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where challenge_id = ${row.challenge_id}::uuid and state = 'GRANTED'
      `.execute(transaction);
      await sql`
        insert into competition.challenge_ruleset_acknowledgments (
          acknowledgment_id, challenge_id, user_id, ruleset_snapshot_id, mode, acknowledged_at
        ) values (
          ${ids.acknowledgmentId}::uuid, ${row.challenge_id}::uuid, ${row.recipient_user_id}::uuid,
          ${row.ruleset_snapshot_id}::uuid,
          ${row.ruleset_ack_mode === 'EXPLICIT_ACK_REQUIRED' ? 'EXPLICIT' : 'IMPLICIT_ON_ACCEPT'},
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        insert into competition.challenge_participant_obligations (
          obligation_id, challenge_id, user_id, accepted_at
        ) values
          (${ids.obligationIds[0]}::uuid, ${row.challenge_id}::uuid, ${row.pair_low_id}::uuid, ${context.occurredAt.toISOString()}::timestamptz),
          (${ids.obligationIds[1]}::uuid, ${row.challenge_id}::uuid, ${row.pair_high_id}::uuid, ${context.occurredAt.toISOString()}::timestamptz)
      `.execute(transaction);
      const response = projection(await challengeRow(transaction, row.challenge_id), command.actor.id!);
      return {
        responseStatus: 200,
        response,
        event: { eventId: ids.eventId, eventName: 'ChallengeAccepted', schemaVersion: 1, transitionId: 'CH-02', payload: { challengeId: response.challengeId, acceptedAt: response.acceptedAt, schedulingDeadlineAt: response.schedulingDeadlineAt, participants: [row.pair_low_id, row.pair_high_id] }, metadata: { policyVersion: CHALLENGE_POLICY_VERSION, rulesetSnapshotId: row.ruleset_snapshot_id } },
        audit: { auditId: ids.auditId, action: row.response_policy === 'MANDATORY' ? 'ACCEPT_MANDATORY_CHALLENGE' : 'ACCEPT_OPTIONAL_CHALLENGE', transitionId: 'CH-02', reasonCode: null, beforeState: row.state, afterState: 'ACCEPTED_UNSCHEDULED', metadata: { schedulingDeadlineAt: response.schedulingDeadlineAt } },
        outbox: [
          { messageId: ids.outboxMessageId, topic: 'competition.challenge.accepted.v1', payload: { challengeId: response.challengeId, timer: { commandType: 'EXPIRE_CHALLENGE_SCHEDULING', aggregateType: 'Challenge', aggregateId: response.challengeId, deadlineAt: response.schedulingDeadlineAt, expectedState: 'ACCEPTED_UNSCHEDULED', expectedVersion: response.version, policyVersion: CHALLENGE_POLICY_VERSION, idempotencyKey: `challenge:${response.challengeId}:expire-scheduling:v${response.version}` } } },
          { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1', payload: { notifications: [{ notificationId: ids.notificationId, recipientUserId: row.initiator_user_id, category: 'MANDATORY', renderKey: row.response_policy === 'MANDATORY' ? 'challenge.mandatory-accepted' : 'challenge.optional-accepted', actionTarget: { type: 'CHALLENGE', challengeId: response.challengeId }, payload: { recipientDisplayName: row.recipient_display_name }, deadlineAt: response.schedulingDeadlineAt }] } },
        ],
      };
    },
  });
}

async function recordMandatoryResponseForfeit(input: {
  readonly transaction: Transaction<Database>;
  readonly row: ChallengeRow;
  readonly ids: ChallengeEffectIds;
  readonly occurredAt: Date;
  readonly nextChallengeVersion: number;
  readonly recordedByUserId: string | null;
  readonly reason: 'DECLINED' | 'EXPIRED';
}): Promise<{
  readonly response: ChallengeProjection;
  readonly event: {
    readonly eventId: string;
    readonly eventName: string;
    readonly schemaVersion: 1;
    readonly transitionId: string;
    readonly payload: Readonly<Record<string, unknown>>;
    readonly metadata: Readonly<Record<string, unknown>>;
  };
  readonly relatedEvents: readonly {
    readonly eventId: string;
    readonly eventName: string;
    readonly schemaVersion: 1;
    readonly aggregateType: string;
    readonly aggregateId: string;
    readonly aggregateVersion: number;
    readonly transitionId: string | null;
    readonly payload: Readonly<Record<string, unknown>>;
    readonly metadata: Readonly<Record<string, unknown>>;
  }[];
  readonly audit: {
    readonly auditId: string;
    readonly action: string;
    readonly transitionId: string;
    readonly reasonCode: string;
    readonly beforeState: string;
    readonly afterState: string;
    readonly metadata: Readonly<Record<string, unknown>>;
  };
  readonly outbox: readonly {
    readonly messageId: string;
    readonly topic: string;
    readonly sourceEventId?: string;
    readonly payload: Readonly<Record<string, unknown>>;
  }[];
}> {
  const { transaction, row, ids, occurredAt, nextChallengeVersion, recordedByUserId, reason } = input;
  const required = administrativeForfeitIds(ids);
  const competitionResult = await sql<AdministrativeForfeitContextRow & {
    readonly phase: string;
    readonly availability: string;
    readonly community_active: boolean;
  }>`
    select competition.competition_id, competition.version::text as competition_version,
      competition.status_version::text as status_version,
      competition.champion_user_id, competition.contender_user_id,
      competition.status_lock_result_id, competition.integrity_hold_case_id,
      exists (
        select 1 from competition.process_holds as process_hold
        where process_hold.aggregate_type = 'COMPETITION'
          and process_hold.aggregate_id = competition.competition_id
          and process_hold.reason = 'STATUS_REVIEW' and process_hold.state = 'ACTIVE'
      ) as status_review_hold_active,
      competition.phase, competition.availability,
      community.state = 'ACTIVE' as community_active,
      configuration.pair_cooldown_days
    from competition.competitions as competition
    join community.communities as community on community.community_id = competition.community_id
    join community.community_configuration_versions as configuration
      on configuration.configuration_id = community.configuration_id
    where competition.competition_id = ${row.competition_id}::uuid
    for update of competition
  `.execute(transaction);
  const competition = competitionResult.rows[0];
  if (
    !competition
    || competition.phase !== 'RUNNING'
    || competition.availability !== 'ACTIVE'
    || !competition.community_active
    || competition.integrity_hold_case_id !== null
    || competition.status_review_hold_active
    || competition.status_lock_result_id !== null
    || competition.contender_user_id !== row.recipient_user_id
    || competition.champion_user_id === row.initiator_user_id
  ) {
    throw new ChallengeConflictError('COMPETITION_NOT_ACTIVE');
  }
  const transition = deriveProvisionalStatusTransition({
    stake: 'CONTENDER',
    outcomeCode: 'FORFEIT',
    winnerUserId: row.initiator_user_id,
    loserUserId: row.recipient_user_id,
    snapshot: {
      championUserId: competition.champion_user_id,
      contenderUserId: competition.contender_user_id,
      statusVersion: Number(competition.status_version),
    },
  });
  if (!transition.locksStatus || transition.type !== 'CONTENDER_TRANSFERRED') {
    throw new ChallengeConflictError('PAIR_MATRIX_DENIED');
  }
  const appealDeadlineAt = resultAppealDeadline(occurredAt);
  const reasonCode = reason === 'DECLINED'
    ? 'MANDATORY_RESPONSE_DECLINED'
    : 'MANDATORY_RESPONSE_EXPIRED';
  const comment = reason === 'DECLINED'
    ? 'The current Contender explicitly declined the mandatory status Challenge.'
    : 'The current Contender did not answer the mandatory status Challenge before its deadline.';
  const preStatus = {
    championUserId: transition.before.championUserId,
    contenderUserId: transition.before.contenderUserId,
    statusVersion: transition.before.statusVersion,
  };
  await sql`
    insert into competition.results (
      result_id, challenge_id, session_id, competitive_snapshot_id,
      cycle_no, origin, state, recorded_outcome_code,
      winner_user_id, loser_user_id, reason_code, comment,
      method_code, method_text, score_payload, method_payload,
      actual_time, venue_id, coach_user_id, recorded_by, recorded_at,
      appeal_deadline_at, pre_status_snapshot, status_transition_event_id,
      version, updated_at
    ) values (
      ${required.resultId}::uuid, ${row.challenge_id}::uuid, null, null,
      ${row.cycle_no}, 'ADMINISTRATIVE_FORFEIT', 'RECORDED', 'FORFEIT',
      ${row.initiator_user_id}::uuid, ${row.recipient_user_id}::uuid,
      ${reasonCode}, ${comment}, null, null, null, null,
      ${occurredAt.toISOString()}::timestamptz, null, null,
      ${recordedByUserId}::uuid, ${occurredAt.toISOString()}::timestamptz,
      ${appealDeadlineAt.toISOString()}::timestamptz,
      ${JSON.stringify(preStatus)}::jsonb, ${required.statusEventId}::uuid,
      1, ${occurredAt.toISOString()}::timestamptz
    )
  `.execute(transaction);
  await sql`
    update competition.challenges
    set state = 'RESULT_RECORDED', decided_at = ${occurredAt.toISOString()}::timestamptz,
      version = ${nextChallengeVersion}, updated_at = ${occurredAt.toISOString()}::timestamptz
    where challenge_id = ${row.challenge_id}::uuid and state = 'AWAITING_RESPONSE'
  `.execute(transaction);
  const competitionAggregateVersion = Number(competition.competition_version) + 1;
  await sql`
    update competition.competitions
    set champion_user_id = ${transition.after.championUserId}::uuid,
      contender_user_id = ${transition.after.contenderUserId}::uuid,
      status_version = ${transition.after.statusVersion},
      status_lock_result_id = ${required.resultId}::uuid,
      version = ${competitionAggregateVersion},
      updated_at = ${occurredAt.toISOString()}::timestamptz
    where competition_id = ${competition.competition_id}::uuid
      and status_version = ${transition.before.statusVersion}
      and status_lock_result_id is null
  `.execute(transaction);
  await sql`
    insert into competition.status_transitions (
      transition_id, source_result_id, source_event_id, competition_id,
      transition_type, before_champion_user_id, before_contender_user_id,
      before_status_version, after_champion_user_id, after_contender_user_id,
      after_status_version, competitive_snapshot_id, provisional, applied_at
    ) values (
      ${required.statusTransitionId}::uuid, ${required.resultId}::uuid,
      ${required.resultEventId}::uuid, ${competition.competition_id}::uuid,
      ${transition.type}, ${transition.before.championUserId}::uuid,
      ${transition.before.contenderUserId}::uuid, ${transition.before.statusVersion},
      ${transition.after.championUserId}::uuid, ${transition.after.contenderUserId}::uuid,
      ${transition.after.statusVersion}, null, true,
      ${occurredAt.toISOString()}::timestamptz
    )
  `.execute(transaction);
  const cooldownEndsAt = new Date(
    occurredAt.getTime() + competition.pair_cooldown_days * 24 * 60 * 60 * 1_000,
  );
  await sql`
    insert into competition.pair_cooldowns (
      cooldown_id, competition_id, pair_low_id, pair_high_id,
      source_result_id, started_at, ends_at
    ) values (
      ${required.cooldownId}::uuid, ${competition.competition_id}::uuid,
      ${row.pair_low_id}::uuid, ${row.pair_high_id}::uuid,
      ${required.resultId}::uuid, ${occurredAt.toISOString()}::timestamptz,
      ${cooldownEndsAt.toISOString()}::timestamptz
    )
  `.execute(transaction);
  const response = projection(await challengeRow(transaction, row.challenge_id), row.initiator_user_id);
  const transitionId = reason === 'DECLINED' ? 'CH-04' : 'CH-07';
  const eventName = reason === 'DECLINED'
    ? 'MandatoryChallengeRefused'
    : 'MandatoryChallengeExpired';
  const canonicalPayload = {
    resultId: required.resultId,
    challengeId: row.challenge_id,
    sessionId: null,
    origin: 'ADMINISTRATIVE_FORFEIT',
    competitiveContextSnapshotId: null,
    outcomeCode: 'FORFEIT',
    winnerUserId: row.initiator_user_id,
    loserUserId: row.recipient_user_id,
    reasonCode,
    actualTime: occurredAt.toISOString(),
    venueId: null,
    coachUserId: null,
    appealDeadlineAt: appealDeadlineAt.toISOString(),
    preStatus,
    stake: 'CONTENDER',
  };
  return {
    response,
    event: {
      eventId: ids.eventId,
      eventName,
      schemaVersion: 1,
      transitionId,
      payload: { ...canonicalPayload, responseDeadlineAt: row.response_deadline_at.toISOString() },
      metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
    },
    relatedEvents: [
      {
        eventId: required.resultEventId,
        eventName: 'ResultRecorded',
        schemaVersion: 1,
        aggregateType: 'Result',
        aggregateId: required.resultId,
        aggregateVersion: 1,
        transitionId: 'R-01',
        payload: canonicalPayload,
        metadata: { policyVersion: RESULT_POLICY_VERSION },
      },
      {
        eventId: required.cooldownEventId,
        eventName: 'PairCooldownStarted',
        schemaVersion: 1,
        aggregateType: 'PairCooldown',
        aggregateId: required.cooldownId,
        aggregateVersion: 1,
        transitionId: 'CD-01',
        payload: {
          cooldownId: required.cooldownId,
          competitionId: competition.competition_id,
          participantIds: [row.pair_low_id, row.pair_high_id],
          sourceResultId: required.resultId,
          startedAt: occurredAt.toISOString(),
          endsAt: cooldownEndsAt.toISOString(),
        },
        metadata: { policyVersion: RESULT_POLICY_VERSION },
      },
      {
        eventId: required.statusEventId,
        eventName: transition.eventName!,
        schemaVersion: 1,
        aggregateType: 'Competition',
        aggregateId: competition.competition_id,
        aggregateVersion: competitionAggregateVersion,
        transitionId: transition.transitionId,
        payload: {
          transitionId: required.statusTransitionId,
          sourceResultId: required.resultId,
          sourceEventId: required.resultEventId,
          competitionId: competition.competition_id,
          before: transition.before,
          after: transition.after,
          transitionType: transition.type,
          provisional: true,
          participantIds: [row.pair_low_id, row.pair_high_id],
          snapshotId: null,
        },
        metadata: { policyVersion: RESULT_POLICY_VERSION },
      },
    ],
    audit: {
      auditId: ids.auditId,
      action: eventName,
      transitionId,
      reasonCode,
      beforeState: row.state,
      afterState: 'RESULT_RECORDED',
      metadata: { resultId: required.resultId, statusTransitionType: transition.type },
    },
    outbox: [
      {
        messageId: ids.outboxMessageId,
        topic: 'competition.result.recorded.v1',
        sourceEventId: required.resultEventId,
        payload: {
          ...canonicalPayload,
          timer: {
            commandType: 'FINALIZE_RESULT',
            aggregateType: 'Result',
            aggregateId: required.resultId,
            expectedState: 'RECORDED',
            expectedVersion: 1,
            deadlineAt: appealDeadlineAt.toISOString(),
            policyVersion: RESULT_POLICY_VERSION,
            idempotencyKey: `result:${required.resultId}:finalize:v1`,
          },
        },
      },
      {
        messageId: ids.notificationOutboxMessageId,
        topic: 'notification.in_app.v1',
        payload: {
          notifications: [row.initiator_user_id, row.recipient_user_id].map(
            (recipientUserId, index) => ({
              notificationId: required.notificationIds[index]!,
              recipientUserId,
              category: 'MANDATORY',
              renderKey: 'result.administrative-forfeit-recorded',
              actionTarget: { type: 'RESULT', resultId: required.resultId },
              payload: { challengeId: row.challenge_id, reasonCode, provisional: true },
              deadlineAt: appealDeadlineAt.toISOString(),
            }),
          ),
        },
      },
    ],
  };
}

export async function declineOptionalChallenge(
  database: Kysely<Database>,
  command: CommandEnvelope<RespondToChallengePayload>,
  ids: DeclineChallengeEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<ChallengeProjection>> {
  if (command.actor.id === null || command.aggregateType !== 'Challenge' || command.aggregateId !== command.payload.challengeId) {
    throw new ChallengeConflictError('CHALLENGE_RECIPIENT_REQUIRED');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await challengeRow(transaction, command.aggregateId, true);
      if (row.response_policy === 'MANDATORY') {
        assertMandatoryChallengeCanBeDeclined({
          state: row.state,
          actorUserId: command.actor.id!,
          recipientUserId: row.recipient_user_id,
          responseDeadlineAt: row.response_deadline_at,
          occurredAt: context.occurredAt,
        });
        const effect = await recordMandatoryResponseForfeit({
          transaction,
          row,
          ids,
          occurredAt: context.occurredAt,
          nextChallengeVersion: context.nextVersion,
          recordedByUserId: command.actor.id!,
          reason: 'DECLINED',
        });
        return { responseStatus: 200, ...effect };
      }
      if (row.response_policy === 'MUTUAL_GENESIS') {
        throw new ChallengeConflictError('CHALLENGE_NOT_AWAITING_RESPONSE');
      }
      assertOptionalChallengeCanBeDeclined(row.state, command.actor.id!, row.recipient_user_id);
      const quietUntil = optionalChallengePairQuietEndsAt(context.occurredAt);
      await sql`update competition.challenges set state = 'DECLINED', decided_at = ${context.occurredAt.toISOString()}::timestamptz, version = ${context.nextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz where challenge_id = ${row.challenge_id}::uuid and state = 'AWAITING_RESPONSE'`.execute(transaction);
      await sql`insert into competition.optional_pair_quiet_periods (quiet_period_id, competition_id, pair_low_id, pair_high_id, source_challenge_id, reason, started_at, ends_at) values (${ids.quietPeriodId}::uuid, ${row.competition_id}::uuid, ${row.pair_low_id}::uuid, ${row.pair_high_id}::uuid, ${row.challenge_id}::uuid, 'OPTIONAL_DECLINED', ${context.occurredAt.toISOString()}::timestamptz, ${quietUntil.toISOString()}::timestamptz)`.execute(transaction);
      const response = projection(await challengeRow(transaction, row.challenge_id), command.actor.id!);
      return {
        responseStatus: 200,
        response,
        event: { eventId: ids.eventId, eventName: 'ChallengeDeclined', schemaVersion: 1, transitionId: 'CH-03', payload: { challengeId: row.challenge_id, quietUntil: quietUntil.toISOString(), noLoss: true }, metadata: { policyVersion: CHALLENGE_POLICY_VERSION } },
        audit: { auditId: ids.auditId, action: 'DECLINE_OPTIONAL_CHALLENGE', transitionId: 'CH-03', reasonCode: null, beforeState: row.state, afterState: 'DECLINED', metadata: { quietUntil: quietUntil.toISOString(), noLoss: true } },
        outbox: [
          { messageId: ids.outboxMessageId, topic: 'competition.challenge.declined.v1', payload: { challengeId: row.challenge_id, quietUntil: quietUntil.toISOString() } },
          { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1', payload: { notifications: [{ notificationId: ids.notificationId, recipientUserId: row.initiator_user_id, category: 'SOCIAL', renderKey: 'challenge.optional-declined', actionTarget: { type: 'CHAT', chatId: row.source_chat_id }, payload: { challengeId: row.challenge_id, noLoss: true }, deadlineAt: null }] } },
        ],
      };
    },
  });
}

export async function withdrawOptionalChallenge(
  database: Kysely<Database>,
  command: CommandEnvelope<RespondToChallengePayload>,
  ids: ChallengeEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<ChallengeProjection>> {
  if (command.actor.id === null || command.aggregateType !== 'Challenge' || command.aggregateId !== command.payload.challengeId) {
    throw new ChallengeConflictError('CHALLENGE_INITIATOR_REQUIRED');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await challengeRow(transaction, command.aggregateId, true);
      if (row.response_policy === 'MUTUAL_GENESIS') {
        throw new ChallengeConflictError('CHALLENGE_NOT_AWAITING_RESPONSE');
      }
      assertOptionalChallengeCanBeWithdrawn(row.state, command.actor.id!, row.initiator_user_id);
      await sql`update competition.challenges set state = 'WITHDRAWN', decided_at = ${context.occurredAt.toISOString()}::timestamptz, version = ${context.nextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz where challenge_id = ${row.challenge_id}::uuid and state = 'AWAITING_RESPONSE'`.execute(transaction);
      const response = projection(await challengeRow(transaction, row.challenge_id), command.actor.id!);
      return {
        responseStatus: 200,
        response,
        event: { eventId: ids.eventId, eventName: 'ChallengeWithdrawn', schemaVersion: 1, transitionId: 'CH-05', payload: { challengeId: row.challenge_id, noLoss: true }, metadata: { policyVersion: CHALLENGE_POLICY_VERSION } },
        audit: { auditId: ids.auditId, action: row.response_policy === 'MANDATORY' ? 'WITHDRAW_MANDATORY_CHALLENGE' : 'WITHDRAW_OPTIONAL_CHALLENGE', transitionId: 'CH-05', reasonCode: null, beforeState: row.state, afterState: 'WITHDRAWN', metadata: { noLoss: true } },
        outbox: [
          { messageId: ids.outboxMessageId, topic: 'competition.challenge.withdrawn.v1', payload: { challengeId: row.challenge_id, competitionId: row.competition_id, responsePolicy: row.response_policy } },
          { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1', payload: { notifications: [{ notificationId: ids.notificationId, recipientUserId: row.recipient_user_id, category: row.response_policy === 'MANDATORY' ? 'MANDATORY' : 'SOCIAL', renderKey: row.response_policy === 'MANDATORY' ? 'challenge.mandatory-withdrawn' : 'challenge.optional-withdrawn', actionTarget: { type: 'CHAT', chatId: row.source_chat_id }, payload: { challengeId: row.challenge_id, noLoss: true }, deadlineAt: null }] } },
        ],
      };
    },
  });
}

export async function rescheduleChallengeByAthlete(
  database: Kysely<Database>,
  command: CommandEnvelope<RescheduleChallengeByAthletePayload>,
  ids: AthleteChallengeRescheduleEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<ChallengeProjection>> {
  if (
    !command.actor.id
    || command.aggregateType !== 'Challenge'
    || command.aggregateId !== command.payload.challengeId
    || command.commandType !== 'RESCHEDULE_CHALLENGE_BY_ATHLETE'
  ) {
    throw new ChallengeConflictError('CHALLENGE_RESCHEDULE_NOT_ALLOWED');
  }
  const actorUserId = command.actor.id;
  const reason = normalizeScheduleMutationReason(command.payload);
  return executeCriticalCommand(database, {
    command: { ...command, payload: { ...command.payload, ...reason } },
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const bookingResult = await sql<{
        readonly booking_id: string;
        readonly chat_id: string;
        readonly slot_id: string;
        readonly state: 'SELECTING' | 'HOST_CONFIRMATION_PENDING';
        readonly coach_user_id: string | null;
        readonly version: string;
      }>`
        select booking_id, chat_id, slot_id, state,
          commercial_terms_snapshot ->> 'coachUserId' as coach_user_id,
          version::text as version
        from scheduling.bookings
        where challenge_id = ${command.aggregateId}::uuid
          and state in ('SELECTING', 'HOST_CONFIRMATION_PENDING')
        order by created_at desc, booking_id desc
        limit 1
        for update
      `.execute(transaction);
      const booking = bookingResult.rows[0] ?? null;
      const row = await challengeRow(transaction, command.aggregateId, true);
      if (!row.scheduling_deadline_at) {
        throw new ChallengeConflictError('CHALLENGE_RESCHEDULE_NOT_ALLOWED');
      }
      if (
        (row.state === 'BOOKING_PENDING' && booking === null)
        || (row.state === 'ACCEPTED_UNSCHEDULED' && booking !== null)
      ) {
        throw new ChallengeConflictError('CHALLENGE_BOOKING_NOT_PENDING');
      }
      await assertChallengeCompetitionOperational(transaction, row.competition_id);
      if (row.user_reschedule_count === 2) {
        const winnerUserId = challengeRescheduleLimitForfeitWinner({
          state: row.state,
          actorUserId,
          participantUserIds: [row.pair_low_id, row.pair_high_id],
          userRescheduleCount: row.user_reschedule_count,
          consequencesConfirmed: command.payload.confirmForfeit === true,
        });
        const required = administrativeForfeitIds(ids);
        if (!ids.notificationOutboxMessageId) {
          throw new TypeError('Result notification outbox ID is required');
        }
        if (booking) {
          await sql`
            update scheduling.bookings
            set state = 'CANCELLED', cancelled_at = ${context.occurredAt.toISOString()}::timestamptz,
              cancel_actor = ${command.actor.id}::uuid,
              cancel_reason = 'CHALLENGE_RESCHEDULE_LIMIT_FORFEIT',
              version = version + 1,
              updated_at = ${context.occurredAt.toISOString()}::timestamptz
            where booking_id = ${booking.booking_id}::uuid
              and state in ('SELECTING', 'HOST_CONFIRMATION_PENDING')
          `.execute(transaction);
        }
        const forfeit = await recordAdministrativeForfeit(
          transaction,
          {
            challengeId: row.challenge_id,
            loserUserId: actorUserId,
            recordedByUserId: actorUserId,
            reasonCode: 'RESCHEDULE_LIMIT_EXCEEDED',
            comment: 'The Athlete confirmed another culpable reschedule after using both allowances.',
            sourceSessionId: null,
            sourceCoachUserId: booking?.coach_user_id ?? null,
            notificationRecipientUserIds: [row.pair_low_id, row.pair_high_id],
            occurredAt: context.occurredAt,
            expectedChallengeState: row.state as 'ACCEPTED_UNSCHEDULED' | 'BOOKING_PENDING',
          },
          {
            resultId: required.resultId,
            resultEventId: required.resultEventId,
            statusTransitionId: required.statusTransitionId,
            statusEventId: required.statusEventId,
            cooldownId: required.cooldownId,
            cooldownEventId: required.cooldownEventId,
            resultOutboxMessageId: required.timerOutboxMessageId,
            notificationOutboxMessageId: ids.notificationOutboxMessageId,
            notificationIds: required.notificationIds,
          },
        );
        const response = projection(
          await challengeRow(transaction, row.challenge_id),
          actorUserId,
        );
        return {
          responseStatus: 200,
          response,
          event: {
            eventId: ids.eventId,
            eventName: 'RescheduleLimitForfeit',
            schemaVersion: 1,
            transitionId: 'CH-23',
            payload: {
              challengeId: row.challenge_id,
              resultId: forfeit.resultId,
              bookingId: booking?.booking_id ?? null,
              initiatedByUserId: actorUserId,
              winnerUserId,
              loserUserId: actorUserId,
              reasonCode: reason.reasonCode,
              userRescheduleCount: row.user_reschedule_count,
              appealDeadlineAt: forfeit.appealDeadlineAt.toISOString(),
            },
            metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
          },
          relatedEvents: [
            ...(booking ? [{
              eventId: ids.bookingEventId,
              eventName: 'BookingRequestWithdrawn',
              schemaVersion: 1,
              aggregateType: 'Booking',
              aggregateId: booking.booking_id,
              aggregateVersion: Number(booking.version) + 1,
              transitionId: 'B-04',
              payload: {
                bookingId: booking.booking_id,
                slotId: booking.slot_id,
                withdrawnByUserId: actorUserId,
                previousState: booking.state,
                cause: 'CHALLENGE_RESCHEDULE_LIMIT_FORFEIT',
              },
              metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
            }] : []),
            ...forfeit.relatedEvents,
          ],
          audit: {
            auditId: ids.auditId,
            action: 'RESCHEDULE_LIMIT_FORFEIT',
            transitionId: 'CH-23',
            reasonCode: reason.reasonCode,
            beforeState: row.state,
            afterState: 'RESULT_RECORDED',
            metadata: {
              resultId: forfeit.resultId,
              bookingId: booking?.booking_id ?? null,
              initiatedByUserId: actorUserId,
              winnerUserId,
              loserUserId: actorUserId,
              reasonNote: reason.reasonNote,
              userRescheduleCount: row.user_reschedule_count,
              statusTransitionType: forfeit.statusTransitionType,
            },
          },
          outbox: [
            {
              messageId: ids.outboxMessageId,
              topic: 'competition.challenge.reschedule-limit-forfeit.v1',
              payload: {
                challengeId: row.challenge_id,
                resultId: forfeit.resultId,
                bookingId: booking?.booking_id ?? null,
                initiatedByUserId: actorUserId,
                winnerUserId,
                loserUserId: actorUserId,
                reasonCode: reason.reasonCode,
                userRescheduleCount: row.user_reschedule_count,
                appealDeadlineAt: forfeit.appealDeadlineAt.toISOString(),
              },
            },
            ...forfeit.outbox,
            ...(booking ? [{
              messageId: ids.bookingOutboxMessageId,
              topic: 'scheduling.booking.request-withdrawn.v1',
              sourceEventId: ids.bookingEventId,
              payload: {
                bookingId: booking.booking_id,
                chatId: booking.chat_id,
                slotId: booking.slot_id,
                cause: 'CHALLENGE_RESCHEDULE_LIMIT_FORFEIT',
              },
            }] : []),
            ...(booking?.coach_user_id ? [{
              messageId: ids.hostNotificationOutboxMessageId,
              topic: 'notification.in_app.v1',
              sourceEventId: ids.bookingEventId,
              payload: {
                notifications: [{
                  notificationId: ids.notificationId,
                  recipientUserId: booking.coach_user_id,
                  category: 'SERVICE',
                  renderKey: 'challenge.reschedule-limit-forfeit-host',
                  actionTarget: { type: 'BOOKING', bookingId: booking.booking_id },
                  payload: {
                    challengeId: row.challenge_id,
                    bookingId: booking.booking_id,
                    resultId: forfeit.resultId,
                    outcomeCode: 'FORFEIT',
                  },
                  deadlineAt: null,
                }],
              },
            }] : []),
          ],
        };
      }
      const nextCount = nextAthleteChallengeRescheduleCount({
        state: row.state,
        actorUserId,
        participantUserIds: [row.pair_low_id, row.pair_high_id],
        userRescheduleCount: row.user_reschedule_count,
      });
      if (booking) {
        await sql`
          update scheduling.bookings
          set state = 'CANCELLED', version = version + 1,
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where booking_id = ${booking.booking_id}::uuid
            and state in ('SELECTING', 'HOST_CONFIRMATION_PENDING')
        `.execute(transaction);
      }
      const faultAttribution = command.actor.id === row.pair_low_id ? 'A' : 'B';
      await sql`
        insert into competition.challenge_reschedules (
          reschedule_id, challenge_id, booking_id, initiated_by_user_id,
          fault_attribution, fault_user_id, reason_code, reason_note, created_at
        ) values (
          ${ids.rescheduleId}::uuid, ${row.challenge_id}::uuid,
          ${booking?.booking_id ?? null}::uuid, ${command.actor.id}::uuid,
          ${faultAttribution}, ${command.actor.id}::uuid,
          ${reason.reasonCode}, ${reason.reasonNote},
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        update competition.challenges
        set state = 'ACCEPTED_UNSCHEDULED',
          user_reschedule_count = ${nextCount}, version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where challenge_id = ${row.challenge_id}::uuid
          and state in ('ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING')
      `.execute(transaction);
      const response = projection({
        ...row,
        state: 'ACCEPTED_UNSCHEDULED',
        user_reschedule_count: nextCount,
        version: String(context.nextVersion),
      }, command.actor.id!);
      const peerUserId = command.actor.id === row.pair_low_id
        ? row.pair_high_id
        : row.pair_low_id;
      const notifications = [
        {
          notificationId: ids.notificationIds[0],
          recipientUserId: peerUserId,
          category: 'MANDATORY',
          renderKey: 'challenge.rescheduled-by-athlete',
          actionTarget: { type: 'CHALLENGE', challengeId: row.challenge_id },
          payload: {
            challengeId: row.challenge_id,
            userRescheduleCount: nextCount,
            reasonCode: reason.reasonCode,
          },
          deadlineAt: row.scheduling_deadline_at.toISOString(),
        },
        ...(booking?.coach_user_id
          ? [{
              notificationId: ids.notificationIds[1],
              recipientUserId: booking.coach_user_id,
              category: 'SERVICE',
              renderKey: 'booking.host-request-cancelled-by-challenge-reschedule',
              actionTarget: { type: 'BOOKING', bookingId: booking.booking_id },
              payload: {
                challengeId: row.challenge_id,
                bookingId: booking.booking_id,
                slotId: booking.slot_id,
              },
              deadlineAt: null,
            }]
          : []),
      ];
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'ChallengeRescheduledByAthlete',
          schemaVersion: 1,
          transitionId: 'CH-22',
          payload: {
            challengeId: row.challenge_id,
            rescheduleId: ids.rescheduleId,
            bookingId: booking?.booking_id ?? null,
            initiatedByUserId: command.actor.id,
            faultAttribution,
            reasonCode: reason.reasonCode,
            userRescheduleCount: nextCount,
            schedulingDeadlineAt: row.scheduling_deadline_at.toISOString(),
          },
          metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
        },
        ...(booking
          ? {
              relatedEvents: [{
                eventId: ids.bookingEventId,
                eventName: 'BookingRequestWithdrawn',
                schemaVersion: 1,
                aggregateType: 'Booking',
                aggregateId: booking.booking_id,
                aggregateVersion: Number(booking.version) + 1,
                transitionId: 'B-04',
                payload: {
                  bookingId: booking.booking_id,
                  slotId: booking.slot_id,
                  withdrawnByUserId: command.actor.id,
                  previousState: booking.state,
                  cause: 'ATHLETE_CHALLENGE_RESCHEDULE',
                },
                metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
              }],
            }
          : {}),
        audit: {
          auditId: ids.auditId,
          action: 'RESCHEDULE_CHALLENGE_BY_ATHLETE',
          transitionId: 'CH-22',
          reasonCode: reason.reasonCode,
          beforeState: row.state,
          afterState: 'ACCEPTED_UNSCHEDULED',
          metadata: {
            rescheduleId: ids.rescheduleId,
            bookingId: booking?.booking_id ?? null,
            reasonNote: reason.reasonNote,
            faultAttribution,
            userRescheduleCount: nextCount,
            schedulingDeadlineAt: row.scheduling_deadline_at.toISOString(),
          },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'competition.challenge.rescheduled-by-athlete.v1',
            payload: {
              challengeId: row.challenge_id,
              rescheduleId: ids.rescheduleId,
              bookingId: booking?.booking_id ?? null,
              initiatedByUserId: command.actor.id,
              reasonCode: reason.reasonCode,
              userRescheduleCount: nextCount,
              timer: {
                commandType: 'EXPIRE_CHALLENGE_SCHEDULING',
                aggregateType: 'Challenge',
                aggregateId: row.challenge_id,
                deadlineAt: row.scheduling_deadline_at!.toISOString(),
                expectedState: 'ACCEPTED_UNSCHEDULED',
                expectedVersion: context.nextVersion,
                policyVersion: CHALLENGE_POLICY_VERSION,
                idempotencyKey: `challenge:${row.challenge_id}:expire-scheduling:v${context.nextVersion}`,
              },
            },
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: { notifications },
          },
          ...(booking
            ? [{
                messageId: ids.bookingOutboxMessageId,
                topic: 'scheduling.booking.request-withdrawn.v1',
                sourceEventId: ids.bookingEventId,
                payload: {
                  bookingId: booking.booking_id,
                  chatId: booking.chat_id,
                  slotId: booking.slot_id,
                  cause: 'ATHLETE_CHALLENGE_RESCHEDULE',
                },
              }]
            : []),
        ],
      };
    },
  });
}

export async function proposeMutualChallengeReschedule(
  database: Kysely<Database>,
  command: CommandEnvelope<ProposeMutualChallengeReschedulePayload>,
  ids: ProposeMutualChallengeRescheduleEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<MutualChallengeRescheduleRequestProjection>> {
  if (
    !command.actor.id
    || command.aggregateType !== 'ChallengeMutualReschedule'
    || command.commandType !== 'PROPOSE_MUTUAL_CHALLENGE_RESCHEDULE'
  ) {
    throw new ChallengeConflictError('CHALLENGE_MUTUAL_RESCHEDULE_NOT_ALLOWED');
  }
  const reason = normalizeScheduleMutationReason(command.payload);
  return executeCriticalCommand(database, {
    command: { ...command, payload: { ...command.payload, ...reason } },
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const preliminary = await challengeRow(transaction, command.payload.challengeId);
      const resource = await mutualRescheduleResourceForUpdate(
        transaction,
        preliminary.challenge_id,
        preliminary.state,
      );
      const row = await challengeRow(transaction, preliminary.challenge_id, true);
      assertExpectedVersion(Number(row.version), command.payload.challengeVersion);
      const existing = await currentMutualRescheduleRequest(
        transaction,
        row.challenge_id,
        Number(row.version),
      );
      assertMutualChallengeRescheduleCanBeProposed({
        state: row.state,
        actorUserId: command.actor.id!,
        participantUserIds: [row.pair_low_id, row.pair_high_id],
        userRescheduleCount: row.user_reschedule_count,
        requestExistsForCurrentVersion: existing !== null,
      });
      if (!row.scheduling_deadline_at) {
        throw new ChallengeConflictError('CHALLENGE_MUTUAL_RESCHEDULE_NOT_ALLOWED');
      }
      if (
        (row.state === 'ACCEPTED_UNSCHEDULED' && resource !== null)
        || (row.state === 'BOOKING_PENDING'
          && (!resource || resource.session_id !== null
            || !['SELECTING', 'HOST_CONFIRMATION_PENDING'].includes(resource.booking_state)))
        || (row.state === 'BOOKED'
          && (!resource || resource.session_id === null || resource.booking_state !== 'CONFIRMED_PAIR'
            || !['SCHEDULED', 'READY_FOR_COACH'].includes(resource.session_state ?? '')
            || resource.actual_start_at !== null || resource.slot_state !== 'BOOKED'))
      ) {
        throw new ChallengeConflictError('CHALLENGE_MUTUAL_RESCHEDULE_NOT_ALLOWED');
      }
      await assertChallengeCompetitionOperational(transaction, row.competition_id);
      await sql`
        insert into competition.challenge_mutual_reschedule_requests (
          request_id, challenge_id, booking_id, session_id, proposed_by_user_id,
          confirmed_by_user_id, reason_code, reason_note, state,
          challenge_version_at_proposal, booking_version_at_proposal,
          session_version_at_proposal, slot_version_at_proposal,
          proposed_at, confirmed_at, version, created_at, updated_at
        ) values (
          ${command.aggregateId}::uuid, ${row.challenge_id}::uuid,
          ${resource?.booking_id ?? null}::uuid, ${resource?.session_id ?? null}::uuid,
          ${command.actor.id}::uuid, null, ${reason.reasonCode}, ${reason.reasonNote},
          'PROPOSED', ${Number(row.version)},
          ${resource ? Number(resource.booking_version) : null},
          ${resource?.session_version ? Number(resource.session_version) : null},
          ${resource?.session_id ? Number(resource.slot_version) : null},
          ${context.occurredAt.toISOString()}::timestamptz, null, 1,
          ${context.occurredAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      const inserted = await mutualRescheduleRequestRow(transaction, command.aggregateId);
      if (!inserted) {
        throw new ChallengeConflictError('CHALLENGE_MUTUAL_RESCHEDULE_NOT_ALLOWED');
      }
      const response = mutualRescheduleRequestProjection(inserted);
      const peerUserId = command.actor.id === row.pair_low_id
        ? row.pair_high_id
        : row.pair_low_id;
      return {
        responseStatus: 201,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'ChallengeRescheduleProposed',
          schemaVersion: 1,
          transitionId: null,
          payload: {
            requestId: response.requestId,
            challengeId: response.challengeId,
            bookingId: response.bookingId,
            sessionId: response.sessionId,
            proposedByUserId: response.proposedByUserId,
            reasonCode: response.reasonCode,
            challengeVersionAtProposal: Number(row.version),
          },
          metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId,
          action: 'PROPOSE_MUTUAL_CHALLENGE_RESCHEDULE',
          transitionId: null,
          reasonCode: reason.reasonCode,
          beforeState: null,
          afterState: 'PROPOSED',
          metadata: {
            challengeId: row.challenge_id,
            bookingId: response.bookingId,
            sessionId: response.sessionId,
            reasonNote: reason.reasonNote,
            challengeVersionAtProposal: Number(row.version),
          },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'competition.challenge.mutual-reschedule-proposed.v1',
            payload: {
              requestId: response.requestId,
              challengeId: response.challengeId,
              bookingId: response.bookingId,
              sessionId: response.sessionId,
              proposedByUserId: response.proposedByUserId,
              reasonCode: response.reasonCode,
            },
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: {
              notifications: [{
                notificationId: ids.notificationId,
                recipientUserId: peerUserId,
                category: 'MANDATORY',
                renderKey: 'challenge.mutual-reschedule-proposed',
                actionTarget: { type: 'CHALLENGE', challengeId: row.challenge_id },
                payload: {
                  requestId: response.requestId,
                  challengeId: row.challenge_id,
                  reasonCode: response.reasonCode,
                },
                deadlineAt: row.scheduling_deadline_at!.toISOString(),
              }],
            },
          },
        ],
      };
    },
  });
}

export async function confirmMutualChallengeReschedule(
  database: Kysely<Database>,
  command: CommandEnvelope<ConfirmMutualChallengeReschedulePayload>,
  ids: ConfirmMutualChallengeRescheduleEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<ChallengeProjection>> {
  if (
    !command.actor.id
    || command.aggregateType !== 'Challenge'
    || command.aggregateId !== command.payload.challengeId
    || command.commandType !== 'CONFIRM_MUTUAL_CHALLENGE_RESCHEDULE'
  ) {
    throw new ChallengeConflictError('CHALLENGE_MUTUAL_RESCHEDULE_NOT_ALLOWED');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const request = await mutualRescheduleRequestRow(
        transaction,
        command.payload.requestId,
        true,
      );
      if (
        !request
        || request.challenge_id !== command.aggregateId
        || request.state !== 'PROPOSED'
      ) {
        throw new ChallengeConflictError('CHALLENGE_MUTUAL_RESCHEDULE_NOT_ALLOWED');
      }
      assertExpectedVersion(Number(request.version), command.payload.requestVersion);
      const preliminary = await challengeRow(transaction, command.aggregateId);
      const resource = await mutualRescheduleResourceForUpdate(
        transaction,
        preliminary.challenge_id,
        preliminary.state,
      );
      const row = await challengeRow(transaction, command.aggregateId, true);
      const nextCount = nextMutualChallengeRescheduleCount({
        state: row.state,
        proposedByUserId: request.proposed_by_user_id,
        confirmedByUserId: command.actor.id!,
        participantUserIds: [row.pair_low_id, row.pair_high_id],
        userRescheduleCount: row.user_reschedule_count,
      });
      if (
        !row.scheduling_deadline_at
        || Number(request.challenge_version_at_proposal) !== Number(row.version)
        || request.booking_id !== (resource?.booking_id ?? null)
        || request.session_id !== (resource?.session_id ?? null)
        || Number(request.booking_version_at_proposal ?? 0)
          !== Number(resource?.booking_version ?? 0)
        || Number(request.session_version_at_proposal ?? 0)
          !== Number(resource?.session_version ?? 0)
        || Number(request.slot_version_at_proposal ?? 0)
          !== Number(resource?.session_id ? resource.slot_version : 0)
      ) {
        throw new ChallengeConflictError('CHALLENGE_MUTUAL_RESCHEDULE_NOT_ALLOWED');
      }
      if (
        (row.state === 'ACCEPTED_UNSCHEDULED' && resource !== null)
        || (row.state === 'BOOKING_PENDING'
          && (!resource || resource.session_id !== null
            || !['SELECTING', 'HOST_CONFIRMATION_PENDING'].includes(resource.booking_state)))
        || (row.state === 'BOOKED'
          && (!resource || resource.session_id === null || resource.booking_state !== 'CONFIRMED_PAIR'
            || !['SCHEDULED', 'READY_FOR_COACH'].includes(resource.session_state ?? '')
            || resource.actual_start_at !== null || resource.slot_state !== 'BOOKED'))
      ) {
        throw new ChallengeConflictError('CHALLENGE_MUTUAL_RESCHEDULE_NOT_ALLOWED');
      }
      await assertChallengeCompetitionOperational(transaction, row.competition_id);
      await sql`
        update competition.challenge_mutual_reschedule_requests
        set state = 'CONFIRMED', confirmed_by_user_id = ${command.actor.id}::uuid,
          confirmed_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = 2, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where request_id = ${request.request_id}::uuid and state = 'PROPOSED' and version = 1
      `.execute(transaction);
      if (resource?.session_id) {
        await sql`
          update scheduling.sessions
          set state = 'CANCELLED', cancelled_at = ${context.occurredAt.toISOString()}::timestamptz,
            cancelled_by = ${command.actor.id}::uuid,
            cancellation_reason_code = 'MUTUAL_CHALLENGE_RESCHEDULE',
            version = version + 1, updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where session_id = ${resource.session_id}::uuid
            and state in ('SCHEDULED', 'READY_FOR_COACH') and actual_start_at is null
        `.execute(transaction);
        await sql`
          update scheduling.slots
          set state = 'CANCELLED', version = version + 1,
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where slot_id = ${resource.slot_id}::uuid and state = 'BOOKED'
        `.execute(transaction);
      }
      if (resource) {
        await sql`
          update scheduling.bookings
          set state = 'CANCELLED', cancelled_at = ${context.occurredAt.toISOString()}::timestamptz,
            cancel_actor = ${command.actor.id}::uuid,
            cancel_reason = 'MUTUAL_CHALLENGE_RESCHEDULE',
            version = version + 1, updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where booking_id = ${resource.booking_id}::uuid
            and state in ('SELECTING', 'HOST_CONFIRMATION_PENDING', 'CONFIRMED_PAIR')
        `.execute(transaction);
      }
      await sql`
        insert into competition.challenge_reschedules (
          reschedule_id, challenge_id, booking_id, initiated_by_user_id,
          fault_attribution, fault_user_id, reason_code, reason_note, created_at
        ) values (
          ${ids.rescheduleId}::uuid, ${row.challenge_id}::uuid,
          ${resource?.booking_id ?? null}::uuid, ${request.proposed_by_user_id}::uuid,
          'MUTUAL', null, ${request.reason_code}, ${request.reason_note},
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        update competition.challenges
        set state = 'ACCEPTED_UNSCHEDULED', user_reschedule_count = ${nextCount},
          version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where challenge_id = ${row.challenge_id}::uuid
          and state in ('ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED')
      `.execute(transaction);
      const response = projection({
        ...row,
        state: 'ACCEPTED_UNSCHEDULED',
        user_reschedule_count: nextCount,
        version: String(context.nextVersion),
      }, command.actor.id!);
      const bookingVersion = resource ? Number(resource.booking_version) + 1 : null;
      const sessionVersion = resource?.session_version
        ? Number(resource.session_version) + 1
        : null;
      const slotVersion = resource?.session_id ? Number(resource.slot_version) + 1 : null;
      const relatedEvents = [
        {
          eventId: ids.requestEventId,
          eventName: 'ChallengeRescheduled',
          schemaVersion: 1,
          aggregateType: 'ChallengeMutualReschedule',
          aggregateId: request.request_id,
          aggregateVersion: 2,
          transitionId: 'CH-21',
          payload: {
            requestId: request.request_id,
            challengeId: row.challenge_id,
            proposedByUserId: request.proposed_by_user_id,
            confirmedByUserId: command.actor.id,
            faultAttribution: 'MUTUAL',
          },
          metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
        },
        ...(resource ? [{
          eventId: ids.bookingEventId,
          eventName: 'BookingCancelledNoFault',
          schemaVersion: 1,
          aggregateType: 'Booking',
          aggregateId: resource.booking_id,
          aggregateVersion: bookingVersion!,
          transitionId: resource.session_id ? 'B-15' : 'B-04',
          payload: {
            bookingId: resource.booking_id,
            challengeId: row.challenge_id,
            cause: 'MUTUAL',
            userRescheduleCounted: true,
          },
          metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
        }] : []),
        ...(resource?.session_id ? [
          {
            eventId: ids.sessionEventId,
            eventName: 'SessionCancelled',
            schemaVersion: 1,
            aggregateType: 'Session',
            aggregateId: resource.session_id,
            aggregateVersion: sessionVersion!,
            transitionId: 'S-04',
            payload: { sessionId: resource.session_id, cause: 'MUTUAL_CHALLENGE_RESCHEDULE' },
            metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
          },
          {
            eventId: ids.slotEventId,
            eventName: 'SlotBookingCancelled',
            schemaVersion: 1,
            aggregateType: 'Slot',
            aggregateId: resource.slot_id,
            aggregateVersion: slotVersion!,
            transitionId: 'SL-06',
            payload: { slotId: resource.slot_id, cause: 'MUTUAL_CHALLENGE_RESCHEDULE' },
            metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
          },
        ] : []),
      ];
      const notificationRecipients = [
        row.pair_low_id,
        row.pair_high_id,
        ...(resource ? [resource.coach_user_id] : []),
      ];
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'ChallengeRescheduled',
          schemaVersion: 1,
          transitionId: 'CH-21',
          payload: {
            challengeId: row.challenge_id,
            requestId: request.request_id,
            rescheduleId: ids.rescheduleId,
            bookingId: resource?.booking_id ?? null,
            sessionId: resource?.session_id ?? null,
            proposedByUserId: request.proposed_by_user_id,
            confirmedByUserId: command.actor.id,
            faultAttribution: 'MUTUAL',
            reasonCode: request.reason_code,
            userRescheduleCount: nextCount,
            schedulingDeadlineAt: row.scheduling_deadline_at.toISOString(),
          },
          metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
        },
        relatedEvents,
        audit: {
          auditId: ids.auditId,
          action: 'CONFIRM_MUTUAL_CHALLENGE_RESCHEDULE',
          transitionId: 'CH-21',
          reasonCode: request.reason_code,
          beforeState: row.state,
          afterState: 'ACCEPTED_UNSCHEDULED',
          metadata: {
            requestId: request.request_id,
            rescheduleId: ids.rescheduleId,
            bookingId: resource?.booking_id ?? null,
            sessionId: resource?.session_id ?? null,
            reasonNote: request.reason_note,
            faultAttribution: 'MUTUAL',
            userRescheduleCount: nextCount,
          },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'competition.challenge.rescheduled.v1',
            payload: {
              challengeId: row.challenge_id,
              requestId: request.request_id,
              rescheduleId: ids.rescheduleId,
              bookingId: resource?.booking_id ?? null,
              sessionId: resource?.session_id ?? null,
              proposedByUserId: request.proposed_by_user_id,
              confirmedByUserId: command.actor.id,
              faultAttribution: 'MUTUAL',
              reasonCode: request.reason_code,
              userRescheduleCount: nextCount,
              timer: {
                commandType: 'EXPIRE_CHALLENGE_SCHEDULING',
                aggregateType: 'Challenge',
                aggregateId: row.challenge_id,
                deadlineAt: row.scheduling_deadline_at.toISOString(),
                expectedState: 'ACCEPTED_UNSCHEDULED',
                expectedVersion: context.nextVersion,
                policyVersion: CHALLENGE_POLICY_VERSION,
                idempotencyKey: `challenge:${row.challenge_id}:expire-scheduling:v${context.nextVersion}`,
              },
            },
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: {
              notifications: notificationRecipients.map((recipientUserId, index) => ({
                notificationId: ids.notificationIds[index]!,
                recipientUserId,
                category: 'MANDATORY',
                renderKey: 'challenge.mutual-reschedule-confirmed',
                actionTarget: { type: 'CHALLENGE', challengeId: row.challenge_id },
                payload: {
                  requestId: request.request_id,
                  challengeId: row.challenge_id,
                  bookingId: resource?.booking_id ?? null,
                  sessionId: resource?.session_id ?? null,
                  reasonCode: request.reason_code,
                  userRescheduleCount: nextCount,
                },
                deadlineAt: row.scheduling_deadline_at!.toISOString(),
              })),
            },
          },
          ...(resource ? [{
            messageId: ids.bookingOutboxMessageId,
            topic: 'scheduling.booking.cancelled-no-fault.v1',
            sourceEventId: ids.bookingEventId,
            payload: {
              bookingId: resource.booking_id,
              sessionId: resource.session_id,
              slotId: resource.slot_id,
              cause: 'MUTUAL_CHALLENGE_RESCHEDULE',
              userRescheduleCounted: true,
            },
          }] : []),
        ],
      };
    },
  });
}

export async function readChallengeTimerSnapshot(
  database: Kysely<Database>,
  challengeId: string,
): Promise<TimerAggregateSnapshot> {
  const result = await sql<{
    readonly state: ChallengeState;
    readonly version: string;
    readonly effective_deadline_at: Date | null;
  }>`
    select challenge.state, challenge.version::text as version,
      case
        when community.state = 'PAUSED' or competition.availability = 'PAUSED'
          or exists (
            select 1 from competition.process_holds as process_hold
            where process_hold.aggregate_type = 'COMPETITION'
              and process_hold.aggregate_id = competition.competition_id
              and process_hold.reason = 'STATUS_REVIEW' and process_hold.state = 'ACTIVE'
          )
          then greatest(
            case
              when challenge.state = 'AWAITING_RESPONSE' then challenge.response_deadline_at
              when challenge.state in ('ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING')
                then challenge.scheduling_deadline_at
              else null
            end,
            clock_timestamp() + interval '5 minutes'
          )
        when challenge.state = 'AWAITING_RESPONSE' then challenge.response_deadline_at
        when challenge.state in ('ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING')
          then challenge.scheduling_deadline_at
        else null
      end as effective_deadline_at
    from competition.challenges as challenge
    join competition.competitions as competition
      on competition.competition_id = challenge.competition_id
    join community.communities as community
      on community.community_id = competition.community_id
    where challenge.challenge_id = ${challengeId}::uuid
  `.execute(database);
  const row = result.rows[0];
  return row
    ? {
        state: row.state,
        version: Number(row.version),
        ...(row.effective_deadline_at
          ? { deadlineAt: row.effective_deadline_at.toISOString() }
          : {}),
      }
    : { state: 'MISSING', version: 0 };
}

export async function expireChallengeScheduling(
  database: Kysely<Database>,
  command: CommandEnvelope<ExpireChallengeSchedulingPayload>,
  ids: ExpireChallengeSchedulingEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<ChallengeProjection>> {
  if (
    command.actor.type !== 'SYSTEM'
    || command.actor.id !== null
    || command.aggregateType !== 'Challenge'
    || command.aggregateId !== command.payload.challengeId
    || command.commandType !== 'EXPIRE_CHALLENGE_SCHEDULING'
  ) {
    throw new ChallengeConflictError('CHALLENGE_NOT_ACCEPTED');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await challengeRow(transaction, command.aggregateId, true);
      await assertNoActivePlatformIncidentForTimer(transaction, {
        commandType: command.commandType,
        aggregateId: command.aggregateId,
        occurredAt: context.occurredAt,
      });
      const outcome = assertAcceptedChallengeSchedulingCanExpire({
        state: row.state,
        schedulingDeadlineAt: row.scheduling_deadline_at,
        schedulingExtensionCount: row.scheduling_extension_count,
        occurredAt: context.occurredAt,
      });
      const bookingResult = await sql<{
        readonly booking_id: string;
        readonly state: string;
        readonly version: string;
      }>`
        select booking_id, state, version::text
        from scheduling.bookings
        where challenge_id = ${row.challenge_id}::uuid
          and state in ('SELECTING', 'HOST_CONFIRMATION_PENDING')
        order by created_at desc, booking_id desc
        limit 1
        for update
      `.execute(transaction);
      const booking = bookingResult.rows[0] ?? null;
      const occurredAt = context.occurredAt.toISOString();
      const extendedDeadline = outcome === 'EXTEND'
        ? extendedChallengeSchedulingDeadline(row.scheduling_deadline_at!)
        : null;
      if (extendedDeadline) {
        await sql`
          update competition.challenges
          set state = 'ACCEPTED_UNSCHEDULED',
            scheduling_deadline_at = ${extendedDeadline.toISOString()}::timestamptz,
            scheduling_extension_count = 1, version = ${context.nextVersion},
            updated_at = ${occurredAt}::timestamptz
          where challenge_id = ${row.challenge_id}::uuid
            and state in ('ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING')
            and scheduling_extension_count = 0
        `.execute(transaction);
      } else {
        await sql`
          update competition.challenges
          set state = 'CANCELLED_NO_FAULT', decided_at = ${occurredAt}::timestamptz,
            version = ${context.nextVersion}, updated_at = ${occurredAt}::timestamptz
          where challenge_id = ${row.challenge_id}::uuid
            and state in ('ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING')
            and scheduling_extension_count = 1
        `.execute(transaction);
        await sql`
          update competition.challenge_participant_obligations
          set released_at = ${occurredAt}::timestamptz,
            release_reason = 'NO_CAPACITY_AFTER_SCHEDULING_EXTENSION'
          where challenge_id = ${row.challenge_id}::uuid and released_at is null
        `.execute(transaction);
      }
      if (booking) {
        await sql`
          update scheduling.bookings
          set state = 'CANCELLED', cancelled_at = ${occurredAt}::timestamptz,
            cancel_actor = null, cancel_reason = 'CHALLENGE_SCHEDULING_DEADLINE',
            version = version + 1, updated_at = ${occurredAt}::timestamptz
          where booking_id = ${booking.booking_id}::uuid
            and state in ('SELECTING', 'HOST_CONFIRMATION_PENDING')
        `.execute(transaction);
      }
      const response = projection(
        await challengeRow(transaction, row.challenge_id),
        row.initiator_user_id,
      );
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: extendedDeadline
            ? 'ChallengeSchedulingExtended'
            : 'ChallengeCancelledNoCapacity',
          schemaVersion: 1,
          transitionId: extendedDeadline ? 'CH-24' : 'CH-25',
          payload: {
            challengeId: row.challenge_id,
            bookingId: booking?.booking_id ?? null,
            reason: extendedDeadline ? 'SCHEDULING_OPTIONS_EXPANDED' : 'NO_CAPACITY',
            schedulingDeadlineAt: extendedDeadline?.toISOString() ?? null,
            noForfeit: true,
          },
          metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
        },
        ...(booking ? {
          relatedEvents: [{
            eventId: ids.bookingEventId,
            eventName: 'BookingCancelledNoFault',
            schemaVersion: 1,
            aggregateType: 'Booking',
            aggregateId: booking.booking_id,
            aggregateVersion: Number(booking.version) + 1,
            transitionId: null,
            payload: {
              bookingId: booking.booking_id,
              challengeId: row.challenge_id,
              reason: 'CHALLENGE_SCHEDULING_DEADLINE',
              noForfeit: true,
            },
            metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
          }],
        } : {}),
        audit: {
          auditId: ids.auditId,
          action: 'EXPIRE_CHALLENGE_SCHEDULING',
          transitionId: extendedDeadline ? 'CH-24' : 'CH-25',
          reasonCode: extendedDeadline ? 'SCHEDULING_OPTIONS_EXPANDED' : 'NO_CAPACITY',
          beforeState: row.state,
          afterState: extendedDeadline ? 'ACCEPTED_UNSCHEDULED' : 'CANCELLED_NO_FAULT',
          metadata: { bookingId: booking?.booking_id ?? null,
            schedulingDeadlineAt: extendedDeadline?.toISOString() ?? null, noForfeit: true },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: extendedDeadline
              ? 'competition.challenge.scheduling-extended.v1'
              : 'competition.challenge.cancelled-no-capacity.v1',
            payload: {
              challengeId: row.challenge_id,
              competitionId: row.competition_id,
              bookingId: booking?.booking_id ?? null,
              ...(extendedDeadline ? { timer: {
                commandType: 'EXPIRE_CHALLENGE_SCHEDULING',
                aggregateType: 'Challenge', aggregateId: row.challenge_id,
                expectedState: 'ACCEPTED_UNSCHEDULED', expectedVersion: context.nextVersion,
                deadlineAt: extendedDeadline.toISOString(), policyVersion: CHALLENGE_POLICY_VERSION,
                idempotencyKey: `challenge:${row.challenge_id}:expire-scheduling:v${context.nextVersion}`,
              } } : {}),
              noForfeit: true,
            },
          },
          ...(booking ? [{
            messageId: ids.bookingOutboxMessageId,
            topic: 'scheduling.booking.cancelled-no-fault.v1',
            sourceEventId: ids.bookingEventId,
            payload: {
              bookingId: booking.booking_id,
              challengeId: row.challenge_id,
              reason: 'CHALLENGE_SCHEDULING_DEADLINE',
              noForfeit: true,
            },
          }] : []),
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: {
              notifications: [row.pair_low_id, row.pair_high_id].map(
                (recipientUserId, index) => ({
                  notificationId: ids.notificationIds[index]!,
                  recipientUserId,
                  category: 'MANDATORY',
                  renderKey: extendedDeadline
                    ? 'challenge.scheduling-extended'
                    : 'challenge.cancelled-no-capacity',
                  actionTarget: { type: 'CHAT', chatId: row.source_chat_id },
                  payload: { challengeId: row.challenge_id, noForfeit: true },
                  deadlineAt: extendedDeadline?.toISOString() ?? null,
                }),
              ),
            },
          },
        ],
      };
    },
  });
}

export async function expireOptionalChallenge(
  database: Kysely<Database>,
  command: CommandEnvelope<ExpireOptionalChallengePayload>,
  ids: ChallengeEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<ChallengeProjection>> {
  if (
    command.actor.type !== 'SYSTEM'
    || command.actor.id !== null
    || command.aggregateType !== 'Challenge'
    || command.aggregateId !== command.payload.challengeId
  ) {
    throw new ChallengeConflictError('CHALLENGE_NOT_AWAITING_RESPONSE');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await challengeRow(transaction, command.aggregateId, true);
      await assertNoActivePlatformIncidentForTimer(transaction, {
        commandType: command.commandType,
        aggregateId: command.aggregateId,
        occurredAt: context.occurredAt,
      });
      await assertChallengeCompetitionOperational(transaction, row.competition_id);
      if (row.response_policy === 'MANDATORY') {
        assertMandatoryChallengeCanBeExpired(
          row.state,
          row.response_deadline_at,
          context.occurredAt,
        );
        const effect = await recordMandatoryResponseForfeit({
          transaction,
          row,
          ids,
          occurredAt: context.occurredAt,
          nextChallengeVersion: context.nextVersion,
          recordedByUserId: null,
          reason: 'EXPIRED',
        });
        return { responseStatus: 200, ...effect };
      }
      if (row.response_policy !== 'OPTIONAL') {
        throw new ChallengeConflictError('CHALLENGE_NOT_AWAITING_RESPONSE');
      }
      assertOptionalChallengeCanBeExpired(row.state, row.response_deadline_at, context.occurredAt);
      await sql`
        update competition.challenges
        set state = 'EXPIRED_NO_FAULT', decided_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = ${context.nextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where challenge_id = ${row.challenge_id}::uuid and state = 'AWAITING_RESPONSE'
      `.execute(transaction);
      const response = projection(
        await challengeRow(transaction, row.challenge_id),
        row.initiator_user_id,
      );
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'ChallengeExpiredNoFault',
          schemaVersion: 1,
          transitionId: 'CH-06',
          payload: { challengeId: row.challenge_id, noLoss: true, pairQuietCreated: false },
          metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId,
          action: 'EXPIRE_OPTIONAL_CHALLENGE',
          transitionId: 'CH-06',
          reasonCode: 'RESPONSE_DEADLINE_REACHED',
          beforeState: row.state,
          afterState: 'EXPIRED_NO_FAULT',
          metadata: { noLoss: true, pairQuietCreated: false },
        },
        outbox: [
          { messageId: ids.outboxMessageId, topic: 'competition.challenge.expired-no-fault.v1', payload: { challengeId: row.challenge_id } },
          { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1', payload: { notifications: [{ notificationId: ids.notificationId, recipientUserId: row.initiator_user_id, category: 'SOCIAL', renderKey: 'challenge.optional-expired', actionTarget: { type: 'CHAT', chatId: row.source_chat_id }, payload: { challengeId: row.challenge_id, noLoss: true }, deadlineAt: null }] } },
        ],
      };
    },
  });
}

export async function ensureLocalPilotCompetition(
  database: Kysely<Database>,
  fixture: LocalPilotCompetitionFixture,
): Promise<void> {
  await database.transaction().execute(async (transaction) => {
    await sql`
      insert into competition.competitions (
        competition_id, community_id, age_division, discipline_key,
        phase, availability, version, created_at, updated_at
      ) values (
        ${fixture.competitionId}::uuid, ${fixture.communityId}::uuid, 'ADULT', null,
        'FOUNDING_OPEN', 'ACTIVE', 1, ${fixture.occurredAt}::timestamptz,
        ${fixture.occurredAt}::timestamptz
      ) on conflict (competition_id) do nothing
    `.execute(transaction);
    await sql`
      insert into platform.domain_events (
        event_id, event_name, event_version, aggregate_type, aggregate_id,
        aggregate_version, transition_id, correlation_id, actor_id, actor_type,
        actor_roles, actor_scope_ids, occurred_at, idempotency_key_hash, payload, metadata
      ) values (
        md5('competition-created:' || ${fixture.competitionId})::uuid,
        'CompetitionCreated', 1, 'Competition', ${fixture.competitionId}::uuid, 1, null,
        md5('competition-created-correlation:' || ${fixture.competitionId})::uuid,
        ${fixture.centralActorId}::uuid, 'SYSTEM', '["CENTRAL_ADMIN"]'::jsonb,
        '{}'::uuid[], ${fixture.occurredAt}::timestamptz,
        md5('competition-created:' || ${fixture.competitionId}),
        ${JSON.stringify({ competitionId: fixture.competitionId,
          communityId: fixture.communityId, ageDivision: 'ADULT', bootstrap: true })}::jsonb,
        ${JSON.stringify({ policyVersion: 'community-lifecycle-mvp-v1', bootstrap: true })}::jsonb
      ) on conflict do nothing
    `.execute(transaction);
    for (const membership of fixture.memberships) {
      await sql`
        insert into community.community_memberships (
          membership_id, community_id, user_id, age_division, state,
          competition_enabled, join_path, decided_at, decided_by, version,
          created_at, updated_at
        )
        select ${membership.membershipId}::uuid, ${fixture.communityId}::uuid,
          ${membership.userId}::uuid, identity.age_division, 'ACTIVE', true,
          'INVITE', ${fixture.occurredAt}::timestamptz, ${fixture.centralActorId}::uuid, 1,
          ${fixture.occurredAt}::timestamptz, ${fixture.occurredAt}::timestamptz
        from identity.users as identity
        where identity.user_id = ${membership.userId}::uuid
          and not exists (
            select 1 from community.community_memberships as current
            where current.community_id = ${fixture.communityId}::uuid
              and current.user_id = ${membership.userId}::uuid
              and current.state in ('PENDING', 'ACTIVE', 'UNDER_REVIEW')
          )
        on conflict (membership_id) do nothing
      `.execute(transaction);
      await sql`
        update community.community_memberships
        set competition_enabled = true, updated_at = clock_timestamp()
        where community_id = ${fixture.communityId}::uuid
          and user_id = ${membership.userId}::uuid and state = 'ACTIVE'
      `.execute(transaction);
    }
  });
}
