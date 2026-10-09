import {
  CHALLENGE_POLICY_VERSION,
  RESULT_POLICY_VERSION,
  ResultConflictError,
  ResultPermissionDeniedError,
  acceptedChallengeSchedulingDeadline,
  assertAppealCanBeWithdrawn,
  assertAppealReviewCanStart,
  deriveProvisionalStatusTransition,
  normalizeAppealResponse,
  normalizeAppealDecision,
  normalizeAppealSlaExtension,
  type AppealDecision,
  type AppealResponseRole,
  type AppealSlaExtensionHours,
  type AppealState,
  type ChallengeStake,
  type CommandEnvelope,
  type ResultOutcomeCode,
  type ResultState,
  type StatusTransitionType,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import { executeCriticalCommand, type ExecutedCommand, type RelatedDomainEventDraft } from './platform-command.js';

export interface StartAppealReviewPayload {
  readonly appealId: string;
}

export interface DecideAppealPayload {
  readonly appealId: string;
  readonly decision: AppealDecision;
  readonly reason: string;
}

export interface AddAppealResponsePayload {
  readonly appealId: string;
  readonly statement: string;
}

export interface WithdrawAppealPayload {
  readonly appealId: string;
}

export interface ExtendAppealSlaPayload {
  readonly appealId: string;
  readonly durationHours: AppealSlaExtensionHours;
  readonly reason: string;
}

export interface AppealEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly decisionId?: string;
  readonly responseId?: string;
  readonly withdrawalId?: string;
  readonly extensionId?: string;
  readonly resultEventId?: string;
  readonly challengeEventId?: string;
  readonly statusFinalizationId?: string;
  readonly statusCompensationId?: string;
  readonly statusEventId?: string;
  readonly cooldownEventId?: string;
  readonly notificationOutboxMessageId?: string;
  readonly notificationIds?: readonly string[];
}

export interface AppealResponseProjection {
  readonly responseId: string;
  readonly responderUserId: string;
  readonly responderDisplayName: string;
  readonly responderRole: AppealResponseRole;
  readonly statement: string;
  readonly submittedAt: string;
}

export interface AppealSlaExtensionProjection {
  readonly durationHours: AppealSlaExtensionHours;
  readonly reason: string;
  readonly extendedBy: string;
  readonly extendedAt: string;
  readonly previousDueAt: string;
  readonly extendedDueAt: string;
}

export interface AppealProjection {
  readonly appealId: string;
  readonly resultId: string;
  readonly challengeId: string;
  readonly state: AppealState;
  readonly appellantUserId: string;
  readonly appellantDisplayName: string;
  readonly reasonCode: string;
  readonly statement: string;
  readonly submittedAt: string;
  readonly responseDeadlineAt: string;
  readonly responses: AppealResponseProjection[];
  readonly originalSlaDueAt: string;
  readonly slaDueAt: string;
  readonly slaExtension: AppealSlaExtensionProjection | null;
  readonly withdrawnAt: string | null;
  readonly assignedReviewerUserId: string | null;
  readonly reviewStartedAt: string | null;
  readonly decision: AppealDecision | null;
  readonly decisionReason: string | null;
  readonly decidedAt: string | null;
  readonly resultState: ResultState;
  readonly recordedOutcomeCode: ResultOutcomeCode;
  readonly effectiveOutcomeCode: ResultOutcomeCode | null;
  readonly recordedWinnerUserId: string | null;
  readonly effectiveWinnerUserId: string | null;
  readonly participantUserIds: [string, string];
  readonly coachUserId: string | null;
  readonly viewerCanStartReview: boolean;
  readonly viewerCanDecide: boolean;
  readonly viewerCanRespond: boolean;
  readonly viewerCanWithdraw: boolean;
  readonly viewerCanExtendSla: boolean;
  readonly version: number;
}

interface AppealRow {
  readonly appeal_id: string;
  readonly result_id: string;
  readonly challenge_id: string;
  readonly state: AppealState;
  readonly appellant_user_id: string;
  readonly appellant_display_name: string;
  readonly reason_code: string;
  readonly statement: string;
  readonly submitted_at: Date;
  readonly response_deadline_at: Date;
  readonly sla_due_at: Date;
  readonly extended_due_at: Date | null;
  readonly extension_duration_hours: number | null;
  readonly extension_reason: string | null;
  readonly extended_by: string | null;
  readonly extended_at: Date | null;
  readonly previous_due_at: Date | null;
  readonly withdrawn_at: Date | null;
  readonly responses: readonly {
    readonly responseId: string;
    readonly responderUserId: string;
    readonly responderDisplayName: string;
    readonly responderRole: AppealResponseRole;
    readonly statement: string;
    readonly submittedAt: string;
  }[];
  readonly assigned_reviewer_id: string | null;
  readonly review_started_at: Date | null;
  readonly decision: AppealDecision | null;
  readonly decision_reason: string | null;
  readonly decided_at: Date | null;
  readonly appeal_version: string;
  readonly result_state: ResultState;
  readonly result_version: string;
  readonly appeal_deadline_at: Date;
  readonly recorded_outcome_code: ResultOutcomeCode;
  readonly winner_user_id: string | null;
  readonly loser_user_id: string | null;
  readonly effective_outcome_code: ResultOutcomeCode | null;
  readonly effective_winner_user_id: string | null;
  readonly pair_low_id: string;
  readonly pair_high_id: string;
  readonly coach_user_id: string | null;
  readonly challenge_state: string;
  readonly challenge_version: string;
  readonly cycle_no: number;
  readonly competition_id: string;
  readonly competition_version: string;
  readonly competition_status_version: string;
  readonly current_champion_user_id: string | null;
  readonly current_contender_user_id: string | null;
  readonly status_lock_result_id: string | null;
  readonly effective_stake: ChallengeStake;
  readonly transition_id: string | null;
  readonly transition_type: StatusTransitionType | null;
  readonly before_champion_user_id: string | null;
  readonly before_contender_user_id: string | null;
  readonly before_status_version: string | null;
  readonly after_champion_user_id: string | null;
  readonly after_contender_user_id: string | null;
  readonly cooldown_id: string | null;
}

async function hasCentralGrant(
  database: Kysely<Database> | Transaction<Database>,
  userId: string,
): Promise<boolean> {
  const result = await sql<{ readonly allowed: boolean }>`
    select exists (
      select 1 from community.role_grants
      where user_id = ${userId}::uuid and role = 'CENTRAL_ADMIN'
        and scope_type = 'GLOBAL' and scope_id is null and state = 'ACTIVE'
        and (expires_at is null or expires_at > clock_timestamp())
    ) as allowed
  `.execute(database);
  return result.rows[0]?.allowed ?? false;
}

async function appealRows(
  database: Kysely<Database> | Transaction<Database>,
  appealId?: string,
  lock = false,
): Promise<readonly AppealRow[]> {
  const result = await sql<AppealRow>`
    select appeal.appeal_id, appeal.result_id, appeal.challenge_id, appeal.state,
      appeal.appellant_user_id, appellant.display_name as appellant_display_name,
      appeal.reason_code, appeal.statement, appeal.submitted_at,
      appeal.response_deadline_at, appeal.sla_due_at, appeal.assigned_reviewer_id,
      extension.extended_due_at, extension.duration_hours as extension_duration_hours,
      extension.reason as extension_reason, extension.extended_by, extension.extended_at,
      extension.previous_due_at, withdrawal.withdrawn_at,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'responseId', response.response_id,
          'responderUserId', response.responder_user_id,
          'responderDisplayName', responder.display_name,
          'responderRole', response.responder_role,
          'statement', response.statement,
          'submittedAt', response.submitted_at
        ) order by response.submitted_at, response.response_id)
        from competition.appeal_responses as response
        join identity.users as responder on responder.user_id = response.responder_user_id
        where response.appeal_id = appeal.appeal_id
      ), '[]'::jsonb) as responses,
      appeal.review_started_at, appeal.decision, appeal.decision_reason, appeal.decided_at,
      appeal.version::text as appeal_version,
      result.state as result_state, result.version::text as result_version,
      result.appeal_deadline_at,
      coalesce(correction_decision.effective_outcome_code,
        result.recorded_outcome_code) as recorded_outcome_code,
      case when correction_decision.decision_id is not null
        then correction_decision.effective_winner_user_id
        else result.winner_user_id end as winner_user_id,
      case when correction_decision.decision_id is not null
        then correction_decision.effective_loser_user_id
        else result.loser_user_id end as loser_user_id,
      decision.effective_outcome_code, decision.effective_winner_user_id,
      challenge.pair_low_id, challenge.pair_high_id, result.coach_user_id,
      challenge.state as challenge_state, challenge.version::text as challenge_version,
      challenge.cycle_no,
      competition.competition_id, competition.version::text as competition_version,
      competition.status_version::text as competition_status_version,
      competition.champion_user_id as current_champion_user_id,
      competition.contender_user_id as current_contender_user_id,
      competition.status_lock_result_id,
      coalesce(snapshot.effective_stake, challenge.stake) as effective_stake,
      transition.transition_id, transition.transition_type,
      transition.before_champion_user_id, transition.before_contender_user_id,
      transition.before_status_version::text as before_status_version,
      transition.after_champion_user_id, transition.after_contender_user_id,
      cooldown.cooldown_id
    from competition.appeals as appeal
    join identity.users as appellant on appellant.user_id = appeal.appellant_user_id
    join competition.results as result on result.result_id = appeal.result_id
    join competition.challenges as challenge on challenge.challenge_id = appeal.challenge_id
    join competition.competitions as competition on competition.competition_id = challenge.competition_id
    left join scheduling.session_competitive_snapshots as snapshot
      on snapshot.snapshot_id = result.competitive_snapshot_id
    left join competition.status_transitions as transition
      on transition.source_result_id = result.result_id
    left join competition.pair_cooldowns as cooldown
      on cooldown.source_result_id = result.result_id and cooldown.invalidated_at is null
    left join competition.appeal_decisions as decision on decision.appeal_id = appeal.appeal_id
    left join competition.technical_correction_decisions as correction_decision
      on correction_decision.result_id = result.result_id
    left join competition.appeal_sla_extensions as extension on extension.appeal_id = appeal.appeal_id
    left join competition.appeal_withdrawals as withdrawal on withdrawal.appeal_id = appeal.appeal_id
    where (${appealId ?? null}::uuid is null or appeal.appeal_id = ${appealId ?? null}::uuid)
    order by appeal.submitted_at, appeal.appeal_id
    ${lock ? sql`for update of appeal, result, challenge, competition` : sql``}
  `.execute(database);
  return result.rows;
}

function projectAppeal(row: AppealRow, viewerUserId: string, now = new Date()): AppealProjection {
  const responseActorIds = new Set(row.responses.map((response) => response.responderUserId));
  const canParticipate = row.state === 'SUBMITTED' || row.state === 'UNDER_REVIEW';
  const isOpponent = [row.pair_low_id, row.pair_high_id].includes(viewerUserId)
    && viewerUserId !== row.appellant_user_id;
  const isCoach = row.coach_user_id === viewerUserId;
  return {
    appealId: row.appeal_id,
    resultId: row.result_id,
    challengeId: row.challenge_id,
    state: row.state,
    appellantUserId: row.appellant_user_id,
    appellantDisplayName: row.appellant_display_name,
    reasonCode: row.reason_code,
    statement: row.statement,
    submittedAt: row.submitted_at.toISOString(),
    responseDeadlineAt: row.response_deadline_at.toISOString(),
    responses: [...row.responses],
    originalSlaDueAt: row.sla_due_at.toISOString(),
    slaDueAt: (row.extended_due_at ?? row.sla_due_at).toISOString(),
    slaExtension: row.extended_due_at === null ? null : {
      durationHours: row.extension_duration_hours as AppealSlaExtensionHours,
      reason: row.extension_reason!,
      extendedBy: row.extended_by!,
      extendedAt: row.extended_at!.toISOString(),
      previousDueAt: row.previous_due_at!.toISOString(),
      extendedDueAt: row.extended_due_at.toISOString(),
    },
    withdrawnAt: row.withdrawn_at?.toISOString() ?? null,
    assignedReviewerUserId: row.assigned_reviewer_id,
    reviewStartedAt: row.review_started_at?.toISOString() ?? null,
    decision: row.decision,
    decisionReason: row.decision_reason,
    decidedAt: row.decided_at?.toISOString() ?? null,
    resultState: row.result_state,
    recordedOutcomeCode: row.recorded_outcome_code,
    effectiveOutcomeCode: row.effective_outcome_code
      ?? (row.state === 'DECIDED_ANNULLED' || row.state === 'DECIDED_REPEAT'
        ? null
        : row.recorded_outcome_code),
    recordedWinnerUserId: row.winner_user_id,
    effectiveWinnerUserId: row.effective_winner_user_id
      ?? (row.state === 'DECIDED_ANNULLED' || row.state === 'DECIDED_REPEAT'
        ? null
        : row.winner_user_id),
    participantUserIds: [row.pair_low_id, row.pair_high_id],
    coachUserId: row.coach_user_id,
    viewerCanStartReview: row.state === 'SUBMITTED'
      && ![row.pair_low_id, row.pair_high_id, row.coach_user_id].includes(viewerUserId),
    viewerCanDecide: row.state === 'UNDER_REVIEW' && row.assigned_reviewer_id === viewerUserId,
    viewerCanRespond: canParticipate && now < row.response_deadline_at
      && (isOpponent || isCoach) && !responseActorIds.has(viewerUserId),
    viewerCanWithdraw: canParticipate && row.appellant_user_id === viewerUserId,
    viewerCanExtendSla: row.state === 'UNDER_REVIEW'
      && row.assigned_reviewer_id === viewerUserId && row.extended_due_at === null,
    version: Number(row.appeal_version),
  };
}

export async function listAppealsForCentral(
  database: Kysely<Database>,
  centralUserId: string,
): Promise<readonly AppealProjection[]> {
  if (!(await hasCentralGrant(database, centralUserId))) throw new ResultPermissionDeniedError();
  return (await appealRows(database))
    .filter((row) => row.state === 'SUBMITTED' || row.state === 'UNDER_REVIEW')
    .map((row) => projectAppeal(row, centralUserId));
}

export async function readAppealForViewer(
  database: Kysely<Database>,
  resultId: string,
  viewerUserId: string,
  now = new Date(),
): Promise<AppealProjection | null> {
  const row = (await appealRows(database)).find((item) => item.result_id === resultId);
  if (!row) return null;
  const visible = [row.pair_low_id, row.pair_high_id, row.coach_user_id].includes(viewerUserId)
    || await hasCentralGrant(database, viewerUserId);
  if (!visible) throw new ResultPermissionDeniedError();
  return projectAppeal(row, viewerUserId, now);
}

function requiredIds<T extends readonly (keyof AppealEffectIds)[]>(
  ids: AppealEffectIds,
  keys: T,
): { readonly [K in T[number]]: string } {
  return Object.fromEntries(keys.map((key) => {
    const value = ids[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`Appeal effect ID ${String(key)} is required`);
    }
    return [key, value];
  })) as { readonly [K in T[number]]: string };
}

function requireNotifications(ids: AppealEffectIds): {
  readonly messageId: string;
  readonly notificationIds: readonly [string, string, string];
} {
  const messageId = requiredIds(ids, ['notificationOutboxMessageId'] as const)
    .notificationOutboxMessageId;
  if (!ids.notificationIds || ids.notificationIds.length < 3) {
    throw new TypeError('Three Appeal notification IDs are required');
  }
  return { messageId, notificationIds: [ids.notificationIds[0]!, ids.notificationIds[1]!, ids.notificationIds[2]!] };
}

export async function addAppealResponse(
  database: Kysely<Database>,
  command: CommandEnvelope<AddAppealResponsePayload>,
  ids: AppealEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<AppealProjection>> {
  if (!command.actor.id || command.aggregateType !== 'Appeal'
    || command.payload.appealId !== command.aggregateId) throw new ResultPermissionDeniedError();
  const responseId = requiredIds(ids, ['responseId'] as const).responseId;
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = (await appealRows(transaction, command.aggregateId, true))[0];
      if (!row) throw new ResultPermissionDeniedError();
      const normalized = normalizeAppealResponse({
        state: row.state,
        responderUserId: command.actor.id!,
        appellantUserId: row.appellant_user_id,
        participantUserIds: [row.pair_low_id, row.pair_high_id],
        coachUserId: row.coach_user_id,
        responseDeadlineAt: row.response_deadline_at,
        occurredAt: context.occurredAt,
        alreadyResponded: row.responses.some((response) => response.responderUserId === command.actor.id),
        statement: command.payload.statement,
      });
      await sql`
        insert into competition.appeal_responses (
          response_id, appeal_id, responder_user_id, responder_role, statement, submitted_at
        ) values (
          ${responseId}::uuid, ${row.appeal_id}::uuid, ${command.actor.id}::uuid,
          ${normalized.role}, ${normalized.statement}, ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        update competition.appeals set version = ${context.nextVersion}
        where appeal_id = ${row.appeal_id}::uuid
          and state in ('SUBMITTED', 'UNDER_REVIEW')
      `.execute(transaction);
      const projected = (await appealRows(transaction, row.appeal_id))[0];
      if (!projected) throw new ResultConflictError('APPEAL_RESPONSE_WINDOW_CLOSED');
      return {
        responseStatus: 200,
        response: projectAppeal(projected, command.actor.id!, context.occurredAt),
        event: {
          eventId: ids.eventId, eventName: 'AppealResponseAdded', schemaVersion: 1,
          transitionId: 'A-03',
          payload: {
            appealId: row.appeal_id, responseId, responderUserId: command.actor.id,
            responderRole: normalized.role, statement: normalized.statement,
            submittedAt: context.occurredAt.toISOString(),
          },
          metadata: { policyVersion: RESULT_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId, action: 'ADD_APPEAL_RESPONSE', transitionId: 'A-03',
          reasonCode: normalized.role, beforeState: row.state, afterState: row.state,
          metadata: { responseId, resultId: row.result_id },
        },
        outbox: [{
          messageId: ids.outboxMessageId, topic: 'competition.appeal.response-added.v1',
          payload: { appealId: row.appeal_id, resultId: row.result_id, responseId },
        }],
      };
    },
  });
}

export async function extendAppealSla(
  database: Kysely<Database>,
  command: CommandEnvelope<ExtendAppealSlaPayload>,
  ids: AppealEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<AppealProjection>> {
  if (!command.actor.id || command.aggregateType !== 'Appeal'
    || command.payload.appealId !== command.aggregateId) throw new ResultPermissionDeniedError();
  const extensionId = requiredIds(ids, ['extensionId'] as const).extensionId;
  const notifications = requireNotifications(ids);
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      if (!(await hasCentralGrant(transaction, command.actor.id!))) throw new ResultPermissionDeniedError();
      const row = (await appealRows(transaction, command.aggregateId, true))[0];
      if (!row) throw new ResultPermissionDeniedError();
      const normalized = normalizeAppealSlaExtension({
        state: row.state,
        assignedReviewerUserId: row.assigned_reviewer_id,
        reviewerUserId: command.actor.id!,
        alreadyExtended: row.extended_due_at !== null,
        currentDueAt: row.extended_due_at ?? row.sla_due_at,
        durationHours: command.payload.durationHours,
        reason: command.payload.reason,
      });
      const previousDueAt = row.extended_due_at ?? row.sla_due_at;
      await sql`
        insert into competition.appeal_sla_extensions (
          extension_id, appeal_id, extended_by, duration_hours, reason,
          previous_due_at, extended_due_at, extended_at
        ) values (
          ${extensionId}::uuid, ${row.appeal_id}::uuid, ${command.actor.id}::uuid,
          ${normalized.durationHours}, ${normalized.reason},
          ${previousDueAt.toISOString()}::timestamptz,
          ${normalized.extendedDueAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        update competition.appeals set version = ${context.nextVersion}
        where appeal_id = ${row.appeal_id}::uuid and state = 'UNDER_REVIEW'
      `.execute(transaction);
      const projected = (await appealRows(transaction, row.appeal_id))[0];
      if (!projected) throw new ResultConflictError('APPEAL_SLA_EXTENSION_NOT_ALLOWED');
      const recipients = [row.pair_low_id, row.pair_high_id, row.coach_user_id]
        .filter((recipientUserId): recipientUserId is string => recipientUserId !== null);
      return {
        responseStatus: 200,
        response: projectAppeal(projected, command.actor.id!, context.occurredAt),
        event: {
          eventId: ids.eventId, eventName: 'AppealSlaExtended', schemaVersion: 1,
          transitionId: 'A-05',
          payload: {
            appealId: row.appeal_id, extensionId, reviewerUserId: command.actor.id,
            durationHours: normalized.durationHours, reason: normalized.reason,
            previousDueAt: previousDueAt.toISOString(),
            extendedDueAt: normalized.extendedDueAt.toISOString(),
          },
          metadata: { policyVersion: RESULT_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId, action: 'EXTEND_APPEAL_SLA', transitionId: 'A-05',
          reasonCode: 'CENTRAL_REVIEW_EXTENSION', beforeState: row.state, afterState: row.state,
          metadata: { extensionId, reason: normalized.reason },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId, topic: 'competition.appeal.sla-extended.v1',
            payload: {
              appealId: row.appeal_id, resultId: row.result_id,
              extendedDueAt: normalized.extendedDueAt.toISOString(),
            },
          },
          {
            messageId: notifications.messageId, topic: 'notification.in_app.v1',
            payload: {
              notifications: recipients.map((recipientUserId, index) => ({
                notificationId: notifications.notificationIds[index]!, recipientUserId,
                category: 'SERVICE', renderKey: 'appeal.sla-extended',
                actionTarget: { type: 'RESULT', resultId: row.result_id },
                payload: {
                  appealId: row.appeal_id, reason: normalized.reason,
                  extendedDueAt: normalized.extendedDueAt.toISOString(),
                },
                deadlineAt: normalized.extendedDueAt.toISOString(),
              })),
            },
          },
        ],
      };
    },
  });
}

export async function withdrawAppeal(
  database: Kysely<Database>,
  command: CommandEnvelope<WithdrawAppealPayload>,
  ids: AppealEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<AppealProjection>> {
  if (!command.actor.id || command.aggregateType !== 'Appeal'
    || command.payload.appealId !== command.aggregateId) throw new ResultPermissionDeniedError();
  const required = requiredIds(ids, [
    'withdrawalId', 'resultEventId', 'challengeEventId',
  ] as const);
  const notifications = requireNotifications(ids);
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = (await appealRows(transaction, command.aggregateId, true))[0];
      if (!row) throw new ResultPermissionDeniedError();
      assertAppealCanBeWithdrawn({
        state: row.state, actorUserId: command.actor.id!, appellantUserId: row.appellant_user_id,
      });
      if (row.result_state !== 'UNDER_APPEAL' || row.challenge_state !== 'UNDER_APPEAL') {
        throw new ResultConflictError('APPEAL_WITHDRAWAL_NOT_ALLOWED');
      }
      await sql`
        insert into competition.appeal_withdrawals (
          withdrawal_id, appeal_id, withdrawn_by, withdrawn_at
        ) values (
          ${required.withdrawalId}::uuid, ${row.appeal_id}::uuid, ${command.actor.id}::uuid,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        update competition.appeals set state = 'WITHDRAWN', version = ${context.nextVersion}
        where appeal_id = ${row.appeal_id}::uuid and state in ('SUBMITTED', 'UNDER_REVIEW')
      `.execute(transaction);

      const satisfiedResult = await sql<{ readonly user_id: string }>`
        select waiver.user_id
        from competition.appeal_waivers as waiver
        where waiver.result_id = ${row.result_id}::uuid
        union
        select appeal.appellant_user_id
        from competition.appeals as appeal
        join competition.appeal_withdrawals as withdrawal on withdrawal.appeal_id = appeal.appeal_id
        where appeal.result_id = ${row.result_id}::uuid
      `.execute(transaction);
      const satisfied = new Set(satisfiedResult.rows.map((item) => item.user_id));
      const eligible = row.loser_user_id
        ? [row.loser_user_id]
        : [row.pair_low_id, row.pair_high_id];
      const finalizes = context.occurredAt >= row.appeal_deadline_at
        || eligible.every((userId) => satisfied.has(userId));
      const resultNextVersion = Number(row.result_version) + 1;
      const challengeNextVersion = Number(row.challenge_version) + 1;
      const relatedEvents: RelatedDomainEventDraft[] = [];

      if (finalizes) {
        await sql`
          update competition.results
          set state = 'FINAL', finalized_at = ${context.occurredAt.toISOString()}::timestamptz,
            version = ${resultNextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where result_id = ${row.result_id}::uuid and state = 'UNDER_APPEAL'
        `.execute(transaction);
        await sql`
          update competition.challenges
          set state = 'COMPLETED', decided_at = ${context.occurredAt.toISOString()}::timestamptz,
            version = ${challengeNextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where challenge_id = ${row.challenge_id}::uuid and state = 'UNDER_APPEAL'
        `.execute(transaction);
        await sql`
          update competition.challenge_participant_obligations
          set released_at = ${context.occurredAt.toISOString()}::timestamptz,
            release_reason = 'RESULT_FINAL'
          where challenge_id = ${row.challenge_id}::uuid and released_at is null
        `.execute(transaction);
        relatedEvents.push(
          {
            eventId: required.resultEventId, eventName: 'ResultFinalized', schemaVersion: 1,
            aggregateType: 'Result', aggregateId: row.result_id,
            aggregateVersion: resultNextVersion, transitionId: 'R-04',
            payload: {
              resultId: row.result_id, challengeId: row.challenge_id,
              finalizedAt: context.occurredAt.toISOString(), reason: 'ELIGIBLE_ACTORS_WITHDREW',
            },
            metadata: { policyVersion: RESULT_POLICY_VERSION },
          },
          {
            eventId: required.challengeEventId, eventName: 'ChallengeCompleted', schemaVersion: 1,
            aggregateType: 'Challenge', aggregateId: row.challenge_id,
            aggregateVersion: challengeNextVersion, transitionId: 'CH-17',
            payload: {
              challengeId: row.challenge_id, resultId: row.result_id,
              finalizedAt: context.occurredAt.toISOString(),
            },
            metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
          },
        );
        if (row.transition_id) {
          if (row.status_lock_result_id !== row.result_id) {
            throw new ResultConflictError('COMPETITION_STATUS_LOCKED');
          }
          const statusIds = requiredIds(ids, ['statusFinalizationId', 'statusEventId'] as const);
          const competitionAggregateVersion = Number(row.competition_version) + 1;
          const competitionStatusVersion = Number(row.competition_status_version) + 1;
          await sql`
            update competition.competitions
            set status_lock_result_id = null, status_version = ${competitionStatusVersion},
              version = ${competitionAggregateVersion},
              updated_at = ${context.occurredAt.toISOString()}::timestamptz
            where competition_id = ${row.competition_id}::uuid
              and status_lock_result_id = ${row.result_id}::uuid
          `.execute(transaction);
          await sql`
            insert into competition.status_transition_finalizations (
              finalization_id, transition_id, result_id, finalized_by_event_id,
              competition_status_version, finalized_at
            ) values (
              ${statusIds.statusFinalizationId}::uuid, ${row.transition_id}::uuid,
              ${row.result_id}::uuid, ${required.resultEventId}::uuid,
              ${competitionStatusVersion}, ${context.occurredAt.toISOString()}::timestamptz
            )
          `.execute(transaction);
          relatedEvents.push({
            eventId: statusIds.statusEventId, eventName: 'StatusTransitionFinalized', schemaVersion: 1,
            aggregateType: 'Competition', aggregateId: row.competition_id,
            aggregateVersion: competitionAggregateVersion, transitionId: 'ST-13',
            payload: {
              resultId: row.result_id, transitionId: row.transition_id,
              championUserId: row.after_champion_user_id,
              contenderUserId: row.after_contender_user_id,
              statusVersion: competitionStatusVersion,
            },
            metadata: { policyVersion: RESULT_POLICY_VERSION },
          });
        }
      } else {
        await sql`
          update competition.results
          set state = 'RECORDED', version = ${resultNextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where result_id = ${row.result_id}::uuid and state = 'UNDER_APPEAL'
        `.execute(transaction);
        await sql`
          update competition.challenges
          set state = 'RESULT_RECORDED', version = ${challengeNextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where challenge_id = ${row.challenge_id}::uuid and state = 'UNDER_APPEAL'
        `.execute(transaction);
      }

      const projected = (await appealRows(transaction, row.appeal_id))[0];
      if (!projected) throw new ResultConflictError('APPEAL_WITHDRAWAL_NOT_ALLOWED');
      const recipients = [row.pair_low_id, row.pair_high_id, row.coach_user_id!];
      return {
        responseStatus: 200,
        response: projectAppeal(projected, command.actor.id!, context.occurredAt),
        event: {
          eventId: ids.eventId, eventName: 'AppealWithdrawn', schemaVersion: 1,
          transitionId: 'A-04',
          payload: {
            appealId: row.appeal_id, resultId: row.result_id,
            withdrawnBy: command.actor.id, withdrawnAt: context.occurredAt.toISOString(),
            resultFinalized: finalizes,
          },
          metadata: { policyVersion: RESULT_POLICY_VERSION },
        },
        relatedEvents,
        audit: {
          auditId: ids.auditId, action: 'WITHDRAW_APPEAL', transitionId: 'A-04',
          reasonCode: 'APPELLANT_WITHDRAWAL', beforeState: row.state, afterState: 'WITHDRAWN',
          metadata: { resultId: row.result_id, resultFinalized: finalizes },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId, topic: 'competition.appeal.withdrawn.v1',
            payload: {
              appealId: row.appeal_id, resultId: row.result_id, resultFinalized: finalizes,
              ...(!finalizes ? {
                timer: {
                  commandType: 'FINALIZE_RESULT', aggregateType: 'Result',
                  aggregateId: row.result_id, expectedState: 'RECORDED',
                  expectedVersion: resultNextVersion,
                  deadlineAt: row.appeal_deadline_at.toISOString(),
                  policyVersion: RESULT_POLICY_VERSION,
                  idempotencyKey: `result:${row.result_id}:finalize:v${resultNextVersion}`,
                },
              } : {}),
            },
          },
          {
            messageId: notifications.messageId, topic: 'notification.in_app.v1',
            payload: {
              notifications: recipients.map((recipientUserId, index) => ({
                notificationId: notifications.notificationIds[index]!, recipientUserId,
                category: 'MANDATORY', renderKey: 'appeal.withdrawn',
                actionTarget: { type: 'RESULT', resultId: row.result_id },
                payload: { appealId: row.appeal_id, resultFinalized: finalizes }, deadlineAt: null,
              })),
            },
          },
        ],
      };
    },
  });
}

export async function startAppealReview(
  database: Kysely<Database>,
  command: CommandEnvelope<StartAppealReviewPayload>,
  ids: AppealEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<AppealProjection>> {
  if (!command.actor.id || command.aggregateType !== 'Appeal'
    || command.payload.appealId !== command.aggregateId) throw new ResultPermissionDeniedError();
  const notifications = requireNotifications(ids);
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      if (!(await hasCentralGrant(transaction, command.actor.id!))) throw new ResultPermissionDeniedError();
      const row = (await appealRows(transaction, command.aggregateId, true))[0];
      if (!row) throw new ResultPermissionDeniedError();
      assertAppealReviewCanStart({
        state: row.state,
        reviewerUserId: command.actor.id!,
        protectedUserIds: [row.pair_low_id, row.pair_high_id, row.coach_user_id].filter(
          (value): value is string => value !== null,
        ),
      });
      await sql`
        update competition.appeals
        set state = 'UNDER_REVIEW', assigned_reviewer_id = ${command.actor.id}::uuid,
          review_started_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = ${context.nextVersion}
        where appeal_id = ${row.appeal_id}::uuid and state = 'SUBMITTED'
      `.execute(transaction);
      const projectedRow = (await appealRows(transaction, row.appeal_id))[0];
      if (!projectedRow) throw new ResultConflictError('APPEAL_NOT_SUBMITTED');
      return {
        responseStatus: 200,
        response: projectAppeal(projectedRow, command.actor.id!),
        event: {
          eventId: ids.eventId, eventName: 'AppealReviewStarted', schemaVersion: 1,
          transitionId: 'A-02',
          payload: {
            appealId: row.appeal_id, resultId: row.result_id,
            reviewerUserId: command.actor.id, startedAt: context.occurredAt.toISOString(),
            slaDueAt: row.sla_due_at.toISOString(),
          },
          metadata: { policyVersion: RESULT_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId, action: 'START_APPEAL_REVIEW', transitionId: 'A-02',
          reasonCode: null, beforeState: 'SUBMITTED', afterState: 'UNDER_REVIEW',
          metadata: { resultId: row.result_id },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId, topic: 'competition.appeal.review-started.v1',
            payload: { appealId: row.appeal_id, resultId: row.result_id },
          },
          {
            messageId: notifications.messageId, topic: 'notification.in_app.v1',
            payload: {
              notifications: [row.pair_low_id, row.pair_high_id, row.coach_user_id!]
                .map((recipientUserId, index) => ({
                  notificationId: notifications.notificationIds[index]!, recipientUserId,
                  category: 'SERVICE', renderKey: 'appeal.review-started',
                  actionTarget: { type: 'RESULT', resultId: row.result_id },
                  payload: { appealId: row.appeal_id, slaDueAt: row.sla_due_at.toISOString() },
                  deadlineAt: row.sla_due_at.toISOString(),
                })),
            },
          },
        ],
      };
    },
  });
}

function decisionEventName(decision: AppealDecision): string {
  return decision === 'UPHOLD' ? 'AppealDecidedUpheld'
    : decision === 'REVERSE' ? 'AppealDecidedReversed'
      : decision === 'ANNUL' ? 'AppealDecidedAnnulled' : 'AppealDecidedRepeat';
}

export async function decideAppeal(
  database: Kysely<Database>,
  command: CommandEnvelope<DecideAppealPayload>,
  ids: AppealEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<AppealProjection>> {
  if (!command.actor.id || command.aggregateType !== 'Appeal'
    || command.payload.appealId !== command.aggregateId) throw new ResultPermissionDeniedError();
  const required = requiredIds(ids, ['decisionId', 'resultEventId', 'challengeEventId'] as const);
  const notifications = requireNotifications(ids);
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      if (!(await hasCentralGrant(transaction, command.actor.id!))) throw new ResultPermissionDeniedError();
      const row = (await appealRows(transaction, command.aggregateId, true))[0];
      if (!row) throw new ResultPermissionDeniedError();
      if (row.result_state !== 'UNDER_APPEAL' || row.challenge_state !== 'UNDER_APPEAL') {
        throw new ResultConflictError('RESULT_APPEAL_ALREADY_DECIDED');
      }
      const normalized = normalizeAppealDecision({
        state: row.state,
        assignedReviewerUserId: row.assigned_reviewer_id,
        reviewerUserId: command.actor.id!,
        decision: command.payload.decision,
        reason: command.payload.reason,
        originalOutcomeCode: row.recorded_outcome_code,
        originalWinnerUserId: row.winner_user_id,
        originalLoserUserId: row.loser_user_id,
        participantUserIds: [row.pair_low_id, row.pair_high_id],
      });
      const resultNextVersion = Number(row.result_version) + 1;
      const challengeNextVersion = Number(row.challenge_version) + 1;
      const decisionEvent = decisionEventName(normalized.decision);
      await sql`
        insert into competition.appeal_decisions (
          decision_id, appeal_id, result_id, reviewer_user_id, decision, reason,
          original_outcome_code, original_winner_user_id, original_loser_user_id,
          effective_outcome_code, effective_winner_user_id, effective_loser_user_id,
          compensation_mode, decided_at
        ) values (
          ${required.decisionId}::uuid, ${row.appeal_id}::uuid, ${row.result_id}::uuid,
          ${command.actor.id}::uuid, ${normalized.decision}, ${normalized.reason},
          ${row.recorded_outcome_code}, ${row.winner_user_id}::uuid, ${row.loser_user_id}::uuid,
          ${normalized.decision === 'ANNUL' || normalized.decision === 'REPEAT'
            ? null : normalized.effectiveOutcomeCode},
          ${normalized.effectiveWinnerUserId}::uuid, ${normalized.effectiveLoserUserId}::uuid,
          ${normalized.compensationMode}, ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        update competition.appeals
        set state = ${normalized.appealState}, decision = ${normalized.decision},
          decision_reason = ${normalized.reason}, decided_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = ${context.nextVersion}
        where appeal_id = ${row.appeal_id}::uuid and state = 'UNDER_REVIEW'
      `.execute(transaction);
      await sql`
        update competition.results
        set state = ${normalized.resultState}, finalized_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = ${resultNextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where result_id = ${row.result_id}::uuid and state = 'UNDER_APPEAL'
      `.execute(transaction);

      const schedulingDeadlineAt = normalized.decision === 'REPEAT'
        ? acceptedChallengeSchedulingDeadline(context.occurredAt)
        : null;
      if (normalized.decision === 'REPEAT') {
        await sql`
          update competition.challenges
          set state = 'ACCEPTED_UNSCHEDULED', cycle_no = cycle_no + 1,
            scheduling_deadline_at = ${schedulingDeadlineAt!.toISOString()}::timestamptz,
            decided_at = null, version = ${challengeNextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where challenge_id = ${row.challenge_id}::uuid and state = 'UNDER_APPEAL'
        `.execute(transaction);
      } else {
        await sql`
          update competition.challenges
          set state = 'COMPLETED', decided_at = ${context.occurredAt.toISOString()}::timestamptz,
            version = ${challengeNextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where challenge_id = ${row.challenge_id}::uuid and state = 'UNDER_APPEAL'
        `.execute(transaction);
        await sql`
          update competition.challenge_participant_obligations
          set released_at = ${context.occurredAt.toISOString()}::timestamptz,
            release_reason = 'APPEAL_DECIDED'
          where challenge_id = ${row.challenge_id}::uuid and released_at is null
        `.execute(transaction);
      }

      const relatedEvents: RelatedDomainEventDraft[] = [];
      if (row.transition_id) {
        if (row.status_lock_result_id !== row.result_id) {
          throw new ResultConflictError('COMPETITION_STATUS_LOCKED');
        }
        const competitionAggregateVersion = Number(row.competition_version) + 1;
        const competitionStatusVersion = Number(row.competition_status_version) + 1;
        if (normalized.decision === 'UPHOLD') {
          const statusIds = requiredIds(ids, ['statusFinalizationId', 'statusEventId'] as const);
          await sql`
            insert into competition.status_transition_finalizations (
              finalization_id, transition_id, result_id, finalized_by_event_id,
              competition_status_version, finalized_at
            ) values (
              ${statusIds.statusFinalizationId}::uuid, ${row.transition_id}::uuid,
              ${row.result_id}::uuid, ${required.resultEventId}::uuid,
              ${competitionStatusVersion}, ${context.occurredAt.toISOString()}::timestamptz
            )
          `.execute(transaction);
          await sql`
            update competition.competitions
            set status_lock_result_id = null, status_version = ${competitionStatusVersion},
              version = ${competitionAggregateVersion},
              updated_at = ${context.occurredAt.toISOString()}::timestamptz
            where competition_id = ${row.competition_id}::uuid
              and status_lock_result_id = ${row.result_id}::uuid
          `.execute(transaction);
          relatedEvents.push({
            eventId: statusIds.statusEventId, eventName: 'StatusTransitionFinalized', schemaVersion: 1,
            aggregateType: 'Competition', aggregateId: row.competition_id,
            aggregateVersion: competitionAggregateVersion, transitionId: 'ST-13',
            payload: { resultId: row.result_id, transitionId: row.transition_id, decisionId: required.decisionId },
            metadata: { policyVersion: RESULT_POLICY_VERSION },
          });
        } else {
          const statusIds = requiredIds(ids, ['statusCompensationId', 'statusEventId'] as const);
          const corrected = normalized.decision === 'REVERSE'
            ? deriveProvisionalStatusTransition({
              stake: row.effective_stake,
              outcomeCode: normalized.effectiveOutcomeCode,
              winnerUserId: normalized.effectiveWinnerUserId,
              loserUserId: normalized.effectiveLoserUserId,
              snapshot: {
                championUserId: row.before_champion_user_id,
                contenderUserId: row.before_contender_user_id,
                statusVersion: Number(row.before_status_version),
              },
            })
            : null;
          const toChampion = corrected?.after.championUserId ?? row.before_champion_user_id;
          const toContender = corrected?.after.contenderUserId ?? row.before_contender_user_id;
          const correctedType = corrected?.type === 'NONE' ? null : corrected?.type ?? null;
          if (normalized.decision === 'REVERSE' && correctedType === null) {
            throw new ResultConflictError('APPEAL_DECISION_INVALID');
          }
          await sql`
            update competition.competitions
            set champion_user_id = ${toChampion}::uuid, contender_user_id = ${toContender}::uuid,
              status_lock_result_id = null, status_version = ${competitionStatusVersion},
              version = ${competitionAggregateVersion},
              updated_at = ${context.occurredAt.toISOString()}::timestamptz
            where competition_id = ${row.competition_id}::uuid
              and status_lock_result_id = ${row.result_id}::uuid
          `.execute(transaction);
          await sql`
            insert into competition.status_transition_compensations (
              compensation_id, source_transition_id, source_result_id, decision_id,
              compensation_mode, corrected_transition_type,
              from_champion_user_id, from_contender_user_id,
              to_champion_user_id, to_contender_user_id,
              competition_status_version, compensated_by_event_id, compensated_at
            ) values (
              ${statusIds.statusCompensationId}::uuid, ${row.transition_id}::uuid,
              ${row.result_id}::uuid, ${required.decisionId}::uuid,
              ${normalized.compensationMode}, ${correctedType},
              ${row.current_champion_user_id}::uuid, ${row.current_contender_user_id}::uuid,
              ${toChampion}::uuid, ${toContender}::uuid,
              ${competitionStatusVersion}, ${statusIds.statusEventId}::uuid,
              ${context.occurredAt.toISOString()}::timestamptz
            )
          `.execute(transaction);
          relatedEvents.push({
            eventId: statusIds.statusEventId,
            eventName: normalized.decision === 'REVERSE'
              ? 'StatusTransitionCompensated' : 'StatusTransitionRolledBack',
            schemaVersion: 1, aggregateType: 'Competition', aggregateId: row.competition_id,
            aggregateVersion: competitionAggregateVersion,
            transitionId: normalized.decision === 'REVERSE' ? 'ST-11' : 'ST-12',
            payload: {
              compensationId: statusIds.statusCompensationId,
              compensatesTransitionId: row.transition_id, decisionId: required.decisionId,
              from: { championUserId: row.current_champion_user_id, contenderUserId: row.current_contender_user_id },
              to: { championUserId: toChampion, contenderUserId: toContender },
              correctedTransitionType: correctedType, statusVersion: competitionStatusVersion,
            },
            metadata: { policyVersion: RESULT_POLICY_VERSION },
          });
        }
      }

      if ((normalized.decision === 'ANNUL' || normalized.decision === 'REPEAT') && row.cooldown_id) {
        const cooldownEventId = requiredIds(ids, ['cooldownEventId'] as const).cooldownEventId;
        await sql`
          update competition.pair_cooldowns
          set invalidated_at = ${context.occurredAt.toISOString()}::timestamptz
          where cooldown_id = ${row.cooldown_id}::uuid and invalidated_at is null
        `.execute(transaction);
        relatedEvents.push({
          eventId: cooldownEventId, eventName: 'PairCooldownRemoved', schemaVersion: 1,
          aggregateType: 'PairCooldown', aggregateId: row.cooldown_id,
          aggregateVersion: 2, transitionId: 'CD-03',
          payload: { cooldownId: row.cooldown_id, resultId: row.result_id, decisionId: required.decisionId },
          metadata: { policyVersion: RESULT_POLICY_VERSION },
        });
      }

      relatedEvents.unshift(
        {
          eventId: required.resultEventId,
          eventName: normalized.decision === 'UPHOLD' ? 'ResultUpheld'
            : normalized.decision === 'REVERSE' ? 'ResultReversed'
              : normalized.decision === 'ANNUL' ? 'ResultAnnulled' : 'RepeatSessionOrdered',
          schemaVersion: 1, aggregateType: 'Result', aggregateId: row.result_id,
          aggregateVersion: resultNextVersion,
          transitionId: normalized.decision === 'UPHOLD' ? 'R-05'
            : normalized.decision === 'REVERSE' ? 'R-06'
              : normalized.decision === 'ANNUL' ? 'R-07' : 'R-08',
          payload: {
            resultId: row.result_id, appealId: row.appeal_id, decisionId: required.decisionId,
            originalOutcomeCode: row.recorded_outcome_code,
            effectiveOutcomeCode: normalized.decision === 'ANNUL' || normalized.decision === 'REPEAT'
              ? null : normalized.effectiveOutcomeCode,
            effectiveWinnerUserId: normalized.effectiveWinnerUserId,
            compensationMode: normalized.compensationMode,
          },
          metadata: { policyVersion: RESULT_POLICY_VERSION },
        },
        {
          eventId: required.challengeEventId,
          eventName: normalized.decision === 'REPEAT' ? 'RepeatSessionOrdered'
            : normalized.decision === 'UPHOLD' ? 'AppealUpheld'
              : normalized.decision === 'REVERSE' ? 'ResultReversed' : 'ResultAnnulled',
          schemaVersion: 1, aggregateType: 'Challenge', aggregateId: row.challenge_id,
          aggregateVersion: challengeNextVersion,
          transitionId: normalized.decision === 'UPHOLD' ? 'CH-18'
            : normalized.decision === 'REPEAT' ? 'CH-20' : 'CH-19',
          payload: {
            challengeId: row.challenge_id, resultId: row.result_id,
            appealId: row.appeal_id, decisionId: required.decisionId,
            cycleNo: normalized.decision === 'REPEAT' ? row.cycle_no + 1 : row.cycle_no,
            schedulingDeadlineAt: schedulingDeadlineAt?.toISOString() ?? null,
          },
          metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
        },
      );

      const projectedRow = (await appealRows(transaction, row.appeal_id))[0];
      if (!projectedRow) throw new ResultConflictError('RESULT_APPEAL_ALREADY_DECIDED');
      const recipients = [row.pair_low_id, row.pair_high_id, row.coach_user_id!];
      return {
        responseStatus: 200,
        response: projectAppeal(projectedRow, command.actor.id!),
        event: {
          eventId: ids.eventId, eventName: decisionEvent, schemaVersion: 1,
          transitionId: normalized.decision === 'UPHOLD' ? 'A-06'
            : normalized.decision === 'REVERSE' ? 'A-07'
              : normalized.decision === 'ANNUL' ? 'A-08' : 'A-09',
          payload: {
            appealId: row.appeal_id, resultId: row.result_id, decisionId: required.decisionId,
            reviewerUserId: command.actor.id, decision: normalized.decision,
            originalOutcomeCode: row.recorded_outcome_code,
            effectiveOutcomeCode: normalized.decision === 'ANNUL' || normalized.decision === 'REPEAT'
              ? null : normalized.effectiveOutcomeCode,
            decidedAt: context.occurredAt.toISOString(),
            compensationMode: normalized.compensationMode,
          },
          metadata: { policyVersion: RESULT_POLICY_VERSION },
        },
        relatedEvents,
        audit: {
          auditId: ids.auditId, action: `DECIDE_APPEAL_${normalized.decision}`,
          transitionId: normalized.decision === 'UPHOLD' ? 'A-06'
            : normalized.decision === 'REVERSE' ? 'A-07'
              : normalized.decision === 'ANNUL' ? 'A-08' : 'A-09',
          reasonCode: normalized.decision, beforeState: 'UNDER_REVIEW',
          afterState: normalized.appealState,
          metadata: { resultId: row.result_id, decisionId: required.decisionId, reason: normalized.reason },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId, topic: 'competition.appeal.decided.v1',
            payload: {
              appealId: row.appeal_id, resultId: row.result_id,
              competitionId: row.competition_id, decision: normalized.decision,
              ...(schedulingDeadlineAt ? {
                timer: {
                  commandType: 'EXPIRE_CHALLENGE_SCHEDULING', aggregateType: 'Challenge',
                  aggregateId: row.challenge_id, expectedState: 'ACCEPTED_UNSCHEDULED',
                  expectedVersion: challengeNextVersion,
                  deadlineAt: schedulingDeadlineAt.toISOString(),
                  policyVersion: CHALLENGE_POLICY_VERSION,
                  idempotencyKey: `challenge:${row.challenge_id}:expire-scheduling:v${challengeNextVersion}`,
                },
              } : {}),
            },
          },
          {
            messageId: notifications.messageId, topic: 'notification.in_app.v1',
            payload: {
              notifications: recipients.map((recipientUserId, index) => ({
                notificationId: notifications.notificationIds[index]!, recipientUserId,
                category: 'MANDATORY', renderKey: 'appeal.decided',
                actionTarget: { type: 'RESULT', resultId: row.result_id },
                payload: {
                  appealId: row.appeal_id, decision: normalized.decision,
                  schedulingDeadlineAt: schedulingDeadlineAt?.toISOString() ?? null,
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
