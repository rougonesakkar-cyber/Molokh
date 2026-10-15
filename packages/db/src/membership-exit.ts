import { createHash, timingSafeEqual } from 'node:crypto';

import {
  CHALLENGE_POLICY_VERSION,
  MEMBERSHIP_EXIT_POLICY_VERSION,
  RESULT_POLICY_VERSION,
  MembershipExitConflictError,
  assertMembershipExitCanBeConfirmed,
  assertMembershipExitEligibility,
  deriveMembershipExitPlan,
  deriveProvisionalStatusTransition,
  deriveStatusReleasePlan,
  membershipExitPreviewExpiresAt,
  resultAppealDeadline,
  type ChallengeStake,
  type CommandEnvelope,
  type MembershipExitConsequence,
  type MembershipExitStatus,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import {
  executeCriticalCommand,
  type ExecutedCommand,
  type RelatedDomainEventDraft,
} from './platform-command.js';

export interface PreviewMembershipExitPayload {
  readonly membershipId: string;
}

export interface ConfirmMembershipExitPayload {
  readonly exitId: string;
  readonly confirmationToken: string;
}

export interface MembershipExitEffectIds {
  readonly eventId: string;
  readonly membershipEventId: string;
  readonly competitionEventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly notificationOutboxMessageId: string;
  readonly notificationIds: readonly [string, string];
  readonly resultId?: string;
  readonly resultEventId?: string;
  readonly resultFinalEventId?: string;
  readonly waiverId?: string;
  readonly waiverEventId?: string;
  readonly cooldownId?: string;
  readonly cooldownEventId?: string;
  readonly challengeEventId?: string;
  readonly statusTransitionId?: string;
  readonly statusEventId?: string;
  readonly statusFinalizationId?: string;
  readonly statusFinalEventId?: string;
  readonly postResultStatusEventId?: string;
  readonly statusOutboxMessageId?: string;
}

export interface MembershipExitProjection {
  readonly exitId: string;
  readonly membershipId: string;
  readonly competitionId: string;
  readonly departingStatus: MembershipExitStatus;
  readonly consequence: MembershipExitConsequence;
  readonly state: 'PREVIEWED' | 'CONFIRMED';
  readonly successorUserId: string | null;
  readonly successorDisplayName: string | null;
  readonly opponentUserId: string | null;
  readonly opponentDisplayName: string | null;
  readonly challengeId: string | null;
  readonly resultId: string | null;
  readonly beforeMembershipVersion: number;
  readonly afterMembershipVersion: number | null;
  readonly beforeStatusVersion: number;
  readonly afterStatusVersion: number | null;
  readonly previewExpiresAt: string;
  readonly confirmationToken: string | null;
  readonly closedChallengeCount: number;
  readonly invalidatedQueueEntryCount: number;
  readonly createsForfeit: boolean;
  readonly createsLoss: boolean;
  readonly createsCooldown: boolean;
  readonly appealWaived: boolean;
  readonly version: number;
}

interface MembershipExitContextRow {
  readonly membership_id: string;
  readonly membership_version: string;
  readonly membership_state: string;
  readonly membership_user_id: string;
  readonly competition_id: string;
  readonly competition_version: string;
  readonly status_version: string;
  readonly phase: string;
  readonly availability: string;
  readonly integrity_hold_active: boolean;
  readonly status_lock_result_id: string | null;
  readonly champion_user_id: string | null;
  readonly contender_user_id: string | null;
  readonly account_active: boolean;
  readonly sensitive_action_held: boolean;
  readonly community_active: boolean;
  readonly has_active_obligation: boolean;
  readonly has_live_status_process: boolean;
  readonly active_challenge_id: string | null;
  readonly active_challenge_version: string | null;
  readonly active_challenge_state: string | null;
  readonly active_challenge_cycle_no: number | null;
  readonly active_challenge_stake: ChallengeStake | null;
  readonly active_challenge_initiator_user_id: string | null;
  readonly active_challenge_recipient_user_id: string | null;
  readonly active_pair_low_id: string | null;
  readonly active_pair_high_id: string | null;
  readonly active_opponent_user_id: string | null;
  readonly active_booking_id: string | null;
  readonly active_booking_state: string | null;
  readonly active_slot_id: string | null;
  readonly active_session_id: string | null;
  readonly active_session_state: string | null;
  readonly active_session_actual_start_at: Date | null;
  readonly pair_cooldown_days: number;
}

interface MembershipExitRow {
  readonly exit_id: string;
  readonly membership_id: string;
  readonly competition_id: string;
  readonly user_id: string;
  readonly departing_status: MembershipExitStatus;
  readonly consequence: MembershipExitConsequence;
  readonly state: 'PREVIEWED' | 'CONFIRMED';
  readonly before_membership_version: string;
  readonly after_membership_version: string | null;
  readonly before_champion_user_id: string | null;
  readonly before_contender_user_id: string | null;
  readonly before_status_version: string;
  readonly after_champion_user_id: string | null;
  readonly after_contender_user_id: string | null;
  readonly after_status_version: string | null;
  readonly after_phase: string | null;
  readonly confirmation_token_hash: string;
  readonly preview_expires_at: Date;
  readonly closed_challenge_count: number;
  readonly invalidated_queue_entry_count: number;
  readonly obligation_challenge_id: string | null;
  readonly obligation_challenge_version: string | null;
  readonly obligation_challenge_state: string | null;
  readonly obligation_stake: ChallengeStake | null;
  readonly opponent_user_id: string | null;
  readonly result_id: string | null;
  readonly appeal_waiver_id: string | null;
  readonly cooldown_id: string | null;
  readonly version: string;
}

interface ForfeitStatusPlan {
  readonly transition: ReturnType<typeof deriveProvisionalStatusTransition>;
  readonly release: ReturnType<typeof deriveStatusReleasePlan> | null;
  readonly finalChampionUserId: string | null;
  readonly finalContenderUserId: string | null;
  readonly finalStatusVersion: number;
  readonly finalPhase: string;
}

function forfeitStatusPlan(row: MembershipExitContextRow, actorUserId: string): ForfeitStatusPlan {
  if (!row.active_challenge_stake || !row.active_opponent_user_id) {
    throw new MembershipExitConflictError('MEMBERSHIP_EXIT_CONTEXT_CHANGED');
  }
  const transition = deriveProvisionalStatusTransition({
    stake: row.active_challenge_stake,
    outcomeCode: 'FORFEIT',
    winnerUserId: row.active_opponent_user_id,
    loserUserId: actorUserId,
    snapshot: {
      championUserId: row.champion_user_id,
      contenderUserId: row.contender_user_id,
      statusVersion: Number(row.status_version),
    },
  });
  const afterResult = transition.after;
  const release = actorUserId === afterResult.championUserId
    || actorUserId === afterResult.contenderUserId
    ? deriveStatusReleasePlan({
      actorUserId,
      championUserId: afterResult.championUserId,
      contenderUserId: afterResult.contenderUserId,
    })
    : null;
  const finalChampionUserId = release?.afterChampionUserId ?? afterResult.championUserId;
  const finalContenderUserId = release ? null : afterResult.contenderUserId;
  const finalStatusVersion = afterResult.statusVersion
    + (transition.locksStatus ? 1 : 0)
    + (release ? 1 : 0);
  const finalPhase = release?.afterPhase
    ?? (transition.type === 'GENESIS_APPLIED' || transition.type === 'GENESIS_APPLIED_WITH_VACANCY'
      ? 'CONTENDER_VACANT_OPEN'
      : transition.type === 'CONTENDER_ASSIGNED'
        ? 'RUNNING'
        : row.phase);
  return {
    transition, release, finalChampionUserId, finalContenderUserId,
    finalStatusVersion, finalPhase,
  };
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function tokenMatches(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(tokenHash(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function requiredForfeitIds(ids: MembershipExitEffectIds) {
  const keys = [
    'resultId', 'resultEventId', 'resultFinalEventId', 'waiverId', 'waiverEventId',
    'cooldownId', 'cooldownEventId', 'challengeEventId', 'statusTransitionId',
    'statusEventId', 'statusFinalizationId', 'statusFinalEventId',
    'postResultStatusEventId',
  ] as const;
  const values = Object.fromEntries(keys.map((key) => {
    const value = ids[key];
    if (!value) throw new TypeError(`Membership exit effect ID ${key} is required`);
    return [key, value];
  }));
  return values as { readonly [K in typeof keys[number]]: string };
}

async function exitContext(
  database: Kysely<Database> | Transaction<Database>,
  membershipId: string,
  userId: string,
  lock: boolean,
): Promise<MembershipExitContextRow | null> {
  const result = await sql<MembershipExitContextRow>`
    select membership.membership_id, membership.version::text as membership_version,
      membership.state as membership_state, membership.user_id as membership_user_id,
      competitive.competition_id, competitive.version::text as competition_version,
      competitive.status_version::text as status_version, competitive.phase,
      competitive.availability,
      (competitive.integrity_hold_case_id is not null or exists (
        select 1 from competition.process_holds as process_hold
        where process_hold.aggregate_type = 'COMPETITION'
          and process_hold.aggregate_id = competitive.competition_id
          and process_hold.reason = 'STATUS_REVIEW' and process_hold.state = 'ACTIVE'
      )) as integrity_hold_active,
      competitive.status_lock_result_id,
      competitive.champion_user_id, competitive.contender_user_id,
      configuration.pair_cooldown_days,
      athlete.account_state = 'ACTIVE' as account_active,
      exists (select 1 from identity.user_sensitive_action_holds as sensitive_hold
        where sensitive_hold.user_id = athlete.user_id and sensitive_hold.state = 'ACTIVE')
        as sensitive_action_held,
      community.state in ('ACTIVE', 'PAUSED') as community_active,
      active.challenge_id is not null as has_active_obligation,
      exists (
        select 1 from competition.challenges as challenge
        where challenge.competition_id = competitive.competition_id
          and challenge.state = 'AWAITING_RESPONSE'
          and challenge.response_policy in ('MANDATORY', 'MUTUAL_GENESIS')
          and membership.user_id in (challenge.initiator_user_id, challenge.recipient_user_id)
      ) as has_live_status_process,
      active.challenge_id as active_challenge_id,
      active.challenge_version::text as active_challenge_version,
      active.challenge_state as active_challenge_state,
      active.cycle_no as active_challenge_cycle_no,
      active.stake as active_challenge_stake,
      active.initiator_user_id as active_challenge_initiator_user_id,
      active.recipient_user_id as active_challenge_recipient_user_id,
      active.pair_low_id as active_pair_low_id,
      active.pair_high_id as active_pair_high_id,
      case when active.initiator_user_id = membership.user_id
        then active.recipient_user_id else active.initiator_user_id end as active_opponent_user_id,
      booked.booking_id as active_booking_id, booked.booking_state as active_booking_state,
      booked.slot_id as active_slot_id, booked.session_id as active_session_id,
      booked.session_state as active_session_state,
      booked.actual_start_at as active_session_actual_start_at
    from community.community_memberships as membership
    join identity.users as athlete on athlete.user_id = membership.user_id
    join community.communities as community on community.community_id = membership.community_id
    join community.community_configuration_versions as configuration
      on configuration.configuration_id = community.configuration_id
    join competition.competitions as competitive
      on competitive.community_id = membership.community_id
      and competitive.age_division = membership.age_division
      and competitive.discipline_key is null
    left join lateral (
      select challenge.challenge_id, challenge.version as challenge_version,
        challenge.state as challenge_state, challenge.cycle_no, challenge.stake,
        challenge.initiator_user_id, challenge.recipient_user_id,
        challenge.pair_low_id, challenge.pair_high_id
      from competition.challenge_participant_obligations as obligation
      join competition.challenges as challenge on challenge.challenge_id = obligation.challenge_id
      where obligation.user_id = membership.user_id and obligation.released_at is null
      order by obligation.accepted_at desc, obligation.obligation_id
      limit 1
    ) as active on true
    left join lateral (
      select booking.booking_id, booking.state as booking_state, booking.slot_id,
        session.session_id, session.state as session_state, session.actual_start_at
      from scheduling.bookings as booking
      left join scheduling.sessions as session on session.booking_id = booking.booking_id
      where booking.challenge_id = active.challenge_id
      order by booking.created_at desc, booking.booking_id
      limit 1
    ) as booked on true
    where membership.membership_id = ${membershipId}::uuid
      and membership.user_id = ${userId}::uuid
    ${lock ? sql`for update of membership, competitive` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function exitRow(
  database: Kysely<Database> | Transaction<Database>,
  exitId: string,
  lock: boolean,
): Promise<MembershipExitRow | null> {
  const result = await sql<MembershipExitRow>`
    select exit_id, membership_id, competition_id, user_id, departing_status,
      consequence, state, before_membership_version::text,
      after_membership_version::text, before_champion_user_id,
      before_contender_user_id, before_status_version::text,
      after_champion_user_id, after_contender_user_id,
      after_status_version::text, after_phase, confirmation_token_hash,
      preview_expires_at, closed_challenge_count,
      invalidated_queue_entry_count, obligation_challenge_id,
      obligation_challenge_version::text, obligation_challenge_state,
      obligation_stake, opponent_user_id, result_id, appeal_waiver_id,
      cooldown_id, version::text
    from community.voluntary_membership_exits
    where exit_id = ${exitId}::uuid
    ${lock ? sql`for update` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

function assertContextEligible(
  row: MembershipExitContextRow | null,
): asserts row is MembershipExitContextRow {
  if (!row) throw new MembershipExitConflictError('MEMBERSHIP_EXIT_MEMBERSHIP_NOT_ACTIVE');
  assertMembershipExitEligibility({
    accountActive: row.account_active,
    membershipActive: row.membership_state === 'ACTIVE',
    communityActive: row.community_active,
    competitionActive: row.availability === 'ACTIVE' && row.phase !== 'CLOSED',
    integrityHoldActive: row.integrity_hold_active,
    hasActiveObligation: row.has_active_obligation,
    activeObligationCanForfeit: row.has_active_obligation
      && ['ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED'].includes(
        row.active_challenge_state ?? '',
      )
      && row.active_session_actual_start_at === null
      && !['IN_PROGRESS', 'ENDED'].includes(row.active_session_state ?? '')
      && row.status_lock_result_id === null,
    activeSessionStarted: row.active_session_actual_start_at !== null
      || ['IN_PROGRESS', 'ENDED'].includes(row.active_session_state ?? ''),
    hasLiveStatusProcess: row.has_live_status_process,
    sensitiveActionHeld: row.sensitive_action_held,
  });
}

async function displayName(
  database: Kysely<Database> | Transaction<Database>,
  userId: string | null,
): Promise<string | null> {
  if (!userId) return null;
  const result = await sql<{ readonly display_name: string }>`
    select display_name from identity.users where user_id = ${userId}::uuid
  `.execute(database);
  return result.rows[0]?.display_name ?? null;
}

async function projection(
  database: Kysely<Database> | Transaction<Database>,
  row: MembershipExitRow,
  confirmationToken: string | null,
): Promise<MembershipExitProjection> {
  const successorUserId = row.consequence === 'CHAMPION_SUCCESSION'
    ? row.after_champion_user_id
    : null;
  return {
    exitId: row.exit_id,
    membershipId: row.membership_id,
    competitionId: row.competition_id,
    departingStatus: row.departing_status,
    consequence: row.consequence,
    state: row.state,
    successorUserId,
    successorDisplayName: await displayName(database, successorUserId),
    opponentUserId: row.opponent_user_id,
    opponentDisplayName: await displayName(database, row.opponent_user_id),
    challengeId: row.obligation_challenge_id,
    resultId: row.result_id,
    beforeMembershipVersion: Number(row.before_membership_version),
    afterMembershipVersion: row.after_membership_version === null
      ? null : Number(row.after_membership_version),
    beforeStatusVersion: Number(row.before_status_version),
    afterStatusVersion: row.after_status_version === null ? null : Number(row.after_status_version),
    previewExpiresAt: row.preview_expires_at.toISOString(),
    confirmationToken,
    closedChallengeCount: row.closed_challenge_count,
    invalidatedQueueEntryCount: row.invalidated_queue_entry_count,
    createsForfeit: row.consequence === 'ACCEPTED_CHALLENGE_FORFEIT',
    createsLoss: row.consequence === 'ACCEPTED_CHALLENGE_FORFEIT',
    createsCooldown: row.consequence === 'ACCEPTED_CHALLENGE_FORFEIT',
    appealWaived: row.consequence === 'ACCEPTED_CHALLENGE_FORFEIT',
    version: Number(row.version),
  };
}

export async function previewMembershipExit(
  database: Kysely<Database>,
  command: CommandEnvelope<PreviewMembershipExitPayload>,
  ids: MembershipExitEffectIds,
  confirmationToken: string,
  now?: () => Date,
): Promise<ExecutedCommand<MembershipExitProjection>> {
  if (
    !command.actor.id || command.actor.type !== 'USER'
    || command.aggregateType !== 'VoluntaryMembershipExit'
    || command.commandType !== 'PREVIEW_MEMBERSHIP_EXIT'
  ) throw new MembershipExitConflictError('MEMBERSHIP_EXIT_OWNER_REQUIRED');

  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const current = await exitContext(
        transaction, command.payload.membershipId, command.actor.id!, true,
      );
      assertContextEligible(current);
      const plan = deriveMembershipExitPlan({
        actorUserId: command.actor.id!,
        championUserId: current.champion_user_id,
        contenderUserId: current.contender_user_id,
        hasAcceptedObligation: current.has_active_obligation,
      });
      const expiresAt = membershipExitPreviewExpiresAt(context.occurredAt);
      const acceptedStatus = plan.createsForfeit
        ? forfeitStatusPlan(current, command.actor.id!)
        : null;
      const acceptedStatusChanges = acceptedStatus !== null
        && acceptedStatus.finalStatusVersion > Number(current.status_version);
      const plannedStatusVersion = acceptedStatusChanges
        ? acceptedStatus.finalStatusVersion
        : plan.statusRelease ? Number(current.status_version) + 1 : null;
      const afterChampionUserId = acceptedStatusChanges
        ? acceptedStatus.finalChampionUserId
        : plan.statusRelease?.afterChampionUserId ?? null;
      const afterContenderUserId = acceptedStatusChanges
        ? acceptedStatus.finalContenderUserId
        : plan.statusRelease?.afterContenderUserId ?? null;
      const afterPhase = acceptedStatusChanges
        ? acceptedStatus.finalPhase
        : plan.statusRelease?.afterPhase ?? null;
      await sql`
        insert into community.voluntary_membership_exits (
          exit_id, membership_id, competition_id, user_id,
          departing_status, consequence, state, before_membership_version,
          before_champion_user_id, before_contender_user_id, before_status_version,
          after_champion_user_id, after_contender_user_id, after_status_version,
          after_phase, obligation_challenge_id, obligation_challenge_version,
          obligation_challenge_state, obligation_stake, opponent_user_id,
          confirmation_token_hash, preview_event_id,
          previewed_at, preview_expires_at, version, created_at, updated_at
        ) values (
          ${command.aggregateId}::uuid, ${current.membership_id}::uuid,
          ${current.competition_id}::uuid, ${command.actor.id}::uuid,
          ${plan.departingStatus}, ${plan.consequence}, 'PREVIEWED',
          ${Number(current.membership_version)}, ${current.champion_user_id}::uuid,
          ${current.contender_user_id}::uuid, ${Number(current.status_version)},
          ${afterChampionUserId}::uuid, ${afterContenderUserId}::uuid,
          ${plannedStatusVersion}, ${afterPhase},
          ${current.active_challenge_id}::uuid,
          ${current.active_challenge_version ? Number(current.active_challenge_version) : null},
          ${current.active_challenge_state}, ${current.active_challenge_stake},
          ${current.active_opponent_user_id}::uuid,
          ${tokenHash(confirmationToken)}, ${ids.eventId}::uuid,
          ${context.occurredAt.toISOString()}::timestamptz,
          ${expiresAt.toISOString()}::timestamptz, ${context.nextVersion},
          ${context.occurredAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      const inserted = await exitRow(transaction, command.aggregateId, false);
      if (!inserted) throw new MembershipExitConflictError('MEMBERSHIP_EXIT_NOT_FOUND');
      return {
        responseStatus: 201,
        response: await projection(transaction, inserted, confirmationToken),
        event: {
          eventId: ids.eventId, eventName: 'ResignationPreviewed', schemaVersion: 1,
          transitionId: null,
          payload: {
            exitId: command.aggregateId, membershipId: current.membership_id,
            competitionId: current.competition_id, departingStatus: plan.departingStatus,
            consequence: plan.consequence, previewExpiresAt: expiresAt.toISOString(),
            createsForfeit: plan.createsForfeit, appealWaived: plan.createsForfeit,
          },
          metadata: { policyVersion: MEMBERSHIP_EXIT_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId, action: 'PREVIEW_MEMBERSHIP_EXIT', transitionId: null,
          reasonCode: plan.createsForfeit
            ? 'VOLUNTARY_ACCEPTED_CHALLENGE_FORFEIT'
            : 'VOLUNTARY_NO_OBLIGATION',
          beforeState: 'ACTIVE',
          afterState: 'PREVIEWED', metadata: { consequence: plan.consequence },
        },
        outbox: [{
          messageId: ids.outboxMessageId,
          topic: 'community.membership-exit.previewed.v1',
          payload: {
            exitId: command.aggregateId, membershipId: current.membership_id,
            userId: command.actor.id, previewExpiresAt: expiresAt.toISOString(),
          },
        }],
      };
    },
  });
}

export async function confirmMembershipExit(
  database: Kysely<Database>,
  command: CommandEnvelope<ConfirmMembershipExitPayload>,
  ids: MembershipExitEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<MembershipExitProjection>> {
  if (
    !command.actor.id || command.actor.type !== 'USER'
    || command.aggregateType !== 'VoluntaryMembershipExit'
    || command.aggregateId !== command.payload.exitId
    || command.commandType !== 'CONFIRM_MEMBERSHIP_EXIT'
  ) throw new MembershipExitConflictError('MEMBERSHIP_EXIT_OWNER_REQUIRED');

  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const exit = await exitRow(transaction, command.aggregateId, true);
      if (!exit) throw new MembershipExitConflictError('MEMBERSHIP_EXIT_NOT_FOUND');
      const current = await exitContext(
        transaction, exit.membership_id, command.actor.id!, true,
      );
      assertContextEligible(current);
      assertMembershipExitCanBeConfirmed({
        state: exit.state, actorUserId: command.actor.id!, ownerUserId: exit.user_id,
        previewExpiresAt: exit.preview_expires_at, occurredAt: context.occurredAt,
        tokenMatches: tokenMatches(
          command.payload.confirmationToken, exit.confirmation_token_hash,
        ),
        previewMembershipVersion: Number(exit.before_membership_version),
        currentMembershipVersion: Number(current.membership_version),
        previewStatusVersion: Number(exit.before_status_version),
        currentStatusVersion: Number(current.status_version),
        previewChampionUserId: exit.before_champion_user_id,
        currentChampionUserId: current.champion_user_id,
        previewContenderUserId: exit.before_contender_user_id,
        currentContenderUserId: current.contender_user_id,
      });
      const previewHadObligation = exit.obligation_challenge_id !== null;
      if (
        previewHadObligation !== current.has_active_obligation
        || exit.obligation_challenge_id !== current.active_challenge_id
        || exit.obligation_challenge_version !== current.active_challenge_version
        || exit.obligation_challenge_state !== current.active_challenge_state
        || exit.obligation_stake !== current.active_challenge_stake
        || exit.opponent_user_id !== current.active_opponent_user_id
      ) throw new MembershipExitConflictError('MEMBERSHIP_EXIT_CONTEXT_CHANGED');
      const plan = deriveMembershipExitPlan({
        actorUserId: command.actor.id!, championUserId: current.champion_user_id,
        contenderUserId: current.contender_user_id,
        hasAcceptedObligation: current.has_active_obligation,
      });
      if (plan.departingStatus !== exit.departing_status || plan.consequence !== exit.consequence) {
        throw new MembershipExitConflictError('MEMBERSHIP_EXIT_CONTEXT_CHANGED');
      }

      const closedChallenges = await sql<{
        readonly challenge_id: string;
        readonly version: string;
      }>`
        update competition.challenges
        set state = 'CANCELLED_NO_FAULT', decided_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = version + 1, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where competition_id = ${current.competition_id}::uuid
          and state = 'AWAITING_RESPONSE' and response_policy = 'OPTIONAL'
          and ${command.actor.id}::uuid in (initiator_user_id, recipient_user_id)
        returning challenge_id, version::text
      `.execute(transaction);
      const invalidatedEntries = await sql<{ readonly queue_entry_id: string }>`
        update competition.challenge_queue_entries
        set state = 'INVALIDATED', terminal_reason = 'MEMBERSHIP_LEFT',
          decided_at = ${context.occurredAt.toISOString()}::timestamptz,
          reconfirmation_deadline_at = null, version = version + 1,
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where competition_id = ${current.competition_id}::uuid
          and initiator_user_id = ${command.actor.id}::uuid
          and state in ('WAITING', 'PAIRED_PENDING_ACCEPTANCE', 'RECONFIRMATION_REQUIRED', 'ACTIVATED')
        returning queue_entry_id
      `.execute(transaction);

      let nextCompetitionVersion: number | null = null;
      let migratedQueueEntryIds: readonly string[] = [];
      let acceptedRelatedEvents: RelatedDomainEventDraft[] = [];
      let resultId: string | null = null;
      let appealWaiverId: string | null = null;
      let cooldownId: string | null = null;
      let acceptedStatusRelease = false;
      if (plan.createsForfeit) {
        const effect = requiredForfeitIds(ids);
        if (
          !current.active_challenge_id || !current.active_challenge_version
          || !current.active_challenge_state || !current.active_challenge_cycle_no
          || !current.active_challenge_stake || !current.active_opponent_user_id
          || !current.active_pair_low_id || !current.active_pair_high_id
        ) throw new MembershipExitConflictError('MEMBERSHIP_EXIT_CONTEXT_CHANGED');
        const status = forfeitStatusPlan(current, command.actor.id!);
        const statusChanged = status.finalStatusVersion > Number(current.status_version);
        if (
          (statusChanged ? status.finalChampionUserId : null) !== exit.after_champion_user_id
          || (statusChanged ? status.finalContenderUserId : null) !== exit.after_contender_user_id
          || (statusChanged ? status.finalStatusVersion : null)
            !== (exit.after_status_version === null ? null : Number(exit.after_status_version))
          || (statusChanged ? status.finalPhase : null) !== exit.after_phase
        ) throw new MembershipExitConflictError('MEMBERSHIP_EXIT_CONTEXT_CHANGED');

        resultId = effect.resultId;
        appealWaiverId = effect.waiverId;
        cooldownId = effect.cooldownId;
        const occurredAt = context.occurredAt.toISOString();
        const appealDeadlineAt = resultAppealDeadline(context.occurredAt);
        const cooldownEndsAt = new Date(
          context.occurredAt.getTime() + current.pair_cooldown_days * 24 * 60 * 60 * 1_000,
        );
        const resultPhase = status.transition.type === 'GENESIS_APPLIED'
          || status.transition.type === 'GENESIS_APPLIED_WITH_VACANCY'
          ? 'CONTENDER_VACANT_OPEN'
          : status.transition.type === 'CONTENDER_ASSIGNED'
            ? 'RUNNING'
            : current.phase;
        const preStatus = {
          championUserId: current.champion_user_id,
          contenderUserId: current.contender_user_id,
          statusVersion: Number(current.status_version),
        };
        const canonicalResultPayload = {
          resultId, challengeId: current.active_challenge_id, sessionId: null,
          origin: 'ADMINISTRATIVE_FORFEIT', competitiveContextSnapshotId: null,
          outcomeCode: 'FORFEIT', winnerUserId: current.active_opponent_user_id,
          loserUserId: command.actor.id!, reasonCode: 'VOLUNTARY_MEMBERSHIP_EXIT',
          actualTime: occurredAt, venueId: null, coachUserId: null,
          appealDeadlineAt: appealDeadlineAt.toISOString(), preStatus,
          stake: current.active_challenge_stake,
        };

        if (current.active_session_id) {
          const cancelledSession = await sql<{ readonly session_id: string }>`
            update scheduling.sessions
            set state = 'CANCELLED', cancelled_at = ${occurredAt}::timestamptz,
              cancelled_by = ${command.actor.id}::uuid,
              cancellation_reason_code = 'VOLUNTARY_MEMBERSHIP_EXIT_FORFEIT',
              version = version + 1, updated_at = ${occurredAt}::timestamptz
            where session_id = ${current.active_session_id}::uuid
              and state in ('SCHEDULED', 'READY_FOR_COACH') and actual_start_at is null
            returning session_id
          `.execute(transaction);
          if (
            ['SCHEDULED', 'READY_FOR_COACH'].includes(current.active_session_state ?? '')
            && cancelledSession.rows.length !== 1
          ) throw new MembershipExitConflictError('MEMBERSHIP_EXIT_CONTEXT_CHANGED');
        }
        if (current.active_booking_id) {
          await sql`
            update scheduling.bookings
            set state = 'CANCELLED', cancelled_at = ${occurredAt}::timestamptz,
              cancel_actor = ${command.actor.id}::uuid,
              cancel_reason = 'VOLUNTARY_MEMBERSHIP_EXIT_FORFEIT',
              version = version + 1, updated_at = ${occurredAt}::timestamptz
            where booking_id = ${current.active_booking_id}::uuid
              and state not in ('EXPIRED', 'REJECTED', 'CANCELLED', 'COMPLETED')
          `.execute(transaction);
        }
        if (current.active_slot_id) {
          await sql`
            update scheduling.slots
            set state = 'CANCELLED', version = version + 1,
              updated_at = ${occurredAt}::timestamptz
            where slot_id = ${current.active_slot_id}::uuid and state = 'BOOKED'
          `.execute(transaction);
        }

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
            ${resultId}::uuid, ${current.active_challenge_id}::uuid, null, null,
            ${current.active_challenge_cycle_no}, 'ADMINISTRATIVE_FORFEIT', 'RECORDED', 'FORFEIT',
            ${current.active_opponent_user_id}::uuid, ${command.actor.id}::uuid,
            'VOLUNTARY_MEMBERSHIP_EXIT',
            'Athlete voluntarily left the Community after accepting the Challenge.',
            null, null, null, null, ${occurredAt}::timestamptz, null, null,
            ${command.actor.id}::uuid, ${occurredAt}::timestamptz,
            ${appealDeadlineAt.toISOString()}::timestamptz, ${JSON.stringify(preStatus)}::jsonb,
            ${status.transition.locksStatus ? effect.statusEventId : null}::uuid,
            1, ${occurredAt}::timestamptz
          )
        `.execute(transaction);
        const recordedChallengeVersion = Number(current.active_challenge_version) + 1;
        const recordedChallenge = await sql<{ readonly challenge_id: string }>`
          update competition.challenges
          set state = 'RESULT_RECORDED', version = ${recordedChallengeVersion},
            updated_at = ${occurredAt}::timestamptz
          where challenge_id = ${current.active_challenge_id}::uuid
            and version = ${Number(current.active_challenge_version)}
            and state in ('ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED')
          returning challenge_id
        `.execute(transaction);
        if (recordedChallenge.rows.length !== 1) {
          throw new MembershipExitConflictError('MEMBERSHIP_EXIT_CONTEXT_CHANGED');
        }

        let competitionVersion = Number(current.competition_version);
        if (status.transition.locksStatus) {
          competitionVersion += 1;
          await sql`
            update competition.competitions
            set champion_user_id = ${status.transition.after.championUserId}::uuid,
              contender_user_id = ${status.transition.after.contenderUserId}::uuid,
              status_version = ${status.transition.after.statusVersion},
              status_lock_result_id = ${resultId}::uuid, version = ${competitionVersion},
              updated_at = ${occurredAt}::timestamptz
            where competition_id = ${current.competition_id}::uuid
              and status_version = ${Number(current.status_version)}
              and status_lock_result_id is null
          `.execute(transaction);
          await sql`
            insert into competition.status_transitions (
              transition_id, source_result_id, source_event_id, competition_id,
              transition_type, before_champion_user_id, before_contender_user_id,
              before_status_version, after_champion_user_id, after_contender_user_id,
              after_status_version, competitive_snapshot_id, provisional, applied_at
            ) values (
              ${effect.statusTransitionId}::uuid, ${resultId}::uuid,
              ${effect.resultEventId}::uuid, ${current.competition_id}::uuid,
              ${status.transition.type}, ${status.transition.before.championUserId}::uuid,
              ${status.transition.before.contenderUserId}::uuid,
              ${status.transition.before.statusVersion},
              ${status.transition.after.championUserId}::uuid,
              ${status.transition.after.contenderUserId}::uuid,
              ${status.transition.after.statusVersion}, null, true, ${occurredAt}::timestamptz
            )
          `.execute(transaction);
          acceptedRelatedEvents.push({
            eventId: effect.statusEventId, eventName: status.transition.eventName!, schemaVersion: 1,
            aggregateType: 'Competition', aggregateId: current.competition_id,
            aggregateVersion: competitionVersion, transitionId: status.transition.transitionId,
            payload: {
              transitionId: effect.statusTransitionId, sourceResultId: resultId,
              sourceEventId: effect.resultEventId, competitionId: current.competition_id,
              before: status.transition.before, after: status.transition.after,
              transitionType: status.transition.type, provisional: true,
              participantIds: [current.active_pair_low_id, current.active_pair_high_id],
              snapshotId: null,
            },
            metadata: { policyVersion: RESULT_POLICY_VERSION },
          });
        }
        await sql`
          insert into competition.pair_cooldowns (
            cooldown_id, competition_id, pair_low_id, pair_high_id,
            source_result_id, started_at, ends_at
          ) values (
            ${cooldownId}::uuid, ${current.competition_id}::uuid,
            ${current.active_pair_low_id}::uuid, ${current.active_pair_high_id}::uuid,
            ${resultId}::uuid, ${occurredAt}::timestamptz,
            ${cooldownEndsAt.toISOString()}::timestamptz
          )
        `.execute(transaction);
        await sql`
          insert into competition.appeal_waivers (
            waiver_id, result_id, user_id, waived_at, reason_context
          ) values (
            ${appealWaiverId}::uuid, ${resultId}::uuid, ${command.actor.id}::uuid,
            ${occurredAt}::timestamptz, 'VOLUNTARY_RESIGNATION'
          )
        `.execute(transaction);
        await sql`
          update competition.results
          set state = 'FINAL', finalized_at = ${occurredAt}::timestamptz,
            version = 2, updated_at = ${occurredAt}::timestamptz
          where result_id = ${resultId}::uuid and state = 'RECORDED'
        `.execute(transaction);
        const completedChallengeVersion = recordedChallengeVersion + 1;
        await sql`
          update competition.challenges
          set state = 'COMPLETED', decided_at = ${occurredAt}::timestamptz,
            version = ${completedChallengeVersion}, updated_at = ${occurredAt}::timestamptz
          where challenge_id = ${current.active_challenge_id}::uuid
            and state = 'RESULT_RECORDED'
        `.execute(transaction);
        await sql`
          update competition.challenge_participant_obligations
          set released_at = ${occurredAt}::timestamptz, release_reason = 'RESULT_FINAL'
          where challenge_id = ${current.active_challenge_id}::uuid and released_at is null
        `.execute(transaction);

        if (status.transition.locksStatus) {
          competitionVersion += 1;
          const finalizedStatusVersion = status.transition.after.statusVersion + 1;
          await sql`
            update competition.competitions
            set status_lock_result_id = null, status_version = ${finalizedStatusVersion},
              phase = ${resultPhase}, version = ${competitionVersion},
              updated_at = ${occurredAt}::timestamptz
            where competition_id = ${current.competition_id}::uuid
              and status_lock_result_id = ${resultId}::uuid
          `.execute(transaction);
          await sql`
            insert into competition.status_transition_finalizations (
              finalization_id, transition_id, result_id, finalized_by_event_id,
              competition_status_version, finalized_at
            ) values (
              ${effect.statusFinalizationId}::uuid, ${effect.statusTransitionId}::uuid,
              ${resultId}::uuid, ${effect.resultFinalEventId}::uuid,
              ${finalizedStatusVersion}, ${occurredAt}::timestamptz
            )
          `.execute(transaction);
          acceptedRelatedEvents.push({
            eventId: effect.statusFinalEventId, eventName: 'StatusTransitionFinalized',
            schemaVersion: 1, aggregateType: 'Competition',
            aggregateId: current.competition_id, aggregateVersion: competitionVersion,
            transitionId: 'ST-13',
            payload: {
              resultId, transitionId: effect.statusTransitionId,
              championUserId: status.transition.after.championUserId,
              contenderUserId: status.transition.after.contenderUserId,
              statusVersion: finalizedStatusVersion,
            },
            metadata: { policyVersion: RESULT_POLICY_VERSION },
          });
        }
        if (status.release) {
          competitionVersion += 1;
          acceptedStatusRelease = true;
          await sql`
            update competition.competitions
            set champion_user_id = ${status.release.afterChampionUserId}::uuid,
              contender_user_id = null, phase = ${status.release.afterPhase},
              status_version = ${status.finalStatusVersion}, version = ${competitionVersion},
              updated_at = ${occurredAt}::timestamptz
            where competition_id = ${current.competition_id}::uuid
          `.execute(transaction);
          acceptedRelatedEvents.push({
            eventId: effect.postResultStatusEventId,
            eventName: status.release.eventName, schemaVersion: 1,
            aggregateType: 'Competition', aggregateId: current.competition_id,
            aggregateVersion: competitionVersion, transitionId: status.release.transitionId,
            payload: {
              exitId: exit.exit_id,
              beforeChampionUserId: status.transition.after.championUserId,
              beforeContenderUserId: status.transition.after.contenderUserId,
              afterChampionUserId: status.release.afterChampionUserId,
              afterContenderUserId: null, statusVersion: status.finalStatusVersion,
              phase: status.release.afterPhase,
              reason: 'VOLUNTARY_MEMBERSHIP_EXIT_AFTER_FORFEIT',
            },
            metadata: { policyVersion: MEMBERSHIP_EXIT_POLICY_VERSION },
          });
        }
        nextCompetitionVersion = competitionVersion === Number(current.competition_version)
          ? null : competitionVersion;

        if (status.release) {
          const targetStatus = status.release.afterPhase === 'FOUNDING_OPEN'
            ? 'CHAMPION' : 'CONTENDER';
          const migrated = await sql<{ readonly queue_entry_id: string }>`
            update competition.challenge_queue_entries
            set target_status = ${targetStatus}, kind = 'GENESIS_CANDIDATE', state = 'WAITING',
              bound_holder_user_id = null, direct_challenge_mode = null,
              reconfirmation_deadline_at = null,
              version = version + 1, updated_at = ${occurredAt}::timestamptz
            where competition_id = ${current.competition_id}::uuid
              and kind = 'DIRECT_STATUS'
              and state in ('WAITING', 'RECONFIRMATION_REQUIRED')
            returning queue_entry_id
          `.execute(transaction);
          migratedQueueEntryIds = migrated.rows.map((row) => row.queue_entry_id);
        }
        acceptedRelatedEvents = [
          {
            eventId: effect.resultEventId, eventName: 'ResultRecorded', schemaVersion: 1,
            aggregateType: 'Result', aggregateId: resultId, aggregateVersion: 1,
            transitionId: 'R-01', payload: canonicalResultPayload,
            metadata: { policyVersion: RESULT_POLICY_VERSION },
          },
          {
            eventId: effect.waiverEventId, eventName: 'AppealWaived', schemaVersion: 1,
            aggregateType: 'AppealWaiver', aggregateId: appealWaiverId,
            aggregateVersion: 1, transitionId: null,
            payload: {
              waiverId: appealWaiverId, resultId, userId: command.actor.id,
              waivedAt: occurredAt, reasonContext: 'VOLUNTARY_RESIGNATION',
            },
            metadata: { policyVersion: RESULT_POLICY_VERSION },
          },
          {
            eventId: effect.resultFinalEventId, eventName: 'ResultFinalized', schemaVersion: 1,
            aggregateType: 'Result', aggregateId: resultId, aggregateVersion: 2,
            transitionId: 'R-04',
            payload: {
              resultId, challengeId: current.active_challenge_id,
              finalizedAt: occurredAt, reason: 'ELIGIBLE_ACTORS_WAIVED',
            },
            metadata: { policyVersion: RESULT_POLICY_VERSION },
          },
          {
            eventId: effect.challengeEventId, eventName: 'ChallengeCompleted', schemaVersion: 1,
            aggregateType: 'Challenge', aggregateId: current.active_challenge_id,
            aggregateVersion: completedChallengeVersion, transitionId: 'CH-17',
            payload: {
              challengeId: current.active_challenge_id, resultId, finalizedAt: occurredAt,
            },
            metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
          },
          {
            eventId: effect.cooldownEventId, eventName: 'PairCooldownStarted', schemaVersion: 1,
            aggregateType: 'PairCooldown', aggregateId: cooldownId, aggregateVersion: 1,
            transitionId: 'CD-01', payload: {
              cooldownId, competitionId: current.competition_id,
              participantIds: [current.active_pair_low_id, current.active_pair_high_id],
              sourceResultId: resultId, startedAt: occurredAt,
              endsAt: cooldownEndsAt.toISOString(),
            },
            metadata: { policyVersion: RESULT_POLICY_VERSION },
          },
          ...acceptedRelatedEvents,
        ];
      } else if (plan.statusRelease) {
        nextCompetitionVersion = Number(current.competition_version) + 1;
        await sql`
          update competition.competitions
          set champion_user_id = ${plan.statusRelease.afterChampionUserId}::uuid,
            contender_user_id = null, phase = ${plan.statusRelease.afterPhase},
            status_version = ${Number(current.status_version) + 1},
            version = ${nextCompetitionVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where competition_id = ${current.competition_id}::uuid
        `.execute(transaction);
        const targetStatus = plan.statusRelease.afterPhase === 'FOUNDING_OPEN'
          ? 'CHAMPION' : 'CONTENDER';
        const migrated = await sql<{ readonly queue_entry_id: string }>`
          update competition.challenge_queue_entries
          set target_status = ${targetStatus}, kind = 'GENESIS_CANDIDATE', state = 'WAITING',
            bound_holder_user_id = null, direct_challenge_mode = null,
            reconfirmation_deadline_at = null,
            version = version + 1, updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where competition_id = ${current.competition_id}::uuid
            and kind = 'DIRECT_STATUS'
            and state in ('WAITING', 'RECONFIRMATION_REQUIRED')
          returning queue_entry_id
        `.execute(transaction);
        migratedQueueEntryIds = migrated.rows.map((row) => row.queue_entry_id);
      }

      const nextMembershipVersion = Number(current.membership_version) + 1;
      const closedChallengeIds = [
        ...closedChallenges.rows.map((row) => row.challenge_id),
        ...(plan.createsForfeit && current.active_challenge_id
          ? [current.active_challenge_id] : []),
      ];
      await sql`
        update community.community_memberships
        set state = 'LEFT', competition_enabled = false,
          left_at = ${context.occurredAt.toISOString()}::timestamptz,
          reason_code = 'VOLUNTARY_EXIT', version = ${nextMembershipVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where membership_id = ${current.membership_id}::uuid and state = 'ACTIVE'
      `.execute(transaction);
      await sql`
        update community.voluntary_membership_exits
        set state = 'CONFIRMED', after_membership_version = ${nextMembershipVersion},
          confirm_event_id = ${ids.eventId}::uuid,
          confirmed_at = ${context.occurredAt.toISOString()}::timestamptz,
          closed_challenge_count = ${closedChallenges.rows.length + (plan.createsForfeit ? 1 : 0)},
          invalidated_queue_entry_count = ${invalidatedEntries.rows.length},
          result_id = ${resultId}::uuid, appeal_waiver_id = ${appealWaiverId}::uuid,
          cooldown_id = ${cooldownId}::uuid,
          version = ${context.nextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where exit_id = ${exit.exit_id}::uuid and state = 'PREVIEWED'
      `.execute(transaction);
      const confirmed = await exitRow(transaction, exit.exit_id, false);
      if (!confirmed) throw new MembershipExitConflictError('MEMBERSHIP_EXIT_NOT_FOUND');

      const relatedEvents: RelatedDomainEventDraft[] = [{
        eventId: ids.membershipEventId, eventName: 'MembershipLeft', schemaVersion: 1,
        aggregateType: 'Membership', aggregateId: exit.membership_id,
        aggregateVersion: nextMembershipVersion, transitionId: 'M-06',
        payload: {
          exitId: exit.exit_id, membershipId: exit.membership_id,
          userId: exit.user_id,
          closedChallengeIds,
          invalidatedQueueEntryIds: invalidatedEntries.rows.map((row) => row.queue_entry_id),
          createsForfeit: plan.createsForfeit,
        },
        metadata: { policyVersion: MEMBERSHIP_EXIT_POLICY_VERSION },
      }];
      relatedEvents.push(...acceptedRelatedEvents);
      if (plan.statusRelease && nextCompetitionVersion !== null) {
        relatedEvents.push({
          eventId: ids.competitionEventId,
          eventName: plan.statusRelease.eventName,
          schemaVersion: 1, aggregateType: 'Competition',
          aggregateId: current.competition_id,
          aggregateVersion: nextCompetitionVersion,
          transitionId: plan.statusRelease.transitionId,
          payload: {
            exitId: exit.exit_id,
            beforeChampionUserId: current.champion_user_id,
            beforeContenderUserId: current.contender_user_id,
            afterChampionUserId: plan.statusRelease.afterChampionUserId,
            afterContenderUserId: null,
            statusVersion: Number(current.status_version) + 1,
            phase: plan.statusRelease.afterPhase,
            reason: 'VOLUNTARY_MEMBERSHIP_EXIT',
          },
          metadata: { policyVersion: MEMBERSHIP_EXIT_POLICY_VERSION },
        });
      }
      const notifications: {
        notificationId: string;
        recipientUserId: string;
        category: 'MANDATORY';
        renderKey: string;
        actionTarget: { type: 'COMMUNITY'; competitionId: string };
        payload: Readonly<Record<string, unknown>>;
        deadlineAt: null;
      }[] = [{
        notificationId: ids.notificationIds[0], recipientUserId: exit.user_id,
        category: 'MANDATORY', renderKey: 'membership.exit-confirmed',
        actionTarget: { type: 'COMMUNITY', competitionId: exit.competition_id },
        payload: { exitId: exit.exit_id, consequence: exit.consequence }, deadlineAt: null,
      }];
      if (plan.statusRelease?.afterChampionUserId) {
        notifications.push({
          notificationId: ids.notificationIds[1],
          recipientUserId: plan.statusRelease.afterChampionUserId,
          category: 'MANDATORY', renderKey: 'status.champion-succession',
          actionTarget: { type: 'COMMUNITY', competitionId: exit.competition_id },
          payload: { exitId: exit.exit_id, previousChampionUserId: exit.user_id },
          deadlineAt: null,
        });
      } else if (plan.createsForfeit && current.active_opponent_user_id) {
        notifications.push({
          notificationId: ids.notificationIds[1],
          recipientUserId: current.active_opponent_user_id,
          category: 'MANDATORY', renderKey: 'membership.exit-opponent-forfeit',
          actionTarget: { type: 'COMMUNITY', competitionId: exit.competition_id },
          payload: { exitId: exit.exit_id, resultId }, deadlineAt: null,
        });
      }
      return {
        responseStatus: 200,
        response: await projection(transaction, confirmed, null),
        event: {
          eventId: ids.eventId, eventName: 'VoluntaryResignationConfirmed',
          schemaVersion: 1, transitionId: 'M-06',
          payload: {
            exitId: exit.exit_id, membershipId: exit.membership_id,
            competitionId: exit.competition_id, userId: exit.user_id,
            departingStatus: exit.departing_status, consequence: exit.consequence,
            closedChallengeIds,
            invalidatedQueueEntryIds: invalidatedEntries.rows.map((row) => row.queue_entry_id),
            migratedQueueEntryIds, resultId, createsForfeit: plan.createsForfeit,
            createsLoss: plan.createsForfeit, createsCooldown: plan.createsForfeit,
            appealWaived: plan.createsForfeit,
          },
          metadata: { policyVersion: MEMBERSHIP_EXIT_POLICY_VERSION },
        },
        relatedEvents,
        audit: {
          auditId: ids.auditId, action: 'CONFIRM_MEMBERSHIP_EXIT',
          transitionId: 'M-06', reasonCode: plan.createsForfeit
            ? 'VOLUNTARY_ACCEPTED_CHALLENGE_FORFEIT'
            : 'VOLUNTARY_NO_OBLIGATION',
          beforeState: 'ACTIVE', afterState: 'LEFT',
          metadata: {
            consequence: exit.consequence,
            closedChallengeCount: closedChallengeIds.length,
            invalidatedQueueEntryCount: invalidatedEntries.rows.length,
          },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: plan.createsForfeit
              ? 'competition.result.finalized.v1'
              : plan.statusRelease
              ? 'competition.status-released.v1'
              : 'community.membership-left.v1',
            payload: {
              exitId: exit.exit_id, membershipId: exit.membership_id,
              competitionId: exit.competition_id, userId: exit.user_id,
              consequence: exit.consequence, resultId, migratedQueueEntryIds,
            },
          },
          ...(plan.createsForfeit && acceptedStatusRelease ? [{
            messageId: ids.statusOutboxMessageId
              ?? (() => { throw new TypeError('Membership exit status outbox ID is required'); })(),
            topic: 'competition.status-released.v1',
            payload: {
              exitId: exit.exit_id, membershipId: exit.membership_id,
              competitionId: exit.competition_id, userId: exit.user_id,
              consequence: exit.consequence, resultId, migratedQueueEntryIds,
            },
          }] : []),
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1', payload: { notifications },
          },
        ],
      };
    },
  });
}
