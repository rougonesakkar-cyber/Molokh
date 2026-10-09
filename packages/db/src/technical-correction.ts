import {
  RESULT_POLICY_VERSION,
  ResultConflictError,
  ResultPermissionDeniedError,
  assertExpectedVersion,
  assertTechnicalCorrectionReviewCanStart,
  deriveProvisionalStatusTransition,
  normalizeTechnicalCorrectionApproval,
  normalizeTechnicalCorrectionRejection,
  normalizeTechnicalCorrectionRequest,
  type CommandEnvelope,
  type ChallengeStake,
  type ResultOutcomeCode,
  type ResultState,
  type StatusTransitionType,
  type TechnicalCorrectionCategory,
  type TechnicalCorrectionState,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import {
  executeCriticalCommand,
  type ExecutedCommand,
  type RelatedDomainEventDraft,
} from './platform-command.js';

export interface RequestTechnicalCorrectionPayload {
  readonly resultId: string;
  readonly expectedResultVersion: number;
  readonly category: TechnicalCorrectionCategory;
  readonly proposedOutcomeCode: ResultOutcomeCode;
  readonly proposedWinnerUserId: string | null;
  readonly internalReason: string;
  readonly evidenceReference: string;
}

export interface TechnicalCorrectionEffectIds {
  readonly correctionId: string;
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly notificationOutboxMessageId: string;
  readonly notificationId: string;
}

export interface StartTechnicalCorrectionReviewPayload {
  readonly correctionId: string;
}

export interface RejectTechnicalCorrectionPayload {
  readonly correctionId: string;
  readonly reason: string;
}

export interface ApproveTechnicalCorrectionPayload {
  readonly correctionId: string;
  readonly reason: string;
}

export interface TechnicalCorrectionReviewEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
}

export interface TechnicalCorrectionRejectionEffectIds extends TechnicalCorrectionReviewEffectIds {
  readonly notificationOutboxMessageId: string;
  readonly notificationId: string;
}

export interface TechnicalCorrectionApprovalEffectIds extends TechnicalCorrectionReviewEffectIds {
  readonly decisionId: string;
  readonly statusCompensationId: string;
  readonly statusTransitionId: string;
  readonly statusEventId: string;
  readonly cooldownId: string;
  readonly cooldownEventId: string;
  readonly notificationOutboxMessageId: string;
  readonly notificationIds: readonly [string, string, string];
}

export interface TechnicalCorrectionProjection {
  readonly correctionId: string;
  readonly resultId: string;
  readonly challengeId: string;
  readonly competitionId: string;
  readonly requesterUserId: string;
  readonly requesterDisplayName: string;
  readonly category: TechnicalCorrectionCategory;
  readonly state: TechnicalCorrectionState;
  readonly originalOutcomeCode: ResultOutcomeCode;
  readonly originalWinnerUserId: string | null;
  readonly proposedOutcomeCode: ResultOutcomeCode;
  readonly proposedWinnerUserId: string | null;
  readonly internalReason: string | null;
  readonly evidenceReference: string | null;
  readonly submittedAt: string;
  readonly assignedReviewerUserId: string | null;
  readonly reviewStartedAt: string | null;
  readonly decisionReason: string | null;
  readonly decidedAt: string | null;
  readonly version: number;
}

interface SourceResultRow {
  readonly result_id: string;
  readonly result_state: ResultState;
  readonly result_version: string;
  readonly recorded_outcome_code: ResultOutcomeCode;
  readonly winner_user_id: string | null;
  readonly coach_user_id: string | null;
  readonly session_coach_user_id: string | null;
  readonly session_id: string | null;
  readonly challenge_id: string;
  readonly competition_id: string;
  readonly community_id: string;
  readonly pair_low_id: string;
  readonly pair_high_id: string;
  readonly existing_open_request: boolean;
  readonly actor_is_central: boolean;
  readonly actor_coach_authorized: boolean;
}

interface CorrectionRow {
  readonly correction_id: string;
  readonly result_id: string;
  readonly challenge_id: string;
  readonly competition_id: string;
  readonly requester_user_id: string;
  readonly requester_display_name: string;
  readonly category: TechnicalCorrectionCategory;
  readonly state: TechnicalCorrectionState;
  readonly original_outcome_code: ResultOutcomeCode;
  readonly original_winner_user_id: string | null;
  readonly proposed_outcome_code: ResultOutcomeCode;
  readonly proposed_winner_user_id: string | null;
  readonly internal_reason: string;
  readonly evidence_reference: string;
  readonly submitted_at: Date;
  readonly assigned_reviewer_user_id: string | null;
  readonly review_started_at: Date | null;
  readonly decision_reason: string | null;
  readonly decided_at: Date | null;
  readonly version: string;
}

interface CorrectionCommandRow extends CorrectionRow {
  readonly pair_low_id: string;
  readonly pair_high_id: string;
  readonly result_coach_user_id: string | null;
  readonly session_coach_user_id: string | null;
  readonly result_state: ResultState;
  readonly result_loser_user_id: string | null;
  readonly result_recorded_at: Date;
  readonly competitive_snapshot_id: string | null;
  readonly challenge_stake: ChallengeStake;
  readonly effective_stake: ChallengeStake;
  readonly snapshot_champion_user_id: string | null;
  readonly snapshot_contender_user_id: string | null;
  readonly snapshot_status_version: string;
  readonly pair_cooldown_days: number;
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
  readonly cooldown_id: string | null;
  readonly cooldown_invalidated_at: Date | null;
  readonly open_appeal: boolean;
}

async function hasCentralGrant(
  database: Kysely<Database> | Transaction<Database>, userId: string,
): Promise<boolean> {
  const result = await sql<{ readonly allowed: boolean }>`select exists (
    select 1 from community.role_grants
    where user_id = ${userId}::uuid and role = 'CENTRAL_ADMIN'
      and scope_type = 'GLOBAL' and scope_id is null and state = 'ACTIVE'
      and (expires_at is null or expires_at > clock_timestamp())
  ) as allowed`.execute(database);
  return result.rows[0]?.allowed === true;
}

async function sourceResultRow(
  transaction: Transaction<Database>, resultId: string, actorUserId: string,
): Promise<SourceResultRow> {
  const result = await sql<SourceResultRow>`
    select result.result_id, result.state as result_state,
      result.version::text as result_version, result.recorded_outcome_code,
      result.winner_user_id, result.coach_user_id,
      session.coach_user_id as session_coach_user_id, session.session_id,
      challenge.challenge_id, competition.competition_id, competition.community_id,
      challenge.pair_low_id, challenge.pair_high_id,
      false as existing_open_request,
      exists (
        select 1 from community.role_grants central_grant
        where central_grant.user_id = ${actorUserId}::uuid
          and central_grant.role = 'CENTRAL_ADMIN'
          and central_grant.scope_type = 'GLOBAL' and central_grant.scope_id is null
          and central_grant.state = 'ACTIVE'
          and (central_grant.expires_at is null or central_grant.expires_at > clock_timestamp())
      ) as actor_is_central,
      exists (
        select 1 from community.role_grants coach_grant
        where coach_grant.user_id = ${actorUserId}::uuid
          and coach_grant.role = 'COACH' and coach_grant.state = 'ACTIVE'
          and (coach_grant.expires_at is null or coach_grant.expires_at > clock_timestamp())
          and (
            (coach_grant.scope_type = 'SESSION' and coach_grant.scope_id = session.session_id)
            or (coach_grant.scope_type = 'COMMUNITY'
              and coach_grant.scope_id = competition.community_id)
          )
      ) as actor_coach_authorized
    from competition.results result
    join competition.challenges challenge on challenge.challenge_id = result.challenge_id
    join competition.competitions competition
      on competition.competition_id = challenge.competition_id
    left join scheduling.sessions session on session.session_id = result.session_id
    where result.result_id = ${resultId}::uuid
    for update of result
  `.execute(transaction);
  const row = result.rows[0];
  if (!row) throw new ResultPermissionDeniedError();
  const existing = await sql<{ readonly exists: boolean }>`select exists (
    select 1 from competition.technical_correction_requests
    where result_id = ${resultId}::uuid and state in ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED')
  ) as exists`.execute(transaction);
  return { ...row, existing_open_request: existing.rows[0]?.exists === true };
}

async function centralNotificationRecipient(
  transaction: Transaction<Database>, actorUserId: string,
): Promise<string> {
  const result = await sql<{ readonly user_id: string }>`
    select user_id from community.role_grants
    where role = 'CENTRAL_ADMIN' and scope_type = 'GLOBAL' and scope_id is null
      and state = 'ACTIVE' and (expires_at is null or expires_at > clock_timestamp())
    order by (user_id = ${actorUserId}::uuid), authorized_at, user_id
    limit 1
  `.execute(transaction);
  const recipient = result.rows[0]?.user_id;
  if (!recipient) throw new ResultConflictError('TECHNICAL_CORRECTION_CENTRAL_UNAVAILABLE');
  return recipient;
}

async function correctionRows(
  database: Kysely<Database> | Transaction<Database>, correctionId?: string,
): Promise<readonly CorrectionRow[]> {
  const result = await sql<CorrectionRow>`
    select correction.correction_id, correction.result_id, correction.challenge_id,
      correction.competition_id, correction.requester_user_id,
      requester.display_name as requester_display_name, correction.category,
      correction.state, correction.original_outcome_code,
      correction.original_winner_user_id, correction.proposed_outcome_code,
      correction.proposed_winner_user_id, correction.internal_reason,
      correction.evidence_reference, correction.submitted_at,
      correction.assigned_reviewer_user_id, correction.review_started_at,
      correction.decision_reason, correction.decided_at,
      correction.version::text as version
    from competition.technical_correction_requests correction
    join identity.users requester on requester.user_id = correction.requester_user_id
    where (${correctionId ?? null}::uuid is null
      or correction.correction_id = ${correctionId ?? null}::uuid)
    order by correction.submitted_at, correction.correction_id
  `.execute(database);
  return result.rows;
}

async function correctionCommandRow(
  transaction: Transaction<Database>, correctionId: string,
): Promise<CorrectionCommandRow | undefined> {
  const result = await sql<CorrectionCommandRow>`
    select correction.correction_id, correction.result_id, correction.challenge_id,
      correction.competition_id, correction.requester_user_id,
      requester.display_name as requester_display_name, correction.category,
      correction.state, correction.original_outcome_code,
      correction.original_winner_user_id, correction.proposed_outcome_code,
      correction.proposed_winner_user_id, correction.internal_reason,
      correction.evidence_reference, correction.submitted_at,
      correction.assigned_reviewer_user_id, correction.review_started_at,
      correction.decision_reason, correction.decided_at,
      correction.version::text as version, challenge.pair_low_id,
      challenge.pair_high_id, result.coach_user_id as result_coach_user_id,
      session.coach_user_id as session_coach_user_id,
      result.state as result_state, result.loser_user_id as result_loser_user_id,
      result.recorded_at as result_recorded_at,
      result.competitive_snapshot_id, challenge.stake as challenge_stake,
      coalesce(snapshot.effective_stake, challenge.stake) as effective_stake,
      coalesce(snapshot.champion_user_id,
        (result.pre_status_snapshot ->> 'championUserId')::uuid)
        as snapshot_champion_user_id,
      coalesce(snapshot.contender_user_id,
        (result.pre_status_snapshot ->> 'contenderUserId')::uuid)
        as snapshot_contender_user_id,
      coalesce(snapshot.competition_status_version,
        (result.pre_status_snapshot ->> 'statusVersion')::bigint,
        competition.status_version)::text as snapshot_status_version,
      coalesce(snapshot_config.pair_cooldown_days,
        current_config.pair_cooldown_days) as pair_cooldown_days,
      competition.version::text as competition_version,
      competition.status_version::text as competition_status_version,
      competition.champion_user_id as current_champion_user_id,
      competition.contender_user_id as current_contender_user_id,
      competition.status_lock_result_id,
      transition.transition_id, transition.transition_type,
      transition.before_champion_user_id, transition.before_contender_user_id,
      transition.before_status_version::text as before_status_version,
      cooldown.cooldown_id, cooldown.invalidated_at as cooldown_invalidated_at,
      exists (
        select 1 from competition.appeals appeal
        where appeal.result_id = result.result_id
          and appeal.state in ('SUBMITTED', 'UNDER_REVIEW')
      ) as open_appeal
    from competition.technical_correction_requests correction
    join identity.users requester on requester.user_id = correction.requester_user_id
    join competition.results result on result.result_id = correction.result_id
    join competition.challenges challenge on challenge.challenge_id = correction.challenge_id
    join competition.competitions competition
      on competition.competition_id = correction.competition_id
    left join scheduling.sessions session on session.session_id = result.session_id
    left join scheduling.session_competitive_snapshots snapshot
      on snapshot.snapshot_id = result.competitive_snapshot_id
    left join community.community_configuration_versions snapshot_config
      on snapshot_config.configuration_id = snapshot.community_configuration_id
    join community.communities community on community.community_id = competition.community_id
    join community.community_configuration_versions current_config
      on current_config.configuration_id = community.configuration_id
    left join competition.status_transitions transition
      on transition.source_result_id = result.result_id
    left join competition.pair_cooldowns cooldown
      on cooldown.source_result_id = result.result_id
    where correction.correction_id = ${correctionId}::uuid
    for update of correction, result, competition
  `.execute(transaction);
  return result.rows[0];
}

function project(
  row: CorrectionRow, requestDetails: boolean, decisionDetails: boolean,
): TechnicalCorrectionProjection {
  return {
    correctionId: row.correction_id,
    resultId: row.result_id,
    challengeId: row.challenge_id,
    competitionId: row.competition_id,
    requesterUserId: row.requester_user_id,
    requesterDisplayName: row.requester_display_name,
    category: row.category,
    state: row.state,
    originalOutcomeCode: row.original_outcome_code,
    originalWinnerUserId: row.original_winner_user_id,
    proposedOutcomeCode: row.proposed_outcome_code,
    proposedWinnerUserId: row.proposed_winner_user_id,
    internalReason: requestDetails ? row.internal_reason : null,
    evidenceReference: requestDetails ? row.evidence_reference : null,
    submittedAt: row.submitted_at.toISOString(),
    assignedReviewerUserId: row.assigned_reviewer_user_id,
    reviewStartedAt: row.review_started_at?.toISOString() ?? null,
    decisionReason: decisionDetails ? row.decision_reason : null,
    decidedAt: row.decided_at?.toISOString() ?? null,
    version: Number(row.version),
  };
}

export async function listTechnicalCorrectionsForCentral(
  database: Kysely<Database>, centralUserId: string,
): Promise<TechnicalCorrectionProjection[]> {
  if (!(await hasCentralGrant(database, centralUserId))) throw new ResultPermissionDeniedError();
  return (await correctionRows(database))
    .filter((row) => row.state === 'SUBMITTED' || row.state === 'UNDER_REVIEW')
    .map((row) => project(row, true, true));
}

export async function listTechnicalCorrectionsForViewer(
  database: Kysely<Database>, viewerUserId: string,
): Promise<TechnicalCorrectionProjection[]> {
  const central = await hasCentralGrant(database, viewerUserId);
  return (await correctionRows(database))
    .filter((row) => central || row.requester_user_id === viewerUserId)
    .map((row) => project(row, true, central));
}

export async function requestTechnicalCorrection(
  database: Kysely<Database>,
  command: CommandEnvelope<RequestTechnicalCorrectionPayload>,
  ids: TechnicalCorrectionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<TechnicalCorrectionProjection>> {
  if (
    !command.actor.id
    || command.aggregateType !== 'TechnicalCorrection'
    || command.commandType !== 'REQUEST_TECHNICAL_CORRECTION'
    || command.expectedVersion !== 0
    || command.aggregateId !== ids.correctionId
  ) throw new ResultPermissionDeniedError();
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const source = await sourceResultRow(transaction, command.payload.resultId, command.actor.id!);
      const actorIsAssignedCoach = source.actor_coach_authorized
        && (source.coach_user_id === command.actor.id
          || source.session_coach_user_id === command.actor.id);
      if (
        (!source.actor_is_central && !actorIsAssignedCoach)
        || [source.pair_low_id, source.pair_high_id].includes(command.actor.id!)
      ) throw new ResultPermissionDeniedError();
      assertExpectedVersion(Number(source.result_version), command.payload.expectedResultVersion);
      const normalized = normalizeTechnicalCorrectionRequest({
        resultState: source.result_state,
        existingOpenRequest: source.existing_open_request,
        originalOutcomeCode: source.recorded_outcome_code,
        originalWinnerUserId: source.winner_user_id,
        proposedOutcomeCode: command.payload.proposedOutcomeCode,
        proposedWinnerUserId: command.payload.proposedWinnerUserId,
        participantUserIds: [source.pair_low_id, source.pair_high_id],
        category: command.payload.category,
        internalReason: command.payload.internalReason,
        evidenceReference: command.payload.evidenceReference,
      });
      const recipientUserId = await centralNotificationRecipient(transaction, command.actor.id!);
      await sql`
        insert into competition.technical_correction_requests (
          correction_id, result_id, challenge_id, competition_id,
          requester_user_id, category, state, source_result_version,
          original_outcome_code, original_winner_user_id,
          proposed_outcome_code, proposed_winner_user_id,
          internal_reason, evidence_reference, submitted_at, version
        ) values (
          ${ids.correctionId}::uuid, ${source.result_id}::uuid,
          ${source.challenge_id}::uuid, ${source.competition_id}::uuid,
          ${command.actor.id}::uuid, ${normalized.category}, 'SUBMITTED',
          ${Number(source.result_version)}, ${source.recorded_outcome_code},
          ${source.winner_user_id}::uuid, ${normalized.proposedOutcomeCode},
          ${normalized.proposedWinnerUserId}::uuid, ${normalized.internalReason},
          ${normalized.evidenceReference}, ${context.occurredAt.toISOString()}::timestamptz, 1
        )
      `.execute(transaction);
      const row = (await correctionRows(transaction, ids.correctionId))[0]!;
      const publicPayload = {
        correctionId: ids.correctionId,
        resultId: source.result_id,
        category: normalized.category,
        state: 'SUBMITTED',
        submittedAt: context.occurredAt.toISOString(),
      };
      return {
        responseStatus: 201,
        response: project(row, true, source.actor_is_central),
        event: {
          eventId: ids.eventId,
          eventName: 'TechnicalCorrectionRequested',
          schemaVersion: 1,
          transitionId: 'TC-01',
          payload: publicPayload,
          metadata: { policyVersion: RESULT_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId,
          action: 'REQUEST_TECHNICAL_CORRECTION',
          transitionId: 'TC-01',
          reasonCode: normalized.category,
          beforeState: null,
          afterState: 'SUBMITTED',
          metadata: {
            resultId: source.result_id,
            originalOutcomeCode: source.recorded_outcome_code,
            originalWinnerUserId: source.winner_user_id,
            proposedOutcomeCode: normalized.proposedOutcomeCode,
            proposedWinnerUserId: normalized.proposedWinnerUserId,
            internalReason: normalized.internalReason,
            evidenceReference: normalized.evidenceReference,
          },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'competition.technical-correction.requested.v1',
            payload: publicPayload,
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: {
              notifications: [{
                notificationId: ids.notificationId,
                recipientUserId,
                category: 'MANDATORY',
                renderKey: 'result.technical-correction-requested',
                actionTarget: { type: 'RESULT', resultId: source.result_id },
                payload: {
                  correctionId: ids.correctionId,
                  resultId: source.result_id,
                  category: normalized.category,
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

function assertTransitionCommand(
  command: CommandEnvelope<
    StartTechnicalCorrectionReviewPayload
    | RejectTechnicalCorrectionPayload
    | ApproveTechnicalCorrectionPayload
  >,
  commandType:
    | 'START_TECHNICAL_CORRECTION_REVIEW'
    | 'REJECT_TECHNICAL_CORRECTION'
    | 'APPROVE_TECHNICAL_CORRECTION',
): void {
  if (
    !command.actor.id
    || command.aggregateType !== 'TechnicalCorrection'
    || command.commandType !== commandType
    || command.payload.correctionId !== command.aggregateId
  ) throw new ResultPermissionDeniedError();
}

export async function startTechnicalCorrectionReview(
  database: Kysely<Database>,
  command: CommandEnvelope<StartTechnicalCorrectionReviewPayload>,
  ids: TechnicalCorrectionReviewEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<TechnicalCorrectionProjection>> {
  assertTransitionCommand(command, 'START_TECHNICAL_CORRECTION_REVIEW');
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      if (!(await hasCentralGrant(transaction, command.actor.id!))) {
        throw new ResultPermissionDeniedError();
      }
      const row = await correctionCommandRow(transaction, command.aggregateId);
      if (!row) throw new ResultPermissionDeniedError();
      assertExpectedVersion(Number(row.version), command.expectedVersion);
      assertTechnicalCorrectionReviewCanStart({
        state: row.state,
        reviewerUserId: command.actor.id!,
        protectedUserIds: [row.requester_user_id, row.pair_low_id, row.pair_high_id,
          row.result_coach_user_id ?? '', row.session_coach_user_id ?? ''],
      });
      await sql`update competition.technical_correction_requests
        set state = 'UNDER_REVIEW', assigned_reviewer_user_id = ${command.actor.id}::uuid,
          review_started_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = ${context.nextVersion}
        where correction_id = ${row.correction_id}::uuid and state = 'SUBMITTED'`
        .execute(transaction);
      const updated = (await correctionRows(transaction, row.correction_id))[0]!;
      const publicPayload = {
        correctionId: row.correction_id, resultId: row.result_id, state: 'UNDER_REVIEW',
        reviewStartedAt: context.occurredAt.toISOString(),
      };
      return {
        responseStatus: 200,
        response: project(updated, true, true),
        event: { eventId: ids.eventId, eventName: 'TechnicalCorrectionReviewStarted',
          schemaVersion: 1, transitionId: 'TC-02', payload: publicPayload,
          metadata: { policyVersion: RESULT_POLICY_VERSION } },
        audit: { auditId: ids.auditId, action: 'START_TECHNICAL_CORRECTION_REVIEW',
          transitionId: 'TC-02', reasonCode: null, beforeState: 'SUBMITTED',
          afterState: 'UNDER_REVIEW', metadata: { resultId: row.result_id } },
        outbox: [{ messageId: ids.outboxMessageId,
          topic: 'competition.technical-correction.review-started.v1', payload: publicPayload }],
      };
    },
  });
}

export async function rejectTechnicalCorrection(
  database: Kysely<Database>,
  command: CommandEnvelope<RejectTechnicalCorrectionPayload>,
  ids: TechnicalCorrectionRejectionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<TechnicalCorrectionProjection>> {
  assertTransitionCommand(command, 'REJECT_TECHNICAL_CORRECTION');
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      if (!(await hasCentralGrant(transaction, command.actor.id!))) {
        throw new ResultPermissionDeniedError();
      }
      const row = await correctionCommandRow(transaction, command.aggregateId);
      if (!row) throw new ResultPermissionDeniedError();
      assertExpectedVersion(Number(row.version), command.expectedVersion);
      const reason = normalizeTechnicalCorrectionRejection({
        state: row.state,
        assignedReviewerUserId: row.assigned_reviewer_user_id,
        reviewerUserId: command.actor.id!,
        reason: command.payload.reason,
      });
      await sql`update competition.technical_correction_requests
        set state = 'REJECTED', decision_reason = ${reason},
          decided_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = ${context.nextVersion}
        where correction_id = ${row.correction_id}::uuid and state = 'UNDER_REVIEW'`
        .execute(transaction);
      const updated = (await correctionRows(transaction, row.correction_id))[0]!;
      const publicPayload = {
        correctionId: row.correction_id, resultId: row.result_id, state: 'REJECTED',
        decidedAt: context.occurredAt.toISOString(),
      };
      return {
        responseStatus: 200,
        response: project(updated, true, true),
        event: { eventId: ids.eventId, eventName: 'TechnicalCorrectionRejected',
          schemaVersion: 1, transitionId: 'TC-05', payload: publicPayload,
          metadata: { policyVersion: RESULT_POLICY_VERSION } },
        audit: { auditId: ids.auditId, action: 'REJECT_TECHNICAL_CORRECTION',
          transitionId: 'TC-05', reasonCode: 'INSUFFICIENT_CORRECTION_BASIS',
          beforeState: 'UNDER_REVIEW', afterState: 'REJECTED',
          metadata: { resultId: row.result_id, decisionReason: reason } },
        outbox: [
          { messageId: ids.outboxMessageId,
            topic: 'competition.technical-correction.rejected.v1', payload: publicPayload },
          { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1',
            payload: { notifications: [{ notificationId: ids.notificationId,
              recipientUserId: row.requester_user_id, category: 'MANDATORY',
              renderKey: 'result.technical-correction-rejected',
              actionTarget: { type: 'RESULT', resultId: row.result_id },
              payload: { correctionId: row.correction_id, resultId: row.result_id,
                state: 'REJECTED' }, deadlineAt: null }] } },
        ],
      };
    },
  });
}

export async function approveTechnicalCorrection(
  database: Kysely<Database>,
  command: CommandEnvelope<ApproveTechnicalCorrectionPayload>,
  ids: TechnicalCorrectionApprovalEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<TechnicalCorrectionProjection>> {
  assertTransitionCommand(command, 'APPROVE_TECHNICAL_CORRECTION');
  if (ids.notificationIds.length !== 3) throw new TypeError('Three notification IDs are required');
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      if (!(await hasCentralGrant(transaction, command.actor.id!))) {
        throw new ResultPermissionDeniedError();
      }
      const row = await correctionCommandRow(transaction, command.aggregateId);
      if (!row) throw new ResultPermissionDeniedError();
      assertExpectedVersion(Number(row.version), command.expectedVersion);
      if (row.open_appeal) {
        throw new ResultConflictError('TECHNICAL_CORRECTION_ACTIVE_APPEAL');
      }
      const normalized = normalizeTechnicalCorrectionApproval({
        state: row.state,
        assignedReviewerUserId: row.assigned_reviewer_user_id,
        reviewerUserId: command.actor.id!,
        resultState: row.result_state,
        proposedOutcomeCode: row.proposed_outcome_code,
        proposedWinnerUserId: row.proposed_winner_user_id,
        participantUserIds: [row.pair_low_id, row.pair_high_id],
        category: row.category,
        reason: command.payload.reason,
      });
      const originalLoserUserId = row.original_winner_user_id === null
        ? null
        : row.original_winner_user_id === row.pair_low_id
          ? row.pair_high_id
          : row.pair_low_id;
      await sql`
        insert into competition.technical_correction_decisions (
          decision_id, correction_id, result_id, reviewer_user_id, reason,
          original_outcome_code, original_winner_user_id, original_loser_user_id,
          effective_outcome_code, effective_winner_user_id, effective_loser_user_id,
          compensation_mode, decided_at
        ) values (
          ${ids.decisionId}::uuid, ${row.correction_id}::uuid, ${row.result_id}::uuid,
          ${command.actor.id}::uuid, ${normalized.reason}, ${row.original_outcome_code},
          ${row.original_winner_user_id}::uuid, ${originalLoserUserId}::uuid,
          ${normalized.outcomeCode}, ${normalized.winnerUserId}::uuid,
          ${normalized.loserUserId}::uuid, 'REAPPLY_CORRECTED',
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);

      const relatedEvents: RelatedDomainEventDraft[] = [];
      const snapshot = row.transition_id
        ? {
          championUserId: row.before_champion_user_id,
          contenderUserId: row.before_contender_user_id,
          statusVersion: Number(row.before_status_version),
        }
        : {
          championUserId: row.snapshot_champion_user_id,
          contenderUserId: row.snapshot_contender_user_id,
          statusVersion: Number(row.snapshot_status_version),
        };
      const correctedTransition = deriveProvisionalStatusTransition({
        stake: row.effective_stake,
        outcomeCode: normalized.outcomeCode,
        winnerUserId: normalized.winnerUserId,
        loserUserId: normalized.loserUserId,
        snapshot,
      });

      if (row.transition_id) {
        if (row.status_lock_result_id !== row.result_id) {
          throw new ResultConflictError('COMPETITION_STATUS_LOCKED');
        }
        const competitionAggregateVersion = Number(row.competition_version) + 1;
        const competitionStatusVersion = Number(row.competition_status_version) + 1;
        const correctedType = correctedTransition.type === 'NONE'
          ? null
          : correctedTransition.type;
        await sql`
          update competition.competitions
          set champion_user_id = ${correctedTransition.after.championUserId}::uuid,
            contender_user_id = ${correctedTransition.after.contenderUserId}::uuid,
            status_version = ${competitionStatusVersion},
            status_lock_result_id = ${row.result_id}::uuid,
            version = ${competitionAggregateVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where competition_id = ${row.competition_id}::uuid
            and status_lock_result_id = ${row.result_id}::uuid
        `.execute(transaction);
        await sql`
          insert into competition.technical_correction_status_compensations (
            compensation_id, decision_id, correction_id, source_transition_id,
            source_result_id, corrected_transition_type,
            from_champion_user_id, from_contender_user_id,
            to_champion_user_id, to_contender_user_id,
            competition_status_version, compensated_by_event_id, compensated_at
          ) values (
            ${ids.statusCompensationId}::uuid, ${ids.decisionId}::uuid,
            ${row.correction_id}::uuid, ${row.transition_id}::uuid,
            ${row.result_id}::uuid, ${correctedType},
            ${row.current_champion_user_id}::uuid, ${row.current_contender_user_id}::uuid,
            ${correctedTransition.after.championUserId}::uuid,
            ${correctedTransition.after.contenderUserId}::uuid,
            ${competitionStatusVersion}, ${ids.statusEventId}::uuid,
            ${context.occurredAt.toISOString()}::timestamptz
          )
        `.execute(transaction);
        relatedEvents.push({
          eventId: ids.statusEventId,
          eventName: correctedType === null
            ? 'StatusTransitionRolledBack'
            : 'StatusTransitionCompensated',
          schemaVersion: 1,
          aggregateType: 'Competition',
          aggregateId: row.competition_id,
          aggregateVersion: competitionAggregateVersion,
          transitionId: correctedType === null ? 'ST-12' : 'ST-11',
          payload: {
            compensationId: ids.statusCompensationId,
            compensatesTransitionId: row.transition_id,
            technicalCorrectionDecisionId: ids.decisionId,
            sourceResultId: row.result_id,
            from: {
              championUserId: row.current_champion_user_id,
              contenderUserId: row.current_contender_user_id,
            },
            to: {
              championUserId: correctedTransition.after.championUserId,
              contenderUserId: correctedTransition.after.contenderUserId,
            },
            correctedTransitionType: correctedType,
            statusVersion: competitionStatusVersion,
            statusLockResultId: row.result_id,
            provisional: true,
          },
          metadata: { policyVersion: RESULT_POLICY_VERSION },
        });
      } else if (correctedTransition.locksStatus) {
        if (!row.competitive_snapshot_id) {
          throw new ResultConflictError('COMPETITION_STATUS_SNAPSHOT_STALE');
        }
        if (row.status_lock_result_id) {
          throw new ResultConflictError('COMPETITION_STATUS_LOCKED');
        }
        if (
          row.current_champion_user_id !== snapshot.championUserId
          || row.current_contender_user_id !== snapshot.contenderUserId
          || Number(row.competition_status_version) !== snapshot.statusVersion
        ) {
          throw new ResultConflictError('COMPETITION_STATUS_SNAPSHOT_STALE');
        }
        const competitionAggregateVersion = Number(row.competition_version) + 1;
        await sql`
          update competition.competitions
          set champion_user_id = ${correctedTransition.after.championUserId}::uuid,
            contender_user_id = ${correctedTransition.after.contenderUserId}::uuid,
            status_version = ${correctedTransition.after.statusVersion},
            status_lock_result_id = ${row.result_id}::uuid,
            version = ${competitionAggregateVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where competition_id = ${row.competition_id}::uuid
            and status_lock_result_id is null
            and status_version = ${snapshot.statusVersion}
        `.execute(transaction);
        await sql`
          insert into competition.status_transitions (
            transition_id, source_result_id, source_event_id, competition_id,
            transition_type, before_champion_user_id, before_contender_user_id,
            before_status_version, after_champion_user_id, after_contender_user_id,
            after_status_version, competitive_snapshot_id, provisional, applied_at
          ) values (
            ${ids.statusTransitionId}::uuid, ${row.result_id}::uuid, ${ids.eventId}::uuid,
            ${row.competition_id}::uuid, ${correctedTransition.type},
            ${correctedTransition.before.championUserId}::uuid,
            ${correctedTransition.before.contenderUserId}::uuid,
            ${correctedTransition.before.statusVersion},
            ${correctedTransition.after.championUserId}::uuid,
            ${correctedTransition.after.contenderUserId}::uuid,
            ${correctedTransition.after.statusVersion},
            ${row.competitive_snapshot_id}::uuid, true,
            ${context.occurredAt.toISOString()}::timestamptz
          )
        `.execute(transaction);
        relatedEvents.push({
          eventId: ids.statusEventId,
          eventName: correctedTransition.eventName!,
          schemaVersion: 1,
          aggregateType: 'Competition',
          aggregateId: row.competition_id,
          aggregateVersion: competitionAggregateVersion,
          transitionId: correctedTransition.transitionId,
          payload: {
            transitionId: ids.statusTransitionId,
            sourceResultId: row.result_id,
            sourceEventId: ids.eventId,
            competitionId: row.competition_id,
            before: correctedTransition.before,
            after: correctedTransition.after,
            transitionType: correctedTransition.type,
            provisional: true,
            participantIds: [row.pair_low_id, row.pair_high_id],
            snapshotId: row.competitive_snapshot_id,
            technicalCorrectionDecisionId: ids.decisionId,
          },
          metadata: { policyVersion: RESULT_POLICY_VERSION },
        });
      }

      if (normalized.decisive && (!row.cooldown_id || row.cooldown_invalidated_at)) {
        const cooldownEndsAt = new Date(
          row.result_recorded_at.getTime() + row.pair_cooldown_days * 24 * 60 * 60 * 1_000,
        );
        await sql`
          insert into competition.pair_cooldowns (
            cooldown_id, competition_id, pair_low_id, pair_high_id,
            source_result_id, started_at, ends_at
          ) values (
            ${ids.cooldownId}::uuid, ${row.competition_id}::uuid,
            ${row.pair_low_id}::uuid, ${row.pair_high_id}::uuid,
            ${row.result_id}::uuid, ${row.result_recorded_at.toISOString()}::timestamptz,
            ${cooldownEndsAt.toISOString()}::timestamptz
          )
        `.execute(transaction);
        relatedEvents.push({
          eventId: ids.cooldownEventId,
          eventName: 'PairCooldownStarted',
          schemaVersion: 1,
          aggregateType: 'PairCooldown',
          aggregateId: ids.cooldownId,
          aggregateVersion: 1,
          transitionId: 'CD-01',
          payload: {
            cooldownId: ids.cooldownId,
            competitionId: row.competition_id,
            participantIds: [row.pair_low_id, row.pair_high_id],
            sourceResultId: row.result_id,
            startedAt: row.result_recorded_at.toISOString(),
            endsAt: cooldownEndsAt.toISOString(),
            technicalCorrectionDecisionId: ids.decisionId,
          },
          metadata: { policyVersion: RESULT_POLICY_VERSION },
        });
      } else if (!normalized.decisive && row.cooldown_id && !row.cooldown_invalidated_at) {
        await sql`
          update competition.pair_cooldowns
          set invalidated_at = ${context.occurredAt.toISOString()}::timestamptz
          where cooldown_id = ${row.cooldown_id}::uuid and invalidated_at is null
        `.execute(transaction);
        relatedEvents.push({
          eventId: ids.cooldownEventId,
          eventName: 'PairCooldownRemoved',
          schemaVersion: 1,
          aggregateType: 'PairCooldown',
          aggregateId: row.cooldown_id,
          aggregateVersion: 2,
          transitionId: 'CD-03',
          payload: {
            cooldownId: row.cooldown_id,
            resultId: row.result_id,
            technicalCorrectionDecisionId: ids.decisionId,
          },
          metadata: { policyVersion: RESULT_POLICY_VERSION },
        });
      }

      await sql`
        update competition.technical_correction_requests
        set state = 'APPROVED', decision_reason = ${normalized.reason},
          decided_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = ${context.nextVersion}
        where correction_id = ${row.correction_id}::uuid and state = 'UNDER_REVIEW'
      `.execute(transaction);
      const updated = (await correctionRows(transaction, row.correction_id))[0]!;
      const publicPayload = {
        correctionId: row.correction_id,
        resultId: row.result_id,
        decisionId: ids.decisionId,
        state: 'APPROVED',
        effectiveOutcomeCode: normalized.outcomeCode,
        effectiveWinnerUserId: normalized.winnerUserId,
        decidedAt: context.occurredAt.toISOString(),
      };
      const recipients = [row.requester_user_id, row.pair_low_id, row.pair_high_id];
      return {
        responseStatus: 200,
        response: project(updated, true, true),
        event: {
          eventId: ids.eventId,
          eventName: 'TechnicalCorrectionApproved',
          schemaVersion: 1,
          transitionId: 'TC-04',
          payload: publicPayload,
          metadata: { policyVersion: RESULT_POLICY_VERSION },
        },
        relatedEvents,
        audit: {
          auditId: ids.auditId,
          action: 'APPROVE_TECHNICAL_CORRECTION',
          transitionId: 'TC-04',
          reasonCode: 'TECHNICAL_CORRECTION_CONFIRMED',
          beforeState: 'UNDER_REVIEW',
          afterState: 'APPROVED',
          metadata: {
            resultId: row.result_id,
            decisionId: ids.decisionId,
            originalOutcomeCode: row.original_outcome_code,
            originalWinnerUserId: row.original_winner_user_id,
            effectiveOutcomeCode: normalized.outcomeCode,
            effectiveWinnerUserId: normalized.winnerUserId,
            decisionReason: normalized.reason,
          },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'competition.technical-correction.approved.v1',
            payload: publicPayload,
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: {
              notifications: recipients.map((recipientUserId, index) => ({
                notificationId: ids.notificationIds[index]!,
                recipientUserId,
                category: 'MANDATORY',
                renderKey: 'result.technical-correction-approved',
                actionTarget: { type: 'RESULT', resultId: row.result_id },
                payload: {
                  correctionId: row.correction_id,
                  resultId: row.result_id,
                  state: 'APPROVED',
                  effectiveOutcomeCode: normalized.outcomeCode,
                  effectiveWinnerUserId: normalized.winnerUserId,
                },
                deadlineAt: null,
              })),
            },
          },
        ],
      };
    },
  });
}
