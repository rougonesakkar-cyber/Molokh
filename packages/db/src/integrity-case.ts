import { createHash } from 'node:crypto';

import {
  CHALLENGE_POLICY_VERSION,
  INTEGRITY_POLICY_VERSION,
  RESULT_POLICY_VERSION,
  ResultConflictError,
  ResultPermissionDeniedError,
  acceptedChallengeSchedulingDeadline,
  assertExpectedVersion,
  assertIntegrityReviewCanStart,
  deriveProvisionalStatusTransition,
  integrityReviewSlaDeadline,
  normalizeIntegrityCaseOpening,
  normalizeIntegrityDecision,
  type ChallengeStake,
  type CommandEnvelope,
  type IntegrityCaseState,
  type IntegrityCategory,
  type IntegrityDisposition,
  type ResultOutcomeCode,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import { executeCriticalCommand, type ExecutedCommand, type RelatedDomainEventDraft } from './platform-command.js';

export interface OpenIntegrityCasePayload {
  readonly resultId: string;
  readonly expectedResultVersion: number;
  readonly category: IntegrityCategory;
  readonly evidenceReference: string;
  readonly internalReason: string;
}
export interface StartIntegrityReviewPayload { readonly caseId: string }
export interface DecideIntegrityCasePayload {
  readonly caseId: string;
  readonly disposition: IntegrityDisposition;
  readonly correctedOutcomeCode: ResultOutcomeCode | null;
  readonly reason: string;
}

export interface IntegrityCaseEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly caseId?: string;
  readonly decisionId?: string;
  readonly resultEventId?: string;
  readonly challengeEventId?: string;
  readonly competitionEventId?: string;
  readonly compensationId?: string;
  readonly cooldownEventId?: string;
  readonly obligationIds?: readonly string[];
  readonly notificationOutboxMessageId?: string;
  readonly notificationIds?: readonly string[];
}

export interface IntegrityCaseProjection {
  readonly caseId: string;
  readonly resultId: string;
  readonly challengeId: string;
  readonly competitionId: string;
  readonly category: IntegrityCategory;
  readonly publicReasonCategory: IntegrityCategory;
  readonly evidenceReference: string | null;
  readonly internalReason: string | null;
  readonly state: IntegrityCaseState;
  readonly openedBy: string;
  readonly openedAt: string;
  readonly slaDueAt: string;
  readonly assignedReviewerUserId: string | null;
  readonly reviewStartedAt: string | null;
  readonly requestedDisposition: IntegrityDisposition | null;
  readonly effectiveDisposition: IntegrityDisposition | null;
  readonly decisionReason: string | null;
  readonly effectiveOutcomeCode: ResultOutcomeCode | null;
  readonly effectiveWinnerUserId: string | null;
  readonly replayHash: string | null;
  readonly decidedAt: string | null;
  readonly participantUserIds: readonly [string, string];
  readonly participantDisplayNames: readonly [string, string];
  readonly originalCoachUserId: string | null;
  readonly viewerCanStartReview: boolean;
  readonly viewerCanDecide: boolean;
  readonly version: number;
}

interface IntegrityRow {
  readonly case_id: string;
  readonly result_id: string;
  readonly challenge_id: string;
  readonly competition_id: string;
  readonly category: IntegrityCategory;
  readonly public_reason_category: IntegrityCategory;
  readonly evidence_reference: string;
  readonly internal_reason: string;
  readonly state: IntegrityCaseState;
  readonly source_result_version: string;
  readonly source_competition_version: string;
  readonly source_status_version: string;
  readonly opened_by: string;
  readonly opened_at: Date;
  readonly sla_due_at: Date;
  readonly assigned_reviewer_user_id: string | null;
  readonly review_started_at: Date | null;
  readonly decided_at: Date | null;
  readonly case_version: string;
  readonly requested_disposition: IntegrityDisposition | null;
  readonly effective_disposition: IntegrityDisposition | null;
  readonly decision_reason: string | null;
  readonly effective_outcome_code: ResultOutcomeCode | null;
  readonly effective_winner_user_id: string | null;
  readonly replay_hash: string | null;
  readonly result_state: string;
  readonly result_version: string;
  readonly recorded_outcome_code: ResultOutcomeCode;
  readonly winner_user_id: string | null;
  readonly loser_user_id: string | null;
  readonly competitive_snapshot_id: string | null;
  readonly coach_user_id: string | null;
  readonly challenge_state: string;
  readonly challenge_version: string;
  readonly cycle_no: number;
  readonly pair_low_id: string;
  readonly pair_low_name: string;
  readonly pair_high_id: string;
  readonly pair_high_name: string;
  readonly competition_version: string;
  readonly competition_status_version: string;
  readonly current_champion_user_id: string | null;
  readonly current_contender_user_id: string | null;
  readonly integrity_hold_case_id: string | null;
  readonly competition_availability: string;
  readonly transition_id: string | null;
  readonly transition_applied_at: Date | null;
  readonly before_champion_user_id: string | null;
  readonly before_contender_user_id: string | null;
  readonly before_status_version: string | null;
  readonly cooldown_id: string | null;
  readonly community_id: string;
}

interface FinalResultRow {
  readonly result_id: string;
  readonly result_state: string;
  readonly result_version: string;
  readonly challenge_id: string;
  readonly competition_id: string;
  readonly competition_version: string;
  readonly competition_status_version: string;
  readonly pair_low_id: string;
  readonly pair_high_id: string;
  readonly coach_user_id: string | null;
  readonly existing_open_case: boolean;
}

function requiredIds<T extends readonly (keyof IntegrityCaseEffectIds)[]>(
  ids: IntegrityCaseEffectIds,
  keys: T,
): { readonly [K in T[number]]: string } {
  return Object.fromEntries(keys.map((key) => {
    const value = ids[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`IntegrityCase effect ID ${String(key)} is required`);
    }
    return [key, value];
  })) as { readonly [K in T[number]]: string };
}

async function hasCentralGrant(
  database: Kysely<Database> | Transaction<Database>, userId: string,
): Promise<boolean> {
  const result = await sql<{ readonly allowed: boolean }>`select exists (
    select 1 from community.role_grants where user_id = ${userId}::uuid
      and role = 'CENTRAL_ADMIN' and scope_type = 'GLOBAL' and scope_id is null
      and state = 'ACTIVE' and (expires_at is null or expires_at > clock_timestamp())
  ) as allowed`.execute(database);
  return result.rows[0]?.allowed === true;
}

async function finalResultRow(
  transaction: Transaction<Database>, resultId: string,
): Promise<FinalResultRow> {
  const result = await sql<FinalResultRow>`
    select result.result_id, result.state as result_state,
      result.version::text as result_version, challenge.challenge_id,
      competition.competition_id, competition.version::text as competition_version,
      competition.status_version::text as competition_status_version,
      challenge.pair_low_id, challenge.pair_high_id, result.coach_user_id,
      exists (select 1 from competition.integrity_cases as existing
        where existing.result_id = result.result_id and existing.state in ('OPEN', 'UNDER_REVIEW'))
        as existing_open_case
    from competition.results as result
    join competition.challenges as challenge on challenge.challenge_id = result.challenge_id
    join competition.competitions as competition on competition.competition_id = challenge.competition_id
    where result.result_id = ${resultId}::uuid
    for update of result, challenge, competition
  `.execute(transaction);
  const row = result.rows[0];
  if (!row) throw new ResultPermissionDeniedError();
  return row;
}

async function integrityRows(
  database: Kysely<Database> | Transaction<Database>, caseId?: string, lock = false,
): Promise<readonly IntegrityRow[]> {
  const result = await sql<IntegrityRow>`
    select integrity.case_id, integrity.result_id, integrity.challenge_id,
      integrity.competition_id, integrity.category, integrity.public_reason_category,
      integrity.evidence_reference, integrity.internal_reason, integrity.state,
      integrity.source_result_version::text as source_result_version,
      integrity.source_competition_version::text as source_competition_version,
      integrity.source_status_version::text as source_status_version,
      integrity.opened_by, integrity.opened_at, integrity.sla_due_at,
      integrity.assigned_reviewer_user_id, integrity.review_started_at,
      integrity.decided_at, integrity.version::text as case_version,
      decision.requested_disposition, decision.effective_disposition,
      decision.reason as decision_reason, decision.effective_outcome_code,
      decision.effective_winner_user_id, decision.replay_hash,
      result.state as result_state, result.version::text as result_version,
      coalesce(appeal_decision.effective_outcome_code,
        technical_decision.effective_outcome_code,
        result.recorded_outcome_code) as recorded_outcome_code,
      coalesce(appeal_decision.effective_winner_user_id,
        case when technical_decision.decision_id is not null
          then technical_decision.effective_winner_user_id else result.winner_user_id end)
        as winner_user_id,
      coalesce(appeal_decision.effective_loser_user_id,
        case when technical_decision.decision_id is not null
          then technical_decision.effective_loser_user_id else result.loser_user_id end)
        as loser_user_id,
      result.competitive_snapshot_id, result.coach_user_id,
      challenge.state as challenge_state, challenge.version::text as challenge_version,
      challenge.cycle_no, challenge.pair_low_id, pair_low.display_name as pair_low_name,
      challenge.pair_high_id, pair_high.display_name as pair_high_name,
      competition.version::text as competition_version,
      competition.status_version::text as competition_status_version,
      competition.champion_user_id as current_champion_user_id,
      competition.contender_user_id as current_contender_user_id,
      competition.integrity_hold_case_id, competition.availability as competition_availability,
      transition.transition_id, transition.applied_at as transition_applied_at,
      transition.before_champion_user_id, transition.before_contender_user_id,
      transition.before_status_version::text as before_status_version,
      cooldown.cooldown_id, competition.community_id
    from competition.integrity_cases as integrity
    join competition.results as result on result.result_id = integrity.result_id
    join competition.challenges as challenge on challenge.challenge_id = integrity.challenge_id
    join competition.competitions as competition on competition.competition_id = integrity.competition_id
    join identity.users as pair_low on pair_low.user_id = challenge.pair_low_id
    join identity.users as pair_high on pair_high.user_id = challenge.pair_high_id
    left join competition.integrity_decisions as decision on decision.case_id = integrity.case_id
    left join competition.appeal_decisions as appeal_decision
      on appeal_decision.result_id = result.result_id
    left join competition.technical_correction_decisions as technical_decision
      on technical_decision.result_id = result.result_id
    left join competition.status_transitions as transition on transition.source_result_id = result.result_id
    left join competition.pair_cooldowns as cooldown
      on cooldown.source_result_id = result.result_id and cooldown.invalidated_at is null
    where (${caseId ?? null}::uuid is null or integrity.case_id = ${caseId ?? null}::uuid)
    order by integrity.opened_at, integrity.case_id
    ${lock ? sql`for update of integrity, result, challenge, competition` : sql``}
  `.execute(database);
  return result.rows;
}

function project(row: IntegrityRow, central: boolean, viewerUserId: string): IntegrityCaseProjection {
  return {
    caseId: row.case_id, resultId: row.result_id, challengeId: row.challenge_id,
    competitionId: row.competition_id, category: row.category,
    publicReasonCategory: row.public_reason_category,
    evidenceReference: central ? row.evidence_reference : null,
    internalReason: central ? row.internal_reason : null,
    state: row.state, openedBy: row.opened_by, openedAt: row.opened_at.toISOString(),
    slaDueAt: row.sla_due_at.toISOString(),
    assignedReviewerUserId: row.assigned_reviewer_user_id,
    reviewStartedAt: row.review_started_at?.toISOString() ?? null,
    requestedDisposition: row.requested_disposition,
    effectiveDisposition: row.effective_disposition,
    decisionReason: central ? row.decision_reason : null,
    effectiveOutcomeCode: row.effective_outcome_code,
    effectiveWinnerUserId: row.effective_winner_user_id,
    replayHash: central ? row.replay_hash : null,
    decidedAt: row.decided_at?.toISOString() ?? null,
    participantUserIds: [row.pair_low_id, row.pair_high_id],
    participantDisplayNames: [row.pair_low_name, row.pair_high_name],
    originalCoachUserId: row.coach_user_id,
    viewerCanStartReview: central && row.state === 'OPEN'
      && ![row.pair_low_id, row.pair_high_id, row.coach_user_id].includes(viewerUserId),
    viewerCanDecide: central && row.state === 'UNDER_REVIEW'
      && row.assigned_reviewer_user_id === viewerUserId,
    version: Number(row.case_version),
  };
}

export async function listIntegrityCasesForCentral(
  database: Kysely<Database>, centralUserId: string,
): Promise<IntegrityCaseProjection[]> {
  if (!(await hasCentralGrant(database, centralUserId))) throw new ResultPermissionDeniedError();
  return (await integrityRows(database))
    .filter((row) => row.state === 'OPEN' || row.state === 'UNDER_REVIEW')
    .map((row) => project(row, true, centralUserId));
}

export async function listIntegrityCasesForViewer(
  database: Kysely<Database>, viewerUserId: string,
): Promise<IntegrityCaseProjection[]> {
  const central = await hasCentralGrant(database, viewerUserId);
  return (await integrityRows(database))
    .filter((row) => central || [row.pair_low_id, row.pair_high_id, row.coach_user_id].includes(viewerUserId))
    .map((row) => project(row, central, viewerUserId));
}

export async function readIntegrityCase(
  database: Kysely<Database>, caseId: string, viewerUserId: string,
): Promise<IntegrityCaseProjection> {
  const row = (await integrityRows(database, caseId))[0];
  const central = await hasCentralGrant(database, viewerUserId);
  if (!row || (!central && ![row.pair_low_id, row.pair_high_id, row.coach_user_id].includes(viewerUserId))) {
    throw new ResultPermissionDeniedError();
  }
  return project(row, central, viewerUserId);
}

function notifications(ids: IntegrityCaseEffectIds, count: number) {
  const messageId = requiredIds(ids, ['notificationOutboxMessageId'] as const)
    .notificationOutboxMessageId;
  if (!ids.notificationIds || ids.notificationIds.length < count) {
    throw new TypeError(`${count} IntegrityCase notification IDs are required`);
  }
  return { messageId, ids: ids.notificationIds };
}

export async function openIntegrityCase(
  database: Kysely<Database>, command: CommandEnvelope<OpenIntegrityCasePayload>,
  ids: IntegrityCaseEffectIds, now?: () => Date,
): Promise<ExecutedCommand<IntegrityCaseProjection>> {
  if (!command.actor.id || command.aggregateType !== 'IntegrityCase'
    || command.expectedVersion !== 0) throw new ResultPermissionDeniedError();
  const caseId = requiredIds(ids, ['caseId'] as const).caseId;
  const notice = notifications(ids, 3);
  return executeCriticalCommand(database, {
    command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      if (!(await hasCentralGrant(transaction, command.actor.id!))) throw new ResultPermissionDeniedError();
      const source = await finalResultRow(transaction, command.payload.resultId);
      assertExpectedVersion(Number(source.result_version), command.payload.expectedResultVersion);
      const normalized = normalizeIntegrityCaseOpening({
        resultState: source.result_state as 'FINAL', existingOpenCase: source.existing_open_case,
        category: command.payload.category, evidenceReference: command.payload.evidenceReference,
        internalReason: command.payload.internalReason,
      });
      const slaDueAt = integrityReviewSlaDeadline(context.occurredAt);
      await sql`insert into competition.integrity_cases (
        case_id, result_id, challenge_id, competition_id, category,
        evidence_reference, internal_reason, public_reason_category, state,
        source_result_version, source_competition_version, source_status_version,
        opened_by, opened_at, sla_due_at, version
      ) values (
        ${caseId}::uuid, ${source.result_id}::uuid, ${source.challenge_id}::uuid,
        ${source.competition_id}::uuid, ${command.payload.category},
        ${normalized.evidenceReference}, ${normalized.internalReason}, ${command.payload.category},
        'OPEN', ${Number(source.result_version)}, ${Number(source.competition_version)},
        ${Number(source.competition_status_version)}, ${command.actor.id}::uuid,
        ${context.occurredAt.toISOString()}::timestamptz,
        ${slaDueAt.toISOString()}::timestamptz, 1
      )`.execute(transaction);
      const row = (await integrityRows(transaction, caseId))[0]!;
      const recipients = [source.pair_low_id, source.pair_high_id, source.coach_user_id!];
      return {
        responseStatus: 201, response: project(row, true, command.actor.id!),
        event: {
          eventId: ids.eventId, eventName: 'IntegrityCaseOpened', schemaVersion: 1,
          transitionId: 'IG-01', payload: {
            caseId, resultId: source.result_id, challengeId: source.challenge_id,
            category: command.payload.category, openedAt: context.occurredAt.toISOString(),
            slaDueAt: slaDueAt.toISOString(),
          }, metadata: { policyVersion: INTEGRITY_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId, action: 'OPEN_INTEGRITY_CASE', transitionId: 'IG-01',
          reasonCode: command.payload.category, beforeState: null, afterState: 'OPEN',
          metadata: { resultId: source.result_id, evidenceReference: normalized.evidenceReference },
        },
        outbox: [
          { messageId: ids.outboxMessageId, topic: 'competition.integrity-case.opened.v1',
            payload: { caseId, resultId: source.result_id, category: command.payload.category } },
          { messageId: notice.messageId, topic: 'notification.in_app.v1', payload: {
            notifications: recipients.map((recipientUserId, index) => ({
              notificationId: notice.ids[index]!, recipientUserId, category: 'MANDATORY',
              renderKey: 'result.integrity-review-opened',
              actionTarget: { type: 'RESULT', resultId: source.result_id },
              payload: { caseId, publicReasonCategory: command.payload.category }, deadlineAt: null,
            })),
          } },
        ],
      };
    },
  });
}

export async function startIntegrityReview(
  database: Kysely<Database>, command: CommandEnvelope<StartIntegrityReviewPayload>,
  ids: IntegrityCaseEffectIds, now?: () => Date,
): Promise<ExecutedCommand<IntegrityCaseProjection>> {
  if (!command.actor.id || command.aggregateType !== 'IntegrityCase'
    || command.payload.caseId !== command.aggregateId) throw new ResultPermissionDeniedError();
  return executeCriticalCommand(database, {
    command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      if (!(await hasCentralGrant(transaction, command.actor.id!))) throw new ResultPermissionDeniedError();
      const row = (await integrityRows(transaction, command.aggregateId, true))[0];
      if (!row) throw new ResultPermissionDeniedError();
      assertIntegrityReviewCanStart({
        state: row.state, reviewerUserId: command.actor.id!,
        protectedUserIds: [row.pair_low_id, row.pair_high_id, row.coach_user_id ?? ''],
      });
      if (row.integrity_hold_case_id !== null) {
        throw new ResultConflictError('COMPETITION_INTEGRITY_HOLD');
      }
      const competitionNextVersion = Number(row.competition_version) + 1;
      await sql`update competition.integrity_cases set state = 'UNDER_REVIEW',
        assigned_reviewer_user_id = ${command.actor.id}::uuid,
        review_started_at = ${context.occurredAt.toISOString()}::timestamptz,
        version = ${context.nextVersion} where case_id = ${row.case_id}::uuid and state = 'OPEN'`
        .execute(transaction);
      await sql`update competition.competitions set integrity_hold_case_id = ${row.case_id}::uuid,
        version = ${competitionNextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where competition_id = ${row.competition_id}::uuid and integrity_hold_case_id is null`
        .execute(transaction);
      const projected = (await integrityRows(transaction, row.case_id))[0]!;
      return {
        responseStatus: 200, response: project(projected, true, command.actor.id!),
        event: { eventId: ids.eventId, eventName: 'IntegrityCaseReviewStarted', schemaVersion: 1,
          transitionId: 'IG-02', payload: { caseId: row.case_id, reviewerUserId: command.actor.id,
            startedAt: context.occurredAt.toISOString() },
          metadata: { policyVersion: INTEGRITY_POLICY_VERSION } },
        relatedEvents: [{
          eventId: requiredIds(ids, ['competitionEventId'] as const).competitionEventId,
          eventName: 'CompetitionIntegrityHoldStarted', schemaVersion: 1,
          aggregateType: 'Competition', aggregateId: row.competition_id,
          aggregateVersion: competitionNextVersion, transitionId: null,
          payload: { caseId: row.case_id, resultId: row.result_id },
          metadata: { policyVersion: INTEGRITY_POLICY_VERSION },
        }],
        audit: { auditId: ids.auditId, action: 'START_INTEGRITY_REVIEW', transitionId: 'IG-02',
          reasonCode: row.category, beforeState: 'OPEN', afterState: 'UNDER_REVIEW', metadata: {} },
        outbox: [{ messageId: ids.outboxMessageId,
          topic: 'competition.integrity-case.review-started.v1', payload: { caseId: row.case_id } }],
      };
    },
  });
}

interface ReplayTransitionRow {
  readonly transition_id: string;
  readonly result_id: string;
  readonly applied_at: Date;
  readonly effective_stake: ChallengeStake;
  readonly pair_low_id: string;
  readonly pair_high_id: string;
  readonly recorded_outcome_code: ResultOutcomeCode;
  readonly recorded_winner_user_id: string | null;
  readonly recorded_loser_user_id: string | null;
  readonly appeal_decision: string | null;
  readonly appeal_outcome_code: ResultOutcomeCode | null;
  readonly appeal_winner_user_id: string | null;
  readonly appeal_loser_user_id: string | null;
  readonly technical_decision_id: string | null;
  readonly technical_outcome_code: ResultOutcomeCode | null;
  readonly technical_winner_user_id: string | null;
  readonly technical_loser_user_id: string | null;
  readonly integrity_disposition: IntegrityDisposition | null;
  readonly integrity_outcome_code: ResultOutcomeCode | null;
  readonly integrity_winner_user_id: string | null;
  readonly integrity_loser_user_id: string | null;
}

async function replayStatus(input: {
  readonly transaction: Transaction<Database>;
  readonly row: IntegrityRow;
  readonly disposition: IntegrityDisposition;
  readonly correctedOutcomeCode: ResultOutcomeCode | null;
  readonly correctedWinnerUserId: string | null;
  readonly correctedLoserUserId: string | null;
}) {
  let championUserId = input.row.before_champion_user_id;
  let contenderUserId = input.row.before_contender_user_id;
  let replayVersion = Number(input.row.before_status_version ?? input.row.source_status_version);
  const transitions = await sql<ReplayTransitionRow>`
    select transition.transition_id, result.result_id, transition.applied_at,
      coalesce(snapshot.effective_stake, challenge.stake) as effective_stake,
      challenge.pair_low_id, challenge.pair_high_id,
      result.recorded_outcome_code, result.winner_user_id as recorded_winner_user_id,
      result.loser_user_id as recorded_loser_user_id,
      appeal_decision.decision as appeal_decision,
      appeal_decision.effective_outcome_code as appeal_outcome_code,
      appeal_decision.effective_winner_user_id as appeal_winner_user_id,
      appeal_decision.effective_loser_user_id as appeal_loser_user_id,
      technical_decision.decision_id as technical_decision_id,
      technical_decision.effective_outcome_code as technical_outcome_code,
      technical_decision.effective_winner_user_id as technical_winner_user_id,
      technical_decision.effective_loser_user_id as technical_loser_user_id,
      integrity_decision.effective_disposition as integrity_disposition,
      integrity_decision.effective_outcome_code as integrity_outcome_code,
      integrity_decision.effective_winner_user_id as integrity_winner_user_id,
      integrity_decision.effective_loser_user_id as integrity_loser_user_id
    from competition.status_transitions as transition
    join competition.results as result on result.result_id = transition.source_result_id
    join competition.challenges as challenge on challenge.challenge_id = result.challenge_id
    left join scheduling.session_competitive_snapshots as snapshot
      on snapshot.snapshot_id = result.competitive_snapshot_id
    left join competition.appeal_decisions as appeal_decision
      on appeal_decision.result_id = result.result_id
    left join competition.technical_correction_decisions as technical_decision
      on technical_decision.result_id = result.result_id
    left join competition.integrity_decisions as integrity_decision
      on integrity_decision.result_id = result.result_id
    where transition.competition_id = ${input.row.competition_id}::uuid
      and transition.applied_at >= ${input.row.transition_applied_at?.toISOString() ?? '9999-01-01T00:00:00.000Z'}::timestamptz
    order by transition.applied_at, transition.transition_id
  `.execute(input.transaction);
  const journal: Array<Record<string, unknown>> = [];
  for (const transition of transitions.rows) {
    let outcome: ResultOutcomeCode | null;
    let winner: string | null;
    let loser: string | null;
    if (transition.result_id === input.row.result_id) {
      const currentOutcome = transition.technical_decision_id
        ? transition.technical_outcome_code
        : transition.recorded_outcome_code;
      const currentWinner = transition.technical_decision_id
        ? transition.technical_winner_user_id
        : transition.recorded_winner_user_id;
      const currentLoser = transition.technical_decision_id
        ? transition.technical_loser_user_id
        : transition.recorded_loser_user_id;
      outcome = input.disposition === 'CORRECT' ? input.correctedOutcomeCode
        : input.disposition === 'UPHOLD' ? currentOutcome : null;
      winner = input.disposition === 'CORRECT' ? input.correctedWinnerUserId
        : input.disposition === 'UPHOLD' ? currentWinner : null;
      loser = input.disposition === 'CORRECT' ? input.correctedLoserUserId
        : input.disposition === 'UPHOLD' ? currentLoser : null;
    } else if (transition.integrity_disposition) {
      const removed = transition.integrity_disposition === 'ANNUL'
        || transition.integrity_disposition === 'REPEAT';
      outcome = removed ? null : transition.integrity_outcome_code;
      winner = removed ? null : transition.integrity_winner_user_id;
      loser = removed ? null : transition.integrity_loser_user_id;
    } else if (transition.appeal_decision) {
      const removed = transition.appeal_decision === 'ANNUL'
        || transition.appeal_decision === 'REPEAT';
      outcome = removed ? null : transition.appeal_outcome_code;
      winner = removed ? null : transition.appeal_winner_user_id;
      loser = removed ? null : transition.appeal_loser_user_id;
    } else if (transition.technical_decision_id) {
      outcome = transition.technical_outcome_code;
      winner = transition.technical_winner_user_id;
      loser = transition.technical_loser_user_id;
    } else {
      outcome = transition.recorded_outcome_code;
      winner = transition.recorded_winner_user_id;
      loser = transition.recorded_loser_user_id;
    }
    if (outcome !== null) {
      const derived = deriveProvisionalStatusTransition({
        stake: transition.effective_stake, outcomeCode: outcome,
        winnerUserId: winner, loserUserId: loser,
        snapshot: { championUserId, contenderUserId, statusVersion: replayVersion },
      });
      championUserId = derived.after.championUserId;
      contenderUserId = derived.after.contenderUserId;
      replayVersion = derived.after.statusVersion;
    }
    journal.push({ transitionId: transition.transition_id, resultId: transition.result_id,
      outcome, winnerUserId: winner, championUserId, contenderUserId });
  }
  const replayHash = createHash('sha256').update(JSON.stringify({
    competitionId: input.row.competition_id, sourceResultId: input.row.result_id,
    championUserId, contenderUserId, journal,
  })).digest('hex');
  return { championUserId, contenderUserId, replayHash };
}

async function repeatAllowed(transaction: Transaction<Database>, row: IntegrityRow): Promise<boolean> {
  if (row.competition_availability !== 'ACTIVE') return false;
  const result = await sql<{ readonly allowed: boolean }>`select
    not exists (
      select 1 from competition.challenge_participant_obligations
      where user_id in (${row.pair_low_id}::uuid, ${row.pair_high_id}::uuid)
        and released_at is null
    ) and (
      select count(*) = 2 from community.community_memberships
      where community_id = ${row.community_id}::uuid
        and user_id in (${row.pair_low_id}::uuid, ${row.pair_high_id}::uuid)
        and state = 'ACTIVE' and competition_enabled
    ) as allowed`.execute(transaction);
  return result.rows[0]?.allowed === true;
}

export async function decideIntegrityCase(
  database: Kysely<Database>, command: CommandEnvelope<DecideIntegrityCasePayload>,
  ids: IntegrityCaseEffectIds, now?: () => Date,
): Promise<ExecutedCommand<IntegrityCaseProjection>> {
  if (!command.actor.id || command.aggregateType !== 'IntegrityCase'
    || command.payload.caseId !== command.aggregateId) throw new ResultPermissionDeniedError();
  const required = requiredIds(ids, [
    'decisionId', 'resultEventId', 'challengeEventId', 'competitionEventId',
  ] as const);
  const notice = notifications(ids, 3);
  return executeCriticalCommand(database, {
    command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      if (!(await hasCentralGrant(transaction, command.actor.id!))) throw new ResultPermissionDeniedError();
      const row = (await integrityRows(transaction, command.aggregateId, true))[0];
      if (!row) throw new ResultPermissionDeniedError();
      if (row.result_state !== 'FINAL' || row.challenge_state !== 'COMPLETED'
        || row.integrity_hold_case_id !== row.case_id) {
        throw new ResultConflictError('INTEGRITY_RESULT_NOT_FINAL');
      }
      if (command.payload.disposition === 'CORRECT'
        && ['FORFEIT', 'NO_SHOW'].includes(command.payload.correctedOutcomeCode ?? '')) {
        throw new ResultConflictError('INTEGRITY_DECISION_INVALID');
      }
      const canRepeat = await repeatAllowed(transaction, row);
      const normalized = normalizeIntegrityDecision({
        state: row.state, assignedReviewerUserId: row.assigned_reviewer_user_id,
        reviewerUserId: command.actor.id!, disposition: command.payload.disposition,
        correctedOutcomeCode: command.payload.correctedOutcomeCode,
        reason: command.payload.reason,
        participantUserIds: [row.pair_low_id, row.pair_high_id], repeatAllowed: canRepeat,
      });
      const replay = await replayStatus({ transaction, row,
        disposition: normalized.effectiveDisposition,
        correctedOutcomeCode: normalized.effectiveOutcomeCode,
        correctedWinnerUserId: normalized.effectiveWinnerUserId,
        correctedLoserUserId: normalized.effectiveLoserUserId });
      const effectiveOutcome = normalized.effectiveDisposition === 'UPHOLD'
        ? row.recorded_outcome_code : normalized.effectiveOutcomeCode;
      const effectiveWinner = normalized.effectiveDisposition === 'UPHOLD'
        ? row.winner_user_id : normalized.effectiveWinnerUserId;
      const effectiveLoser = normalized.effectiveDisposition === 'UPHOLD'
        ? row.loser_user_id : normalized.effectiveLoserUserId;
      await sql`insert into competition.integrity_decisions (
        decision_id, case_id, result_id, reviewer_user_id, requested_disposition,
        effective_disposition, reason, public_reason_category,
        original_outcome_code, original_winner_user_id, original_loser_user_id,
        effective_outcome_code, effective_winner_user_id, effective_loser_user_id,
        replay_hash, decided_at
      ) values (
        ${required.decisionId}::uuid, ${row.case_id}::uuid, ${row.result_id}::uuid,
        ${command.actor.id}::uuid, ${normalized.disposition}, ${normalized.effectiveDisposition},
        ${normalized.reason}, ${row.category}, ${row.recorded_outcome_code},
        ${row.winner_user_id}::uuid, ${row.loser_user_id}::uuid, ${effectiveOutcome},
        ${effectiveWinner}::uuid, ${effectiveLoser}::uuid, ${replay.replayHash},
        ${context.occurredAt.toISOString()}::timestamptz
      )`.execute(transaction);
      await sql`update competition.integrity_cases set state = ${normalized.terminalState},
        decided_at = ${context.occurredAt.toISOString()}::timestamptz,
        version = ${context.nextVersion} where case_id = ${row.case_id}::uuid
        and state = 'UNDER_REVIEW'`.execute(transaction);
      const resultNextVersion = Number(row.result_version) + 1;
      const resultState = normalized.effectiveDisposition === 'UPHOLD' ? 'FINAL'
        : normalized.effectiveDisposition === 'CORRECT' ? 'REVERSED'
          : normalized.effectiveDisposition === 'REPEAT' ? 'REPEAT_ORDERED' : 'ANNULLED';
      await sql`update competition.results set state = ${resultState},
        version = ${resultNextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where result_id = ${row.result_id}::uuid and state = 'FINAL'`.execute(transaction);
      const challengeNextVersion = Number(row.challenge_version) + 1;
      const schedulingDeadlineAt = normalized.effectiveDisposition === 'REPEAT'
        ? acceptedChallengeSchedulingDeadline(context.occurredAt) : null;
      if (normalized.effectiveDisposition === 'REPEAT') {
        if (!ids.obligationIds || ids.obligationIds.length < 2) {
          throw new TypeError('Two repeat obligation IDs are required');
        }
        await sql`update competition.challenges set state = 'ACCEPTED_UNSCHEDULED',
          cycle_no = cycle_no + 1,
          scheduling_deadline_at = ${schedulingDeadlineAt!.toISOString()}::timestamptz,
          decided_at = null, version = ${challengeNextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where challenge_id = ${row.challenge_id}::uuid and state = 'COMPLETED'`.execute(transaction);
        await sql`insert into competition.challenge_participant_obligations (
          obligation_id, challenge_id, cycle_no, user_id, accepted_at
        ) values
          (${ids.obligationIds[0]}::uuid, ${row.challenge_id}::uuid, ${row.cycle_no + 1},
            ${row.pair_low_id}::uuid, ${context.occurredAt.toISOString()}::timestamptz),
          (${ids.obligationIds[1]}::uuid, ${row.challenge_id}::uuid, ${row.cycle_no + 1},
            ${row.pair_high_id}::uuid, ${context.occurredAt.toISOString()}::timestamptz)`
          .execute(transaction);
      } else {
        await sql`update competition.challenges set version = ${challengeNextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where challenge_id = ${row.challenge_id}::uuid and state = 'COMPLETED'`.execute(transaction);
      }
      const competitionNextVersion = Number(row.competition_version) + 1;
      const statusChanged = row.transition_id !== null
        && normalized.effectiveDisposition !== 'UPHOLD';
      const competitionStatusVersion = Number(row.competition_status_version) + (statusChanged ? 1 : 0);
      await sql`update competition.competitions set
        champion_user_id = ${statusChanged ? replay.championUserId : row.current_champion_user_id}::uuid,
        contender_user_id = ${statusChanged ? replay.contenderUserId : row.current_contender_user_id}::uuid,
        status_version = ${competitionStatusVersion}, integrity_hold_case_id = null,
        version = ${competitionNextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where competition_id = ${row.competition_id}::uuid
          and integrity_hold_case_id = ${row.case_id}::uuid`.execute(transaction);
      const relatedEvents: RelatedDomainEventDraft[] = [];
      if (statusChanged) {
        const compensationId = requiredIds(ids, ['compensationId'] as const).compensationId;
        await sql`insert into competition.integrity_status_compensations (
          compensation_id, decision_id, case_id, source_transition_id, source_result_id,
          from_champion_user_id, from_contender_user_id, to_champion_user_id,
          to_contender_user_id, competition_status_version, replay_hash,
          compensated_by_event_id, compensated_at
        ) values (
          ${compensationId}::uuid, ${required.decisionId}::uuid, ${row.case_id}::uuid,
          ${row.transition_id}::uuid, ${row.result_id}::uuid,
          ${row.current_champion_user_id}::uuid, ${row.current_contender_user_id}::uuid,
          ${replay.championUserId}::uuid, ${replay.contenderUserId}::uuid,
          ${competitionStatusVersion}, ${replay.replayHash}, ${required.competitionEventId}::uuid,
          ${context.occurredAt.toISOString()}::timestamptz
        )`.execute(transaction);
      }
      if ((normalized.effectiveDisposition === 'ANNUL'
        || normalized.effectiveDisposition === 'REPEAT') && row.cooldown_id) {
        const cooldownEventId = requiredIds(ids, ['cooldownEventId'] as const).cooldownEventId;
        await sql`update competition.pair_cooldowns
          set invalidated_at = ${context.occurredAt.toISOString()}::timestamptz
          where cooldown_id = ${row.cooldown_id}::uuid and invalidated_at is null`.execute(transaction);
        relatedEvents.push({ eventId: cooldownEventId, eventName: 'PairCooldownRemoved', schemaVersion: 1,
          aggregateType: 'PairCooldown', aggregateId: row.cooldown_id, aggregateVersion: 2,
          transitionId: 'CD-03', payload: { cooldownId: row.cooldown_id,
            resultId: row.result_id, integrityDecisionId: required.decisionId },
          metadata: { policyVersion: RESULT_POLICY_VERSION } });
      }
      relatedEvents.unshift(
        { eventId: required.resultEventId,
          eventName: normalized.effectiveDisposition === 'UPHOLD' ? 'ResultUpheld'
            : normalized.effectiveDisposition === 'CORRECT' ? 'ResultCorrected'
              : normalized.effectiveDisposition === 'REPEAT' ? 'RepeatSessionOrdered' : 'ResultAnnulled',
          schemaVersion: 1, aggregateType: 'Result', aggregateId: row.result_id,
          aggregateVersion: resultNextVersion, transitionId: normalized.effectiveDisposition === 'UPHOLD'
            ? 'R-05' : normalized.effectiveDisposition === 'CORRECT' ? 'R-06'
              : normalized.effectiveDisposition === 'REPEAT' ? 'R-08' : 'R-07',
          payload: { resultId: row.result_id, caseId: row.case_id,
            decisionId: required.decisionId, effectiveOutcomeCode: effectiveOutcome,
            effectiveWinnerUserId: effectiveWinner, publicReasonCategory: row.category },
          metadata: { policyVersion: INTEGRITY_POLICY_VERSION } },
        { eventId: required.challengeEventId,
          eventName: normalized.effectiveDisposition === 'REPEAT'
            ? 'RepeatSessionOrdered' : 'IntegrityDecisionApplied', schemaVersion: 1,
          aggregateType: 'Challenge', aggregateId: row.challenge_id,
          aggregateVersion: challengeNextVersion,
          transitionId: normalized.effectiveDisposition === 'REPEAT' ? 'CH-20' : 'CH-19',
          payload: { challengeId: row.challenge_id, resultId: row.result_id,
            caseId: row.case_id, effectiveDisposition: normalized.effectiveDisposition,
            schedulingDeadlineAt: schedulingDeadlineAt?.toISOString() ?? null },
          metadata: { policyVersion: CHALLENGE_POLICY_VERSION } },
        { eventId: required.competitionEventId, eventName: 'CompetitionProjectionRebuilt',
          schemaVersion: 1, aggregateType: 'Competition', aggregateId: row.competition_id,
          aggregateVersion: competitionNextVersion, transitionId: statusChanged ? 'ST-12' : null,
          payload: { caseId: row.case_id, resultId: row.result_id,
            replayHash: replay.replayHash, publicReasonCategory: row.category,
            championUserId: statusChanged ? replay.championUserId : row.current_champion_user_id,
            contenderUserId: statusChanged ? replay.contenderUserId : row.current_contender_user_id },
          metadata: { policyVersion: INTEGRITY_POLICY_VERSION } },
      );
      const projected = (await integrityRows(transaction, row.case_id))[0]!;
      const recipients = [row.pair_low_id, row.pair_high_id, row.coach_user_id!];
      return {
        responseStatus: 200, response: project(projected, true, command.actor.id!),
        event: { eventId: ids.eventId,
          eventName: normalized.effectiveDisposition === 'UPHOLD' ? 'IntegrityCaseUpheld'
            : normalized.effectiveDisposition === 'CORRECT' ? 'IntegrityCaseCorrected'
              : 'IntegrityCaseAnnulled', schemaVersion: 1,
          transitionId: normalized.effectiveDisposition === 'UPHOLD' ? 'IG-03'
            : normalized.effectiveDisposition === 'CORRECT' ? 'IG-04' : 'IG-05',
          payload: { caseId: row.case_id, resultId: row.result_id,
            requestedDisposition: normalized.disposition,
            effectiveDisposition: normalized.effectiveDisposition,
            publicReasonCategory: row.category, replayHash: replay.replayHash,
            decidedAt: context.occurredAt.toISOString() },
          metadata: { policyVersion: INTEGRITY_POLICY_VERSION } },
        relatedEvents,
        audit: { auditId: ids.auditId, action: `DECIDE_INTEGRITY_${normalized.effectiveDisposition}`,
          transitionId: normalized.effectiveDisposition === 'UPHOLD' ? 'IG-03'
            : normalized.effectiveDisposition === 'CORRECT' ? 'IG-04' : 'IG-05',
          reasonCode: row.category, beforeState: 'UNDER_REVIEW',
          afterState: normalized.terminalState,
          metadata: { decisionId: required.decisionId, reason: normalized.reason,
            requestedDisposition: normalized.disposition, replayHash: replay.replayHash } },
        outbox: [
          { messageId: ids.outboxMessageId, topic: 'competition.integrity-case.decided.v1',
            payload: { caseId: row.case_id, resultId: row.result_id,
              competitionId: row.competition_id,
              effectiveDisposition: normalized.effectiveDisposition,
              ...(schedulingDeadlineAt ? { timer: {
                commandType: 'EXPIRE_CHALLENGE_SCHEDULING', aggregateType: 'Challenge',
                aggregateId: row.challenge_id, expectedState: 'ACCEPTED_UNSCHEDULED',
                expectedVersion: challengeNextVersion, deadlineAt: schedulingDeadlineAt.toISOString(),
                policyVersion: CHALLENGE_POLICY_VERSION,
                idempotencyKey: `challenge:${row.challenge_id}:expire-scheduling:v${challengeNextVersion}`,
              } } : {}) } },
          { messageId: notice.messageId, topic: 'notification.in_app.v1', payload: {
            notifications: recipients.map((recipientUserId, index) => ({
              notificationId: notice.ids[index]!, recipientUserId, category: 'MANDATORY',
              renderKey: 'result.integrity-review-decided',
              actionTarget: { type: 'RESULT', resultId: row.result_id },
              payload: { caseId: row.case_id, publicReasonCategory: row.category,
                disposition: normalized.effectiveDisposition }, deadlineAt: null,
            })),
          } },
        ],
      };
    },
  });
}
