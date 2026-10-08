import {
  RESULT_POLICY_VERSION,
  ResultConflictError,
  ResultPermissionDeniedError,
  assertExpectedVersion,
  normalizeTechnicalCorrectionRequest,
  type CommandEnvelope,
  type ResultOutcomeCode,
  type ResultState,
  type TechnicalCorrectionCategory,
  type TechnicalCorrectionState,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import { executeCriticalCommand, type ExecutedCommand } from './platform-command.js';

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
  readonly version: string;
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
    where result_id = ${resultId}::uuid and state in ('SUBMITTED', 'UNDER_REVIEW')
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
      correction.version::text as version
    from competition.technical_correction_requests correction
    join identity.users requester on requester.user_id = correction.requester_user_id
    where (${correctionId ?? null}::uuid is null
      or correction.correction_id = ${correctionId ?? null}::uuid)
    order by correction.submitted_at, correction.correction_id
  `.execute(database);
  return result.rows;
}

function project(row: CorrectionRow, privateDetails: boolean): TechnicalCorrectionProjection {
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
    internalReason: privateDetails ? row.internal_reason : null,
    evidenceReference: privateDetails ? row.evidence_reference : null,
    submittedAt: row.submitted_at.toISOString(),
    version: Number(row.version),
  };
}

export async function listTechnicalCorrectionsForCentral(
  database: Kysely<Database>, centralUserId: string,
): Promise<TechnicalCorrectionProjection[]> {
  if (!(await hasCentralGrant(database, centralUserId))) throw new ResultPermissionDeniedError();
  return (await correctionRows(database))
    .filter((row) => row.state === 'SUBMITTED' || row.state === 'UNDER_REVIEW')
    .map((row) => project(row, true));
}

export async function listTechnicalCorrectionsForViewer(
  database: Kysely<Database>, viewerUserId: string,
): Promise<TechnicalCorrectionProjection[]> {
  const central = await hasCentralGrant(database, viewerUserId);
  return (await correctionRows(database))
    .filter((row) => central || row.requester_user_id === viewerUserId)
    .map((row) => project(row, true));
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
        response: project(row, true),
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
