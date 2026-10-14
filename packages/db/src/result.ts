import {
  CHALLENGE_POLICY_VERSION,
  RESULT_POLICY_VERSION,
  ResultConflictError,
  ResultPermissionDeniedError,
  ResultValidationError,
  appealResponseDeadline,
  appealReviewSlaDeadline,
  assertAppealActionCanBeTaken,
  assertAthleteStoppageResult,
  assertExternalNoContestResult,
  assertExpectedVersion,
  assertReviewedResultMatchesAssignment,
  assertResultCanFinalize,
  assertResultMatchesAttendance,
  deriveProvisionalStatusTransition,
  effectiveChallengeStakeAtSessionWindow,
  eligibleAppealUserIds,
  normalizeResultParticipants,
  normalizeResultMetadataRevision,
  resultAppealDeadline,
  resultMetadataRevisionDeadline,
  resultCanFinalize,
  type ChallengeStake,
  type AppealDecision,
  type CommandEnvelope,
  type MissingResultClaimOutcome,
  type MissingResultReviewState,
  type ResultOutcomeCode,
  type ResultState,
  type StatusTransitionType,
  type TimerAggregateSnapshot,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import { executeCriticalCommand, type ExecutedCommand, type RelatedDomainEventDraft } from './platform-command.js';

export interface RecordSessionResultPayload {
  readonly challengeId: string;
  readonly sessionId: string;
  readonly outcomeCode: ResultOutcomeCode;
  readonly winnerUserId: string | null;
  readonly reasonCode: string | null;
  readonly comment: string | null;
  readonly methodCode: string | null;
  readonly methodText: string | null;
  readonly scorePayload: Readonly<Record<string, unknown>> | null;
  readonly methodPayload: Readonly<Record<string, unknown>> | null;
}

export interface SubmitResultAppealPayload {
  readonly resultId: string;
  readonly reasonCode: string;
  readonly statement: string;
}

export interface WaiveResultAppealPayload {
  readonly resultId: string;
}

export interface ReviseResultMetadataPayload {
  readonly resultId: string;
  readonly methodCode?: string | null;
  readonly methodText?: string | null;
  readonly scorePayload?: Readonly<Record<string, unknown>> | null;
  readonly methodPayload?: Readonly<Record<string, unknown>> | null;
}

export interface ResultMetadataRevisionEffectIds {
  readonly revisionId: string;
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
}

export interface FinalizeResultPayload {
  readonly resultId: string;
}

export interface ResultEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly resultId?: string;
  readonly resultEventId?: string;
  readonly statusTransitionId?: string;
  readonly statusEventId?: string;
  readonly cooldownId?: string;
  readonly cooldownEventId?: string;
  readonly timerOutboxMessageId?: string;
  readonly challengeEventId?: string;
  readonly appealId?: string;
  readonly appealEventId?: string;
  readonly waiverId?: string;
  readonly waiverEventId?: string;
  readonly statusFinalizationId?: string;
  readonly genesisEventId?: string;
  readonly notificationOutboxMessageId?: string;
  readonly notificationIds?: readonly string[];
  readonly missingResultReviewEventId?: string;
}

export interface AdministrativeForfeitEffectIds {
  readonly resultId: string;
  readonly resultEventId: string;
  readonly statusTransitionId: string;
  readonly statusEventId: string;
  readonly cooldownId: string;
  readonly cooldownEventId: string;
  readonly resultOutboxMessageId: string;
  readonly notificationOutboxMessageId: string;
  readonly notificationIds: readonly string[];
}

export interface RecordAdministrativeForfeitInput {
  readonly challengeId: string;
  readonly loserUserId: string;
  readonly recordedByUserId: string;
  readonly reasonCode: string;
  readonly comment: string;
  readonly sourceSessionId: string | null;
  readonly sourceCoachUserId: string | null;
  readonly notificationRecipientUserIds: readonly string[];
  readonly occurredAt: Date;
  readonly expectedChallengeState: 'BOOKED' | 'ACCEPTED_UNSCHEDULED' | 'BOOKING_PENDING';
}

export interface AdministrativeForfeitArtifacts {
  readonly resultId: string;
  readonly challengeVersion: number;
  readonly appealDeadlineAt: Date;
  readonly statusTransitionType: StatusTransitionType;
  readonly response: ResultProjection;
  readonly relatedEvents: readonly RelatedDomainEventDraft[];
  readonly outbox: readonly {
    readonly messageId: string;
    readonly topic: string;
    readonly sourceEventId?: string;
    readonly payload: Readonly<Record<string, unknown>>;
  }[];
}

export interface ResultProjection {
  readonly resultId: string;
  readonly challengeId: string;
  readonly sessionId: string | null;
  readonly state: ResultState;
  readonly outcomeCode: ResultOutcomeCode;
  readonly recordedOutcomeCode: ResultOutcomeCode;
  readonly winnerUserId: string | null;
  readonly winnerDisplayName: string | null;
  readonly loserUserId: string | null;
  readonly loserDisplayName: string | null;
  readonly recordedWinnerUserId: string | null;
  readonly recordedLoserUserId: string | null;
  readonly technicalCorrectionDecisionId: string | null;
  readonly reasonCode: string | null;
  readonly comment: string | null;
  readonly methodCode: string | null;
  readonly methodText: string | null;
  readonly scorePayload: Readonly<Record<string, unknown>> | null;
  readonly methodPayload: Readonly<Record<string, unknown>> | null;
  readonly recordedMethodCode: string | null;
  readonly recordedMethodText: string | null;
  readonly recordedScorePayload: Readonly<Record<string, unknown>> | null;
  readonly recordedMethodPayload: Readonly<Record<string, unknown>> | null;
  readonly latestMetadataRevisionId: string | null;
  readonly metadataRevisionCount: number;
  readonly metadataRevisionDeadlineAt: string;
  readonly viewerCanReviseMetadata: boolean;
  readonly recordedAt: string;
  readonly appealDeadlineAt: string;
  readonly finalizedAt: string | null;
  readonly decision: AppealDecision | null;
  readonly decisionReason: string | null;
  readonly statusTransitionType: StatusTransitionType;
  readonly statusBefore: {
    readonly championUserId: string | null;
    readonly contenderUserId: string | null;
    readonly statusVersion: number;
  };
  readonly statusAfter: {
    readonly championUserId: string | null;
    readonly contenderUserId: string | null;
    readonly statusVersion: number;
  };
  readonly provisional: boolean;
  readonly integrityReviewState: string | null;
  readonly integrityReviewCategory: string | null;
  readonly viewerCanAppeal: boolean;
  readonly viewerCanWaiveAppeal: boolean;
  readonly version: number;
}

interface RecordContextRow {
  readonly challenge_id: string;
  readonly challenge_state: string;
  readonly challenge_version: string;
  readonly cycle_no: number;
  readonly competition_id: string;
  readonly competition_phase: string;
  readonly competition_version: string;
  readonly current_champion_user_id: string | null;
  readonly current_contender_user_id: string | null;
  readonly current_status_version: string;
  readonly status_lock_result_id: string | null;
  readonly integrity_hold_case_id: string | null;
  readonly status_review_hold_active: boolean;
  readonly session_id: string;
  readonly session_state: string;
  readonly venue_id: string;
  readonly coach_user_id: string;
  readonly actual_start_at: Date | null;
  readonly actual_end_at: Date;
  readonly pair_low_id: string;
  readonly pair_high_id: string;
  readonly snapshot_id: string;
  readonly effective_stake: ChallengeStake;
  readonly snapshot_champion_user_id: string | null;
  readonly snapshot_contender_user_id: string | null;
  readonly snapshot_status_version: string;
  readonly pair_cooldown_days: number;
  readonly existing_result_id: string | null;
  readonly actor_coach_authorized: boolean;
  readonly missing_result_review_id: string | null;
  readonly missing_result_review_state: MissingResultReviewState | null;
  readonly missing_result_review_version: string | null;
  readonly assigned_reviewer_coach_user_id: string | null;
  readonly allowed_outcome_code: MissingResultClaimOutcome | null;
  readonly allowed_winner_user_id: string | null;
}

interface AttendanceStatusRow {
  readonly athlete_user_id: string;
  readonly status: string;
}

interface ResultRow {
  readonly result_id: string;
  readonly challenge_id: string;
  readonly session_id: string | null;
  readonly state: ResultState;
  readonly recorded_outcome_code: ResultOutcomeCode;
  readonly source_outcome_code: ResultOutcomeCode;
  readonly winner_user_id: string | null;
  readonly source_winner_user_id: string | null;
  readonly winner_display_name: string | null;
  readonly loser_user_id: string | null;
  readonly source_loser_user_id: string | null;
  readonly loser_display_name: string | null;
  readonly reason_code: string | null;
  readonly comment: string | null;
  readonly method_code: string | null;
  readonly method_text: string | null;
  readonly score_payload: unknown;
  readonly method_payload: unknown;
  readonly source_method_code: string | null;
  readonly source_method_text: string | null;
  readonly source_score_payload: unknown;
  readonly source_method_payload: unknown;
  readonly latest_metadata_revision_id: string | null;
  readonly metadata_revision_count: string | null;
  readonly recorded_at: Date;
  readonly appeal_deadline_at: Date;
  readonly finalized_at: Date | null;
  readonly decision: AppealDecision | null;
  readonly decision_reason: string | null;
  readonly pair_low_id: string;
  readonly pair_high_id: string;
  readonly coach_user_id: string | null;
  readonly session_coach_user_id: string | null;
  readonly challenge_state: string;
  readonly challenge_version: string;
  readonly effective_stake: ChallengeStake;
  readonly competition_id: string;
  readonly competition_phase: string;
  readonly competition_version: string;
  readonly competition_status_version: string;
  readonly current_champion_user_id: string | null;
  readonly current_contender_user_id: string | null;
  readonly status_lock_result_id: string | null;
  readonly transition_id: string | null;
  readonly transition_type: StatusTransitionType | null;
  readonly before_champion_user_id: string | null;
  readonly before_contender_user_id: string | null;
  readonly before_status_version: string | null;
  readonly after_champion_user_id: string | null;
  readonly after_contender_user_id: string | null;
  readonly after_status_version: string | null;
  readonly technical_correction_decision_id: string | null;
  readonly technical_compensation_id: string | null;
  readonly technical_corrected_transition_type: StatusTransitionType | null;
  readonly technical_to_champion_user_id: string | null;
  readonly technical_to_contender_user_id: string | null;
  readonly technical_status_version: string | null;
  readonly viewer_waived: boolean;
  readonly viewer_appealed: boolean;
  readonly viewer_admin: boolean;
  readonly viewer_session_coach: boolean;
  readonly viewer_coach_authorized: boolean;
  readonly integrity_review_state: string | null;
  readonly integrity_review_category: string | null;
  readonly version: string;
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null;
}

function optionalText(value: string | null, field: string, maximum: number): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum) {
    throw new ResultValidationError(field);
  }
  return normalized;
}

function requiredText(value: string, field: string, maximum: number): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum) {
    throw new ResultValidationError(field);
  }
  return normalized;
}

function requiredIds<T extends readonly (keyof ResultEffectIds)[]>(
  ids: ResultEffectIds,
  keys: T,
): { readonly [K in T[number]]: string } {
  const entries = keys.map((key) => {
    const value = ids[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`Result effect ID ${String(key)} is required`);
    }
    return [key, value];
  });
  return Object.fromEntries(entries) as { readonly [K in T[number]]: string };
}

async function recordContext(
  transaction: Transaction<Database>,
  challengeId: string,
  actorUserId: string,
): Promise<RecordContextRow> {
  const result = await sql<RecordContextRow>`
    select challenge.challenge_id, challenge.state as challenge_state,
      challenge.version::text as challenge_version, challenge.cycle_no,
      competition.competition_id, competition.phase as competition_phase,
      competition.version::text as competition_version,
      competition.champion_user_id as current_champion_user_id,
      competition.contender_user_id as current_contender_user_id,
      competition.status_version::text as current_status_version,
      competition.status_lock_result_id,
      competition.integrity_hold_case_id,
      exists (
        select 1 from competition.process_holds as process_hold
        where process_hold.aggregate_type = 'COMPETITION'
          and process_hold.aggregate_id = competition.competition_id
          and process_hold.reason = 'STATUS_REVIEW' and process_hold.state = 'ACTIVE'
      ) as status_review_hold_active,
      session.session_id, session.state as session_state, session.venue_id,
      session.coach_user_id, session.actual_start_at, session.actual_end_at,
      session.pair_low_id, session.pair_high_id,
      snapshot.snapshot_id, snapshot.effective_stake,
      snapshot.champion_user_id as snapshot_champion_user_id,
      snapshot.contender_user_id as snapshot_contender_user_id,
      snapshot.competition_status_version::text as snapshot_status_version,
      configuration.pair_cooldown_days,
      existing.result_id as existing_result_id,
      review.review_id as missing_result_review_id,
      review.state as missing_result_review_state,
      review.version::text as missing_result_review_version,
      review.assigned_reviewer_coach_user_id,
      review.allowed_outcome_code,
      review.allowed_winner_user_id,
      exists (
        select 1 from community.role_grants as role_grant
        where role_grant.user_id = ${actorUserId}::uuid
          and role_grant.role = 'COACH' and role_grant.state = 'ACTIVE'
          and (role_grant.expires_at is null or role_grant.expires_at > clock_timestamp())
          and (
            (role_grant.scope_type = 'SESSION' and role_grant.scope_id = session.session_id)
            or (role_grant.scope_type = 'COMMUNITY' and role_grant.scope_id = competition.community_id)
          )
      ) as actor_coach_authorized
    from competition.challenges as challenge
    join scheduling.sessions as session
      on session.challenge_id = challenge.challenge_id
      and session.purpose = 'OFFICIAL_CHALLENGE'
    join scheduling.session_competitive_snapshots as snapshot
      on snapshot.session_id = session.session_id
      and snapshot.challenge_id = challenge.challenge_id
    join competition.competitions as competition
      on competition.competition_id = challenge.competition_id
      and competition.competition_id = snapshot.competition_id
    join community.community_configuration_versions as configuration
      on configuration.configuration_id = snapshot.community_configuration_id
    left join competition.results as existing
      on existing.challenge_id = challenge.challenge_id
      and existing.cycle_no = challenge.cycle_no
    left join competition.missing_result_reviews as review
      on review.challenge_id = challenge.challenge_id
    where challenge.challenge_id = ${challengeId}::uuid
    order by session.created_at desc
    limit 1
    for update of challenge, session, competition
  `.execute(transaction);
  const row = result.rows[0];
  if (!row) throw new ResultConflictError('CHALLENGE_NOT_AWAITING_RESULT');
  return row;
}

async function resultRow(
  database: Kysely<Database> | Transaction<Database>,
  resultId: string,
  viewerUserId: string,
  lock = false,
): Promise<ResultRow | null> {
  const result = await sql<ResultRow>`
    select result.result_id, result.challenge_id, result.session_id,
      result.state, coalesce(integrity_decision.effective_outcome_code,
        decision.effective_outcome_code, correction_decision.effective_outcome_code,
        result.recorded_outcome_code)
        as recorded_outcome_code,
      result.recorded_outcome_code as source_outcome_code,
      case when integrity_decision.effective_disposition in ('ANNUL', 'REPEAT')
          or decision.decision in ('ANNUL', 'REPEAT') then null
        else coalesce(integrity_decision.effective_winner_user_id,
          decision.effective_winner_user_id,
          case when correction_decision.decision_id is not null
            then correction_decision.effective_winner_user_id else result.winner_user_id end)
      end as winner_user_id,
      result.winner_user_id as source_winner_user_id,
      winner.display_name as winner_display_name,
      case when integrity_decision.effective_disposition in ('ANNUL', 'REPEAT')
          or decision.decision in ('ANNUL', 'REPEAT') then null
        else coalesce(integrity_decision.effective_loser_user_id,
          decision.effective_loser_user_id,
          case when correction_decision.decision_id is not null
            then correction_decision.effective_loser_user_id else result.loser_user_id end)
      end as loser_user_id,
      result.loser_user_id as source_loser_user_id,
      loser.display_name as loser_display_name,
      result.reason_code, result.comment,
      case when latest_revision.revision_id is null then result.method_code
        else latest_revision.after_method_code end as method_code,
      case when latest_revision.revision_id is null then result.method_text
        else latest_revision.after_method_text end as method_text,
      case when latest_revision.revision_id is null then result.score_payload
        else latest_revision.after_score_payload end as score_payload,
      case when latest_revision.revision_id is null then result.method_payload
        else latest_revision.after_method_payload end as method_payload,
      result.method_code as source_method_code,
      result.method_text as source_method_text,
      result.score_payload as source_score_payload,
      result.method_payload as source_method_payload,
      latest_revision.revision_id as latest_metadata_revision_id,
      latest_revision.revision_count::text as metadata_revision_count,
      result.recorded_at, result.appeal_deadline_at,
      result.finalized_at, decision.decision, decision.reason as decision_reason,
      challenge.pair_low_id, challenge.pair_high_id,
      result.coach_user_id, source_session.coach_user_id as session_coach_user_id,
      challenge.state as challenge_state,
      challenge.version::text as challenge_version,
      coalesce(snapshot.effective_stake, challenge.stake) as effective_stake,
      competition.competition_id, competition.phase as competition_phase,
      competition.version::text as competition_version,
      competition.status_version::text as competition_status_version,
      competition.champion_user_id as current_champion_user_id,
      competition.contender_user_id as current_contender_user_id,
      competition.status_lock_result_id,
      transition.transition_id, transition.transition_type,
      transition.before_champion_user_id, transition.before_contender_user_id,
      transition.before_status_version::text as before_status_version,
      transition.after_champion_user_id, transition.after_contender_user_id,
      transition.after_status_version::text as after_status_version,
      correction_decision.decision_id as technical_correction_decision_id,
      correction_compensation.compensation_id as technical_compensation_id,
      correction_compensation.corrected_transition_type
        as technical_corrected_transition_type,
      correction_compensation.to_champion_user_id as technical_to_champion_user_id,
      correction_compensation.to_contender_user_id as technical_to_contender_user_id,
      correction_compensation.competition_status_version::text
        as technical_status_version,
      exists (
        select 1 from competition.appeal_waivers as waiver
        where waiver.result_id = result.result_id and waiver.user_id = ${viewerUserId}::uuid
      ) as viewer_waived,
      exists (
        select 1 from competition.appeals as appeal
        where appeal.result_id = result.result_id and appeal.appellant_user_id = ${viewerUserId}::uuid
      ) as viewer_appealed,
      exists (
        select 1 from community.role_grants as role_grant
        where role_grant.user_id = ${viewerUserId}::uuid
          and role_grant.state = 'ACTIVE'
          and (role_grant.expires_at is null or role_grant.expires_at > clock_timestamp())
          and (
            (role_grant.role = 'CENTRAL_ADMIN' and role_grant.scope_type = 'GLOBAL')
            or (role_grant.role in ('GYM_ADMIN', 'PRIMARY_ADMIN')
              and role_grant.scope_type = 'VENUE' and role_grant.scope_id = result.venue_id)
          )
      ) as viewer_admin,
      exists (
        select 1 from scheduling.sessions as source_session
        where source_session.challenge_id = result.challenge_id
          and source_session.purpose = 'OFFICIAL_CHALLENGE'
          and source_session.coach_user_id = ${viewerUserId}::uuid
      ) as viewer_session_coach,
      exists (
        select 1 from community.role_grants as coach_grant
        where coach_grant.user_id = ${viewerUserId}::uuid
          and coach_grant.role = 'COACH' and coach_grant.state = 'ACTIVE'
          and (coach_grant.expires_at is null or coach_grant.expires_at > clock_timestamp())
          and (
            (coach_grant.scope_type = 'SESSION' and coach_grant.scope_id = result.session_id
              and result.state not in ('FINAL', 'REVERSED', 'ANNULLED', 'REPEAT_ORDERED'))
            or (coach_grant.scope_type = 'COMMUNITY'
              and coach_grant.scope_id = competition.community_id)
          )
      ) as viewer_coach_authorized,
      integrity.state as integrity_review_state,
      integrity.public_reason_category as integrity_review_category,
      result.version::text as version
    from competition.results as result
    join competition.challenges as challenge on challenge.challenge_id = result.challenge_id
    join competition.competitions as competition on competition.competition_id = challenge.competition_id
    left join scheduling.sessions as source_session on source_session.session_id = result.session_id
    left join scheduling.session_competitive_snapshots as snapshot
      on snapshot.snapshot_id = result.competitive_snapshot_id
    left join competition.appeal_decisions as decision on decision.result_id = result.result_id
    left join competition.technical_correction_decisions as correction_decision
      on correction_decision.result_id = result.result_id
    left join competition.technical_correction_status_compensations as correction_compensation
      on correction_compensation.decision_id = correction_decision.decision_id
    left join lateral (
      select revision.revision_id, revision.after_method_code,
        revision.after_method_text, revision.after_score_payload,
        revision.after_method_payload, count(*) over () as revision_count
      from competition.result_metadata_revisions as revision
      where revision.result_id = result.result_id
      order by revision.result_version desc
      limit 1
    ) as latest_revision on true
    left join lateral (
      select integrity_case.case_id, integrity_case.state,
        integrity_case.public_reason_category
      from competition.integrity_cases as integrity_case
      where integrity_case.result_id = result.result_id
      order by integrity_case.opened_at desc, integrity_case.case_id desc
      limit 1
    ) as integrity on true
    left join competition.integrity_decisions as integrity_decision
      on integrity_decision.case_id = integrity.case_id
    left join identity.users as winner on winner.user_id = case
      when integrity_decision.effective_disposition in ('ANNUL', 'REPEAT')
        or decision.decision in ('ANNUL', 'REPEAT') then null
      else coalesce(integrity_decision.effective_winner_user_id,
        decision.effective_winner_user_id,
        case when correction_decision.decision_id is not null
          then correction_decision.effective_winner_user_id else result.winner_user_id end)
    end
    left join identity.users as loser on loser.user_id = case
      when integrity_decision.effective_disposition in ('ANNUL', 'REPEAT')
        or decision.decision in ('ANNUL', 'REPEAT') then null
      else coalesce(integrity_decision.effective_loser_user_id,
        decision.effective_loser_user_id,
        case when correction_decision.decision_id is not null
          then correction_decision.effective_loser_user_id else result.loser_user_id end)
    end
    left join competition.status_transitions as transition
      on transition.source_result_id = result.result_id
    where result.result_id = ${resultId}::uuid
    ${lock ? sql`for update of result, challenge, competition` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

function resultProjection(row: ResultRow, viewerUserId: string, occurredAt = new Date()): ResultProjection {
  const direct = [row.pair_low_id, row.pair_high_id, row.coach_user_id].includes(viewerUserId);
  if (!direct && !row.viewer_admin && !row.viewer_session_coach) {
    throw new ResultPermissionDeniedError();
  }
  const eligible = eligibleAppealUserIds({
    outcomeCode: row.recorded_outcome_code,
    loserUserId: row.loser_user_id,
    participantUserIds: [row.pair_low_id, row.pair_high_id],
  });
  const canAct = row.state === 'RECORDED'
    && occurredAt < row.appeal_deadline_at
    && eligible.includes(viewerUserId)
    && !row.viewer_waived
    && !row.viewer_appealed;
  const beforeVersion = Number(row.before_status_version ?? row.competition_status_version);
  const afterVersion = Number(row.after_status_version ?? row.competition_status_version);
  const technicalProjectionApplies = row.technical_compensation_id !== null
    && row.decision === null
    && !row.integrity_review_state?.startsWith('DECIDED_');
  const beforeChampionUserId = row.transition_id
    ? row.before_champion_user_id
    : row.current_champion_user_id;
  const beforeContenderUserId = row.transition_id
    ? row.before_contender_user_id
    : row.current_contender_user_id;
  const afterChampionUserId = technicalProjectionApplies
    ? row.technical_to_champion_user_id
    : row.transition_id
      ? row.after_champion_user_id
    : row.current_champion_user_id;
  const afterContenderUserId = technicalProjectionApplies
    ? row.technical_to_contender_user_id
    : row.transition_id
      ? row.after_contender_user_id
    : row.current_contender_user_id;
  return {
    resultId: row.result_id,
    challengeId: row.challenge_id,
    sessionId: row.session_id,
    state: row.state,
    outcomeCode: row.recorded_outcome_code,
    recordedOutcomeCode: row.source_outcome_code,
    winnerUserId: row.winner_user_id,
    winnerDisplayName: row.winner_display_name,
    loserUserId: row.loser_user_id,
    loserDisplayName: row.loser_display_name,
    recordedWinnerUserId: row.source_winner_user_id,
    recordedLoserUserId: row.source_loser_user_id,
    technicalCorrectionDecisionId: row.technical_correction_decision_id,
    reasonCode: row.reason_code,
    comment: row.comment,
    methodCode: row.method_code,
    methodText: row.method_text,
    scorePayload: record(row.score_payload),
    methodPayload: record(row.method_payload),
    recordedMethodCode: row.source_method_code,
    recordedMethodText: row.source_method_text,
    recordedScorePayload: record(row.source_score_payload),
    recordedMethodPayload: record(row.source_method_payload),
    latestMetadataRevisionId: row.latest_metadata_revision_id,
    metadataRevisionCount: Number(row.metadata_revision_count ?? '0'),
    metadataRevisionDeadlineAt: resultMetadataRevisionDeadline(row.recorded_at).toISOString(),
    viewerCanReviseMetadata: row.viewer_coach_authorized
      && (viewerUserId === row.coach_user_id || viewerUserId === row.session_coach_user_id)
      && ![row.pair_low_id, row.pair_high_id].includes(viewerUserId)
      && occurredAt < resultMetadataRevisionDeadline(row.recorded_at),
    recordedAt: row.recorded_at.toISOString(),
    appealDeadlineAt: row.appeal_deadline_at.toISOString(),
    finalizedAt: row.finalized_at?.toISOString() ?? null,
    decision: row.decision,
    decisionReason: row.decision_reason,
    statusTransitionType: technicalProjectionApplies
      ? row.technical_corrected_transition_type ?? 'NONE'
      : row.transition_type ?? 'NONE',
    statusBefore: {
      championUserId: beforeChampionUserId,
      contenderUserId: beforeContenderUserId,
      statusVersion: beforeVersion,
    },
    statusAfter: {
      championUserId: afterChampionUserId,
      contenderUserId: afterContenderUserId,
      statusVersion: technicalProjectionApplies
        ? Number(row.technical_status_version)
        : afterVersion,
    },
    provisional: row.state === 'RECORDED' || row.state === 'UNDER_APPEAL',
    integrityReviewState: row.integrity_review_state,
    integrityReviewCategory: row.integrity_review_category,
    viewerCanAppeal: canAct,
    viewerCanWaiveAppeal: canAct,
    version: Number(row.version),
  };
}

interface AdministrativeForfeitContextRow {
  readonly challenge_id: string;
  readonly challenge_state: string;
  readonly challenge_version: string;
  readonly cycle_no: number;
  readonly stake: ChallengeStake;
  readonly pair_low_id: string;
  readonly pair_high_id: string;
  readonly active_obligation_count: string;
  readonly existing_result_id: string | null;
  readonly competition_id: string;
  readonly competition_version: string;
  readonly current_champion_user_id: string | null;
  readonly current_contender_user_id: string | null;
  readonly current_status_version: string;
  readonly status_lock_result_id: string | null;
  readonly integrity_hold_case_id: string | null;
  readonly status_review_hold_active: boolean;
  readonly pair_cooldown_days: number;
  readonly snapshot_id: string | null;
  readonly effective_stake: ChallengeStake | null;
  readonly snapshot_champion_user_id: string | null;
  readonly snapshot_contender_user_id: string | null;
  readonly snapshot_status_version: string | null;
}

export async function recordAdministrativeForfeit(
  transaction: Transaction<Database>,
  input: RecordAdministrativeForfeitInput,
  ids: AdministrativeForfeitEffectIds,
): Promise<AdministrativeForfeitArtifacts> {
  if (
    !Number.isFinite(input.occurredAt.getTime())
    || input.reasonCode.trim().length === 0
    || input.reasonCode.length > 80
    || input.comment.trim().length === 0
    || input.comment.length > 500
    || input.notificationRecipientUserIds.length !== ids.notificationIds.length
  ) {
    throw new ResultValidationError('administrativeForfeit');
  }
  const contextResult = await sql<AdministrativeForfeitContextRow>`
    select challenge.challenge_id, challenge.state as challenge_state,
      challenge.version::text as challenge_version, challenge.cycle_no,
      challenge.stake, challenge.pair_low_id, challenge.pair_high_id,
      (select count(*)::text from competition.challenge_participant_obligations obligation
        where obligation.challenge_id = challenge.challenge_id
          and obligation.released_at is null) as active_obligation_count,
      existing.result_id as existing_result_id,
      competition.competition_id, competition.version::text as competition_version,
      competition.champion_user_id as current_champion_user_id,
      competition.contender_user_id as current_contender_user_id,
      competition.status_version::text as current_status_version,
      competition.status_lock_result_id, competition.integrity_hold_case_id,
      exists (
        select 1 from competition.process_holds process_hold
        where process_hold.aggregate_type = 'COMPETITION'
          and process_hold.aggregate_id = competition.competition_id
          and process_hold.reason = 'STATUS_REVIEW' and process_hold.state = 'ACTIVE'
      ) as status_review_hold_active,
      configuration.pair_cooldown_days,
      snapshot.snapshot_id, snapshot.effective_stake,
      snapshot.champion_user_id as snapshot_champion_user_id,
      snapshot.contender_user_id as snapshot_contender_user_id,
      snapshot.competition_status_version::text as snapshot_status_version
    from competition.challenges challenge
    join competition.competitions competition
      on competition.competition_id = challenge.competition_id
    join community.communities community on community.community_id = competition.community_id
    join community.community_configuration_versions configuration
      on configuration.configuration_id = community.configuration_id
    left join competition.results existing
      on existing.challenge_id = challenge.challenge_id and existing.cycle_no = challenge.cycle_no
    left join lateral (
      select competitive.snapshot_id, competitive.effective_stake,
        competitive.champion_user_id, competitive.contender_user_id,
        competitive.competition_status_version
      from scheduling.session_competitive_snapshots competitive
      where competitive.challenge_id = challenge.challenge_id
      order by competitive.created_at desc, competitive.snapshot_id desc
      limit 1
    ) snapshot on true
    where challenge.challenge_id = ${input.challengeId}::uuid
    for update of challenge, competition
  `.execute(transaction);
  const row = contextResult.rows[0];
  if (
    !row
    || row.challenge_state !== input.expectedChallengeState
    || Number(row.active_obligation_count) !== 2
    || row.existing_result_id !== null
    || ![row.pair_low_id, row.pair_high_id].includes(input.loserUserId)
  ) {
    throw new ResultConflictError('CHALLENGE_NOT_AWAITING_RESULT');
  }
  const winnerUserId = row.pair_low_id === input.loserUserId
    ? row.pair_high_id
    : row.pair_low_id;
  const statusSnapshot = {
    championUserId: row.snapshot_id
      ? row.snapshot_champion_user_id
      : row.current_champion_user_id,
    contenderUserId: row.snapshot_id
      ? row.snapshot_contender_user_id
      : row.current_contender_user_id,
    statusVersion: Number(row.snapshot_id
      ? row.snapshot_status_version
      : row.current_status_version),
  };
  const effectiveStake = row.effective_stake ?? effectiveChallengeStakeAtSessionWindow({
    plannedStake: row.stake,
    participantUserIds: [row.pair_low_id, row.pair_high_id],
    championUserId: row.current_champion_user_id,
    contenderUserId: row.current_contender_user_id,
  });
  const transition = deriveProvisionalStatusTransition({
    stake: effectiveStake,
    outcomeCode: 'FORFEIT',
    winnerUserId,
    loserUserId: input.loserUserId,
    snapshot: statusSnapshot,
  });
  if (transition.locksStatus) {
    if (row.integrity_hold_case_id || row.status_review_hold_active) {
      throw new ResultConflictError('COMPETITION_INTEGRITY_HOLD');
    }
    if (row.status_lock_result_id) throw new ResultConflictError('COMPETITION_STATUS_LOCKED');
    if (
      row.current_champion_user_id !== statusSnapshot.championUserId
      || row.current_contender_user_id !== statusSnapshot.contenderUserId
      || Number(row.current_status_version) !== statusSnapshot.statusVersion
    ) throw new ResultConflictError('COMPETITION_STATUS_SNAPSHOT_STALE');
  }
  const appealDeadlineAt = resultAppealDeadline(input.occurredAt);
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
      ${ids.resultId}::uuid, ${row.challenge_id}::uuid, null, null,
      ${row.cycle_no}, 'ADMINISTRATIVE_FORFEIT', 'RECORDED', 'FORFEIT',
      ${winnerUserId}::uuid, ${input.loserUserId}::uuid,
      ${input.reasonCode}, ${input.comment}, null, null, null, null,
      ${input.occurredAt.toISOString()}::timestamptz, null, null,
      ${input.recordedByUserId}::uuid, ${input.occurredAt.toISOString()}::timestamptz,
      ${appealDeadlineAt.toISOString()}::timestamptz,
      ${JSON.stringify(preStatus)}::jsonb,
      ${transition.locksStatus ? ids.statusEventId : null}::uuid,
      1, ${input.occurredAt.toISOString()}::timestamptz
    )
  `.execute(transaction);
  const challengeVersion = Number(row.challenge_version) + 1;
  await sql`
    update competition.challenges
    set state = 'RESULT_RECORDED', decided_at = ${input.occurredAt.toISOString()}::timestamptz,
      version = ${challengeVersion}, updated_at = ${input.occurredAt.toISOString()}::timestamptz
    where challenge_id = ${row.challenge_id}::uuid and state = ${input.expectedChallengeState}
  `.execute(transaction);
  let competitionAggregateVersion: number | null = null;
  if (transition.locksStatus) {
    competitionAggregateVersion = Number(row.competition_version) + 1;
    await sql`
      update competition.competitions
      set champion_user_id = ${transition.after.championUserId}::uuid,
        contender_user_id = ${transition.after.contenderUserId}::uuid,
        status_version = ${transition.after.statusVersion},
        status_lock_result_id = ${ids.resultId}::uuid,
        version = ${competitionAggregateVersion},
        updated_at = ${input.occurredAt.toISOString()}::timestamptz
      where competition_id = ${row.competition_id}::uuid
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
        ${ids.statusTransitionId}::uuid, ${ids.resultId}::uuid,
        ${ids.resultEventId}::uuid, ${row.competition_id}::uuid,
        ${transition.type}, ${transition.before.championUserId}::uuid,
        ${transition.before.contenderUserId}::uuid, ${transition.before.statusVersion},
        ${transition.after.championUserId}::uuid,
        ${transition.after.contenderUserId}::uuid, ${transition.after.statusVersion},
        null, true, ${input.occurredAt.toISOString()}::timestamptz
      )
    `.execute(transaction);
  }
  const cooldownEndsAt = new Date(
    input.occurredAt.getTime() + row.pair_cooldown_days * 24 * 60 * 60 * 1_000,
  );
  await sql`
    insert into competition.pair_cooldowns (
      cooldown_id, competition_id, pair_low_id, pair_high_id,
      source_result_id, started_at, ends_at
    ) values (
      ${ids.cooldownId}::uuid, ${row.competition_id}::uuid,
      ${row.pair_low_id}::uuid, ${row.pair_high_id}::uuid,
      ${ids.resultId}::uuid, ${input.occurredAt.toISOString()}::timestamptz,
      ${cooldownEndsAt.toISOString()}::timestamptz
    )
  `.execute(transaction);
  const projectionRow = await resultRow(transaction, ids.resultId, input.recordedByUserId);
  if (!projectionRow) throw new ResultConflictError('RESULT_NOT_RECORDED');
  const response = resultProjection(projectionRow, input.recordedByUserId, input.occurredAt);
  const canonicalPayload = {
    resultId: ids.resultId,
    challengeId: row.challenge_id,
    sessionId: null,
    sourceSessionId: input.sourceSessionId,
    origin: 'ADMINISTRATIVE_FORFEIT',
    competitiveContextSnapshotId: null,
    sourceCompetitiveContextSnapshotId: row.snapshot_id,
    outcomeCode: 'FORFEIT',
    winnerUserId,
    loserUserId: input.loserUserId,
    reasonCode: input.reasonCode,
    actualTime: input.occurredAt.toISOString(),
    venueId: null,
    coachUserId: null,
    sourceCoachUserId: input.sourceCoachUserId,
    appealDeadlineAt: appealDeadlineAt.toISOString(),
    preStatus,
    stake: effectiveStake,
  };
  const relatedEvents: RelatedDomainEventDraft[] = [
    {
      eventId: ids.resultEventId, eventName: 'ResultRecorded', schemaVersion: 1,
      aggregateType: 'Result', aggregateId: ids.resultId, aggregateVersion: 1,
      transitionId: 'R-01', payload: canonicalPayload,
      metadata: { policyVersion: RESULT_POLICY_VERSION },
    },
    {
      eventId: ids.cooldownEventId, eventName: 'PairCooldownStarted', schemaVersion: 1,
      aggregateType: 'PairCooldown', aggregateId: ids.cooldownId, aggregateVersion: 1,
      transitionId: 'CD-01',
      payload: {
        cooldownId: ids.cooldownId, competitionId: row.competition_id,
        participantIds: [row.pair_low_id, row.pair_high_id], sourceResultId: ids.resultId,
        startedAt: input.occurredAt.toISOString(), endsAt: cooldownEndsAt.toISOString(),
      },
      metadata: { policyVersion: RESULT_POLICY_VERSION },
    },
  ];
  if (transition.locksStatus && competitionAggregateVersion !== null) {
    relatedEvents.push({
      eventId: ids.statusEventId, eventName: transition.eventName!, schemaVersion: 1,
      aggregateType: 'Competition', aggregateId: row.competition_id,
      aggregateVersion: competitionAggregateVersion, transitionId: transition.transitionId,
      payload: {
        transitionId: ids.statusTransitionId, sourceResultId: ids.resultId,
        sourceEventId: ids.resultEventId, competitionId: row.competition_id,
        before: transition.before, after: transition.after,
        transitionType: transition.type, provisional: true,
        participantIds: [row.pair_low_id, row.pair_high_id], snapshotId: row.snapshot_id,
      },
      metadata: { policyVersion: RESULT_POLICY_VERSION },
    });
  }
  return {
    resultId: ids.resultId,
    challengeVersion,
    appealDeadlineAt,
    statusTransitionType: transition.type,
    response,
    relatedEvents,
    outbox: [
      {
        messageId: ids.resultOutboxMessageId,
        topic: 'competition.result.recorded.v1',
        sourceEventId: ids.resultEventId,
        payload: {
          ...canonicalPayload,
          timer: {
            commandType: 'FINALIZE_RESULT', aggregateType: 'Result',
            aggregateId: ids.resultId, expectedState: 'RECORDED', expectedVersion: 1,
            deadlineAt: appealDeadlineAt.toISOString(), policyVersion: RESULT_POLICY_VERSION,
            idempotencyKey: `result:${ids.resultId}:finalize:v1`,
          },
        },
      },
      {
        messageId: ids.notificationOutboxMessageId,
        topic: 'notification.in_app.v1',
        payload: {
          notifications: input.notificationRecipientUserIds.map((recipientUserId, index) => ({
            notificationId: ids.notificationIds[index]!, recipientUserId,
            category: 'MANDATORY', renderKey: 'result.administrative-forfeit-recorded',
            actionTarget: { type: 'RESULT', resultId: ids.resultId },
            payload: {
              challengeId: row.challenge_id, sourceSessionId: input.sourceSessionId,
              outcomeCode: 'FORFEIT', winnerUserId, loserUserId: input.loserUserId,
              statusTransitionType: transition.type, provisional: true,
            },
            deadlineAt: appealDeadlineAt.toISOString(),
          })),
        },
      },
    ],
  };
}

export async function readResult(
  database: Kysely<Database>,
  resultId: string,
  viewerUserId: string,
  now: Date = new Date(),
): Promise<ResultProjection> {
  if (!Number.isFinite(now.getTime())) throw new ResultValidationError('now');
  const row = await resultRow(database, resultId, viewerUserId);
  if (!row) throw new ResultPermissionDeniedError();
  return resultProjection(row, viewerUserId, now);
}

export async function readResultTimerSnapshot(
  database: Kysely<Database>,
  resultId: string,
): Promise<TimerAggregateSnapshot> {
  const result = await sql<{ readonly state: string; readonly version: string }>`
    select state, version::text as version
    from competition.results where result_id = ${resultId}::uuid
  `.execute(database);
  const row = result.rows[0];
  return row ? { state: row.state, version: Number(row.version) } : { state: 'MISSING', version: 0 };
}

export async function recordSessionResult(
  database: Kysely<Database>,
  command: CommandEnvelope<RecordSessionResultPayload>,
  ids: ResultEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<ResultProjection>> {
  if (
    !command.actor.id || command.aggregateType !== 'Challenge'
    || command.payload.challengeId !== command.aggregateId
  ) throw new ResultPermissionDeniedError();
  const actorUserId = command.actor.id;
  const required = requiredIds(ids, [
    'resultId', 'resultEventId', 'timerOutboxMessageId',
    'notificationOutboxMessageId',
  ] as const);
  if (!ids.notificationIds || ids.notificationIds.length < 2) {
    throw new TypeError('Two Result notification IDs are required');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await recordContext(transaction, command.aggregateId, actorUserId);
      if (row.existing_result_id) throw new ResultConflictError('RESULT_ALREADY_RECORDED');
      if (row.challenge_state !== 'RESULT_PENDING') {
        throw new ResultConflictError('CHALLENGE_NOT_AWAITING_RESULT');
      }
      if (row.session_id !== command.payload.sessionId || row.session_state !== 'ENDED') {
        throw new ResultConflictError('SESSION_NOT_ENDED');
      }
      const actorIsOriginalCoach = actorUserId === row.coach_user_id;
      const actorIsAssignedReviewer = row.missing_result_review_state === 'REVIEWER_ASSIGNED'
        && actorUserId === row.assigned_reviewer_coach_user_id;
      if (
        (!actorIsOriginalCoach && !actorIsAssignedReviewer)
        || !row.actor_coach_authorized
        || [row.pair_low_id, row.pair_high_id].includes(actorUserId)
      ) throw new ResultPermissionDeniedError();
      const normalized = normalizeResultParticipants({
        outcomeCode: command.payload.outcomeCode,
        winnerUserId: command.payload.winnerUserId,
        participantUserIds: [row.pair_low_id, row.pair_high_id],
        reasonCode: command.payload.reasonCode,
        comment: command.payload.comment,
      });
      if (actorIsAssignedReviewer) {
        assertReviewedResultMatchesAssignment({
          state: row.missing_result_review_state!,
          assignedReviewerCoachUserId: row.assigned_reviewer_coach_user_id,
          actorUserId,
          allowedOutcomeCode: row.allowed_outcome_code,
          allowedWinnerUserId: row.allowed_winner_user_id,
          outcomeCode: command.payload.outcomeCode,
          winnerUserId: normalized.winnerUserId,
        });
      }
      const attendance = await sql<AttendanceStatusRow>`
        select athlete_user_id, status from scheduling.attendance
        where session_id = ${row.session_id}::uuid
      `.execute(transaction);
      assertResultMatchesAttendance({
        outcomeCode: command.payload.outcomeCode,
        winnerUserId: normalized.winnerUserId,
        participantUserIds: [row.pair_low_id, row.pair_high_id],
        noShowUserIds: attendance.rows
          .filter((item) => item.status === 'NO_SHOW')
          .map((item) => item.athlete_user_id),
      });
      const transition = deriveProvisionalStatusTransition({
        stake: row.effective_stake,
        outcomeCode: command.payload.outcomeCode,
        winnerUserId: normalized.winnerUserId,
        loserUserId: normalized.loserUserId,
        snapshot: {
          championUserId: row.snapshot_champion_user_id,
          contenderUserId: row.snapshot_contender_user_id,
          statusVersion: Number(row.snapshot_status_version),
        },
      });
      if (transition.locksStatus) {
        if (row.integrity_hold_case_id || row.status_review_hold_active) {
          throw new ResultConflictError('COMPETITION_INTEGRITY_HOLD');
        }
        if (row.status_lock_result_id) throw new ResultConflictError('COMPETITION_STATUS_LOCKED');
        if (
          row.current_champion_user_id !== row.snapshot_champion_user_id
          || row.current_contender_user_id !== row.snapshot_contender_user_id
          || Number(row.current_status_version) !== Number(row.snapshot_status_version)
        ) throw new ResultConflictError('COMPETITION_STATUS_SNAPSHOT_STALE');
      }
      const appealDeadlineAt = resultAppealDeadline(context.occurredAt);
      const methodCode = optionalText(command.payload.methodCode, 'methodCode', 80);
      const methodText = optionalText(command.payload.methodText, 'methodText', 500);
      assertAthleteStoppageResult({
        outcomeCode: command.payload.outcomeCode,
        winnerUserId: normalized.winnerUserId,
        methodCode,
        actualStartAt: row.actual_start_at,
      });
      assertExternalNoContestResult({
        outcomeCode: command.payload.outcomeCode,
        winnerUserId: normalized.winnerUserId,
        reasonCode: normalized.reasonCode,
        methodCode,
        actualStartAt: row.actual_start_at,
      });
      const preStatus = {
        championUserId: transition.before.championUserId,
        contenderUserId: transition.before.contenderUserId,
        statusVersion: transition.before.statusVersion,
      };
      const statusIds = transition.locksStatus
        ? requiredIds(ids, ['statusTransitionId', 'statusEventId'] as const)
        : null;
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
          ${required.resultId}::uuid, ${row.challenge_id}::uuid,
          ${row.session_id}::uuid, ${row.snapshot_id}::uuid,
          ${row.cycle_no}, 'SESSION', 'RECORDED', ${command.payload.outcomeCode},
          ${normalized.winnerUserId}::uuid, ${normalized.loserUserId}::uuid,
          ${normalized.reasonCode}, ${normalized.comment}, ${methodCode}, ${methodText},
          ${command.payload.scorePayload ? JSON.stringify(command.payload.scorePayload) : null}::jsonb,
          ${command.payload.methodPayload ? JSON.stringify(command.payload.methodPayload) : null}::jsonb,
          ${row.actual_end_at.toISOString()}::timestamptz, ${row.venue_id}::uuid,
          ${actorUserId}::uuid, ${actorUserId}::uuid,
          ${context.occurredAt.toISOString()}::timestamptz,
          ${appealDeadlineAt.toISOString()}::timestamptz,
          ${JSON.stringify(preStatus)}::jsonb, ${statusIds?.statusEventId ?? null}::uuid,
          1, ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        update competition.challenges
        set state = 'RESULT_RECORDED', version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where challenge_id = ${row.challenge_id}::uuid and state = 'RESULT_PENDING'
      `.execute(transaction);
      let competitionAggregateVersion: number | null = null;
      if (transition.locksStatus && statusIds) {
        competitionAggregateVersion = Number(row.competition_version) + 1;
        await sql`
          update competition.competitions
          set champion_user_id = ${transition.after.championUserId}::uuid,
            contender_user_id = ${transition.after.contenderUserId}::uuid,
            status_version = ${transition.after.statusVersion},
            status_lock_result_id = ${required.resultId}::uuid,
            version = ${competitionAggregateVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where competition_id = ${row.competition_id}::uuid
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
            ${statusIds.statusTransitionId}::uuid, ${required.resultId}::uuid,
            ${required.resultEventId}::uuid, ${row.competition_id}::uuid,
            ${transition.type}, ${transition.before.championUserId}::uuid,
            ${transition.before.contenderUserId}::uuid, ${transition.before.statusVersion},
            ${transition.after.championUserId}::uuid,
            ${transition.after.contenderUserId}::uuid, ${transition.after.statusVersion},
            ${row.snapshot_id}::uuid, true,
            ${context.occurredAt.toISOString()}::timestamptz
          )
        `.execute(transaction);
      }
      let cooldown: { readonly id: string; readonly eventId: string; readonly endsAt: Date } | null = null;
      if (normalized.decisive) {
        const cooldownIds = requiredIds(ids, ['cooldownId', 'cooldownEventId'] as const);
        const cooldownEndsAt = new Date(
          context.occurredAt.getTime() + row.pair_cooldown_days * 24 * 60 * 60 * 1_000,
        );
        cooldown = { id: cooldownIds.cooldownId, eventId: cooldownIds.cooldownEventId, endsAt: cooldownEndsAt };
        await sql`
          insert into competition.pair_cooldowns (
            cooldown_id, competition_id, pair_low_id, pair_high_id,
            source_result_id, started_at, ends_at
          ) values (
            ${cooldownIds.cooldownId}::uuid, ${row.competition_id}::uuid,
            ${row.pair_low_id}::uuid, ${row.pair_high_id}::uuid,
            ${required.resultId}::uuid, ${context.occurredAt.toISOString()}::timestamptz,
            ${cooldownEndsAt.toISOString()}::timestamptz
          )
        `.execute(transaction);
      }
      const projectionRow = await resultRow(transaction, required.resultId, actorUserId);
      if (!projectionRow) throw new ResultConflictError('RESULT_NOT_RECORDED');
      const response = resultProjection(projectionRow, actorUserId, context.occurredAt);
      const canonicalPayload = {
        resultId: required.resultId,
        challengeId: row.challenge_id,
        sessionId: row.session_id,
        origin: 'SESSION',
        competitiveContextSnapshotId: row.snapshot_id,
        outcomeCode: command.payload.outcomeCode,
        winnerUserId: normalized.winnerUserId,
        loserUserId: normalized.loserUserId,
        reasonCode: normalized.reasonCode,
        actualTime: row.actual_end_at.toISOString(),
        venueId: row.venue_id,
        coachUserId: actorUserId,
        appealDeadlineAt: appealDeadlineAt.toISOString(),
        preStatus,
        stake: row.effective_stake,
      };
      const relatedEvents: RelatedDomainEventDraft[] = [{
        eventId: required.resultEventId,
        eventName: 'ResultRecorded', schemaVersion: 1,
        aggregateType: 'Result', aggregateId: required.resultId,
        aggregateVersion: 1, transitionId: 'R-01', payload: canonicalPayload,
        metadata: { policyVersion: RESULT_POLICY_VERSION },
      }];
      if (
        row.missing_result_review_id
        && row.missing_result_review_version
        && ['OPEN', 'UNDER_REVIEW', 'REVIEWER_ASSIGNED'].includes(row.missing_result_review_state ?? '')
      ) {
        const reviewEventId = requiredIds(ids, ['missingResultReviewEventId'] as const)
          .missingResultReviewEventId;
        const reviewNextVersion = Number(row.missing_result_review_version) + 1;
        const resolution = actorIsAssignedReviewer
          ? command.payload.outcomeCode === 'NO_CONTEST' ? 'NO_CONTEST' : 'RESULT_CONFIRMED'
          : 'LATE_ORIGINAL_RESULT';
        const resolutionReason = actorIsAssignedReviewer
          ? 'Official result recorded by the assigned independent Coach'
          : 'Original Coach submitted the official result after escalation';
        await sql`
          update competition.missing_result_reviews
          set state = 'RESOLVED', resolution = ${resolution},
            resolution_reason = ${resolutionReason},
            resolved_at = ${context.occurredAt.toISOString()}::timestamptz,
            version = ${reviewNextVersion}
          where review_id = ${row.missing_result_review_id}::uuid
            and state in ('OPEN', 'UNDER_REVIEW', 'REVIEWER_ASSIGNED')
        `.execute(transaction);
        relatedEvents.push({
          eventId: reviewEventId,
          eventName: 'MissingResultReviewResolved', schemaVersion: 1,
          aggregateType: 'MissingResultReview', aggregateId: row.missing_result_review_id,
          aggregateVersion: reviewNextVersion,
          transitionId: actorIsAssignedReviewer ? 'MR-04' : 'MR-07',
          payload: {
            reviewId: row.missing_result_review_id,
            challengeId: row.challenge_id,
            sessionId: row.session_id,
            resultId: required.resultId,
            resolution,
            resolvedBy: actorUserId,
            resolvedAt: context.occurredAt.toISOString(),
          },
          metadata: { policyVersion: RESULT_POLICY_VERSION },
        });
      }
      if (cooldown) {
        relatedEvents.push({
          eventId: cooldown.eventId,
          eventName: 'PairCooldownStarted', schemaVersion: 1,
          aggregateType: 'PairCooldown', aggregateId: cooldown.id,
          aggregateVersion: 1, transitionId: 'CD-01',
          payload: {
            cooldownId: cooldown.id, competitionId: row.competition_id,
            participantIds: [row.pair_low_id, row.pair_high_id],
            sourceResultId: required.resultId,
            startedAt: context.occurredAt.toISOString(),
            endsAt: cooldown.endsAt.toISOString(),
          },
          metadata: { policyVersion: RESULT_POLICY_VERSION },
        });
      }
      if (transition.locksStatus && statusIds && competitionAggregateVersion !== null) {
        relatedEvents.push({
          eventId: statusIds.statusEventId,
          eventName: transition.eventName!, schemaVersion: 1,
          aggregateType: 'Competition', aggregateId: row.competition_id,
          aggregateVersion: competitionAggregateVersion,
          transitionId: transition.transitionId,
          payload: {
            transitionId: statusIds.statusTransitionId,
            sourceResultId: required.resultId,
            sourceEventId: required.resultEventId,
            competitionId: row.competition_id,
            before: transition.before,
            after: transition.after,
            transitionType: transition.type,
            provisional: true,
            participantIds: [row.pair_low_id, row.pair_high_id],
            snapshotId: row.snapshot_id,
          },
          metadata: { policyVersion: RESULT_POLICY_VERSION },
        });
      }
      return {
        responseStatus: 201,
        response,
        event: {
          eventId: ids.eventId, eventName: 'ResultRecorded', schemaVersion: 1,
          transitionId: 'CH-15', payload: canonicalPayload,
          metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
        },
        relatedEvents,
        audit: {
          auditId: ids.auditId, action: 'RECORD_RESULT', transitionId: 'CH-15',
          reasonCode: normalized.reasonCode, beforeState: 'RESULT_PENDING',
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
                commandType: 'FINALIZE_RESULT', aggregateType: 'Result',
                aggregateId: required.resultId, expectedState: 'RECORDED', expectedVersion: 1,
                deadlineAt: appealDeadlineAt.toISOString(), policyVersion: RESULT_POLICY_VERSION,
                idempotencyKey: `result:${required.resultId}:finalize:v1`,
              },
            },
          },
          {
            messageId: required.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: {
              notifications: [row.pair_low_id, row.pair_high_id].map((recipientUserId, index) => ({
                notificationId: ids.notificationIds![index]!, recipientUserId,
                category: 'MANDATORY', renderKey: 'result.recorded-provisional',
                actionTarget: { type: 'RESULT', resultId: required.resultId },
                payload: {
                  challengeId: row.challenge_id, outcomeCode: command.payload.outcomeCode,
                  statusTransitionType: transition.type, provisional: true,
                },
                deadlineAt: appealDeadlineAt.toISOString(),
              })),
            },
          },
        ],
      };
    },
  });
}

export async function reviseResultMetadata(
  database: Kysely<Database>,
  command: CommandEnvelope<ReviseResultMetadataPayload>,
  ids: ResultMetadataRevisionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<ResultProjection>> {
  if (
    !command.actor.id || command.actor.type !== 'USER'
    || command.aggregateType !== 'Result'
    || command.commandType !== 'REVISE_RESULT_METADATA'
    || command.payload.resultId !== command.aggregateId
  ) throw new ResultPermissionDeniedError();
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await resultRow(transaction, command.aggregateId, command.actor.id!, true);
      if (!row) throw new ResultPermissionDeniedError();
      const actorAssigned = command.actor.id === row.coach_user_id
        || command.actor.id === row.session_coach_user_id;
      if (
        !actorAssigned || !row.viewer_coach_authorized
        || [row.pair_low_id, row.pair_high_id].includes(command.actor.id!)
      ) throw new ResultPermissionDeniedError();
      assertExpectedVersion(Number(row.version), command.expectedVersion);
      const before = {
        methodCode: row.method_code,
        methodText: row.method_text,
        scorePayload: record(row.score_payload),
        methodPayload: record(row.method_payload),
      };
      const after = normalizeResultMetadataRevision({
        recordedAt: row.recorded_at,
        occurredAt: context.occurredAt,
        before,
        ...(command.payload.methodCode !== undefined
          ? { methodCode: command.payload.methodCode } : {}),
        ...(command.payload.methodText !== undefined
          ? { methodText: command.payload.methodText } : {}),
        ...(command.payload.scorePayload !== undefined
          ? { scorePayload: command.payload.scorePayload } : {}),
        ...(command.payload.methodPayload !== undefined
          ? { methodPayload: command.payload.methodPayload } : {}),
      });
      await sql`
        insert into competition.result_metadata_revisions (
          revision_id, result_id, source_result_version, result_version,
          before_method_code, after_method_code, before_method_text, after_method_text,
          before_score_payload, after_score_payload,
          before_method_payload, after_method_payload, revised_by, revised_at
        ) values (
          ${ids.revisionId}::uuid, ${row.result_id}::uuid, ${row.version}, ${context.nextVersion},
          ${before.methodCode}, ${after.methodCode}, ${before.methodText}, ${after.methodText},
          ${before.scorePayload ? JSON.stringify(before.scorePayload) : null}::jsonb,
          ${after.scorePayload ? JSON.stringify(after.scorePayload) : null}::jsonb,
          ${before.methodPayload ? JSON.stringify(before.methodPayload) : null}::jsonb,
          ${after.methodPayload ? JSON.stringify(after.methodPayload) : null}::jsonb,
          ${command.actor.id}::uuid, ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        update competition.results
        set version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where result_id = ${row.result_id}::uuid and version = ${row.version}
      `.execute(transaction);
      const projected = await resultRow(transaction, row.result_id, command.actor.id!);
      if (!projected) throw new ResultConflictError('RESULT_NOT_RECORDED');
      const response = resultProjection(projected, command.actor.id!, context.occurredAt);
      return {
        responseStatus: 201,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'ResultMetadataRevised',
          schemaVersion: 1,
          transitionId: 'R-02',
          payload: {
            resultId: row.result_id,
            revisionId: ids.revisionId,
            resultVersion: context.nextVersion,
            revisedAt: context.occurredAt.toISOString(),
          },
          metadata: { policyVersion: RESULT_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId,
          action: 'REVISE_RESULT_METADATA',
          transitionId: 'R-02',
          reasonCode: 'COACH_METADATA_CORRECTION',
          beforeState: row.state,
          afterState: row.state,
          metadata: {
            revisionId: ids.revisionId,
            sessionId: row.session_id,
            before,
            after,
          },
        },
        outbox: [{
          messageId: ids.outboxMessageId,
          topic: 'competition.result-metadata.revised.v1',
          payload: {
            resultId: row.result_id,
            revisionId: ids.revisionId,
            resultVersion: context.nextVersion,
          },
        }],
      };
    },
  });
}

interface FinalizationArtifacts {
  readonly response: ResultProjection;
  readonly relatedEvents: readonly RelatedDomainEventDraft[];
}

async function finalizeRecordedResult(
  transaction: Transaction<Database>,
  row: ResultRow,
  viewerUserId: string,
  ids: ResultEffectIds,
  occurredAt: Date,
  resultNextVersion: number,
): Promise<FinalizationArtifacts> {
  const challengeId = requiredIds(ids, ['challengeEventId'] as const).challengeEventId;
  const challengeNextVersion = Number(row.challenge_version) + 1;
  await sql`
    update competition.results
    set state = 'FINAL', finalized_at = ${occurredAt.toISOString()}::timestamptz,
      version = ${resultNextVersion}, updated_at = ${occurredAt.toISOString()}::timestamptz
    where result_id = ${row.result_id}::uuid and state = 'RECORDED'
  `.execute(transaction);
  await sql`
    update competition.challenges
    set state = 'COMPLETED', decided_at = ${occurredAt.toISOString()}::timestamptz,
      version = ${challengeNextVersion},
      updated_at = ${occurredAt.toISOString()}::timestamptz
    where challenge_id = ${row.challenge_id}::uuid and state = 'RESULT_RECORDED'
  `.execute(transaction);
  await sql`
    update competition.challenge_participant_obligations
    set released_at = ${occurredAt.toISOString()}::timestamptz,
      release_reason = 'RESULT_FINAL'
    where challenge_id = ${row.challenge_id}::uuid and released_at is null
  `.execute(transaction);
  const relatedEvents: RelatedDomainEventDraft[] = [{
    eventId: challengeId,
    eventName: 'ChallengeCompleted', schemaVersion: 1,
    aggregateType: 'Challenge', aggregateId: row.challenge_id,
    aggregateVersion: challengeNextVersion, transitionId: 'CH-17',
    payload: { challengeId: row.challenge_id, resultId: row.result_id, finalizedAt: occurredAt.toISOString() },
    metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
  }];
  if (row.transition_id) {
    const statusIds = requiredIds(ids, ['statusFinalizationId', 'statusEventId'] as const);
    if (row.status_lock_result_id !== row.result_id) {
      throw new ResultConflictError('COMPETITION_STATUS_LOCKED');
    }
    const foundingGenesis = row.transition_type === 'GENESIS_APPLIED'
      || row.transition_type === 'GENESIS_APPLIED_WITH_VACANCY';
    const contenderGenesis = row.transition_type === 'CONTENDER_ASSIGNED'
      && row.effective_stake === 'GENESIS_CONTENDER';
    const genesisFinalization = foundingGenesis || contenderGenesis;
    const genesisFinalPhase = row.transition_type === 'GENESIS_APPLIED_WITH_VACANCY'
      ? 'CONTENDER_VACANT_OPEN'
      : 'RUNNING';
    if (foundingGenesis && row.competition_phase !== 'FOUNDING_CHALLENGE') {
      throw new ResultConflictError('COMPETITION_STATUS_SNAPSHOT_STALE');
    }
    if (contenderGenesis && row.competition_phase !== 'CONTENDER_GENESIS') {
      throw new ResultConflictError('COMPETITION_STATUS_SNAPSHOT_STALE');
    }
    const statusAggregateVersion = Number(row.competition_version) + 1;
    const competitionAggregateVersion = statusAggregateVersion + Number(genesisFinalization);
    const competitionStatusVersion = Number(row.competition_status_version) + 1;
    await sql`
      update competition.competitions
      set status_lock_result_id = null, status_version = ${competitionStatusVersion},
        phase = ${genesisFinalization ? genesisFinalPhase : row.competition_phase},
        version = ${competitionAggregateVersion},
        updated_at = ${occurredAt.toISOString()}::timestamptz
      where competition_id = ${row.competition_id}::uuid
        and status_lock_result_id = ${row.result_id}::uuid
    `.execute(transaction);
    await sql`
      insert into competition.status_transition_finalizations (
        finalization_id, transition_id, result_id, finalized_by_event_id,
        competition_status_version, finalized_at
      ) values (
        ${statusIds.statusFinalizationId}::uuid, ${row.transition_id}::uuid,
        ${row.result_id}::uuid, ${ids.eventId}::uuid,
        ${competitionStatusVersion}, ${occurredAt.toISOString()}::timestamptz
      )
    `.execute(transaction);
    relatedEvents.push({
      eventId: statusIds.statusEventId,
      eventName: 'StatusTransitionFinalized', schemaVersion: 1,
      aggregateType: 'Competition', aggregateId: row.competition_id,
      aggregateVersion: statusAggregateVersion, transitionId: 'ST-13',
      payload: {
        resultId: row.result_id, transitionId: row.transition_id,
        championUserId: row.after_champion_user_id,
        contenderUserId: row.after_contender_user_id,
        statusVersion: competitionStatusVersion,
      },
      metadata: { policyVersion: RESULT_POLICY_VERSION },
    });
    if (genesisFinalization) {
      const genesisEventId = requiredIds(ids, ['genesisEventId'] as const).genesisEventId;
      relatedEvents.push({
        eventId: genesisEventId,
        eventName: contenderGenesis ? 'ContenderGenesisFinalized' : 'FoundingGenesisFinalized',
        schemaVersion: 1,
        aggregateType: 'Competition', aggregateId: row.competition_id,
        aggregateVersion: competitionAggregateVersion,
        transitionId: contenderGenesis ? 'C-09' : 'C-04',
        payload: {
          competitionId: row.competition_id,
          resultId: row.result_id,
          fromPhase: contenderGenesis ? 'CONTENDER_GENESIS' : 'FOUNDING_CHALLENGE',
          toPhase: genesisFinalPhase,
          championUserId: row.after_champion_user_id,
          contenderUserId: row.after_contender_user_id,
          finalizedAt: occurredAt.toISOString(),
        },
        metadata: { policyVersion: RESULT_POLICY_VERSION },
      });
    }
  }
  const projected = await resultRow(transaction, row.result_id, viewerUserId);
  if (!projected) throw new ResultConflictError('RESULT_NOT_RECORDED');
  return {
    response: resultProjection(projected, viewerUserId, occurredAt),
    relatedEvents,
  };
}

export async function finalizeResult(
  database: Kysely<Database>,
  command: CommandEnvelope<FinalizeResultPayload>,
  ids: ResultEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<ResultProjection>> {
  if (
    command.actor.type !== 'SYSTEM' || command.aggregateType !== 'Result'
    || command.payload.resultId !== command.aggregateId
  ) throw new ResultPermissionDeniedError();
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await resultRow(transaction, command.aggregateId, rowViewerForSystem, true);
      if (!row) throw new ResultConflictError('RESULT_NOT_RECORDED');
      const waived = await waiverUserIds(transaction, row.result_id);
      const eligible = eligibleAppealUserIds({
        outcomeCode: row.recorded_outcome_code, loserUserId: row.loser_user_id,
        participantUserIds: [row.pair_low_id, row.pair_high_id],
      });
      assertResultCanFinalize({
        state: row.state, appealDeadlineAt: row.appeal_deadline_at,
        occurredAt: context.occurredAt, eligibleUserIds: eligible,
        waivedOrWithdrawnUserIds: waived,
      });
      const finalized = await finalizeRecordedResult(
        transaction, row, row.pair_low_id, ids, context.occurredAt, context.nextVersion,
      );
      return finalizationEffect(row, finalized, ids, context.occurredAt, 'APPEAL_WINDOW_CLOSED');
    },
  });
}

const rowViewerForSystem = '00000000-0000-0000-0000-000000000000';

async function waiverUserIds(
  database: Kysely<Database> | Transaction<Database>,
  resultId: string,
): Promise<readonly string[]> {
  const result = await sql<{ readonly user_id: string }>`
    select user_id from competition.appeal_waivers where result_id = ${resultId}::uuid
  `.execute(database);
  return result.rows.map((item) => item.user_id);
}

function finalizationEffect(
  row: ResultRow,
  finalized: FinalizationArtifacts,
  ids: ResultEffectIds,
  occurredAt: Date,
  reason: 'APPEAL_WINDOW_CLOSED' | 'ELIGIBLE_ACTORS_WAIVED',
  extraRelatedEvents: readonly RelatedDomainEventDraft[] = [],
) {
  if (!ids.notificationOutboxMessageId || !ids.notificationIds || ids.notificationIds.length < 2) {
    throw new TypeError('Result finalization notification IDs are required');
  }
  return {
    responseStatus: 200,
    response: finalized.response,
    event: {
      eventId: ids.eventId, eventName: 'ResultFinalized', schemaVersion: 1,
      transitionId: 'R-04',
      payload: { resultId: row.result_id, challengeId: row.challenge_id, finalizedAt: occurredAt.toISOString(), reason },
      metadata: { policyVersion: RESULT_POLICY_VERSION },
    },
    relatedEvents: [...finalized.relatedEvents, ...extraRelatedEvents],
    audit: {
      auditId: ids.auditId, action: 'FINALIZE_RESULT', transitionId: 'R-04',
      reasonCode: reason, beforeState: 'RECORDED', afterState: 'FINAL', metadata: {},
    },
    outbox: [
      {
        messageId: ids.outboxMessageId, topic: 'competition.result.finalized.v1',
        payload: { resultId: row.result_id, challengeId: row.challenge_id, competitionId: row.competition_id, reason },
      },
      {
        messageId: ids.notificationOutboxMessageId,
        topic: 'notification.in_app.v1',
        payload: {
          notifications: [row.pair_low_id, row.pair_high_id].map((recipientUserId, index) => ({
            notificationId: ids.notificationIds![index]!, recipientUserId,
            category: 'SERVICE', renderKey: 'result.final',
            actionTarget: { type: 'RESULT', resultId: row.result_id },
            payload: { challengeId: row.challenge_id, reason }, deadlineAt: null,
          })),
        },
      },
    ],
  } as const;
}

export async function submitResultAppeal(
  database: Kysely<Database>,
  command: CommandEnvelope<SubmitResultAppealPayload>,
  ids: ResultEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<ResultProjection>> {
  if (!command.actor.id || command.aggregateType !== 'Result' || command.payload.resultId !== command.aggregateId) {
    throw new ResultPermissionDeniedError();
  }
  const required = requiredIds(ids, [
    'appealId', 'appealEventId', 'challengeEventId', 'notificationOutboxMessageId',
  ] as const);
  if (!ids.notificationIds || ids.notificationIds.length < 2) {
    throw new TypeError('Appeal notification IDs are required');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await resultRow(transaction, command.aggregateId, command.actor.id!, true);
      if (!row) throw new ResultPermissionDeniedError();
      if (![row.pair_low_id, row.pair_high_id].includes(command.actor.id!)) {
        throw new ResultPermissionDeniedError();
      }
      const eligible = eligibleAppealUserIds({
        outcomeCode: row.recorded_outcome_code, loserUserId: row.loser_user_id,
        participantUserIds: [row.pair_low_id, row.pair_high_id],
      });
      assertAppealActionCanBeTaken({
        state: row.state, actorUserId: command.actor.id!, eligibleUserIds: eligible,
        appealDeadlineAt: row.appeal_deadline_at, occurredAt: context.occurredAt,
        alreadyWaived: row.viewer_waived, alreadySubmitted: row.viewer_appealed,
      });
      const reasonCode = requiredText(command.payload.reasonCode, 'reasonCode', 80);
      const statement = requiredText(command.payload.statement, 'statement', 2000);
      const responseDeadlineAt = appealResponseDeadline(context.occurredAt);
      const slaDueAt = appealReviewSlaDeadline(context.occurredAt);
      const challengeNextVersion = Number(row.challenge_version) + 1;
      await sql`
        insert into competition.appeals (
          appeal_id, result_id, challenge_id, appellant_user_id, state,
          reason_code, statement, submitted_at, response_deadline_at,
          sla_due_at, version
        ) values (
          ${required.appealId}::uuid, ${row.result_id}::uuid,
          ${row.challenge_id}::uuid, ${command.actor.id}::uuid, 'SUBMITTED',
          ${reasonCode}, ${statement}, ${context.occurredAt.toISOString()}::timestamptz,
          ${responseDeadlineAt.toISOString()}::timestamptz,
          ${slaDueAt.toISOString()}::timestamptz, 1
        )
      `.execute(transaction);
      await sql`
        update competition.results set state = 'UNDER_APPEAL', version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where result_id = ${row.result_id}::uuid and state = 'RECORDED'
      `.execute(transaction);
      await sql`
        update competition.challenges set state = 'UNDER_APPEAL',
          version = ${challengeNextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where challenge_id = ${row.challenge_id}::uuid and state = 'RESULT_RECORDED'
      `.execute(transaction);
      const projected = await resultRow(transaction, row.result_id, command.actor.id!);
      if (!projected) throw new ResultConflictError('RESULT_NOT_RECORDED');
      const response = resultProjection(projected, command.actor.id!, context.occurredAt);
      const opponentUserId = command.actor.id === row.pair_low_id ? row.pair_high_id : row.pair_low_id;
      return {
        responseStatus: 201,
        response,
        event: {
          eventId: ids.eventId, eventName: 'ResultPutUnderAppeal', schemaVersion: 1,
          transitionId: 'R-03',
          payload: { resultId: row.result_id, appealId: required.appealId, appellantUserId: command.actor.id },
          metadata: { policyVersion: RESULT_POLICY_VERSION },
        },
        relatedEvents: [
          {
            eventId: required.appealEventId, eventName: 'AppealSubmitted', schemaVersion: 1,
            aggregateType: 'Appeal', aggregateId: required.appealId,
            aggregateVersion: 1, transitionId: 'A-01',
            payload: {
              appealId: required.appealId, resultId: row.result_id,
              challengeId: row.challenge_id, appellantUserId: command.actor.id,
              responseDeadlineAt: responseDeadlineAt.toISOString(), slaDueAt: slaDueAt.toISOString(),
            },
            metadata: { policyVersion: RESULT_POLICY_VERSION },
          },
          {
            eventId: required.challengeEventId, eventName: 'AppealSubmitted', schemaVersion: 1,
            aggregateType: 'Challenge', aggregateId: row.challenge_id,
            aggregateVersion: challengeNextVersion, transitionId: 'CH-16',
            payload: { challengeId: row.challenge_id, resultId: row.result_id, appealId: required.appealId },
            metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
          },
        ],
        audit: {
          auditId: ids.auditId, action: 'SUBMIT_APPEAL', transitionId: 'R-03',
          reasonCode, beforeState: 'RECORDED', afterState: 'UNDER_APPEAL', metadata: {},
        },
        outbox: [
          {
            messageId: ids.outboxMessageId, topic: 'competition.appeal.submitted.v1',
            payload: { appealId: required.appealId, resultId: row.result_id, challengeId: row.challenge_id },
          },
          {
            messageId: required.notificationOutboxMessageId, topic: 'notification.in_app.v1',
            payload: {
              notifications: [opponentUserId, row.coach_user_id!].map((recipientUserId, index) => ({
                notificationId: ids.notificationIds![index]!, recipientUserId,
                category: 'MANDATORY', renderKey: 'appeal.submitted',
                actionTarget: { type: 'RESULT', resultId: row.result_id },
                payload: { appealId: required.appealId, responseDeadlineAt: responseDeadlineAt.toISOString() },
                deadlineAt: responseDeadlineAt.toISOString(),
              })),
            },
          },
        ],
      };
    },
  });
}

export async function waiveResultAppeal(
  database: Kysely<Database>,
  command: CommandEnvelope<WaiveResultAppealPayload>,
  ids: ResultEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<ResultProjection>> {
  if (!command.actor.id || command.aggregateType !== 'Result' || command.payload.resultId !== command.aggregateId) {
    throw new ResultPermissionDeniedError();
  }
  const waiverId = requiredIds(ids, ['waiverId'] as const).waiverId;
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await resultRow(transaction, command.aggregateId, command.actor.id!, true);
      if (!row) throw new ResultPermissionDeniedError();
      if (![row.pair_low_id, row.pair_high_id].includes(command.actor.id!)) {
        throw new ResultPermissionDeniedError();
      }
      const eligible = eligibleAppealUserIds({
        outcomeCode: row.recorded_outcome_code, loserUserId: row.loser_user_id,
        participantUserIds: [row.pair_low_id, row.pair_high_id],
      });
      assertAppealActionCanBeTaken({
        state: row.state, actorUserId: command.actor.id!, eligibleUserIds: eligible,
        appealDeadlineAt: row.appeal_deadline_at, occurredAt: context.occurredAt,
        alreadyWaived: row.viewer_waived, alreadySubmitted: row.viewer_appealed,
      });
      await sql`
        insert into competition.appeal_waivers (
          waiver_id, result_id, user_id, waived_at, reason_context
        ) values (
          ${waiverId}::uuid, ${row.result_id}::uuid, ${command.actor.id}::uuid,
          ${context.occurredAt.toISOString()}::timestamptz, 'EARLY_UNLOCK'
        )
      `.execute(transaction);
      const waived = [...await waiverUserIds(transaction, row.result_id)];
      if (resultCanFinalize({
        state: row.state, appealDeadlineAt: row.appeal_deadline_at,
        occurredAt: context.occurredAt, eligibleUserIds: eligible,
        waivedOrWithdrawnUserIds: waived,
      })) {
        const finalized = await finalizeRecordedResult(
          transaction, row, command.actor.id!, ids, context.occurredAt, context.nextVersion,
        );
        const waiverEventId = requiredIds(ids, ['waiverEventId'] as const).waiverEventId;
        return finalizationEffect(
          row, finalized, ids, context.occurredAt, 'ELIGIBLE_ACTORS_WAIVED',
          [{
            eventId: waiverEventId, eventName: 'AppealWaived', schemaVersion: 1,
            aggregateType: 'AppealWaiver', aggregateId: waiverId,
            aggregateVersion: 1, transitionId: null,
            payload: {
              waiverId, resultId: row.result_id, userId: command.actor.id,
              waivedAt: context.occurredAt.toISOString(), reasonContext: 'EARLY_UNLOCK',
            },
            metadata: { policyVersion: RESULT_POLICY_VERSION },
          }],
        );
      }
      await sql`
        update competition.results set version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where result_id = ${row.result_id}::uuid and state = 'RECORDED'
      `.execute(transaction);
      const projected = await resultRow(transaction, row.result_id, command.actor.id!);
      if (!projected) throw new ResultConflictError('RESULT_NOT_RECORDED');
      return {
        responseStatus: 200,
        response: resultProjection(projected, command.actor.id!, context.occurredAt),
        event: {
          eventId: ids.eventId, eventName: 'AppealWaived', schemaVersion: 1,
          transitionId: null,
          payload: { resultId: row.result_id, userId: command.actor.id, waivedAt: context.occurredAt.toISOString() },
          metadata: { policyVersion: RESULT_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId, action: 'WAIVE_APPEAL', transitionId: null,
          reasonCode: 'EARLY_UNLOCK', beforeState: 'RECORDED', afterState: 'RECORDED', metadata: {},
        },
        outbox: [
          {
            messageId: ids.outboxMessageId, topic: 'competition.result.appeal-waived.v1',
            payload: {
              resultId: row.result_id, userId: command.actor.id,
              timer: {
                commandType: 'FINALIZE_RESULT', aggregateType: 'Result', aggregateId: row.result_id,
                expectedState: 'RECORDED', expectedVersion: context.nextVersion,
                deadlineAt: row.appeal_deadline_at.toISOString(), policyVersion: RESULT_POLICY_VERSION,
                idempotencyKey: `result:${row.result_id}:finalize:v${context.nextVersion}`,
              },
            },
          },
        ],
      };
    },
  });
}
