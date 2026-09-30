import {
  CHALLENGE_POLICY_VERSION,
  RESULT_POLICY_VERSION,
  ResultConflictError,
  ResultPermissionDeniedError,
  acceptedChallengeSchedulingDeadline,
  assertMissingResultRepeatCanBeOrdered,
  assertMissingResultReviewCanStart,
  challengeResultReminderDeadlines,
  matchingMissingResultClaim,
  normalizeMissingResultClaim,
  normalizeMissingResultCoachAssignment,
  type CommandEnvelope,
  type MissingResultClaimOutcome,
  type MissingResultReviewState,
  type TimerAggregateSnapshot,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import { executeCriticalCommand, type ExecutedCommand, type RelatedDomainEventDraft } from './platform-command.js';

export interface MissingResultTimerPayload { readonly challengeId: string }
export interface StartMissingResultReviewPayload { readonly reviewId: string }
export interface SubmitMissingResultStatementPayload {
  readonly reviewId: string;
  readonly outcomeCode: MissingResultClaimOutcome;
  readonly statement: string;
}
export interface ConfirmMissingResultVenuePayload {
  readonly reviewId: string;
  readonly attendanceConfirmed: boolean;
  readonly note: string;
}
export interface AssignMissingResultCoachPayload {
  readonly reviewId: string;
  readonly reviewerCoachUserId: string;
  readonly repeatObjectivelyImpossible: boolean;
  readonly reason: string;
}
export interface OrderMissingResultRepeatPayload {
  readonly reviewId: string;
  readonly reason: string;
}

export interface MissingResultEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly notificationOutboxMessageId?: string;
  readonly notificationIds?: readonly string[];
  readonly reviewId?: string;
  readonly reviewEventId?: string;
  readonly operationalFollowupId?: string;
  readonly statementId?: string;
  readonly confirmationId?: string;
  readonly challengeEventId?: string;
}

export interface MissingResultStatementProjection {
  readonly statementId: string;
  readonly athleteUserId: string;
  readonly athleteDisplayName: string;
  readonly outcomeCode: MissingResultClaimOutcome;
  readonly winnerUserId: string | null;
  readonly statement: string;
  readonly submittedAt: string;
}

export interface MissingResultVenueConfirmationProjection {
  readonly attendanceConfirmed: boolean;
  readonly note: string;
  readonly confirmedBy: string;
  readonly confirmedAt: string;
}

export interface MissingResultReviewerCoachProjection {
  readonly userId: string;
  readonly displayName: string;
}

export interface MissingResultReviewProjection {
  readonly reviewId: string;
  readonly challengeId: string;
  readonly sessionId: string;
  readonly state: MissingResultReviewState;
  readonly venueId: string;
  readonly venueDisplayName: string;
  readonly originalCoachUserId: string;
  readonly originalCoachDisplayName: string;
  readonly participantUserIds: readonly [string, string];
  readonly participantDisplayNames: readonly [string, string];
  readonly openedAt: string;
  readonly assignedCentralUserId: string | null;
  readonly reviewStartedAt: string | null;
  readonly assignedReviewerCoachUserId: string | null;
  readonly assignedReviewerCoachDisplayName: string | null;
  readonly allowedOutcomeCode: MissingResultClaimOutcome | null;
  readonly allowedWinnerUserId: string | null;
  readonly assignmentReason: string | null;
  readonly statements: MissingResultStatementProjection[];
  readonly venueConfirmation: MissingResultVenueConfirmationProjection | null;
  readonly resolution: string | null;
  readonly resolutionReason: string | null;
  readonly resolvedAt: string | null;
  readonly challengeState: string;
  readonly challengeVersion: number;
  readonly reviewerCoachOptions: MissingResultReviewerCoachProjection[];
  readonly viewerCanSubmitStatement: boolean;
  readonly viewerCanConfirmVenue: boolean;
  readonly viewerCanStartReview: boolean;
  readonly viewerCanAssignCoach: boolean;
  readonly viewerCanOrderRepeat: boolean;
  readonly viewerCanRecordConstrainedResult: boolean;
  readonly version: number;
}

interface MissingContextRow {
  readonly challenge_id: string;
  readonly challenge_state: string;
  readonly challenge_version: string;
  readonly session_id: string;
  readonly actual_end_at: Date;
  readonly venue_id: string;
  readonly venue_display_name: string;
  readonly coach_user_id: string;
  readonly coach_display_name: string;
  readonly pair_low_id: string;
  readonly pair_high_id: string;
  readonly competition_id: string;
  readonly community_id: string;
  readonly existing_result_id: string | null;
  readonly existing_review_id: string | null;
}

interface ReviewRow {
  readonly review_id: string;
  readonly challenge_id: string;
  readonly session_id: string;
  readonly state: MissingResultReviewState;
  readonly venue_id: string;
  readonly venue_display_name: string;
  readonly original_coach_user_id: string;
  readonly original_coach_display_name: string;
  readonly pair_low_id: string;
  readonly pair_low_name: string;
  readonly pair_high_id: string;
  readonly pair_high_name: string;
  readonly community_id: string;
  readonly opened_at: Date;
  readonly assigned_central_user_id: string | null;
  readonly review_started_at: Date | null;
  readonly assigned_reviewer_coach_user_id: string | null;
  readonly assigned_reviewer_coach_display_name: string | null;
  readonly allowed_outcome_code: MissingResultClaimOutcome | null;
  readonly allowed_winner_user_id: string | null;
  readonly assignment_reason: string | null;
  readonly resolution: string | null;
  readonly resolution_reason: string | null;
  readonly resolved_at: Date | null;
  readonly review_version: string;
  readonly challenge_state: string;
  readonly challenge_version: string;
  readonly statements: readonly {
    readonly statementId: string;
    readonly athleteUserId: string;
    readonly athleteDisplayName: string;
    readonly outcomeCode: MissingResultClaimOutcome;
    readonly winnerUserId: string | null;
    readonly statement: string;
    readonly submittedAt: string;
  }[];
  readonly attendance_confirmed: boolean | null;
  readonly venue_note: string | null;
  readonly venue_confirmed_by: string | null;
  readonly venue_confirmed_at: Date | null;
}

function requiredIds<T extends readonly (keyof MissingResultEffectIds)[]>(
  ids: MissingResultEffectIds,
  keys: T,
): { readonly [K in T[number]]: string } {
  return Object.fromEntries(keys.map((key) => {
    const value = ids[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`Missing Result effect ID ${String(key)} is required`);
    }
    return [key, value];
  })) as { readonly [K in T[number]]: string };
}

async function missingContext(
  database: Kysely<Database> | Transaction<Database>,
  challengeId: string,
  lock = false,
): Promise<MissingContextRow | null> {
  const result = await sql<MissingContextRow>`
    select challenge.challenge_id, challenge.state as challenge_state,
      challenge.version::text as challenge_version, session.session_id,
      session.actual_end_at, session.venue_id, venue.display_name as venue_display_name,
      session.coach_user_id, coach.display_name as coach_display_name,
      challenge.pair_low_id, challenge.pair_high_id, challenge.competition_id,
      competition.community_id, result.result_id as existing_result_id,
      review.review_id as existing_review_id
    from competition.challenges as challenge
    join competition.competitions as competition on competition.competition_id = challenge.competition_id
    join scheduling.sessions as session on session.challenge_id = challenge.challenge_id
    join community.venues as venue on venue.venue_id = session.venue_id
    join identity.users as coach on coach.user_id = session.coach_user_id
    left join competition.results as result
      on result.challenge_id = challenge.challenge_id and result.cycle_no = challenge.cycle_no
    left join competition.missing_result_reviews as review on review.challenge_id = challenge.challenge_id
    where challenge.challenge_id = ${challengeId}::uuid and session.state = 'ENDED'
    ${lock ? sql`for update of challenge` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function reviewRows(
  database: Kysely<Database> | Transaction<Database>,
  reviewId?: string,
  lock = false,
): Promise<readonly ReviewRow[]> {
  const result = await sql<ReviewRow>`
    select review.review_id, review.challenge_id, review.session_id, review.state,
      review.venue_id, venue.display_name as venue_display_name,
      review.original_coach_user_id, original_coach.display_name as original_coach_display_name,
      challenge.pair_low_id, pair_low.display_name as pair_low_name,
      challenge.pair_high_id, pair_high.display_name as pair_high_name,
      competition.community_id, review.opened_at, review.assigned_central_user_id,
      review.review_started_at, review.assigned_reviewer_coach_user_id,
      reviewer_coach.display_name as assigned_reviewer_coach_display_name,
      review.allowed_outcome_code, review.allowed_winner_user_id, review.assignment_reason,
      review.resolution, review.resolution_reason, review.resolved_at,
      review.version::text as review_version,
      challenge.state as challenge_state, challenge.version::text as challenge_version,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'statementId', statement.statement_id,
          'athleteUserId', statement.athlete_user_id,
          'athleteDisplayName', athlete.display_name,
          'outcomeCode', statement.claimed_outcome_code,
          'winnerUserId', statement.claimed_winner_user_id,
          'statement', statement.statement,
          'submittedAt', statement.submitted_at
        ) order by statement.submitted_at, statement.statement_id)
        from competition.missing_result_statements as statement
        join identity.users as athlete on athlete.user_id = statement.athlete_user_id
        where statement.review_id = review.review_id
      ), '[]'::jsonb) as statements,
      confirmation.attendance_confirmed,
      confirmation.note as venue_note,
      confirmation.confirmed_by as venue_confirmed_by,
      confirmation.confirmed_at as venue_confirmed_at
    from competition.missing_result_reviews as review
    join competition.challenges as challenge on challenge.challenge_id = review.challenge_id
    join competition.competitions as competition on competition.competition_id = challenge.competition_id
    join community.venues as venue on venue.venue_id = review.venue_id
    join identity.users as original_coach on original_coach.user_id = review.original_coach_user_id
    join identity.users as pair_low on pair_low.user_id = challenge.pair_low_id
    join identity.users as pair_high on pair_high.user_id = challenge.pair_high_id
    left join identity.users as reviewer_coach
      on reviewer_coach.user_id = review.assigned_reviewer_coach_user_id
    left join competition.missing_result_venue_confirmations as confirmation
      on confirmation.review_id = review.review_id
    where (${reviewId ?? null}::uuid is null or review.review_id = ${reviewId ?? null}::uuid)
    order by review.opened_at, review.review_id
    ${lock ? sql`for update of review, challenge` : sql``}
  `.execute(database);
  return result.rows;
}

async function hasCentralGrant(
  database: Kysely<Database> | Transaction<Database>, userId: string,
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

async function hasVenueAdminGrant(
  database: Kysely<Database> | Transaction<Database>, userId: string, venueId: string,
): Promise<boolean> {
  const result = await sql<{ readonly allowed: boolean }>`
    select exists (
      select 1 from community.role_grants
      where user_id = ${userId}::uuid and role in ('PRIMARY_ADMIN', 'GYM_ADMIN')
        and scope_type = 'VENUE' and scope_id = ${venueId}::uuid and state = 'ACTIVE'
        and (expires_at is null or expires_at > clock_timestamp())
    ) as allowed
  `.execute(database);
  return result.rows[0]?.allowed ?? false;
}

async function reviewerCoachOptions(
  database: Kysely<Database> | Transaction<Database>, row: ReviewRow,
): Promise<MissingResultReviewerCoachProjection[]> {
  const result = await sql<{ readonly user_id: string; readonly display_name: string }>`
    select distinct role_grant.user_id, coach.display_name
    from community.role_grants as role_grant
    join identity.users as coach on coach.user_id = role_grant.user_id
    where role_grant.role = 'COACH' and role_grant.state = 'ACTIVE'
      and (role_grant.expires_at is null or role_grant.expires_at > clock_timestamp())
      and role_grant.user_id not in (
        ${row.pair_low_id}::uuid, ${row.pair_high_id}::uuid, ${row.original_coach_user_id}::uuid
      )
      and (
        (role_grant.scope_type = 'COMMUNITY' and role_grant.scope_id = ${row.community_id}::uuid)
        or (role_grant.scope_type = 'SESSION' and role_grant.scope_id = ${row.session_id}::uuid)
      )
    order by coach.display_name, role_grant.user_id
  `.execute(database);
  return result.rows.map((item) => ({ userId: item.user_id, displayName: item.display_name }));
}

async function projectReview(
  database: Kysely<Database> | Transaction<Database>,
  row: ReviewRow,
  viewerUserId: string,
): Promise<MissingResultReviewProjection> {
  const central = await hasCentralGrant(database, viewerUserId);
  const venueAdmin = await hasVenueAdminGrant(database, viewerUserId, row.venue_id);
  const participant = [row.pair_low_id, row.pair_high_id].includes(viewerUserId);
  const reviewerCoach = row.assigned_reviewer_coach_user_id === viewerUserId;
  const statements = row.statements.map((item) => ({ ...item }));
  const visibleStatements = central || reviewerCoach || statements.length === 2
    ? statements
    : statements.filter((item) => item.athleteUserId === viewerUserId);
  const actorAlreadySubmitted = statements.some((item) => item.athleteUserId === viewerUserId);
  const options = central && row.state === 'UNDER_REVIEW'
    ? await reviewerCoachOptions(database, row)
    : [];
  return {
    reviewId: row.review_id, challengeId: row.challenge_id, sessionId: row.session_id,
    state: row.state, venueId: row.venue_id, venueDisplayName: row.venue_display_name,
    originalCoachUserId: row.original_coach_user_id,
    originalCoachDisplayName: row.original_coach_display_name,
    participantUserIds: [row.pair_low_id, row.pair_high_id],
    participantDisplayNames: [row.pair_low_name, row.pair_high_name],
    openedAt: row.opened_at.toISOString(), assignedCentralUserId: row.assigned_central_user_id,
    reviewStartedAt: row.review_started_at?.toISOString() ?? null,
    assignedReviewerCoachUserId: row.assigned_reviewer_coach_user_id,
    assignedReviewerCoachDisplayName: row.assigned_reviewer_coach_display_name,
    allowedOutcomeCode: row.allowed_outcome_code, allowedWinnerUserId: row.allowed_winner_user_id,
    assignmentReason: row.assignment_reason, statements: visibleStatements,
    venueConfirmation: row.venue_confirmed_at === null ? null : {
      attendanceConfirmed: row.attendance_confirmed!, note: row.venue_note!,
      confirmedBy: row.venue_confirmed_by!, confirmedAt: row.venue_confirmed_at.toISOString(),
    },
    resolution: row.resolution, resolutionReason: row.resolution_reason,
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    challengeState: row.challenge_state, challengeVersion: Number(row.challenge_version),
    reviewerCoachOptions: options,
    viewerCanSubmitStatement: participant
      && (row.state === 'OPEN' || row.state === 'UNDER_REVIEW') && !actorAlreadySubmitted,
    viewerCanConfirmVenue: venueAdmin
      && (row.state === 'OPEN' || row.state === 'UNDER_REVIEW') && row.venue_confirmed_at === null,
    viewerCanStartReview: central && row.state === 'OPEN',
    viewerCanAssignCoach: central && row.state === 'UNDER_REVIEW'
      && row.assigned_central_user_id === viewerUserId,
    viewerCanOrderRepeat: central && row.state === 'UNDER_REVIEW'
      && row.assigned_central_user_id === viewerUserId,
    viewerCanRecordConstrainedResult: reviewerCoach && row.state === 'REVIEWER_ASSIGNED',
    version: Number(row.review_version),
  };
}

export async function readMissingResultReview(
  database: Kysely<Database>, reviewId: string, viewerUserId: string,
): Promise<MissingResultReviewProjection> {
  const row = (await reviewRows(database, reviewId))[0];
  if (!row) throw new ResultPermissionDeniedError();
  const visible = [row.pair_low_id, row.pair_high_id, row.original_coach_user_id,
    row.assigned_reviewer_coach_user_id].includes(viewerUserId)
    || await hasCentralGrant(database, viewerUserId)
    || await hasVenueAdminGrant(database, viewerUserId, row.venue_id);
  if (!visible) throw new ResultPermissionDeniedError();
  return projectReview(database, row, viewerUserId);
}

export async function listMissingResultReviewsForCentral(
  database: Kysely<Database>, centralUserId: string,
): Promise<MissingResultReviewProjection[]> {
  if (!(await hasCentralGrant(database, centralUserId))) throw new ResultPermissionDeniedError();
  const rows = (await reviewRows(database)).filter((row) =>
    row.state === 'OPEN' || row.state === 'UNDER_REVIEW' || row.state === 'REVIEWER_ASSIGNED');
  return Promise.all(rows.map((row) => projectReview(database, row, centralUserId)));
}

export async function listMissingResultReviewsForViewer(
  database: Kysely<Database>, viewerUserId: string,
): Promise<MissingResultReviewProjection[]> {
  const rows = await reviewRows(database);
  const visible: ReviewRow[] = [];
  for (const row of rows) {
    if ([row.pair_low_id, row.pair_high_id, row.original_coach_user_id,
      row.assigned_reviewer_coach_user_id].includes(viewerUserId)
      || await hasVenueAdminGrant(database, viewerUserId, row.venue_id)) visible.push(row);
  }
  return Promise.all(visible.map((row) => projectReview(database, row, viewerUserId)));
}

export async function readMissingResultChallengeTimerSnapshot(
  database: Kysely<Database>, challengeId: string,
): Promise<TimerAggregateSnapshot> {
  const row = await missingContext(database, challengeId);
  return row
    ? { state: row.challenge_state, version: Number(row.challenge_version) }
    : { state: 'MISSING', version: 0 };
}

async function notificationRecipients(
  transaction: Transaction<Database>, row: MissingContextRow, stage: 'COACH' | 'ADMIN' | 'CENTRAL',
): Promise<string[]> {
  if (stage === 'COACH') return [row.coach_user_id];
  const result = stage === 'ADMIN'
    ? await sql<{ readonly user_id: string }>`
      select distinct user_id from community.role_grants
      where role in ('PRIMARY_ADMIN', 'GYM_ADMIN') and scope_type = 'VENUE'
        and scope_id = ${row.venue_id}::uuid and state = 'ACTIVE'
        and (expires_at is null or expires_at > clock_timestamp())
    `.execute(transaction)
    : await sql<{ readonly user_id: string }>`
      select distinct user_id from community.role_grants
      where role = 'CENTRAL_ADMIN' and scope_type = 'GLOBAL' and scope_id is null
        and state = 'ACTIVE' and (expires_at is null or expires_at > clock_timestamp())
    `.execute(transaction);
  return result.rows.map((item) => item.user_id);
}

function requireNotificationIds(ids: MissingResultEffectIds, count: number): {
  readonly messageId: string; readonly ids: readonly string[];
} {
  const messageId = requiredIds(ids, ['notificationOutboxMessageId'] as const)
    .notificationOutboxMessageId;
  if (!ids.notificationIds || ids.notificationIds.length < count) {
    throw new TypeError(`${count} Missing Result notification IDs are required`);
  }
  return { messageId, ids: ids.notificationIds };
}

async function executeMissingResultEscalation(input: {
  readonly database: Kysely<Database>;
  readonly command: CommandEnvelope<MissingResultTimerPayload>;
  readonly ids: MissingResultEffectIds;
  readonly stage: 'COACH' | 'ADMIN' | 'CENTRAL';
  readonly now?: () => Date;
}): Promise<ExecutedCommand<{ readonly challengeId: string; readonly stage: string; readonly reviewId: string | null }>> {
  const { command, ids } = input;
  if (command.actor.type !== 'SYSTEM' || command.aggregateType !== 'Challenge'
    || command.payload.challengeId !== command.aggregateId) throw new ResultPermissionDeniedError();
  const opening = input.stage === 'CENTRAL';
  const openIds = opening
    ? requiredIds(ids, ['reviewId', 'reviewEventId', 'operationalFollowupId'] as const)
    : null;
  return executeCriticalCommand(input.database, {
    command,
    ...(input.now ? { now: input.now } : {}),
    mutate: async (transaction, context) => {
      const row = await missingContext(transaction, command.aggregateId, true);
      if (!row || row.challenge_state !== 'RESULT_PENDING' || row.existing_result_id) {
        throw new ResultConflictError('CHALLENGE_NOT_AWAITING_RESULT');
      }
      if (opening && row.existing_review_id) {
        throw new ResultConflictError('MISSING_RESULT_REVIEW_NOT_OPEN');
      }
      const deadlines = challengeResultReminderDeadlines(row.actual_end_at);
      const dueIndex = input.stage === 'COACH' ? 0 : input.stage === 'ADMIN' ? 1 : 2;
      if (context.occurredAt < deadlines[dueIndex]) {
        throw new ResultConflictError('MISSING_RESULT_REVIEW_NOT_OPEN');
      }
      await sql`
        update competition.challenges set version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where challenge_id = ${row.challenge_id}::uuid and state = 'RESULT_PENDING'
      `.execute(transaction);
      if (opening && openIds) {
        await sql`
          insert into competition.missing_result_reviews (
            review_id, challenge_id, session_id, venue_id, original_coach_user_id,
            operational_followup_id, state, opened_at, version
          ) values (
            ${openIds.reviewId}::uuid, ${row.challenge_id}::uuid, ${row.session_id}::uuid,
            ${row.venue_id}::uuid, ${row.coach_user_id}::uuid,
            ${openIds.operationalFollowupId}::uuid, 'OPEN',
            ${context.occurredAt.toISOString()}::timestamptz, 1
          )
        `.execute(transaction);
      }
      const recipients = await notificationRecipients(transaction, row, input.stage);
      const notification = requireNotificationIds(ids, recipients.length);
      const nextTimer = input.stage === 'COACH'
        ? { commandType: 'ESCALATE_MISSING_RESULT_ADMIN', deadline: deadlines[1] }
        : input.stage === 'ADMIN'
          ? { commandType: 'OPEN_MISSING_RESULT_REVIEW', deadline: deadlines[2] }
          : null;
      const eventName = input.stage === 'COACH' ? 'MissingResultCoachReminded'
        : input.stage === 'ADMIN' ? 'MissingResultVenueEscalated' : 'MissingResultReviewOpened';
      const relatedEvents: RelatedDomainEventDraft[] = opening && openIds ? [{
        eventId: openIds.reviewEventId, eventName: 'MissingResultReviewOpened', schemaVersion: 1,
        aggregateType: 'MissingResultReview', aggregateId: openIds.reviewId,
        aggregateVersion: 1, transitionId: 'MR-01',
        payload: {
          reviewId: openIds.reviewId, challengeId: row.challenge_id, sessionId: row.session_id,
          originalCoachUserId: row.coach_user_id, openedAt: context.occurredAt.toISOString(),
          operationalFollowupId: openIds.operationalFollowupId,
        },
        metadata: { policyVersion: RESULT_POLICY_VERSION },
      }] : [];
      return {
        responseStatus: 200,
        response: { challengeId: row.challenge_id, stage: input.stage, reviewId: openIds?.reviewId ?? null },
        event: {
          eventId: ids.eventId, eventName, schemaVersion: 1,
          transitionId: opening ? 'MR-01' : null,
          payload: {
            challengeId: row.challenge_id, sessionId: row.session_id, stage: input.stage,
            occurredAt: context.occurredAt.toISOString(), reviewId: openIds?.reviewId ?? null,
          },
          metadata: { policyVersion: RESULT_POLICY_VERSION },
        },
        relatedEvents,
        audit: {
          auditId: ids.auditId, action: eventName.toUpperCase(),
          transitionId: opening ? 'MR-01' : null, reasonCode: 'RESULT_MISSING',
          beforeState: row.challenge_state, afterState: row.challenge_state,
          metadata: { sessionId: row.session_id, reviewId: openIds?.reviewId ?? null },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: opening
              ? 'competition.missing-result-review.opened.v1'
              : 'competition.challenge.missing-result-escalated.v1',
            payload: {
              challengeId: row.challenge_id, sessionId: row.session_id, stage: input.stage,
              reviewId: openIds?.reviewId ?? null,
              ...(nextTimer ? { timer: {
                commandType: nextTimer.commandType, aggregateType: 'Challenge',
                aggregateId: row.challenge_id, expectedState: 'RESULT_PENDING',
                expectedVersion: context.nextVersion, deadlineAt: nextTimer.deadline.toISOString(),
                policyVersion: RESULT_POLICY_VERSION,
                idempotencyKey: `challenge:${row.challenge_id}:${nextTimer.commandType.toLowerCase()}:v${context.nextVersion}`,
              } } : {}),
            },
          },
          {
            messageId: notification.messageId, topic: 'notification.in_app.v1',
            payload: { notifications: recipients.map((recipientUserId, index) => ({
              notificationId: notification.ids[index]!, recipientUserId,
              category: 'MANDATORY',
              renderKey: input.stage === 'COACH' ? 'result.missing-coach-reminder'
                : input.stage === 'ADMIN' ? 'result.missing-venue-escalation'
                  : 'result.missing-central-review',
              actionTarget: opening
                ? { type: 'MISSING_RESULT_REVIEW', reviewId: openIds!.reviewId }
                : { type: 'CHALLENGE', challengeId: row.challenge_id },
              payload: { challengeId: row.challenge_id, sessionId: row.session_id },
              deadlineAt: nextTimer?.deadline.toISOString() ?? null,
            })) },
          },
        ],
      };
    },
  });
}

export const remindMissingResultCoach = (
  database: Kysely<Database>, command: CommandEnvelope<MissingResultTimerPayload>,
  ids: MissingResultEffectIds, now?: () => Date,
) => executeMissingResultEscalation({ database, command, ids, stage: 'COACH', ...(now ? { now } : {}) });

export const escalateMissingResultAdmin = (
  database: Kysely<Database>, command: CommandEnvelope<MissingResultTimerPayload>,
  ids: MissingResultEffectIds, now?: () => Date,
) => executeMissingResultEscalation({ database, command, ids, stage: 'ADMIN', ...(now ? { now } : {}) });

export const openMissingResultReview = (
  database: Kysely<Database>, command: CommandEnvelope<MissingResultTimerPayload>,
  ids: MissingResultEffectIds, now?: () => Date,
) => executeMissingResultEscalation({ database, command, ids, stage: 'CENTRAL', ...(now ? { now } : {}) });

async function lockedReviewForActor(
  transaction: Transaction<Database>, reviewId: string,
): Promise<ReviewRow> {
  const row = (await reviewRows(transaction, reviewId, true))[0];
  if (!row) throw new ResultPermissionDeniedError();
  if (row.challenge_state !== 'RESULT_PENDING') {
    throw new ResultConflictError('CHALLENGE_NOT_AWAITING_RESULT');
  }
  return row;
}

export async function submitMissingResultStatement(
  database: Kysely<Database>, command: CommandEnvelope<SubmitMissingResultStatementPayload>,
  ids: MissingResultEffectIds, now?: () => Date,
): Promise<ExecutedCommand<MissingResultReviewProjection>> {
  if (!command.actor.id || command.aggregateType !== 'MissingResultReview'
    || command.payload.reviewId !== command.aggregateId) throw new ResultPermissionDeniedError();
  const statementId = requiredIds(ids, ['statementId'] as const).statementId;
  return executeCriticalCommand(database, {
    command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await lockedReviewForActor(transaction, command.aggregateId);
      if (![row.pair_low_id, row.pair_high_id].includes(command.actor.id!)
        || (row.state !== 'OPEN' && row.state !== 'UNDER_REVIEW')) {
        throw new ResultPermissionDeniedError();
      }
      if (row.statements.some((item) => item.athleteUserId === command.actor.id)) {
        throw new ResultConflictError('MISSING_RESULT_EVIDENCE_INCOMPLETE');
      }
      const normalized = normalizeMissingResultClaim({
        outcomeCode: command.payload.outcomeCode,
        participantUserIds: [row.pair_low_id, row.pair_high_id],
        statement: command.payload.statement,
      });
      await sql`
        insert into competition.missing_result_statements (
          statement_id, review_id, athlete_user_id, claimed_outcome_code,
          claimed_winner_user_id, statement, submitted_at
        ) values (
          ${statementId}::uuid, ${row.review_id}::uuid, ${command.actor.id}::uuid,
          ${normalized.outcomeCode}, ${normalized.winnerUserId}::uuid,
          ${normalized.statement}, ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`update competition.missing_result_reviews set version = ${context.nextVersion}
        where review_id = ${row.review_id}::uuid`.execute(transaction);
      const projectedRow = (await reviewRows(transaction, row.review_id))[0]!;
      return {
        responseStatus: 200, response: await projectReview(transaction, projectedRow, command.actor.id!),
        event: {
          eventId: ids.eventId, eventName: 'MissingResultStatementSubmitted', schemaVersion: 1,
          transitionId: null,
          payload: {
            reviewId: row.review_id, statementId, athleteUserId: command.actor.id,
            submittedAt: context.occurredAt.toISOString(),
          }, metadata: { policyVersion: RESULT_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId, action: 'SUBMIT_MISSING_RESULT_STATEMENT', transitionId: null,
          reasonCode: normalized.outcomeCode, beforeState: row.state, afterState: row.state,
          metadata: { statementId },
        },
        outbox: [{
          messageId: ids.outboxMessageId, topic: 'competition.missing-result.statement-submitted.v1',
          payload: { reviewId: row.review_id, athleteUserId: command.actor.id },
        }],
      };
    },
  });
}

export async function confirmMissingResultVenue(
  database: Kysely<Database>, command: CommandEnvelope<ConfirmMissingResultVenuePayload>,
  ids: MissingResultEffectIds, now?: () => Date,
): Promise<ExecutedCommand<MissingResultReviewProjection>> {
  if (!command.actor.id || command.aggregateType !== 'MissingResultReview'
    || command.payload.reviewId !== command.aggregateId) throw new ResultPermissionDeniedError();
  const confirmationId = requiredIds(ids, ['confirmationId'] as const).confirmationId;
  return executeCriticalCommand(database, {
    command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await lockedReviewForActor(transaction, command.aggregateId);
      if (!(await hasVenueAdminGrant(transaction, command.actor.id!, row.venue_id))
        || (row.state !== 'OPEN' && row.state !== 'UNDER_REVIEW')
        || row.venue_confirmed_at !== null) throw new ResultPermissionDeniedError();
      const note = command.payload.note.trim();
      if (note.length === 0 || note.length > 2000) throw new ResultConflictError('MISSING_RESULT_EVIDENCE_INCOMPLETE');
      await sql`
        insert into competition.missing_result_venue_confirmations (
          confirmation_id, review_id, confirmed_by, attendance_confirmed, note, confirmed_at
        ) values (
          ${confirmationId}::uuid, ${row.review_id}::uuid, ${command.actor.id}::uuid,
          ${command.payload.attendanceConfirmed}, ${note},
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`update competition.missing_result_reviews set version = ${context.nextVersion}
        where review_id = ${row.review_id}::uuid`.execute(transaction);
      const projectedRow = (await reviewRows(transaction, row.review_id))[0]!;
      return {
        responseStatus: 200, response: await projectReview(transaction, projectedRow, command.actor.id!),
        event: {
          eventId: ids.eventId, eventName: 'MissingResultVenueConfirmed', schemaVersion: 1,
          transitionId: null,
          payload: {
            reviewId: row.review_id, confirmationId, confirmedBy: command.actor.id,
            attendanceConfirmed: command.payload.attendanceConfirmed,
          }, metadata: { policyVersion: RESULT_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId, action: 'CONFIRM_MISSING_RESULT_VENUE', transitionId: null,
          reasonCode: command.payload.attendanceConfirmed ? 'ATTENDANCE_CONFIRMED' : 'ATTENDANCE_NOT_CONFIRMED',
          beforeState: row.state, afterState: row.state, metadata: { confirmationId },
        },
        outbox: [{
          messageId: ids.outboxMessageId, topic: 'competition.missing-result.venue-confirmed.v1',
          payload: { reviewId: row.review_id, attendanceConfirmed: command.payload.attendanceConfirmed },
        }],
      };
    },
  });
}

export async function startMissingResultReview(
  database: Kysely<Database>, command: CommandEnvelope<StartMissingResultReviewPayload>,
  ids: MissingResultEffectIds, now?: () => Date,
): Promise<ExecutedCommand<MissingResultReviewProjection>> {
  if (!command.actor.id || command.aggregateType !== 'MissingResultReview'
    || command.payload.reviewId !== command.aggregateId) throw new ResultPermissionDeniedError();
  return executeCriticalCommand(database, {
    command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      if (!(await hasCentralGrant(transaction, command.actor.id!))) throw new ResultPermissionDeniedError();
      const row = await lockedReviewForActor(transaction, command.aggregateId);
      assertMissingResultReviewCanStart({
        state: row.state, reviewerUserId: command.actor.id!,
        protectedUserIds: [row.pair_low_id, row.pair_high_id, row.original_coach_user_id],
      });
      await sql`
        update competition.missing_result_reviews
        set state = 'UNDER_REVIEW', assigned_central_user_id = ${command.actor.id}::uuid,
          review_started_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = ${context.nextVersion}
        where review_id = ${row.review_id}::uuid and state = 'OPEN'
      `.execute(transaction);
      const projectedRow = (await reviewRows(transaction, row.review_id))[0]!;
      return {
        responseStatus: 200, response: await projectReview(transaction, projectedRow, command.actor.id!),
        event: {
          eventId: ids.eventId, eventName: 'MissingResultReviewStarted', schemaVersion: 1,
          transitionId: 'MR-02',
          payload: { reviewId: row.review_id, reviewerUserId: command.actor.id, startedAt: context.occurredAt.toISOString() },
          metadata: { policyVersion: RESULT_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId, action: 'START_MISSING_RESULT_REVIEW', transitionId: 'MR-02',
          reasonCode: null, beforeState: row.state, afterState: 'UNDER_REVIEW', metadata: {},
        },
        outbox: [{ messageId: ids.outboxMessageId, topic: 'competition.missing-result-review.started.v1',
          payload: { reviewId: row.review_id } }],
      };
    },
  });
}

function claimsFromRow(row: ReviewRow) {
  return row.statements.map((item) => ({
    outcomeCode: item.outcomeCode, winnerUserId: item.winnerUserId, statement: item.statement,
  }));
}

export async function assignMissingResultReviewerCoach(
  database: Kysely<Database>, command: CommandEnvelope<AssignMissingResultCoachPayload>,
  ids: MissingResultEffectIds, now?: () => Date,
): Promise<ExecutedCommand<MissingResultReviewProjection>> {
  if (!command.actor.id || command.aggregateType !== 'MissingResultReview'
    || command.payload.reviewId !== command.aggregateId) throw new ResultPermissionDeniedError();
  return executeCriticalCommand(database, {
    command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      if (!(await hasCentralGrant(transaction, command.actor.id!))) throw new ResultPermissionDeniedError();
      const row = await lockedReviewForActor(transaction, command.aggregateId);
      const options = await reviewerCoachOptions(transaction, row);
      const normalized = normalizeMissingResultCoachAssignment({
        state: row.state, assignedCentralUserId: row.assigned_central_user_id,
        centralUserId: command.actor.id!, reviewerCoachUserId: command.payload.reviewerCoachUserId,
        reviewerCoachAuthorized: options.some((item) => item.userId === command.payload.reviewerCoachUserId),
        protectedUserIds: [row.pair_low_id, row.pair_high_id, row.original_coach_user_id],
        matchingClaim: matchingMissingResultClaim(claimsFromRow(row)),
        venueAttendanceConfirmed: row.attendance_confirmed === true,
        repeatObjectivelyImpossible: command.payload.repeatObjectivelyImpossible,
        reason: command.payload.reason,
      });
      await sql`
        update competition.missing_result_reviews
        set state = 'REVIEWER_ASSIGNED',
          assigned_reviewer_coach_user_id = ${command.payload.reviewerCoachUserId}::uuid,
          allowed_outcome_code = ${normalized.allowedOutcomeCode},
          allowed_winner_user_id = ${normalized.allowedWinnerUserId}::uuid,
          assignment_reason = ${normalized.reason},
          reviewer_assigned_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = ${context.nextVersion}
        where review_id = ${row.review_id}::uuid and state = 'UNDER_REVIEW'
      `.execute(transaction);
      const projectedRow = (await reviewRows(transaction, row.review_id))[0]!;
      return {
        responseStatus: 200, response: await projectReview(transaction, projectedRow, command.actor.id!),
        event: {
          eventId: ids.eventId, eventName: 'MissingResultReviewerCoachAssigned', schemaVersion: 1,
          transitionId: normalized.allowedOutcomeCode === 'NO_CONTEST' ? 'MR-06' : 'MR-03',
          payload: {
            reviewId: row.review_id, reviewerCoachUserId: command.payload.reviewerCoachUserId,
            allowedOutcomeCode: normalized.allowedOutcomeCode,
            allowedWinnerUserId: normalized.allowedWinnerUserId, reason: normalized.reason,
          }, metadata: { policyVersion: RESULT_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId, action: 'ASSIGN_MISSING_RESULT_REVIEWER_COACH',
          transitionId: normalized.allowedOutcomeCode === 'NO_CONTEST' ? 'MR-06' : 'MR-03',
          reasonCode: normalized.allowedOutcomeCode, beforeState: row.state,
          afterState: 'REVIEWER_ASSIGNED', metadata: { reason: normalized.reason },
        },
        outbox: [{ messageId: ids.outboxMessageId,
          topic: 'competition.missing-result-review.coach-assigned.v1',
          payload: { reviewId: row.review_id, reviewerCoachUserId: command.payload.reviewerCoachUserId } }],
      };
    },
  });
}

export async function orderMissingResultRepeat(
  database: Kysely<Database>, command: CommandEnvelope<OrderMissingResultRepeatPayload>,
  ids: MissingResultEffectIds, now?: () => Date,
): Promise<ExecutedCommand<MissingResultReviewProjection>> {
  if (!command.actor.id || command.aggregateType !== 'MissingResultReview'
    || command.payload.reviewId !== command.aggregateId) throw new ResultPermissionDeniedError();
  const challengeEventId = requiredIds(ids, ['challengeEventId'] as const).challengeEventId;
  return executeCriticalCommand(database, {
    command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      if (!(await hasCentralGrant(transaction, command.actor.id!))) throw new ResultPermissionDeniedError();
      const row = await lockedReviewForActor(transaction, command.aggregateId);
      assertMissingResultRepeatCanBeOrdered({
        state: row.state, assignedCentralUserId: row.assigned_central_user_id,
        centralUserId: command.actor.id!, matchingClaim: matchingMissingResultClaim(claimsFromRow(row)),
        venueAttendanceConfirmed: row.attendance_confirmed === true,
        repeatObjectivelyPossible: true,
      });
      const reason = command.payload.reason.trim();
      if (reason.length === 0 || reason.length > 2000) {
        throw new ResultConflictError('MISSING_RESULT_EVIDENCE_INCOMPLETE');
      }
      const schedulingDeadlineAt = acceptedChallengeSchedulingDeadline(context.occurredAt);
      const challengeNextVersion = Number(row.challenge_version) + 1;
      await sql`
        update competition.missing_result_reviews
        set state = 'REPEAT_ORDERED', resolution = 'REPEAT_ORDERED',
          resolution_reason = ${reason}, resolved_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = ${context.nextVersion}
        where review_id = ${row.review_id}::uuid and state = 'UNDER_REVIEW'
      `.execute(transaction);
      await sql`
        update competition.challenges
        set state = 'ACCEPTED_UNSCHEDULED', cycle_no = cycle_no + 1,
          scheduling_deadline_at = ${schedulingDeadlineAt.toISOString()}::timestamptz,
          decided_at = null, version = ${challengeNextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where challenge_id = ${row.challenge_id}::uuid and state = 'RESULT_PENDING'
      `.execute(transaction);
      const projectedRow = (await reviewRows(transaction, row.review_id))[0]!;
      return {
        responseStatus: 200, response: await projectReview(transaction, projectedRow, command.actor.id!),
        event: {
          eventId: ids.eventId, eventName: 'MissingResultRepeatOrdered', schemaVersion: 1,
          transitionId: 'MR-05', payload: {
            reviewId: row.review_id, challengeId: row.challenge_id, reason,
            schedulingDeadlineAt: schedulingDeadlineAt.toISOString(),
          }, metadata: { policyVersion: RESULT_POLICY_VERSION },
        },
        relatedEvents: [{
          eventId: challengeEventId, eventName: 'MissingResultRepeatOrdered', schemaVersion: 1,
          aggregateType: 'Challenge', aggregateId: row.challenge_id,
          aggregateVersion: challengeNextVersion, transitionId: 'CH-28',
          payload: {
            challengeId: row.challenge_id, reviewId: row.review_id,
            schedulingDeadlineAt: schedulingDeadlineAt.toISOString(), reason,
          }, metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
        }],
        audit: {
          auditId: ids.auditId, action: 'ORDER_MISSING_RESULT_REPEAT', transitionId: 'MR-05',
          reasonCode: 'EVIDENCE_CONFLICT_OR_INSUFFICIENT', beforeState: row.state,
          afterState: 'REPEAT_ORDERED', metadata: { reason },
        },
        outbox: [{
          messageId: ids.outboxMessageId, topic: 'competition.missing-result-review.repeat-ordered.v1',
          payload: {
            reviewId: row.review_id, challengeId: row.challenge_id,
            timer: {
              commandType: 'EXPIRE_CHALLENGE_SCHEDULING', aggregateType: 'Challenge',
              aggregateId: row.challenge_id, expectedState: 'ACCEPTED_UNSCHEDULED',
              expectedVersion: challengeNextVersion, deadlineAt: schedulingDeadlineAt.toISOString(),
              policyVersion: CHALLENGE_POLICY_VERSION,
              idempotencyKey: `challenge:${row.challenge_id}:expire-scheduling:v${challengeNextVersion}`,
            },
          },
        }],
      };
    },
  });
}
