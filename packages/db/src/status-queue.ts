import {
  CHALLENGE_POLICY_VERSION,
  STATUS_QUEUE_POLICY_VERSION,
  StatusQueueConflictError,
  acceptedChallengeSchedulingDeadline,
  assertDirectStatusQueueHeadCanBeActivated,
  assertGenesisChallengeCanExpire,
  assertGenesisResponseCanBeRecorded,
  assertSingleGenesisCandidateCanBePromoted,
  assertStatusQueueEntryCanBeReconfirmed,
  assertStatusQueueEntryCanBeSubmitted,
  assertStatusQueueEntryCanBeWithdrawn,
  assertStatusQueueReconfirmationCanBeRequested,
  assertStatusQueueReconfirmationCanExpire,
  genesisResponseDeadline,
  genesisSingleCandidateDeadline,
  mandatoryChallengeReminderDeadlines,
  mandatoryChallengeResponseDeadline,
  normalizeSocialPair,
  optionalChallengeReminderDeadlines,
  optionalChallengeResponseDeadline,
  statusQueueReconfirmationDeadline,
  type ChallengeState,
  type CommandEnvelope,
  type CompetitionAvailability,
  type CompetitionPhase,
  type CompetitionStatus,
  type DirectStatusChallengeMode,
  type QueueEntryKind,
  type QueueEntryState,
  type QueueTargetStatus,
  type StatusQueueConflictCode,
  type StatusQueueIntent,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import { executeCriticalCommand, type ExecutedCommand } from './platform-command.js';
import { assertNoActivePlatformIncidentForTimer } from './platform-incident.js';
import {
  assertYouthChallengeConsentReady,
  assertYouthOfficialAvailableForUser,
} from './youth-consent.js';

export interface SubmitStatusQueueEntryPayload {
  readonly competitionId: string;
}

export interface WithdrawStatusQueueEntryPayload {
  readonly queueEntryId: string;
}

export interface GenesisResponsePayload {
  readonly challengeId: string;
  readonly explicitRulesetAcknowledged?: boolean;
}

export interface ExpireGenesisChallengePayload {
  readonly challengeId: string;
}

export interface ActivateStatusQueueHeadPayload {
  readonly competitionId: string;
  readonly queueEntryId: string;
}

export interface RequestStatusQueueReconfirmationPayload {
  readonly competitionId: string;
  readonly queueEntryId: string;
}

export interface ReconfirmStatusQueueEntryPayload {
  readonly queueEntryId: string;
}

export interface ExpireStatusQueueReconfirmationPayload {
  readonly queueEntryId: string;
}

export type VacancyQueueReconciliationAction =
  | 'INVALIDATE_CANDIDATE'
  | 'START_SINGLE_WINDOW'
  | 'PAIR_CANDIDATES';

export interface ReconcileVacancyQueuePayload {
  readonly competitionId: string;
  readonly queueEntryId: string;
  readonly action: VacancyQueueReconciliationAction;
}

export interface PromoteSingleGenesisCandidatePayload {
  readonly queueEntryId: string;
}

export interface StatusQueueEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly challengeId: string;
  readonly challengeEventId: string;
  readonly serviceChatId: string;
  readonly serviceChatEventId: string;
  readonly rulesetSnapshotId: string;
  readonly acknowledgmentId: string;
  readonly pairedQueueEventId: string;
  readonly timerOutboxMessageId: string;
  readonly mandatoryReminderTimerOutboxMessageId?: string;
  readonly optionalReminderTimerOutboxMessageIds?: readonly [string, string];
  readonly staleQueueEventId: string;
  readonly staleQueueOutboxMessageId: string;
  readonly notificationOutboxMessageId: string;
  readonly notificationIds: readonly [string, string];
}

export interface GenesisResponseEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly responseId: string;
  readonly acknowledgmentId: string;
  readonly obligationIds: readonly [string, string];
  readonly queueEventIds: readonly [string, string];
  readonly notificationOutboxMessageId: string;
  readonly notificationIds: readonly [string, string];
}

export interface GenesisExpiryEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly queueEventIds: readonly [string, string];
  readonly notificationOutboxMessageId: string;
  readonly notificationIds: readonly [string, string];
}

export interface StatusQueueReconfirmationEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly timerOutboxMessageId: string;
  readonly notificationOutboxMessageId: string;
  readonly notificationId: string;
}

export interface VacancySuccessionEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly statusEventId: string;
  readonly notificationOutboxMessageId: string;
  readonly notificationId: string;
}

export interface StatusHolderProjection {
  readonly userId: string;
  readonly displayName: string;
}

export interface StatusQueueEntryProjection {
  readonly queueEntryId: string;
  readonly competitionId: string;
  readonly initiatorUserId: string;
  readonly initiatorDisplayName: string;
  readonly targetStatus: QueueTargetStatus;
  readonly kind: QueueEntryKind;
  readonly state: QueueEntryState;
  readonly boundHolderUserId: string | null;
  readonly submittedAt: string;
  readonly reconfirmationDeadlineAt: string | null;
  readonly singleCandidateDeadlineAt: string | null;
  readonly position: number | null;
  readonly isViewerEntry: boolean;
  readonly version: number;
}

export interface ActiveStatusChallengeProjection {
  readonly challengeId: string;
  readonly serviceChatId: string;
  readonly state: ChallengeState;
  readonly responsePolicy: 'OPTIONAL' | 'MANDATORY' | 'MUTUAL_GENESIS';
  readonly stake: 'CONTENDER' | 'TITLE' | 'GENESIS_CHAMPION' | 'GENESIS_CONTENDER';
  readonly initiatorDisplayName: string;
  readonly recipientDisplayName: string;
  readonly viewerIsParticipant: boolean;
}

export interface StatusQueueActivationCandidate {
  readonly competitionId: string;
  readonly queueEntryId: string;
  readonly version: number;
}

export interface StatusQueueReconciliationCandidate {
  readonly competitionId: string;
  readonly queueEntryId: string;
  readonly version: number;
}

export interface VacancyQueueReconciliationCandidate {
  readonly competitionId: string;
  readonly queueEntryId: string;
  readonly version: number;
  readonly action: VacancyQueueReconciliationAction;
}

export interface ViewerGenesisActionProjection {
  readonly challengeId: string;
  readonly serviceChatId: string;
  readonly state: ChallengeState;
  readonly opponentDisplayName: string;
  readonly responseDeadlineAt: string;
  readonly rulesetRef: string;
  readonly rulesetAckMode: 'IMPLICIT_ON_ACCEPT' | 'EXPLICIT_ACK_REQUIRED';
  readonly viewerDecision: 'ACCEPT' | 'DECLINE' | null;
  readonly acceptedCount: number;
  readonly canAccept: boolean;
  readonly canDecline: boolean;
  readonly version: number;
}

export interface GenesisResponseProjection extends ViewerGenesisActionProjection {
  readonly competitionId: string;
}

export interface CompetitionStatusProjection {
  readonly competitionId: string;
  readonly phase: CompetitionPhase;
  readonly availability: CompetitionAvailability;
  readonly champion: StatusHolderProjection | null;
  readonly contender: StatusHolderProjection | null;
  readonly statusVersion: number;
  readonly viewerStatus: CompetitionStatus;
  readonly visibility: 'FULL' | 'AGGREGATE';
  readonly queueSize: number;
  readonly queue: readonly StatusQueueEntryProjection[];
  readonly activeChallenge: ActiveStatusChallengeProjection | null;
  readonly viewerGenesisAction: ViewerGenesisActionProjection | null;
  readonly viewerQueueEntryId: string | null;
  readonly canJoinQueue: boolean;
  readonly joinDenialCode: StatusQueueConflictCode | null;
  readonly policyVersion: typeof STATUS_QUEUE_POLICY_VERSION;
}

interface CompetitionViewerRow {
  readonly competition_id: string;
  readonly competition_age_division: 'YOUTH' | 'ADULT';
  readonly phase: CompetitionPhase;
  readonly availability: CompetitionAvailability;
  readonly status_version: string;
  readonly integrity_hold_active: boolean;
  readonly champion_user_id: string | null;
  readonly champion_display_name: string | null;
  readonly contender_user_id: string | null;
  readonly contender_display_name: string | null;
  readonly community_state: string;
  readonly account_state: string;
  readonly account_verified: boolean;
  readonly user_age_division: 'YOUTH' | 'ADULT';
  readonly membership_state: string | null;
  readonly membership_age_division: 'YOUTH' | 'ADULT' | null;
  readonly competition_enabled: boolean | null;
  readonly has_live_entry: boolean;
  readonly pair_cooldown_active: boolean;
  readonly pair_challenge_exists: boolean;
}

interface QueueEntryRow {
  readonly queue_entry_id: string;
  readonly competition_id: string;
  readonly initiator_user_id: string;
  readonly initiator_display_name: string;
  readonly target_status: QueueTargetStatus;
  readonly kind: QueueEntryKind;
  readonly state: QueueEntryState;
  readonly bound_holder_user_id: string | null;
  readonly direct_challenge_mode: DirectStatusChallengeMode | null;
  readonly submitted_at: Date;
  readonly reconfirmation_deadline_at: Date | null;
  readonly single_candidate_since_at: Date | null;
  readonly single_candidate_deadline_at: Date | null;
  readonly position: string | null;
  readonly version: string;
}

interface GenesisCandidateRow {
  readonly queue_entry_id: string;
  readonly initiator_user_id: string;
  readonly target_status: QueueTargetStatus;
  readonly submitted_at: Date;
  readonly single_candidate_since_at: Date | null;
  readonly single_candidate_deadline_at: Date | null;
  readonly version: string;
}

interface VacancyCompetitionRow {
  readonly competition_id: string;
  readonly phase: CompetitionPhase;
  readonly availability: CompetitionAvailability;
  readonly integrity_hold_active: boolean;
  readonly community_active: boolean;
  readonly status_flow_free: boolean;
  readonly champion_user_id: string | null;
  readonly contender_user_id: string | null;
  readonly status_version: string;
  readonly version: string;
}

interface ActivationCompetitionRow {
  readonly competition_id: string;
  readonly phase: CompetitionPhase;
  readonly availability: CompetitionAvailability;
  readonly integrity_hold_active: boolean;
  readonly community_active: boolean;
  readonly champion_user_id: string | null;
  readonly contender_user_id: string | null;
  readonly status_slot_free: boolean;
}

interface GenesisConfigurationRow {
  readonly configuration_id: string;
  readonly ruleset_ref: string;
  readonly ruleset_ack_mode: 'IMPLICIT_ON_ACCEPT' | 'EXPLICIT_ACK_REQUIRED';
}

interface GenesisChallengeRow {
  readonly challenge_id: string;
  readonly competition_id: string;
  readonly service_chat_id: string;
  readonly initiator_user_id: string;
  readonly recipient_user_id: string;
  readonly initiator_display_name: string;
  readonly recipient_display_name: string;
  readonly response_deadline_at: Date;
  readonly state: ChallengeState;
  readonly stake: 'GENESIS_CHAMPION' | 'GENESIS_CONTENDER';
  readonly ruleset_snapshot_id: string;
  readonly ruleset_ref: string;
  readonly ruleset_ack_mode: 'IMPLICIT_ON_ACCEPT' | 'EXPLICIT_ACK_REQUIRED';
  readonly version: string;
}

interface GenesisResponseRow {
  readonly user_id: string;
  readonly decision: 'ACCEPT' | 'DECLINE';
}

interface GenesisQueueRow {
  readonly queue_entry_id: string;
  readonly initiator_user_id: string;
  readonly version: string;
}

interface GenesisEligibilityRow {
  readonly competition_availability: CompetitionAvailability;
  readonly competition_phase: CompetitionPhase;
  readonly integrity_hold_active: boolean;
  readonly community_active: boolean;
  readonly active_account_count: string;
  readonly verified_account_count: string;
  readonly active_membership_count: string;
  readonly matching_age_count: string;
  readonly status_holder_count: string;
}

interface ActiveChallengeRow {
  readonly challenge_id: string;
  readonly state: ChallengeState;
  readonly response_policy: 'OPTIONAL' | 'MANDATORY' | 'MUTUAL_GENESIS';
  readonly stake: 'CONTENDER' | 'TITLE' | 'GENESIS_CHAMPION' | 'GENESIS_CONTENDER';
  readonly initiator_display_name: string;
  readonly recipient_display_name: string;
}

function viewerStatus(row: CompetitionViewerRow, userId: string): CompetitionStatus {
  if (row.champion_user_id === userId) return 'CHAMPION';
  if (row.contender_user_id === userId) return 'CONTENDER';
  return 'ORDINARY';
}

function holder(userId: string | null, displayName: string | null): StatusHolderProjection | null {
  return userId && displayName ? { userId, displayName } : null;
}

function entryProjection(row: QueueEntryRow, viewerUserId: string): StatusQueueEntryProjection {
  return {
    queueEntryId: row.queue_entry_id,
    competitionId: row.competition_id,
    initiatorUserId: row.initiator_user_id,
    initiatorDisplayName: row.initiator_display_name,
    targetStatus: row.target_status,
    kind: row.kind,
    state: row.state,
    boundHolderUserId: row.bound_holder_user_id,
    submittedAt: row.submitted_at.toISOString(),
    reconfirmationDeadlineAt: row.reconfirmation_deadline_at?.toISOString() ?? null,
    singleCandidateDeadlineAt: (row.single_candidate_deadline_at
      ?? (row.single_candidate_since_at
        ? genesisSingleCandidateDeadline(row.single_candidate_since_at)
        : null))?.toISOString() ?? null,
    position: row.position === null ? null : Number(row.position),
    isViewerEntry: row.initiator_user_id === viewerUserId,
    version: Number(row.version),
  };
}

async function competitionViewerContext(
  database: Kysely<Database> | Transaction<Database>,
  competitionId: string,
  userId: string,
): Promise<CompetitionViewerRow | null> {
  const result = await sql<CompetitionViewerRow>`
    select
      competitive.competition_id,
      competitive.age_division as competition_age_division,
      competitive.phase,
      competitive.availability,
      competitive.status_version::text,
      (competitive.integrity_hold_case_id is not null or exists (
        select 1 from competition.process_holds as process_hold
        where process_hold.aggregate_type = 'COMPETITION'
          and process_hold.aggregate_id = competitive.competition_id
          and process_hold.reason = 'STATUS_REVIEW' and process_hold.state = 'ACTIVE'
      )) as integrity_hold_active,
      competitive.champion_user_id,
      champion.display_name as champion_display_name,
      competitive.contender_user_id,
      contender.display_name as contender_display_name,
      community.state as community_state,
      viewer.account_state,
      exists (
        select 1 from identity.account_verifications as verification
        where verification.user_id = viewer.user_id
          and verification.is_current and verification.state = 'VERIFIED'
          and (verification.expires_at is null or verification.expires_at > clock_timestamp())
      ) as account_verified,
      viewer.age_division as user_age_division,
      membership.state as membership_state,
      membership.age_division as membership_age_division,
      membership.competition_enabled,
      exists (
        select 1 from competition.challenge_queue_entries as own_entry
        where own_entry.competition_id = competitive.competition_id
          and own_entry.initiator_user_id = viewer.user_id
          and own_entry.state in (
            'WAITING', 'PAIRED_PENDING_ACCEPTANCE', 'RECONFIRMATION_REQUIRED', 'ACTIVATED'
          )
      ) as has_live_entry,
      exists (
        select 1 from competition.pair_cooldowns as cooldown
        where cooldown.competition_id = competitive.competition_id
          and cooldown.invalidated_at is null
          and cooldown.ends_at > clock_timestamp()
          and competitive.contender_user_id is not null
          and (
            (cooldown.pair_low_id = viewer.user_id and cooldown.pair_high_id = competitive.contender_user_id)
            or (cooldown.pair_high_id = viewer.user_id and cooldown.pair_low_id = competitive.contender_user_id)
          )
      ) as pair_cooldown_active
      , exists (
        select 1 from competition.challenges as challenge
        where challenge.competition_id = competitive.competition_id
          and competitive.contender_user_id is not null
          and (
            (challenge.pair_low_id = viewer.user_id
              and challenge.pair_high_id = competitive.contender_user_id)
            or (challenge.pair_high_id = viewer.user_id
              and challenge.pair_low_id = competitive.contender_user_id)
          )
          and challenge.state in (
            'AWAITING_RESPONSE', 'ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED',
            'IN_SESSION', 'RESULT_PENDING', 'RESULT_RECORDED', 'UNDER_APPEAL'
          )
      ) as pair_challenge_exists
    from competition.competitions as competitive
    join community.communities as community on community.community_id = competitive.community_id
    cross join identity.users as viewer
    left join identity.users as champion on champion.user_id = competitive.champion_user_id
    left join identity.users as contender on contender.user_id = competitive.contender_user_id
    left join community.community_memberships as membership
      on membership.community_id = competitive.community_id
      and membership.user_id = viewer.user_id
      and membership.state in ('PENDING', 'ACTIVE', 'UNDER_REVIEW')
    where competitive.competition_id = ${competitionId}::uuid
      and viewer.user_id = ${userId}::uuid
  `.execute(database);
  return result.rows[0] ?? null;
}

function eligibility(row: CompetitionViewerRow, userId: string) {
  return {
    accountActive: row.account_state === 'ACTIVE',
    accountVerified: row.account_verified,
    communityActive: row.community_state === 'ACTIVE',
    membershipActive: row.membership_state === 'ACTIVE' && row.competition_enabled === true,
    sameAgeContour: row.membership_age_division === row.user_age_division
      && row.user_age_division === row.competition_age_division,
    competitionAvailability: row.availability,
    integrityHoldActive: row.integrity_hold_active,
    competitionPhase: row.phase,
    actorStatus: viewerStatus(row, userId),
    contenderUserId: row.contender_user_id,
    hasLiveEntry: row.has_live_entry,
    pairCooldownActive: row.pair_cooldown_active,
    pairChallengeExists: row.pair_challenge_exists,
  } as const;
}

async function genesisCandidateInvalidationReason(
  transaction: Kysely<Database> | Transaction<Database>,
  competitionId: string,
  userId: string,
): Promise<StatusQueueConflictCode | null> {
  const viewer = await competitionViewerContext(transaction, competitionId, userId);
  if (!viewer) return 'MEMBERSHIP_NOT_ACTIVE';
  try {
    const intent = assertStatusQueueEntryCanBeSubmitted({
      ...eligibility(viewer, userId),
      hasLiveEntry: false,
    });
    if (intent.kind !== 'GENESIS_CANDIDATE') return 'COMPETITION_PHASE_UNAVAILABLE';
  } catch (error) {
    if (!(error instanceof StatusQueueConflictError)) throw error;
    return error.code;
  }
  if (await hasActiveGenesisObligation(transaction, userId, userId)) {
    return 'OFFICIAL_OBLIGATION_LIMIT';
  }
  return null;
}

async function queueEntries(
  database: Kysely<Database> | Transaction<Database>,
  competitionId: string,
): Promise<readonly QueueEntryRow[]> {
  const result = await sql<QueueEntryRow>`
    select
      entry.queue_entry_id,
      entry.competition_id,
      entry.initiator_user_id,
      athlete.display_name as initiator_display_name,
      entry.target_status,
      entry.kind,
      entry.state,
      entry.bound_holder_user_id,
      entry.direct_challenge_mode,
      entry.submitted_at,
      entry.reconfirmation_deadline_at,
      entry.single_candidate_since_at,
      entry.single_candidate_deadline_at,
      row_number() over (order by entry.submitted_at, entry.queue_entry_id)::text as position,
      entry.version::text
    from competition.challenge_queue_entries as entry
    join identity.users as athlete on athlete.user_id = entry.initiator_user_id
    where entry.competition_id = ${competitionId}::uuid
      and entry.state in (
        'WAITING', 'PAIRED_PENDING_ACCEPTANCE', 'RECONFIRMATION_REQUIRED', 'ACTIVATED'
      )
    order by entry.submitted_at, entry.queue_entry_id
  `.execute(database);
  return result.rows;
}

async function queueEntry(
  database: Kysely<Database> | Transaction<Database>,
  queueEntryId: string,
  forUpdate = false,
): Promise<QueueEntryRow | null> {
  const result = forUpdate
    ? await sql<QueueEntryRow>`
        select entry.queue_entry_id, entry.competition_id, entry.initiator_user_id,
          athlete.display_name as initiator_display_name, entry.target_status, entry.kind,
          entry.state, entry.bound_holder_user_id, entry.submitted_at,
          entry.direct_challenge_mode,
          entry.reconfirmation_deadline_at, entry.single_candidate_since_at,
          entry.single_candidate_deadline_at,
          null::text as position, entry.version::text
        from competition.challenge_queue_entries as entry
        join identity.users as athlete on athlete.user_id = entry.initiator_user_id
        where entry.queue_entry_id = ${queueEntryId}::uuid
        for update of entry
      `.execute(database)
    : await sql<QueueEntryRow>`
        select entry.queue_entry_id, entry.competition_id, entry.initiator_user_id,
          athlete.display_name as initiator_display_name, entry.target_status, entry.kind,
          entry.state, entry.bound_holder_user_id, entry.submitted_at,
          entry.direct_challenge_mode,
          entry.reconfirmation_deadline_at, entry.single_candidate_since_at,
          entry.single_candidate_deadline_at,
          case when entry.state in (
            'WAITING', 'PAIRED_PENDING_ACCEPTANCE', 'RECONFIRMATION_REQUIRED', 'ACTIVATED'
          ) then 1 + (
            select count(*) from competition.challenge_queue_entries as earlier
            where earlier.competition_id = entry.competition_id
              and earlier.state in (
                'WAITING', 'PAIRED_PENDING_ACCEPTANCE', 'RECONFIRMATION_REQUIRED', 'ACTIVATED'
              )
              and (earlier.submitted_at, earlier.queue_entry_id) < (entry.submitted_at, entry.queue_entry_id)
          ) else null end::text as position,
          entry.version::text
        from competition.challenge_queue_entries as entry
        join identity.users as athlete on athlete.user_id = entry.initiator_user_id
        where entry.queue_entry_id = ${queueEntryId}::uuid
      `.execute(database);
  return result.rows[0] ?? null;
}

async function activeStatusChallenge(
  database: Kysely<Database> | Transaction<Database>,
  competitionId: string,
  viewerUserId: string,
): Promise<ActiveStatusChallengeProjection | null> {
  const result = await sql<ActiveChallengeRow & {
    readonly service_chat_id: string;
    readonly initiator_user_id: string;
    readonly recipient_user_id: string;
  }>`
    select challenge.challenge_id, challenge.service_chat_id,
      challenge.initiator_user_id, challenge.recipient_user_id, challenge.state,
      challenge.response_policy, challenge.stake,
      initiator.display_name as initiator_display_name,
      recipient.display_name as recipient_display_name
    from competition.challenges as challenge
    join identity.users as initiator on initiator.user_id = challenge.initiator_user_id
    join identity.users as recipient on recipient.user_id = challenge.recipient_user_id
    where challenge.competition_id = ${competitionId}::uuid
      and challenge.stake <> 'NONE'
      and challenge.state in (
        'AWAITING_RESPONSE', 'ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED',
        'IN_SESSION', 'RESULT_PENDING', 'RESULT_RECORDED', 'UNDER_APPEAL'
      )
    order by challenge.created_at desc, challenge.challenge_id desc
    limit 1
  `.execute(database);
  const row = result.rows[0];
  return row ? {
    challengeId: row.challenge_id,
    serviceChatId: row.service_chat_id,
    state: row.state,
    responsePolicy: row.response_policy,
    stake: row.stake,
    initiatorDisplayName: row.initiator_display_name,
    recipientDisplayName: row.recipient_display_name,
    viewerIsParticipant: [row.initiator_user_id, row.recipient_user_id].includes(viewerUserId),
  } : null;
}

async function viewerGenesisAction(
  database: Kysely<Database> | Transaction<Database>,
  competitionId: string,
  viewerUserId: string,
): Promise<ViewerGenesisActionProjection | null> {
  const result = await sql<{
    readonly challenge_id: string;
    readonly service_chat_id: string;
    readonly state: ChallengeState;
    readonly opponent_display_name: string;
    readonly response_deadline_at: Date;
    readonly ruleset_ref: string;
    readonly ruleset_ack_mode: 'IMPLICIT_ON_ACCEPT' | 'EXPLICIT_ACK_REQUIRED';
    readonly participants_eligible: boolean;
    readonly viewer_decision: 'ACCEPT' | 'DECLINE' | null;
    readonly accepted_count: string;
    readonly version: string;
  }>`
    select challenge.challenge_id, challenge.service_chat_id, challenge.state,
      case when challenge.initiator_user_id = ${viewerUserId}::uuid
        then recipient.display_name else initiator.display_name end as opponent_display_name,
      challenge.response_deadline_at,
      snapshot.ruleset_ref, snapshot.ruleset_ack_mode,
      (
        competitive.availability = 'ACTIVE'
        and competitive.integrity_hold_case_id is null
        and not exists (
          select 1 from competition.process_holds as process_hold
          where process_hold.aggregate_type = 'COMPETITION'
            and process_hold.aggregate_id = competitive.competition_id
            and process_hold.reason = 'STATUS_REVIEW' and process_hold.state = 'ACTIVE'
        )
        and community.state = 'ACTIVE'
        and (
          (challenge.stake = 'GENESIS_CHAMPION' and competitive.phase = 'FOUNDING_CHALLENGE')
          or (challenge.stake = 'GENESIS_CONTENDER' and competitive.phase = 'CONTENDER_GENESIS')
        )
        and (select count(*) from identity.users as athlete
          where athlete.user_id in (challenge.initiator_user_id, challenge.recipient_user_id)
            and athlete.account_state = 'ACTIVE') = 2
        and (select count(*) from identity.users as athlete
          where athlete.user_id in (challenge.initiator_user_id, challenge.recipient_user_id)
            and exists (
              select 1 from identity.account_verifications as verification
              where verification.user_id = athlete.user_id
                and verification.is_current and verification.state = 'VERIFIED'
                and (verification.expires_at is null or verification.expires_at > clock_timestamp())
            )) = 2
        and (select count(*) from community.community_memberships as membership
          where membership.community_id = competitive.community_id
            and membership.user_id in (challenge.initiator_user_id, challenge.recipient_user_id)
            and membership.state = 'ACTIVE' and membership.competition_enabled
            and membership.age_division = competitive.age_division) = 2
        and (select count(*) from identity.users as athlete
          where athlete.user_id in (challenge.initiator_user_id, challenge.recipient_user_id)
            and athlete.age_division = competitive.age_division) = 2
        and not exists (
          select 1 from competition.challenge_participant_obligations as obligation
          where obligation.user_id in (challenge.initiator_user_id, challenge.recipient_user_id)
            and obligation.released_at is null
        )
        and challenge.initiator_user_id is distinct from competitive.champion_user_id
        and challenge.initiator_user_id is distinct from competitive.contender_user_id
        and challenge.recipient_user_id is distinct from competitive.champion_user_id
        and challenge.recipient_user_id is distinct from competitive.contender_user_id
      ) as participants_eligible,
      viewer_response.decision as viewer_decision,
      (select count(*)::text from competition.genesis_candidate_responses as accepted
        where accepted.challenge_id = challenge.challenge_id and accepted.decision = 'ACCEPT') as accepted_count,
      challenge.version::text as version
    from competition.challenges as challenge
    join identity.users as initiator on initiator.user_id = challenge.initiator_user_id
    join identity.users as recipient on recipient.user_id = challenge.recipient_user_id
    join competition.ruleset_snapshots as snapshot
      on snapshot.ruleset_snapshot_id = challenge.ruleset_snapshot_id
    join competition.competitions as competitive
      on competitive.competition_id = challenge.competition_id
    join community.communities as community
      on community.community_id = competitive.community_id
    left join competition.genesis_candidate_responses as viewer_response
      on viewer_response.challenge_id = challenge.challenge_id
      and viewer_response.user_id = ${viewerUserId}::uuid
    where challenge.competition_id = ${competitionId}::uuid
      and challenge.response_policy = 'MUTUAL_GENESIS'
      and ${viewerUserId}::uuid in (challenge.initiator_user_id, challenge.recipient_user_id)
      and challenge.state in ('AWAITING_RESPONSE', 'ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED')
    order by challenge.created_at desc, challenge.challenge_id desc
    limit 1
  `.execute(database);
  const row = result.rows[0];
  if (!row) return null;
  const mayRespond = row.state === 'AWAITING_RESPONSE'
    && row.viewer_decision === null
    && row.response_deadline_at.getTime() > Date.now();
  return {
    challengeId: row.challenge_id,
    serviceChatId: row.service_chat_id,
    state: row.state,
    opponentDisplayName: row.opponent_display_name,
    responseDeadlineAt: row.response_deadline_at.toISOString(),
    rulesetRef: row.ruleset_ref,
    rulesetAckMode: row.ruleset_ack_mode,
    viewerDecision: row.viewer_decision,
    acceptedCount: Number(row.accepted_count),
    canAccept: mayRespond && row.participants_eligible,
    canDecline: mayRespond,
    version: Number(row.version),
  };
}

export async function readCompetitionStatus(
  database: Kysely<Database>,
  competitionId: string,
  viewerUserId: string,
): Promise<CompetitionStatusProjection | null> {
  const context = await competitionViewerContext(database, competitionId, viewerUserId);
  if (!context) return null;
  const rows = await queueEntries(database, competitionId);
  const isActiveMember = context.membership_state === 'ACTIVE'
    && context.competition_enabled === true
    && context.membership_age_division === context.user_age_division
    && context.user_age_division === context.competition_age_division;
  let joinDenialCode: StatusQueueConflictCode | null = null;
  try {
    assertStatusQueueEntryCanBeSubmitted(eligibility(context, viewerUserId));
  } catch (error) {
    if (!(error instanceof StatusQueueConflictError)) throw error;
    joinDenialCode = error.code;
  }
  const projectedRows = rows.map((row) => entryProjection(row, viewerUserId));
  return {
    competitionId: context.competition_id,
    phase: context.phase,
    availability: context.availability,
    champion: holder(context.champion_user_id, context.champion_display_name),
    contender: holder(context.contender_user_id, context.contender_display_name),
    statusVersion: Number(context.status_version),
    viewerStatus: viewerStatus(context, viewerUserId),
    visibility: isActiveMember ? 'FULL' : 'AGGREGATE',
    queueSize: rows.length,
    queue: isActiveMember ? projectedRows : [],
    activeChallenge: await activeStatusChallenge(database, competitionId, viewerUserId),
    viewerGenesisAction: isActiveMember
      ? await viewerGenesisAction(database, competitionId, viewerUserId)
      : null,
    viewerQueueEntryId: isActiveMember
      ? projectedRows.find((entry) => entry.isViewerEntry)?.queueEntryId ?? null
      : null,
    canJoinQueue: joinDenialCode === null,
    joinDenialCode,
    policyVersion: STATUS_QUEUE_POLICY_VERSION,
  };
}

async function vacancyCompetition(
  database: Kysely<Database> | Transaction<Database>,
  competitionId: string,
  lock = false,
): Promise<VacancyCompetitionRow | null> {
  const result = lock
    ? await sql<VacancyCompetitionRow>`
        select competitive.competition_id, competitive.phase, competitive.availability,
          (competitive.integrity_hold_case_id is not null or exists (
            select 1 from competition.process_holds as process_hold
            where process_hold.aggregate_type = 'COMPETITION'
              and process_hold.aggregate_id = competitive.competition_id
              and process_hold.reason = 'STATUS_REVIEW' and process_hold.state = 'ACTIVE'
          )) as integrity_hold_active,
          community.state = 'ACTIVE' as community_active,
          competitive.status_lock_result_id is null and not exists (
            select 1 from competition.challenges as challenge
            where challenge.competition_id = competitive.competition_id
              and challenge.stake <> 'NONE'
              and challenge.state in (
                'AWAITING_RESPONSE', 'ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED',
                'IN_SESSION', 'RESULT_PENDING', 'RESULT_RECORDED', 'UNDER_APPEAL'
              )
          ) as status_flow_free,
          competitive.champion_user_id, competitive.contender_user_id,
          competitive.status_version::text, competitive.version::text
        from competition.competitions as competitive
        join community.communities as community
          on community.community_id = competitive.community_id
        where competitive.competition_id = ${competitionId}::uuid
        for update of competitive
      `.execute(database)
    : await sql<VacancyCompetitionRow>`
        select competitive.competition_id, competitive.phase, competitive.availability,
          (competitive.integrity_hold_case_id is not null or exists (
            select 1 from competition.process_holds as process_hold
            where process_hold.aggregate_type = 'COMPETITION'
              and process_hold.aggregate_id = competitive.competition_id
              and process_hold.reason = 'STATUS_REVIEW' and process_hold.state = 'ACTIVE'
          )) as integrity_hold_active,
          community.state = 'ACTIVE' as community_active,
          competitive.status_lock_result_id is null and not exists (
            select 1 from competition.challenges as challenge
            where challenge.competition_id = competitive.competition_id
              and challenge.stake <> 'NONE'
              and challenge.state in (
                'AWAITING_RESPONSE', 'ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED',
                'IN_SESSION', 'RESULT_PENDING', 'RESULT_RECORDED', 'UNDER_APPEAL'
              )
          ) as status_flow_free,
          competitive.champion_user_id, competitive.contender_user_id,
          competitive.status_version::text, competitive.version::text
        from competition.competitions as competitive
        join community.communities as community
          on community.community_id = competitive.community_id
        where competitive.competition_id = ${competitionId}::uuid
      `.execute(database);
  return result.rows[0] ?? null;
}

async function vacancyCandidates(
  database: Kysely<Database> | Transaction<Database>,
  competition: VacancyCompetitionRow,
  lock = false,
): Promise<readonly GenesisCandidateRow[]> {
  const targetStatus = competition.phase === 'FOUNDING_OPEN' ? 'CHAMPION' : 'CONTENDER';
  const result = lock
    ? await sql<GenesisCandidateRow>`
        select queue_entry_id, initiator_user_id, target_status, submitted_at,
          single_candidate_since_at, single_candidate_deadline_at, version::text
        from competition.challenge_queue_entries
        where competition_id = ${competition.competition_id}::uuid
          and target_status = ${targetStatus}
          and kind = 'GENESIS_CANDIDATE' and state = 'WAITING'
        order by submitted_at, queue_entry_id
        limit 2
        for update
      `.execute(database)
    : await sql<GenesisCandidateRow>`
        select queue_entry_id, initiator_user_id, target_status, submitted_at,
          single_candidate_since_at, single_candidate_deadline_at, version::text
        from competition.challenge_queue_entries
        where competition_id = ${competition.competition_id}::uuid
          and target_status = ${targetStatus}
          and kind = 'GENESIS_CANDIDATE' and state = 'WAITING'
        order by submitted_at, queue_entry_id
        limit 2
      `.execute(database);
  return result.rows;
}

async function vacancyQueueAction(
  database: Kysely<Database> | Transaction<Database>,
  competitionId: string,
  lock = false,
): Promise<{
  readonly competition: VacancyCompetitionRow;
  readonly candidates: readonly GenesisCandidateRow[];
  readonly candidate: GenesisCandidateRow;
  readonly action: VacancyQueueReconciliationAction;
  readonly invalidationReason: StatusQueueConflictCode | null;
} | null> {
  const competition = await vacancyCompetition(database, competitionId, lock);
  if (
    !competition
    || !['FOUNDING_OPEN', 'CONTENDER_VACANT_OPEN'].includes(competition.phase)
    || competition.availability !== 'ACTIVE'
    || competition.integrity_hold_active
    || !competition.community_active
    || !competition.status_flow_free
  ) return null;
  const candidates = await vacancyCandidates(database, competition, lock);
  for (const candidate of candidates) {
    const invalidationReason = await genesisCandidateInvalidationReason(
      database,
      competition.competition_id,
      candidate.initiator_user_id,
    );
    if (invalidationReason) {
      return {
        competition,
        candidates,
        candidate,
        action: 'INVALIDATE_CANDIDATE',
        invalidationReason,
      };
    }
  }
  const candidate = candidates[0];
  if (!candidate) return null;
  if (candidates.length >= 2) {
    return {
      competition,
      candidates,
      candidate,
      action: 'PAIR_CANDIDATES',
      invalidationReason: null,
    };
  }
  if (candidate.single_candidate_since_at === null) {
    return {
      competition,
      candidates,
      candidate,
      action: 'START_SINGLE_WINDOW',
      invalidationReason: null,
    };
  }
  return null;
}

export async function readVacancyQueueReconciliationCandidate(
  database: Kysely<Database>,
  competitionId: string,
): Promise<VacancyQueueReconciliationCandidate | null> {
  const action = await vacancyQueueAction(database, competitionId);
  return action ? {
    competitionId: action.competition.competition_id,
    queueEntryId: action.candidate.queue_entry_id,
    version: Number(action.candidate.version),
    action: action.action,
  } : null;
}

export async function readStatusQueueActivationCandidate(
  database: Kysely<Database>,
  competitionId: string,
): Promise<StatusQueueActivationCandidate | null> {
  const result = await sql<{
    readonly competition_id: string;
    readonly queue_entry_id: string;
    readonly version: string;
  }>`
    select competitive.competition_id, head.queue_entry_id, head.version::text
    from competition.competitions as competitive
    join community.communities as community
      on community.community_id = competitive.community_id
    cross join lateral (
      select entry.queue_entry_id, entry.kind, entry.state,
        entry.bound_holder_user_id, entry.version
      from competition.challenge_queue_entries as entry
      where entry.competition_id = competitive.competition_id
        and entry.target_status = 'CONTENDER'
        and entry.state in (
          'WAITING', 'PAIRED_PENDING_ACCEPTANCE', 'RECONFIRMATION_REQUIRED', 'ACTIVATED'
        )
      order by entry.submitted_at, entry.queue_entry_id
      limit 1
    ) as head
    where competitive.competition_id = ${competitionId}::uuid
      and competitive.phase = 'RUNNING'
      and competitive.availability = 'ACTIVE'
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
      and head.state = 'WAITING'
      and head.kind = 'DIRECT_STATUS'
      and head.bound_holder_user_id = competitive.contender_user_id
      and not exists (
        select 1 from scheduling.booking_official_conversions as conversion
        where conversion.competition_id = competitive.competition_id
          and conversion.stake = 'CONTENDER'
          and conversion.state = 'PENDING_CONFIRMATION'
      )
      and not exists (
        select 1 from competition.challenges as challenge
        where challenge.competition_id = competitive.competition_id
          and challenge.stake <> 'NONE'
          and challenge.state in (
            'AWAITING_RESPONSE', 'ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED',
            'IN_SESSION', 'RESULT_PENDING', 'RESULT_RECORDED', 'UNDER_APPEAL'
          )
      )
      and not exists (
        select 1 from competition.challenge_participant_obligations as obligation
        where obligation.user_id = competitive.contender_user_id
          and obligation.released_at is null
      )
  `.execute(database);
  const row = result.rows[0];
  return row ? {
    competitionId: row.competition_id,
    queueEntryId: row.queue_entry_id,
    version: Number(row.version),
  } : null;
}

export async function readStatusQueueReconciliationCandidates(
  database: Kysely<Database>,
  competitionId: string,
): Promise<readonly StatusQueueReconciliationCandidate[]> {
  const result = await sql<{
    readonly competition_id: string;
    readonly queue_entry_id: string;
    readonly version: string;
  }>`
    select competitive.competition_id, entry.queue_entry_id, entry.version::text
    from competition.competitions as competitive
    join competition.challenge_queue_entries as entry
      on entry.competition_id = competitive.competition_id
    where competitive.competition_id = ${competitionId}::uuid
      and competitive.phase = 'RUNNING'
      and competitive.contender_user_id is not null
      and competitive.status_lock_result_id is null
      and entry.kind = 'DIRECT_STATUS'
      and entry.state = 'WAITING'
      and (
        (entry.target_status = 'CONTENDER'
          and entry.bound_holder_user_id is distinct from competitive.contender_user_id)
        or (entry.target_status = 'CHAMPION'
          and entry.initiator_user_id is distinct from competitive.contender_user_id)
      )
    order by entry.submitted_at, entry.queue_entry_id
  `.execute(database);
  return result.rows.map((row) => ({
    competitionId: row.competition_id,
    queueEntryId: row.queue_entry_id,
    version: Number(row.version),
  }));
}

async function directCandidateInvalidationReason(
  transaction: Transaction<Database>,
  competitionId: string,
  userId: string,
  currentContenderUserId: string,
  directChallengeMode: DirectStatusChallengeMode,
): Promise<StatusQueueConflictCode | null> {
  const viewer = await competitionViewerContext(transaction, competitionId, userId);
  if (!viewer) return 'MEMBERSHIP_NOT_ACTIVE';
  try {
    const intent = assertStatusQueueEntryCanBeSubmitted({
      ...eligibility(viewer, userId),
      hasLiveEntry: false,
    });
    if (intent.kind !== 'DIRECT_STATUS') return 'COMPETITION_PHASE_UNAVAILABLE';
    if (intent.boundHolderUserId !== currentContenderUserId) return 'BOUND_HOLDER_CHANGED';
    if (intent.directChallengeMode !== directChallengeMode) {
      return 'COMPETITION_PHASE_UNAVAILABLE';
    }
  } catch (error) {
    if (!(error instanceof StatusQueueConflictError)) throw error;
    return error.code;
  }
  if (await hasActiveGenesisObligation(transaction, userId, userId)) {
    return 'OFFICIAL_OBLIGATION_LIMIT';
  }
  return null;
}

export async function requestStatusQueueReconfirmation(
  database: Kysely<Database>,
  command: CommandEnvelope<RequestStatusQueueReconfirmationPayload>,
  ids: StatusQueueReconfirmationEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<StatusQueueEntryProjection>> {
  if (
    command.actor.type !== 'SYSTEM'
    || command.aggregateType !== 'ChallengeQueueEntry'
    || command.aggregateId !== command.payload.queueEntryId
    || command.commandType !== 'REQUEST_STATUS_QUEUE_RECONFIRMATION'
  ) {
    throw new StatusQueueConflictError('QUEUE_RECONFIRMATION_NOT_REQUIRED');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const competitionResult = await sql<{
        readonly competition_id: string;
        readonly phase: CompetitionPhase;
        readonly contender_user_id: string | null;
        readonly status_lock_result_id: string | null;
      }>`
        select competition_id, phase, contender_user_id, status_lock_result_id
        from competition.competitions
        where competition_id = ${command.payload.competitionId}::uuid
        for update
      `.execute(transaction);
      const competition = competitionResult.rows[0];
      if (
        !competition
        || competition.phase !== 'RUNNING'
        || competition.contender_user_id === null
        || competition.status_lock_result_id !== null
      ) {
        throw new StatusQueueConflictError('COMPETITION_PHASE_UNAVAILABLE');
      }
      const existing = await queueEntry(transaction, command.payload.queueEntryId, true);
      if (!existing || existing.competition_id !== competition.competition_id) {
        throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_FOUND');
      }
      const reconciliationAction = assertStatusQueueReconfirmationCanBeRequested({
        state: existing.state,
        kind: existing.kind,
        targetStatus: existing.target_status,
        initiatorUserId: existing.initiator_user_id,
        boundHolderUserId: existing.bound_holder_user_id,
        currentContenderUserId: competition.contender_user_id,
      });
      const invalidationReason = reconciliationAction === 'INVALIDATE_FORMER_CONTENDER_TITLE_INTENT'
        ? 'FORMER_CONTENDER_TITLE_INTENT' as const
        : await directCandidateInvalidationReason(
            transaction,
            competition.competition_id,
            existing.initiator_user_id,
            competition.contender_user_id,
            existing.direct_challenge_mode ?? 'MANDATORY_CONTENDER',
          );
      if (invalidationReason !== null) {
        const reason = invalidationReason;
        await sql`
          update competition.challenge_queue_entries
          set state = 'INVALIDATED', decided_at = ${context.occurredAt.toISOString()}::timestamptz,
            terminal_reason = ${reason}, version = ${context.nextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where queue_entry_id = ${existing.queue_entry_id}::uuid and state = 'WAITING'
        `.execute(transaction);
        const invalidated = await queueEntry(transaction, existing.queue_entry_id);
        if (!invalidated) throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_FOUND');
        const response = entryProjection(invalidated, existing.initiator_user_id);
        return {
          responseStatus: 200,
          response,
          event: {
            eventId: ids.eventId,
            eventName: 'QueueEntryInvalidated',
            schemaVersion: 1,
            transitionId: 'Q-08',
            payload: {
              queueEntryId: response.queueEntryId,
              competitionId: response.competitionId,
              reasonCode: reason,
              noLoss: true,
            },
            metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
          },
          audit: {
            auditId: ids.auditId,
            action: 'INVALIDATE_STATUS_QUEUE_ENTRY_AFTER_HOLDER_CHANGE',
            transitionId: 'Q-08',
            reasonCode: reason,
            beforeState: existing.state,
            afterState: 'INVALIDATED',
            metadata: { competitionId: response.competitionId, noLoss: true },
          },
          outbox: [
            {
              messageId: ids.outboxMessageId,
              topic: 'competition.status-queue.head-released.v1',
              payload: {
                queueEntryId: response.queueEntryId,
                competitionId: response.competitionId,
                reasonCode: reason,
              },
            },
            {
              messageId: ids.notificationOutboxMessageId,
              topic: 'notification.in_app.v1',
              payload: {
                notifications: [{
                  notificationId: ids.notificationId,
                  recipientUserId: existing.initiator_user_id,
                  category: 'MANDATORY',
                  renderKey: 'status.queue-entry-invalidated',
                  actionTarget: { type: 'COMMUNITY', competitionId: response.competitionId },
                  payload: { queueEntryId: response.queueEntryId, reasonCode: reason, noLoss: true },
                  deadlineAt: null,
                }],
              },
            },
          ],
        };
      }

      const deadline = statusQueueReconfirmationDeadline(context.occurredAt);
      await sql`
        update competition.challenge_queue_entries
        set state = 'RECONFIRMATION_REQUIRED',
          bound_holder_user_id = ${competition.contender_user_id}::uuid,
          reconfirmation_deadline_at = ${deadline.toISOString()}::timestamptz,
          version = ${context.nextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where queue_entry_id = ${existing.queue_entry_id}::uuid and state = 'WAITING'
      `.execute(transaction);
      const updated = await queueEntry(transaction, existing.queue_entry_id);
      if (!updated) throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_FOUND');
      const response = entryProjection(updated, existing.initiator_user_id);
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'QueueReconfirmationRequested',
          schemaVersion: 1,
          transitionId: 'Q-05',
          payload: {
            queueEntryId: response.queueEntryId,
            competitionId: response.competitionId,
            previousHolderUserId: existing.bound_holder_user_id,
            newHolderUserId: competition.contender_user_id,
            submittedAt: response.submittedAt,
            reconfirmationDeadlineAt: deadline.toISOString(),
          },
          metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId,
          action: 'REQUEST_STATUS_QUEUE_RECONFIRMATION',
          transitionId: 'Q-05',
          reasonCode: 'BOUND_HOLDER_CHANGED',
          beforeState: existing.state,
          afterState: 'RECONFIRMATION_REQUIRED',
          metadata: {
            competitionId: response.competitionId,
            previousHolderUserId: existing.bound_holder_user_id,
            newHolderUserId: competition.contender_user_id,
            preservedSubmittedAt: response.submittedAt,
          },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'competition.status-queue.reconfirmation-requested.v1',
            payload: {
              queueEntryId: response.queueEntryId,
              competitionId: response.competitionId,
              timer: {
                commandType: 'EXPIRE_STATUS_QUEUE_RECONFIRMATION',
                aggregateType: 'ChallengeQueueEntry',
                aggregateId: response.queueEntryId,
                expectedState: 'RECONFIRMATION_REQUIRED',
                expectedVersion: context.nextVersion,
                deadlineAt: deadline.toISOString(),
                policyVersion: STATUS_QUEUE_POLICY_VERSION,
                idempotencyKey: `status-queue:${response.queueEntryId}:expire-reconfirmation:v${context.nextVersion}`,
              },
            },
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: {
              notifications: [{
                notificationId: ids.notificationId,
                recipientUserId: existing.initiator_user_id,
                category: 'MANDATORY',
                renderKey: 'status.queue-reconfirmation-required',
                actionTarget: { type: 'COMMUNITY', competitionId: response.competitionId },
                payload: {
                  queueEntryId: response.queueEntryId,
                  newHolderUserId: competition.contender_user_id,
                  preservedFifo: true,
                },
                deadlineAt: deadline.toISOString(),
              }],
            },
          },
        ],
      };
    },
  });
}

export async function reconfirmStatusQueueEntry(
  database: Kysely<Database>,
  command: CommandEnvelope<ReconfirmStatusQueueEntryPayload>,
  ids: StatusQueueReconfirmationEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<StatusQueueEntryProjection>> {
  if (
    command.actor.id === null
    || command.aggregateType !== 'ChallengeQueueEntry'
    || command.aggregateId !== command.payload.queueEntryId
    || command.commandType !== 'RECONFIRM_STATUS_QUEUE_ENTRY'
  ) {
    throw new StatusQueueConflictError('QUEUE_ENTRY_INITIATOR_REQUIRED');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const existing = await queueEntry(transaction, command.payload.queueEntryId, true);
      if (!existing) throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_FOUND');
      const competitionResult = await sql<{
        readonly contender_user_id: string | null;
      }>`
        select contender_user_id from competition.competitions
        where competition_id = ${existing.competition_id}::uuid
        for update
      `.execute(transaction);
      const currentContenderUserId = competitionResult.rows[0]?.contender_user_id ?? null;
      assertStatusQueueEntryCanBeReconfirmed({
        state: existing.state,
        actorUserId: command.actor.id!,
        initiatorUserId: existing.initiator_user_id,
        boundHolderUserId: existing.bound_holder_user_id,
        currentContenderUserId,
        reconfirmationDeadlineAt: existing.reconfirmation_deadline_at,
        occurredAt: context.occurredAt,
      });
      const invalidationReason = await directCandidateInvalidationReason(
        transaction,
        existing.competition_id,
        existing.initiator_user_id,
        currentContenderUserId!,
        existing.direct_challenge_mode ?? 'MANDATORY_CONTENDER',
      );
      if (invalidationReason !== null) throw new StatusQueueConflictError(invalidationReason);
      await sql`
        update competition.challenge_queue_entries
        set state = 'WAITING', reconfirmation_deadline_at = null,
          version = ${context.nextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where queue_entry_id = ${existing.queue_entry_id}::uuid
          and state = 'RECONFIRMATION_REQUIRED'
      `.execute(transaction);
      const updated = await queueEntry(transaction, existing.queue_entry_id);
      if (!updated) throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_FOUND');
      const response = entryProjection(updated, command.actor.id!);
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'QueueEntryReconfirmed',
          schemaVersion: 1,
          transitionId: 'Q-06',
          payload: {
            queueEntryId: response.queueEntryId,
            competitionId: response.competitionId,
            boundHolderUserId: response.boundHolderUserId,
            preservedSubmittedAt: response.submittedAt,
          },
          metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId,
          action: 'RECONFIRM_STATUS_QUEUE_ENTRY',
          transitionId: 'Q-06',
          reasonCode: null,
          beforeState: existing.state,
          afterState: 'WAITING',
          metadata: { competitionId: response.competitionId, preservedSubmittedAt: response.submittedAt },
        },
        outbox: [{
          messageId: ids.outboxMessageId,
          topic: 'competition.status-queue.reconfirmed.v1',
          payload: {
            queueEntryId: response.queueEntryId,
            competitionId: response.competitionId,
            preservedSubmittedAt: response.submittedAt,
          },
        }],
      };
    },
  });
}

export async function readStatusQueueTimerSnapshot(
  database: Kysely<Database>,
  queueEntryId: string,
): Promise<{ readonly state: string; readonly version: number }> {
  const existing = await queueEntry(database, queueEntryId);
  if (!existing) throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_FOUND');
  return { state: existing.state, version: Number(existing.version) };
}

export async function expireStatusQueueReconfirmation(
  database: Kysely<Database>,
  command: CommandEnvelope<ExpireStatusQueueReconfirmationPayload>,
  ids: StatusQueueReconfirmationEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<StatusQueueEntryProjection>> {
  if (
    command.actor.type !== 'SYSTEM'
    || command.aggregateType !== 'ChallengeQueueEntry'
    || command.aggregateId !== command.payload.queueEntryId
    || command.commandType !== 'EXPIRE_STATUS_QUEUE_RECONFIRMATION'
  ) {
    throw new StatusQueueConflictError('QUEUE_RECONFIRMATION_NOT_REQUIRED');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const existing = await queueEntry(transaction, command.payload.queueEntryId, true);
      if (!existing) throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_FOUND');
      await assertNoActivePlatformIncidentForTimer(transaction, {
        commandType: command.commandType,
        aggregateId: command.aggregateId,
        occurredAt: context.occurredAt,
      });
      assertStatusQueueReconfirmationCanExpire({
        state: existing.state,
        reconfirmationDeadlineAt: existing.reconfirmation_deadline_at,
        occurredAt: context.occurredAt,
      });
      await sql`
        update competition.challenge_queue_entries
        set state = 'EXPIRED', reconfirmation_deadline_at = null,
          decided_at = ${context.occurredAt.toISOString()}::timestamptz,
          terminal_reason = 'RECONFIRMATION_EXPIRED', version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where queue_entry_id = ${existing.queue_entry_id}::uuid
          and state = 'RECONFIRMATION_REQUIRED'
      `.execute(transaction);
      const updated = await queueEntry(transaction, existing.queue_entry_id);
      if (!updated) throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_FOUND');
      const response = entryProjection(updated, existing.initiator_user_id);
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'QueueEntryReconfirmationClosed',
          schemaVersion: 1,
          transitionId: 'Q-07',
          payload: {
            queueEntryId: response.queueEntryId,
            competitionId: response.competitionId,
            reasonCode: 'RECONFIRMATION_EXPIRED',
            noLoss: true,
          },
          metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId,
          action: 'EXPIRE_STATUS_QUEUE_RECONFIRMATION',
          transitionId: 'Q-07',
          reasonCode: 'RECONFIRMATION_EXPIRED',
          beforeState: existing.state,
          afterState: 'EXPIRED',
          metadata: { competitionId: response.competitionId, noLoss: true },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'competition.status-queue.head-released.v1',
            payload: {
              queueEntryId: response.queueEntryId,
              competitionId: response.competitionId,
              reasonCode: 'RECONFIRMATION_EXPIRED',
            },
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: {
              notifications: [{
                notificationId: ids.notificationId,
                recipientUserId: existing.initiator_user_id,
                category: 'MANDATORY',
                renderKey: 'status.queue-reconfirmation-expired',
                actionTarget: { type: 'COMMUNITY', competitionId: response.competitionId },
                payload: { queueEntryId: response.queueEntryId, noLoss: true },
                deadlineAt: null,
              }],
            },
          },
        ],
      };
    },
  });
}

export async function activateStatusQueueHead(
  database: Kysely<Database>,
  command: CommandEnvelope<ActivateStatusQueueHeadPayload>,
  ids: StatusQueueEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<StatusQueueEntryProjection>> {
  if (
    command.actor.type !== 'SYSTEM'
    || command.aggregateType !== 'ChallengeQueueEntry'
    || command.aggregateId !== command.payload.queueEntryId
    || command.commandType !== 'ACTIVATE_STATUS_QUEUE_HEAD'
  ) {
    throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_HEAD');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const competitionResult = await sql<ActivationCompetitionRow>`
        select competitive.competition_id, competitive.phase, competitive.availability,
          (competitive.integrity_hold_case_id is not null or exists (
            select 1 from competition.process_holds as process_hold
            where process_hold.aggregate_type = 'COMPETITION'
              and process_hold.aggregate_id = competitive.competition_id
              and process_hold.reason = 'STATUS_REVIEW' and process_hold.state = 'ACTIVE'
          )) as integrity_hold_active,
          community.state = 'ACTIVE' as community_active,
          competitive.champion_user_id,
          competitive.contender_user_id,
          (
            competitive.status_lock_result_id is null
            and not exists (
              select 1 from scheduling.booking_official_conversions as conversion
              where conversion.competition_id = competitive.competition_id
                and conversion.stake = 'CONTENDER'
                and conversion.state = 'PENDING_CONFIRMATION'
            )
            and not exists (
              select 1 from competition.challenges as challenge
              where challenge.competition_id = competitive.competition_id
                and challenge.stake <> 'NONE'
                and challenge.state in (
                  'AWAITING_RESPONSE', 'ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED',
                  'IN_SESSION', 'RESULT_PENDING', 'RESULT_RECORDED', 'UNDER_APPEAL'
                )
            )
          ) as status_slot_free
        from competition.competitions as competitive
        join community.communities as community
          on community.community_id = competitive.community_id
        where competitive.competition_id = ${command.payload.competitionId}::uuid
        for update of competitive
      `.execute(transaction);
      const competition = competitionResult.rows[0];
      if (!competition) throw new StatusQueueConflictError('COMPETITION_PHASE_UNAVAILABLE');

      const headResult = await sql<{ readonly queue_entry_id: string }>`
        select queue_entry_id
        from competition.challenge_queue_entries
        where competition_id = ${competition.competition_id}::uuid
          and target_status = 'CONTENDER'
          and state in (
            'WAITING', 'PAIRED_PENDING_ACCEPTANCE', 'RECONFIRMATION_REQUIRED', 'ACTIVATED'
          )
        order by submitted_at, queue_entry_id
        limit 1
        for update
      `.execute(transaction);
      const existing = await queueEntry(transaction, command.aggregateId, true);
      if (!existing) throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_FOUND');
      assertDirectStatusQueueHeadCanBeActivated({
        state: existing.state,
        kind: existing.kind,
        strictHead: headResult.rows[0]?.queue_entry_id === existing.queue_entry_id,
        competitionPhase: competition.phase,
        statusSlotFree: competition.status_slot_free,
        boundHolderUserId: existing.bound_holder_user_id,
        currentContenderUserId: competition.contender_user_id,
      });
      if (!competition.community_active) {
        throw new StatusQueueConflictError('COMMUNITY_NOT_ACTIVE');
      }
      if (competition.availability !== 'ACTIVE') {
        throw new StatusQueueConflictError('COMPETITION_NOT_ACTIVE');
      }
      if (competition.integrity_hold_active) {
        throw new StatusQueueConflictError('COMPETITION_INTEGRITY_HOLD');
      }
      const contenderUserId = competition.contender_user_id!;
      for (const userId of [existing.initiator_user_id, contenderUserId].sort()) {
        await sql`
          select pg_advisory_xact_lock(hashtextextended(${`challenge-obligation:${userId}`}, 0))
        `.execute(transaction);
      }
      const invalidationReason = await directCandidateInvalidationReason(
        transaction,
        competition.competition_id,
        existing.initiator_user_id,
        contenderUserId,
        existing.direct_challenge_mode ?? 'MANDATORY_CONTENDER',
      );
      if (invalidationReason && invalidationReason !== 'BOUND_HOLDER_CHANGED') {
        await sql`
          update competition.challenge_queue_entries
          set state = 'INVALIDATED', decided_at = ${context.occurredAt.toISOString()}::timestamptz,
            terminal_reason = ${invalidationReason}, version = ${context.nextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where queue_entry_id = ${existing.queue_entry_id}::uuid and state = 'WAITING'
        `.execute(transaction);
        const invalidated = await queueEntry(transaction, existing.queue_entry_id);
        if (!invalidated) throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_FOUND');
        const response = entryProjection(invalidated, existing.initiator_user_id);
        return {
          responseStatus: 200,
          response,
          event: {
            eventId: ids.eventId,
            eventName: 'QueueEntryInvalidated',
            schemaVersion: 1,
            transitionId: 'Q-08',
            payload: {
              queueEntryId: existing.queue_entry_id,
              competitionId: competition.competition_id,
              reasonCode: invalidationReason,
              noLoss: true,
            },
            metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
          },
          audit: {
            auditId: ids.auditId,
            action: 'INVALIDATE_STATUS_QUEUE_HEAD',
            transitionId: 'Q-08',
            reasonCode: invalidationReason,
            beforeState: existing.state,
            afterState: 'INVALIDATED',
            metadata: { competitionId: competition.competition_id, noLoss: true },
          },
          outbox: [
            {
              messageId: ids.outboxMessageId,
              topic: 'competition.status-queue.head-released.v1',
              payload: {
                queueEntryId: existing.queue_entry_id,
                competitionId: competition.competition_id,
                reasonCode: invalidationReason,
              },
            },
            {
              messageId: ids.notificationOutboxMessageId,
              topic: 'notification.in_app.v1',
              payload: {
                notifications: [{
                  notificationId: ids.notificationIds[0],
                  recipientUserId: existing.initiator_user_id,
                  category: 'MANDATORY',
                  renderKey: 'status.queue-entry-invalidated',
                  actionTarget: { type: 'COMMUNITY', competitionId: competition.competition_id },
                  payload: { queueEntryId: existing.queue_entry_id, reasonCode: invalidationReason, noLoss: true },
                  deadlineAt: null,
                }],
              },
            },
          ],
        };
      }
      if (invalidationReason === 'BOUND_HOLDER_CHANGED') {
        throw new StatusQueueConflictError('BOUND_HOLDER_CHANGED');
      }

      const holder = await competitionViewerContext(
        transaction,
        competition.competition_id,
        contenderUserId,
      );
      if (!holder) throw new StatusQueueConflictError('STATUS_SLOT_OCCUPIED');
      const holderEligibility = eligibility(holder, contenderUserId);
      if (
        !holderEligibility.accountActive
        || !holderEligibility.accountVerified
        || !holderEligibility.communityActive
        || !holderEligibility.membershipActive
        || !holderEligibility.sameAgeContour
        || holderEligibility.competitionAvailability !== 'ACTIVE'
        || holderEligibility.integrityHoldActive
        || holderEligibility.actorStatus !== 'CONTENDER'
        || await hasActiveGenesisObligation(transaction, contenderUserId, contenderUserId)
      ) {
        throw new StatusQueueConflictError('STATUS_SLOT_OCCUPIED');
      }

      const configurationResult = await sql<GenesisConfigurationRow>`
        select configuration.configuration_id, configuration.ruleset_ref,
          configuration.ruleset_ack_mode
        from competition.competitions as competitive
        join community.communities as community on community.community_id = competitive.community_id
        join community.community_configuration_versions as configuration
          on configuration.configuration_id = community.configuration_id
        where competitive.competition_id = ${competition.competition_id}::uuid
      `.execute(transaction);
      const configuration = configurationResult.rows[0];
      if (!configuration) throw new StatusQueueConflictError('COMMUNITY_NOT_ACTIVE');
      if (configuration.ruleset_ack_mode === 'EXPLICIT_ACK_REQUIRED') {
        throw new StatusQueueConflictError('RULESET_ACK_REQUIRED');
      }
      const pair = normalizeSocialPair(existing.initiator_user_id, contenderUserId);
      const optionalTitle = existing.direct_challenge_mode === 'OPTIONAL_TITLE';
      if (optionalTitle && competition.champion_user_id !== existing.initiator_user_id) {
        throw new StatusQueueConflictError('COMPETITION_PHASE_UNAVAILABLE');
      }
      const responsePolicy = optionalTitle ? 'OPTIONAL' as const : 'MANDATORY' as const;
      const stake = optionalTitle ? 'TITLE' as const : 'CONTENDER' as const;
      const responseDeadline = optionalTitle
        ? optionalChallengeResponseDeadline(context.occurredAt)
        : mandatoryChallengeResponseDeadline(context.occurredAt);
      const reminderDeadlines = optionalTitle
        ? optionalChallengeReminderDeadlines(context.occurredAt)
        : mandatoryChallengeReminderDeadlines(context.occurredAt);

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
          ${ids.rulesetSnapshotId}::uuid, ${competition.competition_id}::uuid,
          ${configuration.configuration_id}::uuid, ${configuration.ruleset_ref},
          ${configuration.ruleset_ack_mode}, ${CHALLENGE_POLICY_VERSION},
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
          ${ids.challengeId}::uuid, ${competition.competition_id}::uuid, null,
          ${ids.serviceChatId}::uuid, ${ids.serviceChatId}::uuid,
          ${existing.initiator_user_id}::uuid, ${contenderUserId}::uuid,
          ${pair.lowUserId}::uuid, ${pair.highUserId}::uuid,
          ${responsePolicy}, ${stake}, 'AWAITING_RESPONSE', ${ids.rulesetSnapshotId}::uuid,
          ${responseDeadline.toISOString()}::timestamptz, 1,
          ${context.occurredAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        insert into competition.challenge_ruleset_acknowledgments (
          acknowledgment_id, challenge_id, user_id, ruleset_snapshot_id, mode, acknowledged_at
        ) values (
          ${ids.acknowledgmentId}::uuid, ${ids.challengeId}::uuid,
          ${existing.initiator_user_id}::uuid, ${ids.rulesetSnapshotId}::uuid,
          'IMPLICIT_ON_CREATE', ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        update competition.challenge_queue_entries
        set state = 'CONSUMED', linked_challenge_id = ${ids.challengeId}::uuid,
          decided_at = ${context.occurredAt.toISOString()}::timestamptz,
          terminal_reason = 'CHALLENGE_CREATED', version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where queue_entry_id = ${existing.queue_entry_id}::uuid and state = 'WAITING'
      `.execute(transaction);
      const consumed = await queueEntry(transaction, existing.queue_entry_id);
      if (!consumed) throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_FOUND');
      const response = entryProjection(consumed, existing.initiator_user_id);
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'QueueEntryActivated',
          schemaVersion: 1,
          transitionId: 'Q-03',
          payload: {
            queueEntryId: existing.queue_entry_id,
            competitionId: competition.competition_id,
            challengeId: ids.challengeId,
            boundHolderUserId: contenderUserId,
            consumedAtomically: true,
          },
          metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
        },
        relatedEvents: [
          {
            eventId: ids.challengeEventId,
            eventName: 'ChallengeCreated',
            schemaVersion: 1,
            transitionId: 'CH-01',
            aggregateType: 'Challenge',
            aggregateId: ids.challengeId,
            aggregateVersion: 1,
            payload: {
              challengeId: ids.challengeId,
              competitionId: competition.competition_id,
              participants: [existing.initiator_user_id, contenderUserId],
              responsePolicy,
              stake,
              responseDeadlineAt: responseDeadline.toISOString(),
            },
            metadata: { policyVersion: CHALLENGE_POLICY_VERSION, rulesetSnapshotId: ids.rulesetSnapshotId },
          },
          {
            eventId: ids.serviceChatEventId,
            eventName: 'ChatOpened',
            schemaVersion: 1,
            transitionId: 'CT-01',
            aggregateType: 'Chat',
            aggregateId: ids.serviceChatId,
            aggregateVersion: 1,
            payload: {
              chatId: ids.serviceChatId,
              scope: 'CHALLENGE_SERVICE',
              challengeId: ids.challengeId,
              participants: [pair.lowUserId, pair.highUserId],
            },
            metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
          },
        ],
        audit: {
          auditId: ids.auditId,
          action: 'ACTIVATE_AND_CONSUME_STATUS_QUEUE_HEAD',
          transitionId: 'Q-04',
          reasonCode: null,
          beforeState: existing.state,
          afterState: 'CONSUMED',
          metadata: { competitionId: competition.competition_id, challengeId: ids.challengeId },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'competition.status-queue.consumed.v1',
            payload: {
              queueEntryId: existing.queue_entry_id,
              competitionId: competition.competition_id,
              challengeId: ids.challengeId,
            },
          },
          ...(optionalTitle ? [
            {
              messageId: ids.timerOutboxMessageId,
              topic: 'competition.challenge.created.v1',
              payload: {
                challengeId: ids.challengeId,
                timer: {
                  commandType: 'EXPIRE_OPTIONAL_CHALLENGE',
                  aggregateType: 'Challenge',
                  aggregateId: ids.challengeId,
                  expectedState: 'AWAITING_RESPONSE',
                  expectedVersion: 1,
                  deadlineAt: responseDeadline.toISOString(),
                  policyVersion: CHALLENGE_POLICY_VERSION,
                  idempotencyKey: `challenge:${ids.challengeId}:expire-optional:v1`,
                },
              },
            },
            ...reminderDeadlines.map((deadlineAt, index) => ({
              messageId: ids.optionalReminderTimerOutboxMessageIds?.[index]
                ?? (index === 0 ? ids.staleQueueEventId : ids.staleQueueOutboxMessageId),
              topic: index === 0
                ? 'competition.challenge.optional-response-reminder-12h-timer.v1'
                : 'competition.challenge.optional-response-reminder-24h-timer.v1',
              payload: {
                challengeId: ids.challengeId,
                timer: {
                  commandType: index === 0
                    ? 'REMIND_OPTIONAL_CHALLENGE_RESPONSE_12H'
                    : 'REMIND_OPTIONAL_CHALLENGE_RESPONSE_24H',
                  aggregateType: 'Challenge',
                  aggregateId: ids.challengeId,
                  expectedState: 'AWAITING_RESPONSE',
                  expectedVersion: 1,
                  deadlineAt: deadlineAt.toISOString(),
                  policyVersion: CHALLENGE_POLICY_VERSION,
                  idempotencyKey: `challenge:${ids.challengeId}:optional-response-reminder-${index === 0 ? '12h' : '24h'}:v1`,
                },
              },
            })),
          ] : [
          {
            messageId: ids.timerOutboxMessageId,
            topic: 'competition.challenge.mandatory-response-timer.v1',
            payload: {
              challengeId: ids.challengeId,
              reminderDeadlines: reminderDeadlines.map((deadline) => deadline.toISOString()),
              timer: {
                commandType: 'EXPIRE_MANDATORY_CHALLENGE',
                aggregateType: 'Challenge',
                aggregateId: ids.challengeId,
                expectedState: 'AWAITING_RESPONSE',
                expectedVersion: 1,
                deadlineAt: responseDeadline.toISOString(),
                policyVersion: CHALLENGE_POLICY_VERSION,
                idempotencyKey: `challenge:${ids.challengeId}:expire-mandatory:v1`,
              },
            },
          },
          {
            messageId: ids.mandatoryReminderTimerOutboxMessageId ?? ids.staleQueueOutboxMessageId,
            topic: 'competition.challenge.mandatory-response-reminder-48h-timer.v1',
            payload: {
              challengeId: ids.challengeId,
              timer: {
                commandType: 'REMIND_MANDATORY_CHALLENGE_RESPONSE_48H',
                aggregateType: 'Challenge',
                aggregateId: ids.challengeId,
                expectedState: 'AWAITING_RESPONSE',
                expectedVersion: 1,
                deadlineAt: reminderDeadlines[0].toISOString(),
                policyVersion: CHALLENGE_POLICY_VERSION,
                idempotencyKey: `challenge:${ids.challengeId}:mandatory-response-reminder-48h:v1`,
              },
            },
          },
          ]),
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: {
              notifications: [
                {
                  notificationId: ids.notificationIds[0],
                  recipientUserId: contenderUserId,
                  category: 'MANDATORY',
                  renderKey: optionalTitle
                    ? 'challenge.optional-title-received'
                    : 'challenge.mandatory-received',
                  actionTarget: { type: 'CHAT', chatId: ids.serviceChatId },
                  payload: {
                    challengeId: ids.challengeId,
                    challengerUserId: existing.initiator_user_id,
                    responsePolicy,
                    stake,
                    declineHasNoForfeit: optionalTitle,
                  },
                  deadlineAt: responseDeadline.toISOString(),
                },
                {
                  notificationId: ids.notificationIds[1],
                  recipientUserId: existing.initiator_user_id,
                  category: 'MANDATORY',
                  renderKey: 'status.queue-entry-activated',
                  actionTarget: { type: 'CHAT', chatId: ids.serviceChatId },
                  payload: {
                    challengeId: ids.challengeId,
                    contenderUserId,
                    responsePolicy,
                    stake,
                  },
                  deadlineAt: responseDeadline.toISOString(),
                },
              ],
            },
          },
        ],
      };
    },
  });
}

export async function reconcileVacancyQueue(
  database: Kysely<Database>,
  command: CommandEnvelope<ReconcileVacancyQueuePayload>,
  ids: StatusQueueEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<StatusQueueEntryProjection>> {
  if (
    command.actor.type !== 'SYSTEM'
    || command.actor.id !== null
    || command.aggregateType !== 'ChallengeQueueEntry'
    || command.aggregateId !== command.payload.queueEntryId
    || command.commandType !== 'RECONCILE_VACANCY_QUEUE'
  ) {
    throw new StatusQueueConflictError('COMPETITION_PHASE_UNAVAILABLE');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const selected = await vacancyQueueAction(
        transaction,
        command.payload.competitionId,
        true,
      );
      if (
        !selected
        || selected.candidate.queue_entry_id !== command.aggregateId
        || selected.action !== command.payload.action
      ) {
        throw new StatusQueueConflictError('GENESIS_SINGLE_CANDIDATE_CHANGED');
      }
      const beforeState = 'WAITING';
      if (selected.action === 'INVALIDATE_CANDIDATE') {
        const reason = selected.invalidationReason;
        if (!reason) throw new StatusQueueConflictError('GENESIS_SINGLE_CANDIDATE_CHANGED');
        await sql`
          update competition.challenge_queue_entries
          set state = 'INVALIDATED', single_candidate_since_at = null,
            single_candidate_deadline_at = null,
            decided_at = ${context.occurredAt.toISOString()}::timestamptz,
            terminal_reason = ${reason}, version = ${context.nextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where queue_entry_id = ${command.aggregateId}::uuid
            and kind = 'GENESIS_CANDIDATE' and state = 'WAITING'
        `.execute(transaction);
        const invalidated = await queueEntry(transaction, command.aggregateId);
        if (!invalidated) throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_FOUND');
        const response = entryProjection(invalidated, invalidated.initiator_user_id);
        return {
          responseStatus: 200,
          response,
          event: {
            eventId: ids.eventId,
            eventName: 'QueueEntryInvalidated',
            schemaVersion: 1,
            transitionId: 'Q-08',
            payload: {
              queueEntryId: response.queueEntryId,
              competitionId: response.competitionId,
              reasonCode: reason,
              noLoss: true,
            },
            metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
          },
          audit: {
            auditId: ids.auditId,
            action: 'RECONCILE_VACANCY_QUEUE',
            transitionId: 'Q-08',
            reasonCode: reason,
            beforeState,
            afterState: 'INVALIDATED',
            metadata: { competitionId: response.competitionId, noLoss: true },
          },
          outbox: [
            {
              messageId: ids.outboxMessageId,
              topic: 'competition.status-vacancy.reconcile.v1',
              payload: {
                competitionId: response.competitionId,
                invalidatedQueueEntryId: response.queueEntryId,
                reasonCode: reason,
              },
            },
            {
              messageId: ids.notificationOutboxMessageId,
              topic: 'notification.in_app.v1',
              payload: {
                notifications: [{
                  notificationId: ids.notificationIds[0],
                  recipientUserId: invalidated.initiator_user_id,
                  category: 'MANDATORY',
                  renderKey: 'status.queue-entry-invalidated',
                  actionTarget: { type: 'COMMUNITY', competitionId: response.competitionId },
                  payload: { queueEntryId: response.queueEntryId, reasonCode: reason, noLoss: true },
                  deadlineAt: null,
                }],
              },
            },
          ],
        };
      }

      if (selected.action === 'START_SINGLE_WINDOW') {
        const deadline = genesisSingleCandidateDeadline(context.occurredAt);
        await sql`
          update competition.challenge_queue_entries
          set single_candidate_since_at = ${context.occurredAt.toISOString()}::timestamptz,
            single_candidate_deadline_at = ${deadline.toISOString()}::timestamptz,
            version = ${context.nextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where queue_entry_id = ${command.aggregateId}::uuid
            and kind = 'GENESIS_CANDIDATE' and state = 'WAITING'
            and single_candidate_since_at is null
        `.execute(transaction);
        const waiting = await queueEntry(transaction, command.aggregateId);
        if (!waiting) throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_FOUND');
        const response = entryProjection(waiting, waiting.initiator_user_id);
        return {
          responseStatus: 200,
          response,
          event: {
            eventId: ids.eventId,
            eventName: 'GenesisSingleCandidateWindowStarted',
            schemaVersion: 1,
            transitionId: null,
            payload: {
              queueEntryId: response.queueEntryId,
              competitionId: response.competitionId,
              targetStatus: response.targetStatus,
              deadlineAt: deadline.toISOString(),
            },
            metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
          },
          audit: {
            auditId: ids.auditId,
            action: 'START_GENESIS_SINGLE_CANDIDATE_WINDOW',
            transitionId: null,
            reasonCode: null,
            beforeState,
            afterState: 'WAITING',
            metadata: { competitionId: response.competitionId, deadlineAt: deadline.toISOString() },
          },
          outbox: [
            {
              messageId: ids.timerOutboxMessageId,
              topic: 'competition.status-vacancy.single-candidate-window.v1',
              payload: {
                competitionId: response.competitionId,
                queueEntryId: response.queueEntryId,
                deadlineAt: deadline.toISOString(),
                timer: {
                  commandType: 'PROMOTE_SINGLE_GENESIS_CANDIDATE',
                  aggregateType: 'ChallengeQueueEntry',
                  aggregateId: response.queueEntryId,
                  expectedState: 'WAITING',
                  expectedVersion: response.version,
                  deadlineAt: deadline.toISOString(),
                  policyVersion: STATUS_QUEUE_POLICY_VERSION,
                  idempotencyKey: `genesis:${response.queueEntryId}:single-promote:v${response.version}`,
                },
              },
            },
            {
              messageId: ids.notificationOutboxMessageId,
              topic: 'notification.in_app.v1',
              payload: {
                notifications: [{
                  notificationId: ids.notificationIds[0],
                  recipientUserId: waiting.initiator_user_id,
                  category: 'MANDATORY',
                  renderKey: 'status.genesis-single-window-started',
                  actionTarget: { type: 'COMMUNITY', competitionId: response.competitionId },
                  payload: {
                    queueEntryId: response.queueEntryId,
                    targetStatus: response.targetStatus,
                  },
                  deadlineAt: deadline.toISOString(),
                }],
              },
            },
          ],
        };
      }

      const [first, second] = selected.candidates as [GenesisCandidateRow, GenesisCandidateRow];
      for (const userId of [first.initiator_user_id, second.initiator_user_id].sort()) {
        await sql`
          select pg_advisory_xact_lock(hashtextextended(${`challenge-obligation:${userId}`}, 0))
        `.execute(transaction);
      }
      if (await hasActiveGenesisObligation(
        transaction,
        first.initiator_user_id,
        second.initiator_user_id,
      )) {
        throw new StatusQueueConflictError('OFFICIAL_OBLIGATION_LIMIT');
      }
      const configurationResult = await sql<GenesisConfigurationRow>`
        select configuration.configuration_id, configuration.ruleset_ref,
          configuration.ruleset_ack_mode
        from competition.competitions as competitive
        join community.communities as community on community.community_id = competitive.community_id
        join community.community_configuration_versions as configuration
          on configuration.configuration_id = community.configuration_id
        where competitive.competition_id = ${selected.competition.competition_id}::uuid
      `.execute(transaction);
      const configuration = configurationResult.rows[0];
      if (!configuration) throw new StatusQueueConflictError('COMMUNITY_NOT_ACTIVE');
      const pair = normalizeSocialPair(first.initiator_user_id, second.initiator_user_id);
      const responseDeadline = genesisResponseDeadline(context.occurredAt);
      const stake = first.target_status === 'CHAMPION'
        ? 'GENESIS_CHAMPION'
        : 'GENESIS_CONTENDER';
      const phase = first.target_status === 'CHAMPION'
        ? 'FOUNDING_CHALLENGE'
        : 'CONTENDER_GENESIS';
      const competitionTransitionId = first.target_status === 'CHAMPION' ? 'C-02' : 'C-07';
      const competitionEventName = first.target_status === 'CHAMPION'
        ? 'FoundingGenesisPaired'
        : 'ContenderGenesisPaired';
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
          ${ids.rulesetSnapshotId}::uuid, ${selected.competition.competition_id}::uuid,
          ${configuration.configuration_id}::uuid, ${configuration.ruleset_ref},
          ${configuration.ruleset_ack_mode}, ${CHALLENGE_POLICY_VERSION},
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
          ${ids.challengeId}::uuid, ${selected.competition.competition_id}::uuid, null,
          ${ids.serviceChatId}::uuid, ${ids.serviceChatId}::uuid,
          ${first.initiator_user_id}::uuid, ${second.initiator_user_id}::uuid,
          ${pair.lowUserId}::uuid, ${pair.highUserId}::uuid,
          'MUTUAL_GENESIS', ${stake}, 'AWAITING_RESPONSE', ${ids.rulesetSnapshotId}::uuid,
          ${responseDeadline.toISOString()}::timestamptz, 1,
          ${context.occurredAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        update competition.challenge_queue_entries
        set state = 'PAIRED_PENDING_ACCEPTANCE', linked_challenge_id = ${ids.challengeId}::uuid,
          single_candidate_since_at = null, single_candidate_deadline_at = null,
          version = case when queue_entry_id = ${first.queue_entry_id}::uuid
            then ${context.nextVersion} else version + 1 end,
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where queue_entry_id in (${first.queue_entry_id}::uuid, ${second.queue_entry_id}::uuid)
      `.execute(transaction);
      await sql`
        update competition.competitions
        set phase = ${phase}, version = version + 1,
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where competition_id = ${selected.competition.competition_id}::uuid
      `.execute(transaction);
      const paired = await queueEntry(transaction, first.queue_entry_id);
      if (!paired) throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_FOUND');
      const response = entryProjection(paired, paired.initiator_user_id);
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'GenesisCandidatePaired',
          schemaVersion: 1,
          transitionId: 'Q-11',
          payload: {
            challengeId: ids.challengeId,
            competitionId: response.competitionId,
            counterpartQueueEntryId: second.queue_entry_id,
          },
          metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
        },
        relatedEvents: [
          {
            eventId: ids.pairedQueueEventId,
            eventName: 'GenesisCandidatePaired',
            schemaVersion: 1,
            transitionId: 'Q-11',
            aggregateType: 'ChallengeQueueEntry',
            aggregateId: second.queue_entry_id,
            aggregateVersion: Number(second.version) + 1,
            payload: { challengeId: ids.challengeId, counterpartQueueEntryId: first.queue_entry_id },
            metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
          },
          {
            eventId: ids.challengeEventId,
            eventName: 'GenesisChallengeCreated',
            schemaVersion: 1,
            transitionId: 'Q-11',
            aggregateType: 'Challenge',
            aggregateId: ids.challengeId,
            aggregateVersion: 1,
            payload: {
              competitionId: response.competitionId,
              responsePolicy: 'MUTUAL_GENESIS',
              responseDeadlineAt: responseDeadline.toISOString(),
            },
            metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
          },
          {
            eventId: ids.serviceChatEventId,
            eventName: 'ChatOpened',
            schemaVersion: 1,
            transitionId: 'CT-01',
            aggregateType: 'Chat',
            aggregateId: ids.serviceChatId,
            aggregateVersion: 1,
            payload: { chatId: ids.serviceChatId, scope: 'CHALLENGE_SERVICE', challengeId: ids.challengeId },
            metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
          },
          {
            eventId: ids.staleQueueEventId,
            eventName: competitionEventName,
            schemaVersion: 1,
            transitionId: competitionTransitionId,
            aggregateType: 'Competition',
            aggregateId: selected.competition.competition_id,
            aggregateVersion: Number(selected.competition.version) + 1,
            payload: {
              challengeId: ids.challengeId,
              candidateQueueEntryIds: [first.queue_entry_id, second.queue_entry_id],
              phase,
            },
            metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
          },
        ],
        audit: {
          auditId: ids.auditId,
          action: 'RECONCILE_VACANCY_QUEUE',
          transitionId: 'Q-11',
          reasonCode: null,
          beforeState,
          afterState: 'PAIRED_PENDING_ACCEPTANCE',
          metadata: {
            competitionId: response.competitionId,
            candidateQueueEntryIds: [first.queue_entry_id, second.queue_entry_id],
          },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'competition.genesis.paired.v1',
            payload: { challengeId: ids.challengeId, competitionId: response.competitionId },
          },
          {
            messageId: ids.timerOutboxMessageId,
            topic: 'competition.genesis.response-timer.v1',
            payload: {
              challengeId: ids.challengeId,
              deadlineAt: responseDeadline.toISOString(),
              timer: {
                commandType: 'EXPIRE_GENESIS_CHALLENGE',
                aggregateType: 'Challenge',
                aggregateId: ids.challengeId,
                expectedState: 'AWAITING_RESPONSE',
                expectedVersion: 1,
                deadlineAt: responseDeadline.toISOString(),
                policyVersion: STATUS_QUEUE_POLICY_VERSION,
                idempotencyKey: `genesis:${ids.challengeId}:expire:v1`,
              },
            },
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: {
              notifications: [first, second].map((candidate, index) => ({
                notificationId: ids.notificationIds[index]!,
                recipientUserId: candidate.initiator_user_id,
                category: 'MANDATORY',
                renderKey: 'status.genesis-paired',
                actionTarget: { type: 'CHAT', chatId: ids.serviceChatId },
                payload: { challengeId: ids.challengeId, competitionId: response.competitionId },
                deadlineAt: responseDeadline.toISOString(),
              })),
            },
          },
        ],
      };
    },
  });
}

export async function submitStatusQueueEntry(
  database: Kysely<Database>,
  command: CommandEnvelope<SubmitStatusQueueEntryPayload>,
  ids: StatusQueueEffectIds,
): Promise<ExecutedCommand<StatusQueueEntryProjection>> {
  if (command.actor.id === null || command.aggregateType !== 'ChallengeQueueEntry'
    || command.commandType !== 'SUBMIT_STATUS_QUEUE_ENTRY') {
    throw new StatusQueueConflictError('MEMBERSHIP_NOT_ACTIVE');
  }
  return executeCriticalCommand(database, {
    command,
    mutate: async (transaction, context) => {
      await sql`
        select competition_id from competition.competitions
        where competition_id = ${command.payload.competitionId}::uuid
        for update
      `.execute(transaction);
      const viewer = await competitionViewerContext(
        transaction,
        command.payload.competitionId,
        command.actor.id!,
      );
      if (!viewer) throw new StatusQueueConflictError('MEMBERSHIP_NOT_ACTIVE');
      await assertYouthOfficialAvailableForUser(transaction, command.actor.id!);
      const intent: StatusQueueIntent = assertStatusQueueEntryCanBeSubmitted(
        eligibility(viewer, command.actor.id!),
      );
      await sql`
        insert into competition.challenge_queue_entries (
          queue_entry_id, competition_id, initiator_user_id, target_status,
          kind, state, bound_holder_user_id, direct_challenge_mode, source_type, source_id,
          submitted_at, version, created_at, updated_at
        ) values (
          ${command.aggregateId}::uuid, ${command.payload.competitionId}::uuid,
          ${command.actor.id}::uuid, ${intent.targetStatus}, ${intent.kind}, 'WAITING',
          ${intent.boundHolderUserId}::uuid, ${intent.directChallengeMode}, 'DIRECT', null,
          clock_timestamp(), ${context.nextVersion}, clock_timestamp(), clock_timestamp()
        )
      `.execute(transaction);

      const candidatesResult = intent.kind === 'GENESIS_CANDIDATE'
        ? await sql<GenesisCandidateRow>`
            select queue_entry_id, initiator_user_id, target_status, submitted_at,
              single_candidate_since_at, single_candidate_deadline_at, version::text
            from competition.challenge_queue_entries
            where competition_id = ${command.payload.competitionId}::uuid
              and target_status = ${intent.targetStatus}
              and kind = 'GENESIS_CANDIDATE' and state = 'WAITING'
            order by submitted_at, queue_entry_id
            limit 2
            for update
          `.execute(transaction)
        : { rows: [] as GenesisCandidateRow[] };
      const candidates = candidatesResult.rows;
      let paired = false;
      let staleCandidate: {
        readonly row: GenesisCandidateRow;
        readonly reason: StatusQueueConflictCode;
      } | null = null;
      let pairedPreviousCandidate: GenesisCandidateRow | null = null;
      if (candidates.length === 2) {
        const currentCandidate = candidates.find(
          (candidate) => candidate.queue_entry_id === command.aggregateId,
        );
        const previousCandidate = candidates.find(
          (candidate) => candidate.queue_entry_id !== command.aggregateId,
        );
        if (!currentCandidate || !previousCandidate) {
          throw new StatusQueueConflictError('LIVE_QUEUE_ENTRY_EXISTS');
        }
        for (const userId of candidates.map((candidate) => candidate.initiator_user_id).sort()) {
          await sql`
            select pg_advisory_xact_lock(hashtextextended(${`challenge-obligation:${userId}`}, 0))
          `.execute(transaction);
        }
        if (await hasActiveGenesisObligation(
          transaction,
          currentCandidate.initiator_user_id,
          currentCandidate.initiator_user_id,
        )) {
          throw new StatusQueueConflictError('OFFICIAL_OBLIGATION_LIMIT');
        }
        const invalidationReason = await genesisCandidateInvalidationReason(
          transaction,
          command.payload.competitionId,
          previousCandidate.initiator_user_id,
        );
        if (invalidationReason) {
          staleCandidate = { row: previousCandidate, reason: invalidationReason };
          await sql`
            update competition.challenge_queue_entries
            set state = 'INVALIDATED', decided_at = ${context.occurredAt.toISOString()}::timestamptz,
              terminal_reason = ${invalidationReason}, single_candidate_since_at = null,
              single_candidate_deadline_at = null,
              version = version + 1,
              updated_at = ${context.occurredAt.toISOString()}::timestamptz
            where queue_entry_id = ${previousCandidate.queue_entry_id}::uuid
              and state = 'WAITING'
          `.execute(transaction);
        }
      }
      if (candidates.length === 2 && staleCandidate === null) {
        paired = true;
        pairedPreviousCandidate = candidates.find(
          (candidate) => candidate.queue_entry_id !== command.aggregateId,
        ) ?? null;
        if (!pairedPreviousCandidate) {
          throw new StatusQueueConflictError('LIVE_QUEUE_ENTRY_EXISTS');
        }
        const [first, second] = candidates as [GenesisCandidateRow, GenesisCandidateRow];
        const pair = normalizeSocialPair(first.initiator_user_id, second.initiator_user_id);
        const configurationResult = await sql<GenesisConfigurationRow>`
          select configuration.configuration_id, configuration.ruleset_ref,
            configuration.ruleset_ack_mode
          from competition.competitions as competitive
          join community.communities as community on community.community_id = competitive.community_id
          join community.community_configuration_versions as configuration
            on configuration.configuration_id = community.configuration_id
          where competitive.competition_id = ${command.payload.competitionId}::uuid
        `.execute(transaction);
        const configuration = configurationResult.rows[0];
        if (!configuration) throw new StatusQueueConflictError('COMMUNITY_NOT_ACTIVE');
        const responseDeadline = genesisResponseDeadline(context.occurredAt);
        const stake = intent.targetStatus === 'CHAMPION'
          ? 'GENESIS_CHAMPION'
          : 'GENESIS_CONTENDER';
        const phase = intent.targetStatus === 'CHAMPION'
          ? 'FOUNDING_CHALLENGE'
          : 'CONTENDER_GENESIS';

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
            ${ids.rulesetSnapshotId}::uuid, ${command.payload.competitionId}::uuid,
            ${configuration.configuration_id}::uuid, ${configuration.ruleset_ref},
            ${configuration.ruleset_ack_mode}, ${CHALLENGE_POLICY_VERSION},
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
            ${ids.challengeId}::uuid, ${command.payload.competitionId}::uuid, null,
            ${ids.serviceChatId}::uuid, ${ids.serviceChatId}::uuid,
            ${first.initiator_user_id}::uuid, ${second.initiator_user_id}::uuid,
            ${pair.lowUserId}::uuid, ${pair.highUserId}::uuid,
            'MUTUAL_GENESIS', ${stake}, 'AWAITING_RESPONSE', ${ids.rulesetSnapshotId}::uuid,
            ${responseDeadline.toISOString()}::timestamptz, 1,
            ${context.occurredAt.toISOString()}::timestamptz,
            ${context.occurredAt.toISOString()}::timestamptz
          )
        `.execute(transaction);
        await sql`
          update competition.challenge_queue_entries
          set state = 'PAIRED_PENDING_ACCEPTANCE', linked_challenge_id = ${ids.challengeId}::uuid,
            single_candidate_since_at = null, single_candidate_deadline_at = null,
            version = case when queue_entry_id = ${command.aggregateId}::uuid
              then version else version + 1 end,
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where queue_entry_id in (${first.queue_entry_id}::uuid, ${second.queue_entry_id}::uuid)
        `.execute(transaction);
        await sql`
          update competition.competitions
          set phase = ${phase}, version = version + 1,
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where competition_id = ${command.payload.competitionId}::uuid
        `.execute(transaction);
      }
      const inserted = await queueEntry(transaction, command.aggregateId);
      if (!inserted) throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_FOUND');
      const response = entryProjection(inserted, command.actor.id!);
      return {
        responseStatus: 201,
        response,
        event: {
          eventId: ids.eventId,
          eventName: paired ? 'GenesisCandidatePaired' : 'ChallengeQueued',
          schemaVersion: 1,
          transitionId: 'Q-01',
          payload: {
            queueEntryId: response.queueEntryId,
            competitionId: response.competitionId,
            initiatorUserId: response.initiatorUserId,
            targetStatus: response.targetStatus,
            kind: response.kind,
            submittedAt: response.submittedAt,
            ...(paired ? { challengeId: ids.challengeId } : {}),
            ...(staleCandidate ? {
              invalidatedQueueEntryId: staleCandidate.row.queue_entry_id,
              invalidationReason: staleCandidate.reason,
            } : {}),
          },
          metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId,
          action: 'SUBMIT_STATUS_QUEUE_ENTRY',
          transitionId: 'Q-01',
          reasonCode: null,
          beforeState: null,
          afterState: response.state,
          metadata: {
            competitionId: response.competitionId,
            position: response.position,
            ...(staleCandidate ? {
              invalidatedQueueEntryId: staleCandidate.row.queue_entry_id,
              invalidationReason: staleCandidate.reason,
            } : {}),
          },
        },
        ...(paired ? { relatedEvents: [
          {
            eventId: ids.pairedQueueEventId,
            eventName: 'GenesisCandidatePaired',
            schemaVersion: 1,
            transitionId: 'Q-11',
            aggregateType: 'ChallengeQueueEntry',
            aggregateId: pairedPreviousCandidate!.queue_entry_id,
            aggregateVersion: Number(pairedPreviousCandidate!.version) + 1,
            payload: { challengeId: ids.challengeId, counterpartQueueEntryId: response.queueEntryId },
            metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
          },
          {
            eventId: ids.challengeEventId,
            eventName: 'GenesisChallengeCreated',
            schemaVersion: 1,
            transitionId: 'Q-11',
            aggregateType: 'Challenge',
            aggregateId: ids.challengeId,
            aggregateVersion: 1,
            payload: {
              competitionId: response.competitionId,
              responsePolicy: 'MUTUAL_GENESIS',
              responseDeadlineAt: genesisResponseDeadline(context.occurredAt).toISOString(),
            },
            metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
          },
          {
            eventId: ids.serviceChatEventId,
            eventName: 'ChatOpened',
            schemaVersion: 1,
            transitionId: 'CT-01',
            aggregateType: 'Chat',
            aggregateId: ids.serviceChatId,
            aggregateVersion: 1,
            payload: { chatId: ids.serviceChatId, scope: 'CHALLENGE_SERVICE', challengeId: ids.challengeId },
            metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
          },
        ] } : staleCandidate ? { relatedEvents: [{
          eventId: ids.staleQueueEventId,
          eventName: 'QueueEntryInvalidated',
          schemaVersion: 1,
          transitionId: 'Q-08',
          aggregateType: 'ChallengeQueueEntry',
          aggregateId: staleCandidate.row.queue_entry_id,
          aggregateVersion: Number(staleCandidate.row.version) + 1,
          payload: {
            queueEntryId: staleCandidate.row.queue_entry_id,
            competitionId: response.competitionId,
            reasonCode: staleCandidate.reason,
            noLoss: true,
          },
          metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
        }] } : {}),
        outbox: paired ? [
          {
            messageId: ids.outboxMessageId,
            topic: 'competition.genesis.paired.v1',
            payload: { challengeId: ids.challengeId, competitionId: response.competitionId },
          },
          {
            messageId: ids.timerOutboxMessageId,
            topic: 'competition.genesis.response-timer.v1',
            payload: {
              challengeId: ids.challengeId,
              deadlineAt: genesisResponseDeadline(context.occurredAt).toISOString(),
              timer: {
                commandType: 'EXPIRE_GENESIS_CHALLENGE',
                aggregateType: 'Challenge',
                aggregateId: ids.challengeId,
                expectedState: 'AWAITING_RESPONSE',
                expectedVersion: 1,
                deadlineAt: genesisResponseDeadline(context.occurredAt).toISOString(),
                policyVersion: STATUS_QUEUE_POLICY_VERSION,
                idempotencyKey: `genesis:${ids.challengeId}:expire:v1`,
              },
            },
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: {
              notifications: candidates.map((candidate, index) => ({
                notificationId: ids.notificationIds[index]!,
                recipientUserId: candidate.initiator_user_id,
                category: 'MANDATORY',
                renderKey: 'status.genesis-paired',
                actionTarget: { type: 'CHAT', chatId: ids.serviceChatId },
                payload: {
                  challengeId: ids.challengeId,
                  competitionId: response.competitionId,
                },
                deadlineAt: genesisResponseDeadline(context.occurredAt).toISOString(),
              })),
            },
          },
        ] : [{
            messageId: ids.outboxMessageId,
            topic: 'competition.status-queue.submitted.v1',
            payload: { queueEntryId: response.queueEntryId, competitionId: response.competitionId },
          }, ...(staleCandidate ? [{
            messageId: ids.staleQueueOutboxMessageId,
            topic: 'competition.status-queue.invalidated.v1',
            sourceEventId: ids.staleQueueEventId,
            payload: {
              queueEntryId: staleCandidate.row.queue_entry_id,
              competitionId: response.competitionId,
              reasonCode: staleCandidate.reason,
              noLoss: true,
            },
          }, {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: {
              notifications: [{
                notificationId: ids.notificationIds[0],
                recipientUserId: staleCandidate.row.initiator_user_id,
                category: 'MANDATORY',
                renderKey: 'status.queue-entry-invalidated',
                actionTarget: {
                  type: 'COMMUNITY',
                  competitionId: response.competitionId,
                },
                payload: {
                  queueEntryId: staleCandidate.row.queue_entry_id,
                  reasonCode: staleCandidate.reason,
                  noLoss: true,
                },
              }],
            },
          }] : [])],
      };
    },
  });
}

async function genesisChallengeRow(
  database: Kysely<Database> | Transaction<Database>,
  challengeId: string,
  lock = false,
): Promise<GenesisChallengeRow> {
  const result = await sql<GenesisChallengeRow>`
    select challenge.challenge_id, challenge.competition_id, challenge.service_chat_id,
      challenge.initiator_user_id, challenge.recipient_user_id,
      initiator.display_name as initiator_display_name,
      recipient.display_name as recipient_display_name,
      challenge.response_deadline_at, challenge.state, challenge.stake,
      challenge.ruleset_snapshot_id, snapshot.ruleset_ref, snapshot.ruleset_ack_mode,
      challenge.version::text as version
    from competition.challenges as challenge
    join identity.users as initiator on initiator.user_id = challenge.initiator_user_id
    join identity.users as recipient on recipient.user_id = challenge.recipient_user_id
    join competition.ruleset_snapshots as snapshot
      on snapshot.ruleset_snapshot_id = challenge.ruleset_snapshot_id
    where challenge.challenge_id = ${challengeId}::uuid
      and challenge.response_policy = 'MUTUAL_GENESIS'
    ${lock ? sql`for update of challenge` : sql``}
  `.execute(database);
  const row = result.rows[0];
  if (!row) throw new StatusQueueConflictError('GENESIS_CHALLENGE_NOT_FOUND');
  return row;
}

async function genesisResponses(
  database: Kysely<Database> | Transaction<Database>,
  challengeId: string,
): Promise<readonly GenesisResponseRow[]> {
  return (await sql<GenesisResponseRow>`
    select user_id, decision from competition.genesis_candidate_responses
    where challenge_id = ${challengeId}::uuid
    order by responded_at, response_id
  `.execute(database)).rows;
}

async function genesisQueueRows(
  database: Kysely<Database> | Transaction<Database>,
  challengeId: string,
): Promise<readonly GenesisQueueRow[]> {
  return (await sql<GenesisQueueRow>`
    select queue_entry_id, initiator_user_id, version::text
    from competition.challenge_queue_entries
    where linked_challenge_id = ${challengeId}::uuid
    order by submitted_at, queue_entry_id
    for update
  `.execute(database)).rows;
}

function genesisResponseProjection(
  row: GenesisChallengeRow,
  responses: readonly GenesisResponseRow[],
  viewerUserId: string,
): GenesisResponseProjection {
  const viewerDecision = responses.find((response) => response.user_id === viewerUserId)?.decision ?? null;
  const mayRespond = row.state === 'AWAITING_RESPONSE'
    && viewerDecision === null
    && row.response_deadline_at.getTime() > Date.now();
  return {
    challengeId: row.challenge_id,
    competitionId: row.competition_id,
    serviceChatId: row.service_chat_id,
    state: row.state,
    opponentDisplayName: viewerUserId === row.initiator_user_id
      ? row.recipient_display_name
      : row.initiator_display_name,
    responseDeadlineAt: row.response_deadline_at.toISOString(),
    rulesetRef: row.ruleset_ref,
    rulesetAckMode: row.ruleset_ack_mode,
    viewerDecision,
    acceptedCount: responses.filter((response) => response.decision === 'ACCEPT').length,
    canAccept: mayRespond,
    canDecline: mayRespond,
    version: Number(row.version),
  };
}

async function hasActiveGenesisObligation(
  transaction: Kysely<Database> | Transaction<Database>,
  firstUserId: string,
  secondUserId: string,
): Promise<boolean> {
  const result = await sql<{ readonly active: boolean }>`
    select exists (
      select 1 from competition.challenge_participant_obligations
      where user_id in (${firstUserId}::uuid, ${secondUserId}::uuid)
        and released_at is null
    ) as active
  `.execute(transaction);
  return result.rows[0]?.active ?? false;
}

async function assertGenesisParticipantsEligible(
  transaction: Transaction<Database>,
  row: GenesisChallengeRow,
): Promise<void> {
  const result = await sql<GenesisEligibilityRow>`
    select
      competitive.availability as competition_availability,
      competitive.phase as competition_phase,
      (competitive.integrity_hold_case_id is not null or exists (
        select 1 from competition.process_holds as process_hold
        where process_hold.aggregate_type = 'COMPETITION'
          and process_hold.aggregate_id = competitive.competition_id
          and process_hold.reason = 'STATUS_REVIEW' and process_hold.state = 'ACTIVE'
      )) as integrity_hold_active,
      community.state = 'ACTIVE' as community_active,
      (select count(*)::text from identity.users as athlete
        where athlete.user_id in (${row.initiator_user_id}::uuid, ${row.recipient_user_id}::uuid)
          and athlete.account_state = 'ACTIVE') as active_account_count,
      (select count(*)::text from identity.users as athlete
        where athlete.user_id in (${row.initiator_user_id}::uuid, ${row.recipient_user_id}::uuid)
          and exists (
            select 1 from identity.account_verifications as verification
            where verification.user_id = athlete.user_id
              and verification.is_current and verification.state = 'VERIFIED'
              and (verification.expires_at is null or verification.expires_at > clock_timestamp())
          )) as verified_account_count,
      (select count(*)::text from community.community_memberships as membership
        where membership.community_id = competitive.community_id
          and membership.user_id in (${row.initiator_user_id}::uuid, ${row.recipient_user_id}::uuid)
          and membership.state = 'ACTIVE' and membership.competition_enabled
          and membership.age_division = competitive.age_division) as active_membership_count,
      (select count(*)::text from identity.users as athlete
        where athlete.user_id in (${row.initiator_user_id}::uuid, ${row.recipient_user_id}::uuid)
          and athlete.age_division = competitive.age_division) as matching_age_count,
      (select count(*)::text from identity.users as athlete
        where athlete.user_id in (${row.initiator_user_id}::uuid, ${row.recipient_user_id}::uuid)
          and athlete.user_id in (competitive.champion_user_id, competitive.contender_user_id))
        as status_holder_count
    from competition.competitions as competitive
    join community.communities as community on community.community_id = competitive.community_id
    where competitive.competition_id = ${row.competition_id}::uuid
  `.execute(transaction);
  const eligibility = result.rows[0];
  if (!eligibility || Number(eligibility.active_account_count) !== 2) {
    throw new StatusQueueConflictError('ACCOUNT_NOT_ACTIVE');
  }
  if (Number(eligibility.verified_account_count) !== 2) {
    throw new StatusQueueConflictError('ACCOUNT_NOT_VERIFIED');
  }
  if (!eligibility.community_active) {
    throw new StatusQueueConflictError('COMMUNITY_NOT_ACTIVE');
  }
  if (Number(eligibility.active_membership_count) !== 2) {
    throw new StatusQueueConflictError('MEMBERSHIP_NOT_ACTIVE');
  }
  if (Number(eligibility.matching_age_count) !== 2) {
    throw new StatusQueueConflictError('AGE_CONTOUR_MISMATCH');
  }
  if (eligibility.competition_availability !== 'ACTIVE') {
    throw new StatusQueueConflictError('COMPETITION_NOT_ACTIVE');
  }
  if (eligibility.integrity_hold_active) {
    throw new StatusQueueConflictError('COMPETITION_INTEGRITY_HOLD');
  }
  const expectedPhase = row.stake === 'GENESIS_CHAMPION'
    ? 'FOUNDING_CHALLENGE'
    : 'CONTENDER_GENESIS';
  if (eligibility.competition_phase !== expectedPhase) {
    throw new StatusQueueConflictError('COMPETITION_PHASE_UNAVAILABLE');
  }
  if (Number(eligibility.status_holder_count) !== 0) {
    throw new StatusQueueConflictError('ALREADY_STATUS_HOLDER');
  }
}

export async function respondToGenesisChallenge(
  database: Kysely<Database>,
  command: CommandEnvelope<GenesisResponsePayload>,
  decision: 'ACCEPT' | 'DECLINE',
  ids: GenesisResponseEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<GenesisResponseProjection>> {
  if (command.actor.id === null || command.aggregateType !== 'Challenge'
    || command.aggregateId !== command.payload.challengeId
    || command.commandType !== `${decision}_GENESIS_CHALLENGE`) {
    throw new StatusQueueConflictError('GENESIS_PARTICIPANT_REQUIRED');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await genesisChallengeRow(transaction, command.aggregateId, true);
      await sql`
        select competition_id from competition.competitions
        where competition_id = ${row.competition_id}::uuid for update
      `.execute(transaction);
      const existingResponses = await genesisResponses(transaction, row.challenge_id);
      const existingDecision = existingResponses.find(
        (response) => response.user_id === command.actor.id,
      )?.decision ?? null;
      assertGenesisResponseCanBeRecorded({
        state: row.state,
        actorIsParticipant: command.actor.id === row.initiator_user_id
          || command.actor.id === row.recipient_user_id,
        responseDeadlineAt: row.response_deadline_at,
        occurredAt: context.occurredAt,
        existingDecision,
      });
      if (decision === 'ACCEPT' && row.ruleset_ack_mode === 'EXPLICIT_ACK_REQUIRED'
        && command.payload.explicitRulesetAcknowledged !== true) {
        throw new StatusQueueConflictError('RULESET_ACK_REQUIRED');
      }
      if (decision === 'ACCEPT') {
        await assertGenesisParticipantsEligible(transaction, row);
        await assertYouthChallengeConsentReady(
          transaction,
          row.challenge_id,
          [row.initiator_user_id, row.recipient_user_id],
          context.occurredAt,
        );
        const obligationLockOrder = [row.initiator_user_id, row.recipient_user_id].sort();
        for (const userId of obligationLockOrder) {
          await sql`
            select pg_advisory_xact_lock(hashtextextended(${`challenge-obligation:${userId}`}, 0))
          `.execute(transaction);
        }
        if (await hasActiveGenesisObligation(
          transaction,
          row.initiator_user_id,
          row.recipient_user_id,
        )) throw new StatusQueueConflictError('OFFICIAL_OBLIGATION_LIMIT');
      }
      const queueRows = await genesisQueueRows(transaction, row.challenge_id);
      if (queueRows.length !== 2) throw new StatusQueueConflictError('GENESIS_CHALLENGE_NOT_FOUND');
      const actorQueue = queueRows.find((entry) => entry.initiator_user_id === command.actor.id)!;
      const survivorQueue = queueRows.find((entry) => entry.initiator_user_id !== command.actor.id)!;
      await sql`
        insert into competition.genesis_candidate_responses (
          response_id, challenge_id, queue_entry_id, user_id, decision, responded_at
        ) values (
          ${ids.responseId}::uuid, ${row.challenge_id}::uuid, ${actorQueue.queue_entry_id}::uuid,
          ${command.actor.id}::uuid, ${decision}, ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);

      let afterState = 'AWAITING_RESPONSE';
      if (decision === 'DECLINE') {
        afterState = 'DECLINED';
        await sql`
          update competition.challenges
          set state = 'DECLINED', decided_at = ${context.occurredAt.toISOString()}::timestamptz,
            version = ${context.nextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where challenge_id = ${row.challenge_id}::uuid
        `.execute(transaction);
        await sql`
          update competition.challenge_queue_entries
          set state = 'WITHDRAWN', single_candidate_since_at = null,
            single_candidate_deadline_at = null,
            decided_at = ${context.occurredAt.toISOString()}::timestamptz,
            terminal_reason = 'GENESIS_DECLINED', version = version + 1,
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where queue_entry_id = ${actorQueue.queue_entry_id}::uuid
        `.execute(transaction);
        await sql`
          update competition.challenge_queue_entries
          set state = 'WAITING', linked_challenge_id = null,
            single_candidate_since_at = null, single_candidate_deadline_at = null,
            version = version + 1,
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where queue_entry_id = ${survivorQueue.queue_entry_id}::uuid
        `.execute(transaction);
        await sql`
          update competition.competitions
          set phase = ${row.stake === 'GENESIS_CHAMPION' ? 'FOUNDING_OPEN' : 'CONTENDER_VACANT_OPEN'},
            version = version + 1, updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where competition_id = ${row.competition_id}::uuid
        `.execute(transaction);
      } else {
        await sql`
          insert into competition.challenge_ruleset_acknowledgments (
            acknowledgment_id, challenge_id, user_id, ruleset_snapshot_id, mode, acknowledged_at
          ) values (
            ${ids.acknowledgmentId}::uuid, ${row.challenge_id}::uuid, ${command.actor.id}::uuid,
            ${row.ruleset_snapshot_id}::uuid,
            ${row.ruleset_ack_mode === 'EXPLICIT_ACK_REQUIRED' ? 'EXPLICIT' : 'IMPLICIT_ON_ACCEPT'},
            ${context.occurredAt.toISOString()}::timestamptz
          )
        `.execute(transaction);
        const nextResponses = [...existingResponses, { user_id: command.actor.id, decision: 'ACCEPT' as const }];
        if (nextResponses.filter((response) => response.decision === 'ACCEPT').length === 2) {
          afterState = 'ACCEPTED_UNSCHEDULED';
          const schedulingDeadline = acceptedChallengeSchedulingDeadline(context.occurredAt);
          await sql`
            update governance.youth_challenge_consents
            set expires_at = ${schedulingDeadline.toISOString()}::timestamptz,
              updated_at = ${context.occurredAt.toISOString()}::timestamptz
            where challenge_id = ${row.challenge_id}::uuid and state = 'GRANTED'
          `.execute(transaction);
          await sql`
            update competition.challenges
            set state = 'ACCEPTED_UNSCHEDULED',
              accepted_at = ${context.occurredAt.toISOString()}::timestamptz,
              scheduling_deadline_at = ${schedulingDeadline.toISOString()}::timestamptz,
              version = ${context.nextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
            where challenge_id = ${row.challenge_id}::uuid
          `.execute(transaction);
          await sql`
            insert into competition.challenge_participant_obligations (
              obligation_id, challenge_id, user_id, accepted_at
            ) values
              (${ids.obligationIds[0]}::uuid, ${row.challenge_id}::uuid,
                ${row.initiator_user_id}::uuid, ${context.occurredAt.toISOString()}::timestamptz),
              (${ids.obligationIds[1]}::uuid, ${row.challenge_id}::uuid,
                ${row.recipient_user_id}::uuid, ${context.occurredAt.toISOString()}::timestamptz)
          `.execute(transaction);
          await sql`
            update competition.challenge_queue_entries
            set state = 'CONSUMED', decided_at = ${context.occurredAt.toISOString()}::timestamptz,
              terminal_reason = 'GENESIS_ACCEPTED', version = version + 1,
              updated_at = ${context.occurredAt.toISOString()}::timestamptz
            where linked_challenge_id = ${row.challenge_id}::uuid
          `.execute(transaction);
        } else {
          await sql`
            update competition.challenges
            set version = ${context.nextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
            where challenge_id = ${row.challenge_id}::uuid
          `.execute(transaction);
        }
      }

      const updated = await genesisChallengeRow(transaction, row.challenge_id);
      const responses = await genesisResponses(transaction, row.challenge_id);
      const response = genesisResponseProjection(updated, responses, command.actor.id!);
      const notificationRecipients = decision === 'DECLINE'
        ? [survivorQueue.initiator_user_id]
        : afterState === 'ACCEPTED_UNSCHEDULED'
          ? [row.initiator_user_id, row.recipient_user_id]
          : [survivorQueue.initiator_user_id];
      const notificationRenderKey = decision === 'DECLINE'
        ? 'status.genesis-counterpart-declined'
        : afterState === 'ACCEPTED_UNSCHEDULED'
          ? 'status.genesis-ready-to-schedule'
          : 'status.genesis-counterpart-accepted';
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: decision === 'ACCEPT'
            ? (afterState === 'ACCEPTED_UNSCHEDULED' ? 'GenesisChallengeAccepted' : 'GenesisCandidateAccepted')
            : 'GenesisCandidateDeclined',
          schemaVersion: 1,
          transitionId: decision === 'ACCEPT' ? 'Q-12' : 'Q-13',
          payload: {
            challengeId: row.challenge_id,
            actorUserId: command.actor.id,
            decision,
            acceptedCount: response.acceptedCount,
            noLoss: decision === 'DECLINE',
          },
          metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
        },
        ...((decision === 'DECLINE' || afterState === 'ACCEPTED_UNSCHEDULED')
          ? { relatedEvents: queueRows.map((entry, index) => ({
          eventId: ids.queueEventIds[index]!,
          eventName: afterState === 'ACCEPTED_UNSCHEDULED'
            ? 'QueueEntryConsumed'
            : decision === 'DECLINE'
              ? (entry.queue_entry_id === actorQueue.queue_entry_id
                  ? 'QueueEntryWithdrawn'
                  : 'GenesisCandidateReturnedToQueue')
              : 'GenesisCandidateResponseRecorded',
          schemaVersion: 1,
          transitionId: decision === 'ACCEPT' ? 'Q-12' : 'Q-13',
          aggregateType: 'ChallengeQueueEntry',
          aggregateId: entry.queue_entry_id,
          aggregateVersion: Number(entry.version) + 1,
          payload: { challengeId: row.challenge_id, decision, noLoss: true },
          metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
            })) }
          : {}),
        audit: {
          auditId: ids.auditId,
          action: `${decision}_GENESIS_CHALLENGE`,
          transitionId: decision === 'ACCEPT' ? 'Q-12' : 'Q-13',
          reasonCode: decision === 'DECLINE' ? 'ATHLETE_DECLINED' : null,
          beforeState: row.state,
          afterState,
          metadata: { competitionId: row.competition_id, acceptedCount: response.acceptedCount },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: decision === 'ACCEPT'
              ? 'competition.genesis.accepted.v1'
              : 'competition.genesis.declined.v1',
            payload: {
              challengeId: row.challenge_id,
              competitionId: row.competition_id,
              state: afterState,
              survivorQueueEntryId: decision === 'DECLINE' ? survivorQueue.queue_entry_id : null,
              schedulingDeadlineAt: afterState === 'ACCEPTED_UNSCHEDULED'
                ? acceptedChallengeSchedulingDeadline(context.occurredAt).toISOString()
                : null,
              ...(decision === 'ACCEPT' && afterState === 'AWAITING_RESPONSE'
                ? {
                    timer: {
                      commandType: 'EXPIRE_GENESIS_CHALLENGE',
                      aggregateType: 'Challenge',
                      aggregateId: row.challenge_id,
                      expectedState: 'AWAITING_RESPONSE',
                      expectedVersion: context.nextVersion,
                      deadlineAt: row.response_deadline_at.toISOString(),
                      policyVersion: STATUS_QUEUE_POLICY_VERSION,
                      idempotencyKey: `genesis:${row.challenge_id}:expire:v${context.nextVersion}`,
                    },
                  }
                : {}),
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
                renderKey: notificationRenderKey,
                actionTarget: decision === 'DECLINE'
                  ? { type: 'COMMUNITY', competitionId: row.competition_id }
                  : { type: 'CHAT', chatId: row.service_chat_id },
                payload: {
                  challengeId: row.challenge_id,
                  competitionId: row.competition_id,
                  actorUserId: command.actor.id,
                  noLoss: decision === 'DECLINE',
                },
                ...(decision === 'ACCEPT'
                  ? { deadlineAt: afterState === 'ACCEPTED_UNSCHEDULED'
                      ? acceptedChallengeSchedulingDeadline(context.occurredAt).toISOString()
                      : row.response_deadline_at.toISOString() }
                  : {}),
              })),
            },
          },
        ],
      };
    },
  });
}

export async function expireGenesisChallenge(
  database: Kysely<Database>,
  command: CommandEnvelope<ExpireGenesisChallengePayload>,
  ids: GenesisExpiryEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<GenesisResponseProjection>> {
  if (command.actor.type !== 'SYSTEM' || command.actor.id !== null
    || command.aggregateType !== 'Challenge'
    || command.aggregateId !== command.payload.challengeId
    || command.commandType !== 'EXPIRE_GENESIS_CHALLENGE') {
    throw new StatusQueueConflictError('GENESIS_RESPONSE_NOT_PENDING');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await genesisChallengeRow(transaction, command.aggregateId, true);
      await assertNoActivePlatformIncidentForTimer(transaction, {
        commandType: command.commandType,
        aggregateId: command.aggregateId,
        occurredAt: context.occurredAt,
      });
      assertGenesisChallengeCanExpire({
        state: row.state,
        responseDeadlineAt: row.response_deadline_at,
        occurredAt: context.occurredAt,
      });
      await sql`
        select competition_id from competition.competitions
        where competition_id = ${row.competition_id}::uuid for update
      `.execute(transaction);
      const queueRows = await genesisQueueRows(transaction, row.challenge_id);
      if (queueRows.length !== 2) throw new StatusQueueConflictError('GENESIS_CHALLENGE_NOT_FOUND');
      const responses = await genesisResponses(transaction, row.challenge_id);
      const acceptedUserIds = new Set(
        responses.filter((response) => response.decision === 'ACCEPT')
          .map((response) => response.user_id),
      );

      await sql`
        update competition.challenges
        set state = 'EXPIRED_NO_FAULT', decided_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = ${context.nextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where challenge_id = ${row.challenge_id}::uuid
      `.execute(transaction);
      for (const entry of queueRows) {
        const survives = acceptedUserIds.has(entry.initiator_user_id);
        if (survives) {
          await sql`
            update competition.challenge_queue_entries
            set state = 'WAITING', linked_challenge_id = null,
              single_candidate_since_at = null, single_candidate_deadline_at = null,
              version = version + 1,
              updated_at = ${context.occurredAt.toISOString()}::timestamptz
            where queue_entry_id = ${entry.queue_entry_id}::uuid
          `.execute(transaction);
        } else {
          await sql`
            update competition.challenge_queue_entries
            set state = 'EXPIRED', single_candidate_since_at = null,
              single_candidate_deadline_at = null,
              decided_at = ${context.occurredAt.toISOString()}::timestamptz,
              terminal_reason = 'GENESIS_RESPONSE_TIMEOUT', version = version + 1,
              updated_at = ${context.occurredAt.toISOString()}::timestamptz
            where queue_entry_id = ${entry.queue_entry_id}::uuid
          `.execute(transaction);
        }
      }
      await sql`
        update competition.competitions
        set phase = ${row.stake === 'GENESIS_CHAMPION' ? 'FOUNDING_OPEN' : 'CONTENDER_VACANT_OPEN'},
          version = version + 1, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where competition_id = ${row.competition_id}::uuid
      `.execute(transaction);

      const updated = await genesisChallengeRow(transaction, row.challenge_id);
      const response = genesisResponseProjection(
        updated,
        responses,
        row.initiator_user_id,
      );
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'GenesisChallengeExpiredNoFault',
          schemaVersion: 1,
          transitionId: 'Q-14',
          payload: {
            challengeId: row.challenge_id,
            survivorUserIds: [...acceptedUserIds],
            noLoss: true,
          },
          metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
        },
        relatedEvents: queueRows.map((entry, index) => ({
          eventId: ids.queueEventIds[index]!,
          eventName: acceptedUserIds.has(entry.initiator_user_id)
            ? 'GenesisCandidateReturnedToQueue'
            : 'GenesisCandidateExpired',
          schemaVersion: 1,
          transitionId: 'Q-14',
          aggregateType: 'ChallengeQueueEntry',
          aggregateId: entry.queue_entry_id,
          aggregateVersion: Number(entry.version) + 1,
          payload: {
            challengeId: row.challenge_id,
            preservedFifo: acceptedUserIds.has(entry.initiator_user_id),
            noLoss: true,
          },
          metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
        })),
        audit: {
          auditId: ids.auditId,
          action: 'EXPIRE_GENESIS_CHALLENGE',
          transitionId: 'Q-14',
          reasonCode: 'RESPONSE_DEADLINE_REACHED',
          beforeState: row.state,
          afterState: 'EXPIRED_NO_FAULT',
          metadata: { survivorUserIds: [...acceptedUserIds], noLoss: true },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'competition.genesis.expired-no-fault.v1',
            payload: {
              challengeId: row.challenge_id,
              competitionId: row.competition_id,
              survivorUserIds: [...acceptedUserIds],
            },
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: {
              notifications: queueRows.map((entry, index) => ({
                notificationId: ids.notificationIds[index]!,
                recipientUserId: entry.initiator_user_id,
                category: 'MANDATORY',
                renderKey: acceptedUserIds.has(entry.initiator_user_id)
                  ? 'status.genesis-expired-returned-to-queue'
                  : 'status.genesis-response-expired',
                actionTarget: { type: 'COMMUNITY', competitionId: row.competition_id },
                payload: {
                  challengeId: row.challenge_id,
                  competitionId: row.competition_id,
                  preservedFifo: acceptedUserIds.has(entry.initiator_user_id),
                  noLoss: true,
                },
              })),
            },
          },
        ],
      };
    },
  });
}

export async function promoteSingleGenesisCandidate(
  database: Kysely<Database>,
  command: CommandEnvelope<PromoteSingleGenesisCandidatePayload>,
  ids: VacancySuccessionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<StatusQueueEntryProjection>> {
  if (
    command.actor.type !== 'SYSTEM'
    || command.actor.id !== null
    || command.aggregateType !== 'ChallengeQueueEntry'
    || command.aggregateId !== command.payload.queueEntryId
    || command.commandType !== 'PROMOTE_SINGLE_GENESIS_CANDIDATE'
  ) {
    throw new StatusQueueConflictError('GENESIS_SINGLE_CANDIDATE_CHANGED');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const existing = await queueEntry(transaction, command.aggregateId, true);
      if (!existing) {
        throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_FOUND');
      }
      await assertNoActivePlatformIncidentForTimer(transaction, {
        commandType: command.commandType,
        aggregateId: command.aggregateId,
        occurredAt: context.occurredAt,
      });
      const competition = await vacancyCompetition(
        transaction,
        existing.competition_id,
        true,
      );
      if (
        !competition
        || competition.availability !== 'ACTIVE'
        || competition.integrity_hold_active
        || !competition.community_active
        || !competition.status_flow_free
      ) {
        throw new StatusQueueConflictError('COMPETITION_PHASE_UNAVAILABLE');
      }
      const candidates = await vacancyCandidates(transaction, competition, true);
      assertSingleGenesisCandidateCanBePromoted({
        state: existing.state,
        kind: existing.kind,
        isOnlyCandidate: candidates.length === 1
          && candidates[0]?.queue_entry_id === existing.queue_entry_id,
        singleCandidateSinceAt: existing.single_candidate_since_at,
        singleCandidateDeadlineAt: existing.single_candidate_deadline_at,
        occurredAt: context.occurredAt,
      });
      const invalidationReason = await genesisCandidateInvalidationReason(
        transaction,
        competition.competition_id,
        existing.initiator_user_id,
      );
      if (invalidationReason) {
        await sql`
          update competition.challenge_queue_entries
          set state = 'INVALIDATED', single_candidate_since_at = null,
            single_candidate_deadline_at = null,
            decided_at = ${context.occurredAt.toISOString()}::timestamptz,
            terminal_reason = ${invalidationReason}, version = ${context.nextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where queue_entry_id = ${existing.queue_entry_id}::uuid
            and kind = 'GENESIS_CANDIDATE' and state = 'WAITING'
        `.execute(transaction);
        const invalidated = await queueEntry(transaction, existing.queue_entry_id);
        if (!invalidated) throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_FOUND');
        const response = entryProjection(invalidated, invalidated.initiator_user_id);
        return {
          responseStatus: 200,
          response,
          event: {
            eventId: ids.eventId,
            eventName: 'QueueEntryInvalidated',
            schemaVersion: 1,
            transitionId: 'Q-08',
            payload: {
              queueEntryId: response.queueEntryId,
              competitionId: response.competitionId,
              reasonCode: invalidationReason,
              noLoss: true,
            },
            metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
          },
          audit: {
            auditId: ids.auditId,
            action: 'PROMOTE_SINGLE_GENESIS_CANDIDATE',
            transitionId: 'Q-08',
            reasonCode: invalidationReason,
            beforeState: existing.state,
            afterState: 'INVALIDATED',
            metadata: { competitionId: response.competitionId, noLoss: true },
          },
          outbox: [
            {
              messageId: ids.outboxMessageId,
              topic: 'competition.status-vacancy.reconcile.v1',
              payload: {
                competitionId: response.competitionId,
                invalidatedQueueEntryId: response.queueEntryId,
                reasonCode: invalidationReason,
              },
            },
            {
              messageId: ids.notificationOutboxMessageId,
              topic: 'notification.in_app.v1',
              payload: {
                notifications: [{
                  notificationId: ids.notificationId,
                  recipientUserId: existing.initiator_user_id,
                  category: 'MANDATORY',
                  renderKey: 'status.queue-entry-invalidated',
                  actionTarget: { type: 'COMMUNITY', competitionId: response.competitionId },
                  payload: {
                    queueEntryId: response.queueEntryId,
                    reasonCode: invalidationReason,
                    noLoss: true,
                  },
                  deadlineAt: null,
                }],
              },
            },
          ],
        };
      }

      const promotingChampion = existing.target_status === 'CHAMPION';
      if (
        (promotingChampion
          && (competition.phase !== 'FOUNDING_OPEN' || competition.champion_user_id !== null))
        || (!promotingChampion
          && (competition.phase !== 'CONTENDER_VACANT_OPEN'
            || competition.champion_user_id === null
            || competition.contender_user_id !== null))
      ) {
        throw new StatusQueueConflictError('GENESIS_SINGLE_CANDIDATE_CHANGED');
      }
      const nextStatusVersion = Number(competition.status_version) + 1;
      const nextCompetitionVersion = Number(competition.version) + 1;
      const nextPhase = promotingChampion ? 'CONTENDER_VACANT_OPEN' : 'RUNNING';
      await sql`
        update competition.challenge_queue_entries
        set state = 'CONSUMED', single_candidate_since_at = null,
          single_candidate_deadline_at = null,
          decided_at = ${context.occurredAt.toISOString()}::timestamptz,
          terminal_reason = 'SINGLE_CANDIDATE_PROMOTED', version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where queue_entry_id = ${existing.queue_entry_id}::uuid
          and kind = 'GENESIS_CANDIDATE' and state = 'WAITING'
      `.execute(transaction);
      await sql`
        update competition.competitions
        set champion_user_id = case when ${promotingChampion}
              then ${existing.initiator_user_id}::uuid else champion_user_id end,
          contender_user_id = case when ${promotingChampion}
              then null else ${existing.initiator_user_id}::uuid end,
          phase = ${nextPhase}, status_version = ${nextStatusVersion},
          version = ${nextCompetitionVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where competition_id = ${competition.competition_id}::uuid
      `.execute(transaction);
      const promoted = await queueEntry(transaction, existing.queue_entry_id);
      if (!promoted) throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_FOUND');
      const response = entryProjection(promoted, promoted.initiator_user_id);
      const statusEventName = promotingChampion
        ? 'GenesisWithoutOpponent'
        : 'SuccessionWithoutOpponent';
      const transitionId = promotingChampion ? 'C-03' : 'C-08';
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'GenesisCandidateConsumed',
          schemaVersion: 1,
          transitionId: null,
          payload: {
            queueEntryId: response.queueEntryId,
            competitionId: response.competitionId,
            userId: existing.initiator_user_id,
            targetStatus: existing.target_status,
            statusVersion: nextStatusVersion,
            createsResult: false,
            createsLoss: false,
            createsCooldown: false,
          },
          metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
        },
        relatedEvents: [{
          eventId: ids.statusEventId,
          eventName: statusEventName,
          schemaVersion: 1,
          transitionId,
          aggregateType: 'Competition',
          aggregateId: competition.competition_id,
          aggregateVersion: nextCompetitionVersion,
          payload: {
            userId: existing.initiator_user_id,
            assignedStatus: existing.target_status,
            statusVersion: nextStatusVersion,
            phase: nextPhase,
            noOpponent: true,
          },
          metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
        }],
        audit: {
          auditId: ids.auditId,
          action: 'PROMOTE_SINGLE_GENESIS_CANDIDATE',
          transitionId,
          reasonCode: 'THREE_DAY_WINDOW_ELAPSED',
          beforeState: existing.state,
          afterState: 'CONSUMED',
          metadata: {
            competitionId: response.competitionId,
            assignedStatus: existing.target_status,
            createsResult: false,
            createsLoss: false,
            createsCooldown: false,
          },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'competition.status-vacancy.single-promoted.v1',
            payload: {
              competitionId: response.competitionId,
              queueEntryId: response.queueEntryId,
              userId: existing.initiator_user_id,
              assignedStatus: existing.target_status,
              phase: nextPhase,
            },
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: {
              notifications: [{
                notificationId: ids.notificationId,
                recipientUserId: existing.initiator_user_id,
                category: 'MANDATORY',
                renderKey: promotingChampion
                  ? 'status.genesis-single-promoted-champion'
                  : 'status.genesis-single-promoted-contender',
                actionTarget: { type: 'COMMUNITY', competitionId: response.competitionId },
                payload: {
                  queueEntryId: response.queueEntryId,
                  assignedStatus: existing.target_status,
                  noOpponent: true,
                },
                deadlineAt: null,
              }],
            },
          },
        ],
      };
    },
  });
}

export async function withdrawStatusQueueEntry(
  database: Kysely<Database>,
  command: CommandEnvelope<WithdrawStatusQueueEntryPayload>,
  ids: StatusQueueEffectIds,
): Promise<ExecutedCommand<StatusQueueEntryProjection>> {
  if (command.actor.id === null || command.aggregateType !== 'ChallengeQueueEntry'
    || command.commandType !== 'WITHDRAW_STATUS_QUEUE_ENTRY'
    || command.aggregateId !== command.payload.queueEntryId) {
    throw new StatusQueueConflictError('QUEUE_ENTRY_INITIATOR_REQUIRED');
  }
  return executeCriticalCommand(database, {
    command,
    mutate: async (transaction, context) => {
      const existing = await queueEntry(transaction, command.payload.queueEntryId, true);
      if (!existing) throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_FOUND');
      assertStatusQueueEntryCanBeWithdrawn({
        actorUserId: command.actor.id!,
        initiatorUserId: existing.initiator_user_id,
        state: existing.state,
      });
      const closingReconfirmation = existing.state === 'RECONFIRMATION_REQUIRED';
      await sql`
        update competition.challenge_queue_entries
        set state = 'WITHDRAWN', reconfirmation_deadline_at = null,
          single_candidate_since_at = null, single_candidate_deadline_at = null,
          decided_at = ${context.occurredAt.toISOString()}::timestamptz,
          terminal_reason = 'ATHLETE_WITHDREW', version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where queue_entry_id = ${command.aggregateId}::uuid
          and state in ('WAITING', 'RECONFIRMATION_REQUIRED')
      `.execute(transaction);
      const updated = await queueEntry(transaction, command.aggregateId);
      if (!updated) throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_FOUND');
      const response = entryProjection(updated, command.actor.id!);
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: closingReconfirmation
            ? 'QueueEntryReconfirmationClosed'
            : 'QueueEntryWithdrawn',
          schemaVersion: 1,
          transitionId: closingReconfirmation ? 'Q-07' : 'Q-02',
          payload: {
            queueEntryId: response.queueEntryId,
            competitionId: response.competitionId,
            noLoss: true,
          },
          metadata: { policyVersion: STATUS_QUEUE_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId,
          action: 'WITHDRAW_STATUS_QUEUE_ENTRY',
          transitionId: closingReconfirmation ? 'Q-07' : 'Q-02',
          reasonCode: 'ATHLETE_WITHDREW',
          beforeState: existing.state,
          afterState: 'WITHDRAWN',
          metadata: { competitionId: response.competitionId, submittedAt: response.submittedAt },
        },
        outbox: [{
          messageId: ids.outboxMessageId,
          topic: closingReconfirmation
            ? 'competition.status-queue.head-released.v1'
            : 'competition.status-queue.withdrawn.v1',
          payload: { queueEntryId: response.queueEntryId, competitionId: response.competitionId, noLoss: true },
        }],
      };
    },
  });
}
