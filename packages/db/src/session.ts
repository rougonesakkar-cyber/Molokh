import {
  CHALLENGE_POLICY_VERSION,
  RESULT_POLICY_VERSION,
  SCHEDULING_POLICY_VERSION,
  ChallengeConflictError,
  SchedulingConflictError,
  SchedulingPermissionDeniedError,
  SchedulingValidationError,
  assertAttendanceCanBeRecorded,
  assertCoachReplacementCanBeCommitted,
  assertCoachReplacementCanBeRejected,
  assertChallengeSessionCanEnd,
  assertChallengeSessionCanStart,
  assertChallengeSessionWindowCanOpen,
  assertExternalSessionFailureCanBeCommitted,
  assertSafetyCaseReviewCanStart,
  assertSafetyCaseReviewerIndependent,
  assertSessionCanEnd,
  assertSessionCanStart,
  assertSessionCoach,
  assertSessionWindowCanOpen,
  assertSafetyCancellationCanBeSubmitted,
  assertExpectedVersion,
  challengeResultReminderDeadlines,
  effectiveChallengeStakeAtSessionWindow,
  externalChallengeRescheduleCount,
  extendSchedulingDeadlineForSafetyHold,
  normalizeSafetyAccountRestrictionDecision,
  normalizeSafetyEnforcementDecision,
  normalizeSafetyCaseReleaseDecision,
  safetyRestrictionSubjectStatus,
  officialCancellationWinner,
  titleChallengeCompetitiveContextIsCurrent,
  titleSessionRequiresCompetitiveInvalidation,
  type AttendanceStatus,
  type ChallengeStake,
  type ChallengeState,
  type CommandEnvelope,
  type SessionState,
  type SafetyCancellationReasonCode,
  type SafetyAccountRestrictionCategory,
  type SafetyCaseRemedy,
  type SafetyReplacementRemedy,
  type TimerAggregateSnapshot,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import {
  readBookingOfficialConversionForSession,
  type BookingOfficialConversionProjection,
} from './booking-conversion.js';
import {
  executeCriticalCommand,
  type ExecutedCommand,
  type OutboxDraft,
  type RelatedDomainEventDraft,
} from './platform-command.js';
import {
  recordAdministrativeForfeit,
  type AdministrativeForfeitEffectIds,
} from './result.js';
import {
  readBookingSoloContinuationForSession,
  type BookingSoloContinuationProjection,
} from './solo-continuation.js';
import {
  openBookedOfficialTrainingRetention,
  readBookingTrainingRetentionForSession,
  type BookingTrainingRetentionProjection,
} from './training-retention.js';

export interface OpenSessionWindowPayload {
  readonly sessionId: string;
}

export interface InvalidateCompetitiveSessionPayload {
  readonly sessionId: string;
}

export interface CompetitiveSessionInvalidationEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly challengeEventId: string;
  readonly challengeOutboxMessageId: string;
  readonly bookingEventId: string;
  readonly slotEventId: string;
  readonly retentionId: string;
  readonly retentionEventId: string;
  readonly retentionOutboxMessageId: string;
  readonly retentionTimerOutboxMessageId: string;
  readonly notificationOutboxMessageId: string;
  readonly notificationIds: readonly [string, string, string];
}

export interface InvalidPlannedTitleSessionCandidate {
  readonly sessionId: string;
  readonly competitionId: string;
  readonly version: number;
}

export interface StartSessionPayload {
  readonly sessionId: string;
}

export interface RecordAttendancePayload {
  readonly sessionId: string;
  readonly athleteUserId: string;
  readonly status: AttendanceStatus;
  readonly comment: string | null;
}

export interface EndSessionPayload {
  readonly sessionId: string;
}

export interface ReplaceSessionCoachPayload {
  readonly sessionId: string;
  readonly replacementCoachUserId: string;
}

export interface CancelAfterCoachReplacementPayload {
  readonly sessionId: string;
}

export type ExternalSessionFailureReason =
  | 'COACH_UNAVAILABLE'
  | 'VENUE_UNAVAILABLE'
  | 'SAFETY'
  | 'OTHER_EXTERNAL';

export interface FailSessionExternalPayload {
  readonly sessionId: string;
  readonly reasonCode: ExternalSessionFailureReason;
}

export interface CancelOfficialSessionByAthletePayload {
  readonly sessionId: string;
}

export interface ReportSafetyAndCancelSessionPayload {
  readonly sessionId: string;
  readonly subjectUserId: string;
  readonly reasonCode: SafetyCancellationReasonCode;
  readonly explicitConfirmation: true;
  readonly expectedBookingVersion: number;
  readonly expectedChallengeVersion: number;
}

export interface SafetyCancellationEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly bookingEventId: string;
  readonly slotEventId: string;
  readonly challengeEventId: string;
  readonly caseId: string;
  readonly caseEventId: string;
  readonly caseOutboxMessageId: string;
  readonly holdId: string;
  readonly holdEventId: string;
  readonly holdOutboxMessageId: string;
  readonly notificationOutboxMessageId: string;
  readonly notificationIds: readonly [string, string, string, string];
}

export interface SafetyCancellationProjection {
  readonly action: 'SAFETY_REPORTED_AND_CANCELLED' | 'COACH_REFUSED_UNSAFE_SESSION';
  readonly caseId: string;
  readonly caseState: 'SUBMITTED';
  readonly challengeId: string;
  readonly bookingId: string;
  readonly sessionId: string;
  readonly holdId: string;
  readonly holdState: 'ACTIVE';
  readonly initialDueAt: string;
  readonly finalDueAt: string;
  readonly submittedAt: string;
  readonly sessionVersion: number;
  readonly bookingVersion: number;
  readonly slotVersion: number;
  readonly challengeVersion: number;
}

export interface StartSafetyCaseReviewPayload {
  readonly caseId: string;
}

export interface ResolveSafetyCasePayload {
  readonly caseId: string;
  readonly remedyCode: SafetyCaseRemedy;
  readonly replacementCoachUserId: string | null;
  readonly replacementVenueId: string | null;
  readonly causalLinkConfirmed?: boolean;
  readonly restrictionCategoryCode?: SafetyAccountRestrictionCategory;
  readonly seriousCategoryConfirmed?: boolean;
  readonly consequencesConfirmed?: boolean;
  readonly reason: string;
  readonly expectedChallengeVersion: number;
  readonly expectedHoldVersion: number;
}

export interface SafetyCaseReviewEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
}

export interface SafetyCaseResolutionEffectIds extends SafetyCaseReviewEffectIds {
  readonly decisionId: string;
  readonly decisionEventId: string;
  readonly challengeEventId: string;
  readonly challengeOutboxMessageId: string;
  readonly holdEventId: string;
  readonly holdOutboxMessageId: string;
  readonly notificationOutboxMessageId: string;
  readonly notificationIds: readonly [string, string, string];
  readonly resultId?: string;
  readonly resultEventId?: string;
  readonly statusTransitionId?: string;
  readonly statusEventId?: string;
  readonly cooldownId?: string;
  readonly cooldownEventId?: string;
  readonly resultOutboxMessageId?: string;
  readonly resultNotificationOutboxMessageId?: string;
  readonly resultNotificationIds?: readonly [string, string];
  readonly enforcementId?: string;
  readonly restrictionEventId?: string;
  readonly restrictionOutboxMessageId?: string;
  readonly restrictionNotificationOutboxMessageId?: string;
  readonly restrictionNotificationId?: string;
  readonly statusReviewHoldId?: string;
  readonly statusReviewHoldEventId?: string;
  readonly statusReviewHoldOutboxMessageId?: string;
}

export type SafetyCaseReviewProjection =
  | {
      readonly action: 'SAFETY_REVIEW_STARTED';
      readonly caseId: string;
      readonly state: 'UNDER_REVIEW';
      readonly assignedReviewerUserId: string;
      readonly reviewStartedAt: string;
      readonly challengeId: string;
      readonly challengeVersion: number;
      readonly holdId: string;
      readonly holdVersion: number;
      readonly version: number;
    }
  | {
      readonly action: 'SAFETY_REPLACEMENT_APPLIED';
      readonly caseId: string;
      readonly state: 'CLOSED';
      readonly decisionId: string;
      readonly remedyCode: SafetyReplacementRemedy;
      readonly replacementCoachUserId: string | null;
      readonly replacementVenueId: string | null;
      readonly challengeId: string;
      readonly challengeState: 'ACCEPTED_UNSCHEDULED';
      readonly schedulingDeadlineAt: string;
      readonly challengeVersion: number;
      readonly holdId: string;
      readonly holdState: 'RELEASED';
      readonly holdVersion: number;
      readonly releasedAt: string;
      readonly version: number;
    }
  | {
      readonly action: 'SAFETY_ENFORCEMENT_FORFEIT_APPLIED';
      readonly caseId: string;
      readonly state: 'CLOSED';
      readonly decisionId: string;
      readonly remedyCode: 'FORFEIT_BY_ENFORCEMENT';
      readonly resultId: string;
      readonly challengeId: string;
      readonly challengeState: 'RESULT_RECORDED';
      readonly challengeVersion: number;
      readonly loserUserId: string;
      readonly winnerUserId: string;
      readonly appealDeadlineAt: string;
      readonly holdId: string;
      readonly holdState: 'RELEASED';
      readonly holdVersion: number;
      readonly releasedAt: string;
      readonly version: number;
    }
  | {
      readonly action: 'SAFETY_ACCOUNT_RESTRICTION_APPLIED';
      readonly caseId: string;
      readonly state: 'CLOSED';
      readonly decisionId: string;
      readonly remedyCode: 'ACCOUNT_RESTRICTION';
      readonly enforcementId: string;
      readonly subjectUserId: string;
      readonly categoryCode: SafetyAccountRestrictionCategory;
      readonly accountState: 'RESTRICTED';
      readonly appealDeadlineAt: string;
      readonly challengeId: string;
      readonly challengeState: 'BOOKED';
      readonly challengeVersion: number;
      readonly holdId: string;
      readonly holdState: 'ACTIVE';
      readonly holdVersion: number;
      readonly competitionId: string;
      readonly subjectStatus: 'CHAMPION' | 'CONTENDER' | null;
      readonly statusReviewHoldId: string | null;
      readonly version: number;
    };

export interface SessionEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly attendanceId?: string;
  readonly attendanceEventId?: string;
  readonly bookingEventId?: string;
  readonly slotEventId?: string;
  readonly replacementId?: string;
  readonly assignmentRevisionId?: string;
  readonly notificationOutboxMessageId?: string;
  readonly notificationIds?: readonly [string, string];
  readonly competitiveSnapshotId?: string;
  readonly challengeEventId?: string;
  readonly challengeOutboxMessageId?: string;
  readonly rescheduleId?: string;
  readonly resultId?: string;
  readonly resultEventId?: string;
  readonly statusTransitionId?: string;
  readonly statusEventId?: string;
  readonly cooldownId?: string;
  readonly cooldownEventId?: string;
  readonly resultOutboxMessageId?: string;
  readonly resultNotificationOutboxMessageId?: string;
  readonly resultNotificationIds?: readonly [string, string, string];
  readonly conversionEventId?: string;
  readonly conversionQueueEventId?: string;
  readonly conversionOutboxMessageId?: string;
  readonly conversionNotificationOutboxMessageId?: string;
  readonly conversionNotificationIds?: readonly [string, string, string];
}

export interface ReplacementCoachProjection {
  readonly userId: string;
  readonly displayName: string;
}

export interface AttendanceProjection {
  readonly attendanceId: string;
  readonly athleteUserId: string;
  readonly athleteDisplayName: string;
  readonly status: AttendanceStatus;
  readonly arrivalAt: string | null;
  readonly recordedByUserId: string;
  readonly recordedAt: string;
  readonly reasonCode: 'ABSENCE_PREVENTED_SESSION' | null;
  readonly comment: string | null;
}

export interface SessionLifecycleProjection {
  readonly sessionId: string;
  readonly bookingId: string;
  readonly bookingVersion: number;
  readonly challengeId: string | null;
  readonly challengeState: ChallengeState | null;
  readonly challengeVersion: number | null;
  readonly resultId: string | null;
  readonly venueId: string;
  readonly venueDisplayName: string;
  readonly coachUserId: string;
  readonly coachDisplayName: string;
  readonly guestCoachGrantId: string | null;
  readonly guestCoachGrantState: 'ACTIVE' | 'EXPIRED' | null;
  readonly guestCoachGrantExpiresAt: string | null;
  readonly athleteUserIds: readonly [string, string];
  readonly athleteDisplayNames: readonly [string, string];
  readonly activeAthleteUserIds: readonly string[];
  readonly activeAthleteDisplayNames: readonly string[];
  readonly purpose: 'TRAINING' | 'OFFICIAL_CHALLENGE';
  readonly state: SessionState;
  readonly scheduledStartAt: string;
  readonly scheduledEndAt: string;
  readonly windowOpenedAt: string | null;
  readonly actualStartAt: string | null;
  readonly actualEndAt: string | null;
  readonly latestCoachReplacementAt: string | null;
  readonly cancellationReasonCode: string | null;
  readonly noShowGraceMinutes: number;
  readonly attendance: readonly AttendanceProjection[];
  readonly viewerCanManage: boolean;
  readonly viewerCanRecordResult: boolean;
  readonly viewerCanAdminister: boolean;
  readonly viewerCanAuthorizeGuestCoach: boolean;
  readonly viewerCanReportCoachSafetyRefusal: boolean;
  readonly viewerCanRequestNoFaultReschedule: boolean;
  readonly viewerCanRequestOfficialConversion: boolean;
  readonly viewerCanCancelTraining: boolean;
  readonly viewerCanCancelOfficial: boolean;
  readonly officialConversion: BookingOfficialConversionProjection | null;
  readonly soloContinuation: BookingSoloContinuationProjection | null;
  readonly trainingRetention: BookingTrainingRetentionProjection | null;
  readonly replacementCoachOptions: readonly ReplacementCoachProjection[];
  readonly version: number;
}

export interface MySessionsProjection {
  readonly sessions: readonly SessionLifecycleProjection[];
  readonly completedTrainingCount: number;
}

interface SessionRow {
  readonly session_id: string;
  readonly booking_id: string;
  readonly booking_state: string;
  readonly booking_version: string;
  readonly challenge_id: string | null;
  readonly challenge_state: ChallengeState | null;
  readonly challenge_version: string | null;
  readonly result_id: string | null;
  readonly slot_id: string;
  readonly venue_id: string;
  readonly venue_display_name: string;
  readonly coach_user_id: string;
  readonly coach_display_name: string;
  readonly guest_coach_grant_id: string | null;
  readonly guest_coach_grant_state: 'ACTIVE' | 'EXPIRED' | null;
  readonly guest_coach_grant_expires_at: Date | null;
  readonly assigned_coach_has_community_grant: boolean;
  readonly pair_low_id: string;
  readonly pair_high_id: string;
  readonly athlete_low_name: string;
  readonly athlete_high_name: string;
  readonly solo_athlete_user_id: string | null;
  readonly purpose: SessionLifecycleProjection['purpose'];
  readonly state: SessionState;
  readonly scheduled_start_at: Date;
  readonly scheduled_end_at: Date;
  readonly window_opened_at: Date | null;
  readonly actual_start_at: Date | null;
  readonly actual_end_at: Date | null;
  readonly latest_coach_replacement_at: Date | null;
  readonly cancellation_reason_code: string | null;
  readonly no_show_grace_minutes: number;
  readonly version: string;
}

interface AttendanceRow {
  readonly attendance_id: string;
  readonly athlete_user_id: string;
  readonly athlete_display_name: string;
  readonly status: AttendanceStatus;
  readonly arrival_at: Date | null;
  readonly recorded_by: string;
  readonly recorded_at: Date;
  readonly reason_code: 'ABSENCE_PREVENTED_SESSION' | null;
  readonly comment: string | null;
}

function activeSessionAthleteIds(row: SessionRow): readonly string[] {
  return row.solo_athlete_user_id === null
    ? [row.pair_low_id, row.pair_high_id]
    : [row.solo_athlete_user_id];
}

function assertBookingReadyForSession(row: SessionRow): void {
  if (row.booking_state !== 'CONFIRMED_PAIR' && row.booking_state !== 'CONFIRMED_SOLO') {
    throw new SchedulingConflictError('SESSION_NOT_READY');
  }
}

interface SessionResourceRow {
  readonly booking_id: string;
  readonly booking_state: 'CONFIRMED_PAIR' | 'CONFIRMED_SOLO';
  readonly booking_version: string;
  readonly slot_id: string;
  readonly slot_state: 'BOOKED';
  readonly slot_version: string;
  readonly commercial_terms_snapshot: unknown;
}

interface CompetitiveSessionResourceRow {
  readonly booking_state: string;
  readonly booking_version: string;
  readonly slot_state: string;
  readonly slot_version: string;
}

interface OfficialSessionChallengeRow {
  readonly challenge_id: string;
  readonly competition_id: string;
  readonly community_id: string;
  readonly community_configuration_id: string;
  readonly community_venue_id: string;
  readonly source_chat_id: string;
  readonly pair_low_id: string;
  readonly pair_high_id: string;
  readonly state: ChallengeState;
  readonly stake: ChallengeStake;
  readonly ruleset_snapshot_id: string;
  readonly champion_user_id: string | null;
  readonly contender_user_id: string | null;
  readonly competition_status_version: string;
  readonly active_obligation_count: string;
  readonly scheduling_deadline_at: Date | null;
  readonly user_reschedule_count: number;
  readonly version: string;
}

interface CompetitiveSnapshotRow {
  readonly snapshot_id: string;
  readonly effective_stake: ChallengeStake;
}

interface SessionStartConversionRow {
  readonly conversion_id: string;
  readonly competition_id: string;
  readonly state: 'WAITING_FIFO' | 'PENDING_CONFIRMATION';
  readonly version: string;
  readonly queue_entry_id: string | null;
  readonly queue_version: string | null;
  readonly booking_version: string;
}

function requiredChallengeTransitionIds(ids: SessionEffectIds): {
  readonly eventId: string;
  readonly outboxMessageId: string;
} {
  if (!ids.challengeEventId || !ids.challengeOutboxMessageId) {
    throw new TypeError('Official Challenge transition effect IDs are required');
  }
  return {
    eventId: ids.challengeEventId,
    outboxMessageId: ids.challengeOutboxMessageId,
  };
}

function requiredExternalChallengeRescheduleIds(ids: SessionEffectIds): {
  readonly eventId: string;
  readonly outboxMessageId: string;
  readonly rescheduleId: string;
} {
  const transition = requiredChallengeTransitionIds(ids);
  if (!ids.rescheduleId) {
    throw new TypeError('Official external reschedule ID is required');
  }
  return { ...transition, rescheduleId: ids.rescheduleId };
}

function requiredCompetitiveSnapshotId(ids: SessionEffectIds): string {
  if (!ids.competitiveSnapshotId) {
    throw new TypeError('Official Session competitive snapshot ID is required');
  }
  return ids.competitiveSnapshotId;
}

function normalizeComment(comment: string | null): string | null {
  if (comment === null) return null;
  const value = comment.trim();
  if (value.length === 0 || value.length > 500) {
    throw new SchedulingValidationError('comment');
  }
  return value;
}

function attendanceProjection(row: AttendanceRow): AttendanceProjection {
  return {
    attendanceId: row.attendance_id,
    athleteUserId: row.athlete_user_id,
    athleteDisplayName: row.athlete_display_name,
    status: row.status,
    arrivalAt: row.arrival_at?.toISOString() ?? null,
    recordedByUserId: row.recorded_by,
    recordedAt: row.recorded_at.toISOString(),
    reasonCode: row.reason_code,
    comment: row.comment,
  };
}

async function attendanceForSession(
  database: Kysely<Database> | Transaction<Database>,
  sessionId: string,
): Promise<readonly AttendanceProjection[]> {
  const result = await sql<AttendanceRow>`
    select attendance.attendance_id, attendance.athlete_user_id,
      athlete.display_name as athlete_display_name, attendance.status,
      attendance.arrival_at, attendance.recorded_by, attendance.recorded_at,
      attendance.reason_code, attendance.comment
    from scheduling.attendance as attendance
    join identity.users as athlete on athlete.user_id = attendance.athlete_user_id
    where attendance.session_id = ${sessionId}::uuid
    order by attendance.recorded_at, attendance.athlete_user_id
  `.execute(database);
  return result.rows.map(attendanceProjection);
}

async function hasActiveCoachScope(
  database: Kysely<Database> | Transaction<Database>,
  row: SessionRow,
  actorId: string,
): Promise<boolean> {
  if (actorId !== row.coach_user_id) return false;
  const result = await sql<{ readonly allowed: boolean }>`
    select true as allowed
    where exists (
      select 1
      from community.role_grants as role_grant
      where role_grant.user_id = ${actorId}::uuid
        and role_grant.role = 'COACH'
        and role_grant.state = 'ACTIVE'
        and (role_grant.expires_at is null or role_grant.expires_at > clock_timestamp())
        and (
          (
            role_grant.scope_type = 'SESSION'
            and role_grant.scope_id = ${row.session_id}::uuid
            and ${row.state} <> 'CANCELLED'
            and not exists (
              select 1 from competition.results as terminal_result
              where terminal_result.session_id = ${row.session_id}::uuid
                and terminal_result.state in ('FINAL', 'REVERSED', 'ANNULLED', 'REPEAT_ORDERED')
            )
          )
          or (
            role_grant.scope_type = 'COMMUNITY'
            and role_grant.scope_id in (
              select community_id from community.communities
              where venue_id = ${row.venue_id}::uuid and state <> 'CLOSED'
            )
          )
        )
    )
  `.execute(database);
  return result.rows[0]?.allowed === true;
}

async function isAssignedMissingResultReviewer(
  database: Kysely<Database> | Transaction<Database>,
  sessionId: string,
  actorId: string,
): Promise<boolean> {
  const result = await sql<{ readonly allowed: boolean }>`
    select exists (
      select 1 from competition.missing_result_reviews as review
      where review.session_id = ${sessionId}::uuid
        and review.state = 'REVIEWER_ASSIGNED'
        and review.assigned_reviewer_coach_user_id = ${actorId}::uuid
    ) as allowed
  `.execute(database);
  return result.rows[0]?.allowed === true;
}

async function assertActiveCoachScope(
  database: Kysely<Database> | Transaction<Database>,
  row: SessionRow,
  actorId: string,
): Promise<void> {
  assertSessionCoach({
    actorId,
    coachUserId: row.coach_user_id,
    athleteUserIds: [row.pair_low_id, row.pair_high_id],
  });
  if (!(await hasActiveCoachScope(database, row, actorId))) {
    throw new SchedulingPermissionDeniedError();
  }
}

async function hasActiveVenueAdminScope(
  database: Kysely<Database> | Transaction<Database>,
  actorId: string,
  venueId: string,
): Promise<boolean> {
  const result = await sql<{ readonly allowed: boolean }>`
    select true as allowed
    where exists (
      select 1 from community.role_grants
      where user_id = ${actorId}::uuid
        and role in ('PRIMARY_ADMIN', 'GYM_ADMIN')
        and scope_type = 'VENUE'
        and scope_id = ${venueId}::uuid
        and state = 'ACTIVE'
        and (expires_at is null or expires_at > clock_timestamp())
    )
  `.execute(database);
  return result.rows[0]?.allowed === true;
}

async function hasActiveCentralScope(
  database: Kysely<Database> | Transaction<Database>,
  actorId: string,
): Promise<boolean> {
  const result = await sql<{ readonly allowed: boolean }>`
    select true as allowed
    where exists (
      select 1 from community.role_grants role_grant
      join identity.users actor on actor.user_id = role_grant.user_id
      where role_grant.user_id = ${actorId}::uuid
        and actor.account_state = 'ACTIVE'
        and role_grant.role = 'CENTRAL_ADMIN' and role_grant.scope_type = 'GLOBAL'
        and role_grant.state = 'ACTIVE'
        and (role_grant.expires_at is null or role_grant.expires_at > clock_timestamp())
    )
  `.execute(database);
  return result.rows[0]?.allowed === true;
}

async function replacementCoachOptions(
  database: Kysely<Database> | Transaction<Database>,
  row: SessionRow,
): Promise<readonly ReplacementCoachProjection[]> {
  const result = await sql<{
    readonly user_id: string;
    readonly display_name: string;
  }>`
    select distinct candidate.user_id, candidate.display_name
    from community.communities as community
    join community.role_grants as role_grant
      on role_grant.role = 'COACH'
      and role_grant.scope_type = 'COMMUNITY'
      and role_grant.scope_id = community.community_id
      and role_grant.state = 'ACTIVE'
      and (role_grant.expires_at is null or role_grant.expires_at > clock_timestamp())
    join identity.users as candidate on candidate.user_id = role_grant.user_id
    where community.venue_id = ${row.venue_id}::uuid
      and community.state <> 'CLOSED'
      and candidate.account_state = 'ACTIVE'
      and candidate.user_id <> ${row.coach_user_id}::uuid
      and candidate.user_id not in (${row.pair_low_id}::uuid, ${row.pair_high_id}::uuid)
      and not exists (
        select 1 from scheduling.slots as conflict
        where conflict.coach_user_id = candidate.user_id
          and conflict.slot_id <> ${row.slot_id}::uuid
          and conflict.state in ('PUBLISHED', 'BOOKED')
          and tstzrange(conflict.start_at, conflict.end_at, '[)')
            && tstzrange(${row.scheduled_start_at.toISOString()}::timestamptz,
              ${row.scheduled_end_at.toISOString()}::timestamptz, '[)')
      )
    order by candidate.display_name, candidate.user_id
  `.execute(database);
  return result.rows.map((candidate) => ({
    userId: candidate.user_id,
    displayName: candidate.display_name,
  }));
}

async function officialChallengeForSession(
  transaction: Transaction<Database>,
  session: SessionRow,
): Promise<OfficialSessionChallengeRow | null> {
  if (session.purpose === 'TRAINING') return null;
  if (!session.challenge_id) {
    throw new ChallengeConflictError('CHALLENGE_SESSION_MISMATCH');
  }
  const result = await sql<OfficialSessionChallengeRow>`
    select challenge.challenge_id, challenge.competition_id,
      competition.community_id,
      ruleset.community_configuration_id,
      community.venue_id as community_venue_id, challenge.source_chat_id,
      challenge.pair_low_id, challenge.pair_high_id, challenge.state,
      challenge.stake, challenge.ruleset_snapshot_id,
      competition.champion_user_id, competition.contender_user_id,
      competition.status_version::text as competition_status_version,
      (select count(*)::text
        from competition.challenge_participant_obligations as obligation
        where obligation.challenge_id = challenge.challenge_id
          and obligation.released_at is null) as active_obligation_count,
      challenge.scheduling_deadline_at, challenge.user_reschedule_count,
      challenge.version::text as version
    from competition.challenges as challenge
    join competition.competitions as competition
      on competition.competition_id = challenge.competition_id
    join competition.ruleset_snapshots as ruleset
      on ruleset.ruleset_snapshot_id = challenge.ruleset_snapshot_id
      and ruleset.competition_id = competition.competition_id
    join community.communities as community
      on community.community_id = competition.community_id
    where challenge.challenge_id = ${session.challenge_id}::uuid
    for update of challenge, competition, community
  `.execute(transaction);
  const challenge = result.rows[0];
  if (
    !challenge
    || challenge.pair_low_id !== session.pair_low_id
    || challenge.pair_high_id !== session.pair_high_id
    || challenge.community_venue_id !== session.venue_id
  ) {
    throw new ChallengeConflictError('CHALLENGE_SESSION_MISMATCH');
  }
  return challenge;
}

async function competitiveSnapshotForSession(
  transaction: Transaction<Database>,
  sessionId: string,
): Promise<CompetitiveSnapshotRow | null> {
  const result = await sql<CompetitiveSnapshotRow>`
    select snapshot_id, effective_stake
    from scheduling.session_competitive_snapshots
    where session_id = ${sessionId}::uuid
  `.execute(transaction);
  return result.rows[0] ?? null;
}

async function assertNoCompetitionStatusReviewHold(
  transaction: Transaction<Database>,
  challengeId: string,
): Promise<void> {
  const result = await sql<{ readonly hold_active: boolean }>`
    select exists (
      select 1 from competition.process_holds as process_hold
      where process_hold.aggregate_type = 'COMPETITION'
        and process_hold.aggregate_id = competition.competition_id
        and process_hold.reason = 'STATUS_REVIEW'
        and process_hold.state = 'ACTIVE'
    ) as hold_active
    from competition.challenges as challenge
    join competition.competitions as competition
      on competition.competition_id = challenge.competition_id
    where challenge.challenge_id = ${challengeId}::uuid
    for update of competition
  `.execute(transaction);
  if (result.rows[0]?.hold_active) {
    throw new SchedulingConflictError('COMPETITION_STATUS_REVIEW_HOLD');
  }
}

async function readSessionRow(
  database: Kysely<Database> | Transaction<Database>,
  sessionId: string,
  lock = false,
): Promise<SessionRow | null> {
  const result = await sql<SessionRow>`
    select session.session_id, session.booking_id, session.challenge_id,
      booking.state as booking_state, booking.version::text as booking_version,
      challenge.state as challenge_state,
      challenge.version::text as challenge_version,
      result.result_id,
      slot.slot_id, session.venue_id,
      venue.display_name as venue_display_name, session.coach_user_id,
      coach.display_name as coach_display_name,
      guest_grant.grant_id as guest_coach_grant_id,
      guest_grant.state as guest_coach_grant_state,
      guest_grant.expires_at as guest_coach_grant_expires_at,
      exists (
        select 1 from community.role_grants as community_coach_grant
        where community_coach_grant.user_id = session.coach_user_id
          and community_coach_grant.role = 'COACH'
          and community_coach_grant.scope_type = 'COMMUNITY'
          and community_coach_grant.state = 'ACTIVE'
          and (community_coach_grant.expires_at is null
            or community_coach_grant.expires_at > clock_timestamp())
      ) as assigned_coach_has_community_grant,
      session.pair_low_id, session.pair_high_id,
      athlete_low.display_name as athlete_low_name,
      athlete_high.display_name as athlete_high_name,
      session.solo_athlete_user_id,
      session.purpose, session.state, session.scheduled_start_at,
      session.scheduled_end_at, session.window_opened_at,
      session.actual_start_at, session.actual_end_at,
      booking.coach_replaced_at as latest_coach_replacement_at,
      session.cancellation_reason_code,
      coalesce(configuration.no_show_grace_minutes, 15)::integer as no_show_grace_minutes,
      session.version::text as version
    from scheduling.sessions as session
    join scheduling.bookings as booking on booking.booking_id = session.booking_id
    join scheduling.slots as slot on slot.slot_id = booking.slot_id
    join community.venues as venue on venue.venue_id = session.venue_id
    join identity.users as coach on coach.user_id = session.coach_user_id
    join identity.users as athlete_low on athlete_low.user_id = session.pair_low_id
    join identity.users as athlete_high on athlete_high.user_id = session.pair_high_id
    left join competition.challenges as challenge on challenge.challenge_id = session.challenge_id
    left join competition.results as result
      on result.challenge_id = challenge.challenge_id and result.cycle_no = challenge.cycle_no
    left join lateral (
      select role_grant.grant_id, role_grant.state, role_grant.expires_at
      from community.role_grants as role_grant
      where role_grant.user_id = session.coach_user_id
        and role_grant.role = 'COACH' and role_grant.scope_type = 'SESSION'
        and role_grant.scope_id = session.session_id
      order by role_grant.created_at desc, role_grant.grant_id desc
      limit 1
    ) as guest_grant on true
    left join lateral (
      select config.no_show_grace_minutes
      from community.communities as community
      join community.community_configuration_versions as config
        on config.configuration_id = community.configuration_id
      where community.venue_id = session.venue_id and community.state <> 'CLOSED'
      order by community.created_at desc
      limit 1
    ) as configuration on true
    where session.session_id = ${sessionId}::uuid
    ${lock ? sql`for update of session` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function sessionProjection(
  database: Kysely<Database> | Transaction<Database>,
  row: SessionRow,
  viewerUserId: string,
): Promise<SessionLifecycleProjection> {
  const viewerCanAdminister = await hasActiveVenueAdminScope(
    database,
    viewerUserId,
    row.venue_id,
  );
  const viewerCanManage = await hasActiveCoachScope(database, row, viewerUserId);
  const viewerIsAssignedReviewer = await isAssignedMissingResultReviewer(
    database,
    row.session_id,
    viewerUserId,
  );
  const officialConversion = await readBookingOfficialConversionForSession(
    database,
    row.session_id,
    viewerUserId,
  );
  const soloContinuation = await readBookingSoloContinuationForSession(
    database,
    row.session_id,
    viewerUserId,
  );
  const trainingRetention = await readBookingTrainingRetentionForSession(
    database,
    row.session_id,
    viewerUserId,
  );
  const viewerIsAthlete = [row.pair_low_id, row.pair_high_id].includes(viewerUserId);
  const activeAthleteUserIds = activeSessionAthleteIds(row);
  const activeAthleteDisplayNames = activeAthleteUserIds.map((athleteUserId) => (
    athleteUserId === row.pair_low_id ? row.athlete_low_name : row.athlete_high_name
  ));
  return {
    sessionId: row.session_id,
    bookingId: row.booking_id,
    bookingVersion: Number(row.booking_version),
    challengeId: row.challenge_id,
    challengeState: row.challenge_state,
    challengeVersion: row.challenge_version === null ? null : Number(row.challenge_version),
    resultId: row.result_id,
    venueId: row.venue_id,
    venueDisplayName: row.venue_display_name,
    coachUserId: row.coach_user_id,
    coachDisplayName: row.coach_display_name,
    guestCoachGrantId: row.guest_coach_grant_id,
    guestCoachGrantState: row.guest_coach_grant_state,
    guestCoachGrantExpiresAt: row.guest_coach_grant_expires_at?.toISOString() ?? null,
    athleteUserIds: [row.pair_low_id, row.pair_high_id],
    athleteDisplayNames: [row.athlete_low_name, row.athlete_high_name],
    activeAthleteUserIds,
    activeAthleteDisplayNames,
    purpose: row.purpose,
    state: row.state,
    scheduledStartAt: row.scheduled_start_at.toISOString(),
    scheduledEndAt: row.scheduled_end_at.toISOString(),
    windowOpenedAt: row.window_opened_at?.toISOString() ?? null,
    actualStartAt: row.actual_start_at?.toISOString() ?? null,
    actualEndAt: row.actual_end_at?.toISOString() ?? null,
    latestCoachReplacementAt: row.latest_coach_replacement_at?.toISOString() ?? null,
    cancellationReasonCode: row.cancellation_reason_code,
    noShowGraceMinutes: row.no_show_grace_minutes,
    attendance: await attendanceForSession(database, row.session_id),
    viewerCanManage,
    viewerCanRecordResult: viewerCanManage || viewerIsAssignedReviewer,
    viewerCanAdminister,
    viewerCanAuthorizeGuestCoach:
      viewerCanAdminister
      && (row.state === 'SCHEDULED' || row.state === 'READY_FOR_COACH')
      && ![row.pair_low_id, row.pair_high_id].includes(row.coach_user_id)
      && !row.assigned_coach_has_community_grant
      && row.guest_coach_grant_state !== 'ACTIVE',
    viewerCanReportCoachSafetyRefusal:
      viewerCanManage
      && row.purpose === 'OFFICIAL_CHALLENGE'
      && row.challenge_state === 'BOOKED'
      && (row.state === 'SCHEDULED' || row.state === 'READY_FOR_COACH')
      && row.actual_start_at === null
      && row.result_id === null,
    viewerCanRequestNoFaultReschedule:
      viewerIsAthlete
      && row.latest_coach_replacement_at !== null
      && (row.state === 'SCHEDULED' || row.state === 'READY_FOR_COACH')
      && row.actual_start_at === null,
    viewerCanRequestOfficialConversion:
      viewerIsAthlete
      && row.purpose === 'TRAINING'
      && row.booking_state === 'CONFIRMED_PAIR'
      && row.state === 'SCHEDULED'
      && row.window_opened_at === null
      && row.actual_start_at === null
      && row.scheduled_start_at > new Date()
      && officialConversion === null
      && soloContinuation === null,
    viewerCanCancelTraining:
      activeAthleteUserIds.includes(viewerUserId)
      && row.purpose === 'TRAINING'
      && (row.booking_state === 'CONFIRMED_PAIR'
        || row.booking_state === 'OFFICIAL_CONVERSION_PENDING')
      && row.state === 'SCHEDULED'
      && row.actual_start_at === null
      && row.scheduled_start_at > new Date()
      && soloContinuation === null,
    viewerCanCancelOfficial:
      activeAthleteUserIds.includes(viewerUserId)
      && row.purpose === 'OFFICIAL_CHALLENGE'
      && row.booking_state === 'CONFIRMED_PAIR'
      && row.challenge_state === 'BOOKED'
      && (row.state === 'SCHEDULED' || row.state === 'READY_FOR_COACH')
      && row.actual_start_at === null
      && row.result_id === null,
    officialConversion,
    soloContinuation,
    trainingRetention,
    replacementCoachOptions: viewerCanAdminister
      ? await replacementCoachOptions(database, row)
      : [],
    version: Number(row.version),
  };
}

export async function readSession(
  database: Kysely<Database>,
  sessionId: string,
  viewerUserId: string,
): Promise<SessionLifecycleProjection> {
  const row = await readSessionRow(database, sessionId);
  if (!row) throw new SchedulingPermissionDeniedError();
  const directParticipant = [row.pair_low_id, row.pair_high_id, row.coach_user_id]
    .includes(viewerUserId);
  if (
    !directParticipant
    && !(await hasActiveVenueAdminScope(database, viewerUserId, row.venue_id))
    && !(await isAssignedMissingResultReviewer(database, row.session_id, viewerUserId))
  ) {
    throw new SchedulingPermissionDeniedError();
  }
  return sessionProjection(database, row, viewerUserId);
}

export async function readMySessions(
  database: Kysely<Database>,
  viewerUserId: string,
): Promise<MySessionsProjection> {
  const result = await sql<{ readonly session_id: string }>`
    select session_id
    from scheduling.sessions
    where ${viewerUserId}::uuid in (pair_low_id, pair_high_id, coach_user_id)
      or exists (
        select 1 from community.role_grants as role_grant
        where role_grant.user_id = ${viewerUserId}::uuid
          and role_grant.role in ('PRIMARY_ADMIN', 'GYM_ADMIN')
          and role_grant.scope_type = 'VENUE'
          and role_grant.scope_id = scheduling.sessions.venue_id
          and role_grant.state = 'ACTIVE'
          and (role_grant.expires_at is null or role_grant.expires_at > clock_timestamp())
      )
      or exists (
        select 1 from competition.missing_result_reviews as review
        where review.session_id = scheduling.sessions.session_id
          and review.state = 'REVIEWER_ASSIGNED'
          and review.assigned_reviewer_coach_user_id = ${viewerUserId}::uuid
      )
    order by
      case state
        when 'IN_PROGRESS' then 0
        when 'READY_FOR_COACH' then 1
        when 'SCHEDULED' then 2
        else 3
      end,
      scheduled_start_at desc,
      session_id
    limit 50
  `.execute(database);
  const sessions = await Promise.all(
    result.rows.map(async (item) => {
      const row = await readSessionRow(database, item.session_id);
      if (!row) throw new SchedulingPermissionDeniedError();
      return sessionProjection(database, row, viewerUserId);
    }),
  );
  const stats = await sql<{ readonly completed_training_count: string }>`
    select count(*)::text as completed_training_count
    from scheduling.attendance as attendance
    join scheduling.sessions as session on session.session_id = attendance.session_id
    where attendance.athlete_user_id = ${viewerUserId}::uuid
      and attendance.status in ('PRESENT', 'LATE')
      and session.purpose = 'TRAINING'
      and session.state = 'ENDED'
  `.execute(database);
  return {
    sessions,
    completedTrainingCount: Number(stats.rows[0]?.completed_training_count ?? '0'),
  };
}

export async function readSessionTimerSnapshot(
  database: Kysely<Database>,
  sessionId: string,
): Promise<TimerAggregateSnapshot> {
  const result = await sql<{ readonly state: string; readonly version: string }>`
    select state, version::text as version
    from scheduling.sessions where session_id = ${sessionId}::uuid
  `.execute(database);
  const row = result.rows[0];
  return row
    ? { state: row.state, version: Number(row.version) }
    : { state: 'MISSING', version: 0 };
}

async function readSessionResourcesForUpdate(
  transaction: Transaction<Database>,
  row: SessionRow,
): Promise<SessionResourceRow> {
  const result = await sql<SessionResourceRow>`
    select booking.booking_id, booking.state as booking_state,
      booking.version::text as booking_version,
      slot.slot_id, slot.state as slot_state, slot.version::text as slot_version,
      booking.commercial_terms_snapshot
    from scheduling.bookings as booking
    join scheduling.slots as slot on slot.slot_id = booking.slot_id
    where booking.booking_id = ${row.booking_id}::uuid
      and booking.state in ('CONFIRMED_PAIR', 'CONFIRMED_SOLO')
      and slot.state = 'BOOKED'
    for update of booking, slot
  `.execute(transaction);
  const resource = result.rows[0];
  if (!resource) throw new SchedulingConflictError('SESSION_NOT_READY');
  return resource;
}

function noFaultCancellationOutbox(
  ids: SessionEffectIds,
  row: SessionRow,
  reasonCode: string,
  challengeReturnedToScheduling = false,
) {
  if (!ids.notificationOutboxMessageId || !ids.notificationIds) {
    throw new SchedulingPermissionDeniedError();
  }
  return [
    {
      messageId: ids.outboxMessageId,
      topic: 'scheduling.session.cancelled-no-fault.v1',
      payload: { sessionId: row.session_id, bookingId: row.booking_id, reasonCode },
    },
    {
      messageId: ids.notificationOutboxMessageId,
      topic: 'notification.in_app.v1',
      payload: {
        notifications: [row.pair_low_id, row.pair_high_id].map(
          (recipientUserId, index) => ({
            notificationId: ids.notificationIds![index]!,
            recipientUserId,
            category: 'SERVICE',
            renderKey: challengeReturnedToScheduling && row.challenge_id
              ? 'challenge.external-rescheduled'
              : 'booking.cancelled-no-fault',
            actionTarget: challengeReturnedToScheduling && row.challenge_id
              ? { type: 'CHALLENGE', challengeId: row.challenge_id }
              : { type: 'SESSION', sessionId: row.session_id },
            payload: {
              bookingId: row.booking_id,
              sessionId: row.session_id,
              reasonCode,
              ...(challengeReturnedToScheduling && row.challenge_id
                ? {
                    challengeId: row.challenge_id,
                    challengeState: 'ACCEPTED_UNSCHEDULED',
                  }
                : {}),
            },
            deadlineAt: null,
          }),
        ),
      },
    },
  ];
}

async function cancelConfirmedSessionResources(
  transaction: Transaction<Database>,
  row: SessionRow,
  resource: SessionResourceRow,
  context: { readonly occurredAt: Date; readonly nextVersion: number },
  actorId: string,
  reasonCode: string,
): Promise<{ readonly bookingVersion: number; readonly slotVersion: number; readonly updated: SessionRow }> {
  const bookingVersion = Number(resource.booking_version) + 1;
  const slotVersion = Number(resource.slot_version) + 1;
  await sql`
    update scheduling.sessions
    set state = 'CANCELLED', cancelled_at = ${context.occurredAt.toISOString()}::timestamptz,
      cancelled_by = ${actorId}::uuid, cancellation_reason_code = ${reasonCode},
      version = ${context.nextVersion},
      updated_at = ${context.occurredAt.toISOString()}::timestamptz
    where session_id = ${row.session_id}::uuid
      and state in ('SCHEDULED', 'READY_FOR_COACH')
  `.execute(transaction);
  await sql`
    update scheduling.bookings
    set state = 'CANCELLED', cancelled_at = ${context.occurredAt.toISOString()}::timestamptz,
      cancel_actor = ${actorId}::uuid, cancel_reason = ${reasonCode},
      version = ${bookingVersion},
      updated_at = ${context.occurredAt.toISOString()}::timestamptz
    where booking_id = ${row.booking_id}::uuid
      and state in ('CONFIRMED_PAIR', 'CONFIRMED_SOLO')
  `.execute(transaction);
  await sql`
    update scheduling.slots
    set state = 'CANCELLED', version = ${slotVersion},
      updated_at = ${context.occurredAt.toISOString()}::timestamptz
    where slot_id = ${resource.slot_id}::uuid and state = 'BOOKED'
  `.execute(transaction);
  return {
    bookingVersion,
    slotVersion,
    updated: {
      ...row,
      state: 'CANCELLED',
      cancellation_reason_code: reasonCode,
      version: String(context.nextVersion),
    },
  };
}

async function operationalSafetyRecipients(
  transaction: Transaction<Database>,
  row: SessionRow,
  reporterUserId: string,
): Promise<readonly string[]> {
  const result = await sql<{
    readonly venue_admin_user_id: string | null;
    readonly central_user_id: string | null;
  }>`
    select
      (
        select role_grant.user_id
        from community.role_grants as role_grant
        where role_grant.role in ('PRIMARY_ADMIN', 'GYM_ADMIN')
          and role_grant.scope_type = 'VENUE'
          and role_grant.scope_id = ${row.venue_id}::uuid
          and role_grant.state = 'ACTIVE'
          and role_grant.user_id <> ${reporterUserId}::uuid
          and (role_grant.expires_at is null or role_grant.expires_at > clock_timestamp())
        order by role_grant.created_at, role_grant.grant_id
        limit 1
      ) as venue_admin_user_id,
      (
        select role_grant.user_id
        from community.role_grants as role_grant
        where role_grant.role = 'CENTRAL_ADMIN'
          and role_grant.scope_type = 'GLOBAL' and role_grant.scope_id is null
          and role_grant.state = 'ACTIVE'
          and role_grant.user_id <> ${reporterUserId}::uuid
          and (role_grant.expires_at is null or role_grant.expires_at > clock_timestamp())
        order by role_grant.created_at, role_grant.grant_id
        limit 1
      ) as central_user_id
  `.execute(transaction);
  const operational = result.rows[0];
  return [...new Set([
    row.pair_low_id,
    row.pair_high_id,
    row.coach_user_id,
    operational?.venue_admin_user_id ?? null,
    operational?.central_user_id ?? null,
  ].filter((recipient): recipient is string => recipient !== null && recipient !== reporterUserId))];
}

export async function reportSafetyAndCancelSession(
  database: Kysely<Database>,
  command: CommandEnvelope<ReportSafetyAndCancelSessionPayload>,
  ids: SafetyCancellationEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<SafetyCancellationProjection>> {
  if (
    !command.actor.id
    || command.aggregateType !== 'Session'
    || command.aggregateId !== command.payload.sessionId
    || !['REPORT_SAFETY_AND_CANCEL', 'REFUSE_UNSAFE_SESSION'].includes(command.commandType)
  ) {
    throw new SchedulingPermissionDeniedError();
  }
  const reporterUserId = command.actor.id;
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await readSessionRow(transaction, command.aggregateId, true);
      if (!row) throw new SchedulingConflictError('SAFETY_CANCELLATION_NOT_ALLOWED');
      const resource = await readSessionResourcesForUpdate(transaction, row);
      const challenge = await officialChallengeForSession(transaction, row);
      if (!challenge) throw new SchedulingConflictError('SAFETY_CANCELLATION_NOT_ALLOWED');
      assertExpectedVersion(
        Number(resource.booking_version),
        command.payload.expectedBookingVersion,
      );
      assertExpectedVersion(
        Number(challenge.version),
        command.payload.expectedChallengeVersion,
      );
      const reporterIsAthlete = [row.pair_low_id, row.pair_high_id].includes(reporterUserId);
      const actorIsAssignedCoach = await hasActiveCoachScope(transaction, row, reporterUserId);
      const actorIsOperational = actorIsAssignedCoach
        || await hasActiveVenueAdminScope(transaction, reporterUserId, row.venue_id)
        || await hasActiveCentralScope(transaction, reporterUserId);
      const isCoachRefusal = command.commandType === 'REFUSE_UNSAFE_SESSION';
      if (isCoachRefusal) {
        assertSessionCoach({
          actorId: reporterUserId,
          coachUserId: row.coach_user_id,
          athleteUserIds: [row.pair_low_id, row.pair_high_id],
        });
        if (!actorIsAssignedCoach) throw new SchedulingPermissionDeniedError();
      }
      const reasonCode = assertSafetyCancellationCanBeSubmitted({
        sessionState: row.state,
        sessionPurpose: row.purpose,
        bookingState: resource.booking_state,
        challengeState: challenge.state,
        actualStartAt: row.actual_start_at?.toISOString() ?? null,
        resultExists: row.result_id !== null,
        explicitConfirmation: command.payload.explicitConfirmation,
        reporterUserId,
        subjectUserId: command.payload.subjectUserId,
        athleteUserIds: [row.pair_low_id, row.pair_high_id],
        actorIsOperational,
        actorIsAssignedCoach,
        reporterPolicy: isCoachRefusal ? 'ASSIGNED_COACH_ONLY' : 'PARTICIPANT_OR_OPERATIONAL',
        reasonCode: command.payload.reasonCode,
      });
      if (!reporterIsAthlete && !actorIsOperational) {
        throw new SchedulingPermissionDeniedError();
      }
      const initialDueAt = new Date(context.occurredAt.getTime() + 24 * 60 * 60 * 1_000);
      const finalDueAt = new Date(context.occurredAt.getTime() + 48 * 60 * 60 * 1_000);
      await sql`
        insert into governance.moderation_cases (
          case_id, case_type, state, report_id, chat_id, message_id,
          reporter_user_id, subject_user_id, reason_code,
          challenge_id, booking_id, session_id, initial_due_at, final_due_at,
          submitted_at, version
        ) values (
          ${ids.caseId}::uuid, 'SAFETY', 'SUBMITTED', null,
          ${challenge.source_chat_id}::uuid, null,
          ${reporterUserId}::uuid, ${command.payload.subjectUserId}::uuid,
          ${reasonCode}, ${challenge.challenge_id}::uuid, ${row.booking_id}::uuid,
          ${row.session_id}::uuid, ${initialDueAt.toISOString()}::timestamptz,
          ${finalDueAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz, 1
        )
      `.execute(transaction);
      const cancelled = await cancelConfirmedSessionResources(
        transaction,
        row,
        resource,
        context,
        reporterUserId,
        isCoachRefusal ? 'COACH_SAFETY_REFUSAL' : 'SAFETY_CASE_SUBMITTED',
      );
      const challengeVersion = Number(challenge.version) + 1;
      await sql`
        update competition.challenges
        set version = ${challengeVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where challenge_id = ${challenge.challenge_id}::uuid
          and state = 'BOOKED' and version = ${Number(challenge.version)}
      `.execute(transaction);
      await sql`
        insert into competition.process_holds (
          hold_id, aggregate_type, aggregate_id, reason, state, deadline_policy,
          moderation_case_id, created_by, created_by_type, started_at, version,
          created_at, updated_at
        ) values (
          ${ids.holdId}::uuid, 'CHALLENGE', ${challenge.challenge_id}::uuid,
          'SAFETY', 'ACTIVE', 'PAUSE', ${ids.caseId}::uuid,
          ${reporterUserId}::uuid, 'USER', ${context.occurredAt.toISOString()}::timestamptz,
          1, ${context.occurredAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      const recipients = await operationalSafetyRecipients(
        transaction,
        row,
        reporterUserId,
      );
      const response: SafetyCancellationProjection = {
        action: isCoachRefusal
          ? 'COACH_REFUSED_UNSAFE_SESSION'
          : 'SAFETY_REPORTED_AND_CANCELLED',
        caseId: ids.caseId,
        caseState: 'SUBMITTED',
        challengeId: challenge.challenge_id,
        bookingId: row.booking_id,
        sessionId: row.session_id,
        holdId: ids.holdId,
        holdState: 'ACTIVE',
        initialDueAt: initialDueAt.toISOString(),
        finalDueAt: finalDueAt.toISOString(),
        submittedAt: context.occurredAt.toISOString(),
        sessionVersion: context.nextVersion,
        bookingVersion: cancelled.bookingVersion,
        slotVersion: cancelled.slotVersion,
        challengeVersion,
      };
      const relatedEvents: RelatedDomainEventDraft[] = [
        {
          eventId: ids.caseEventId, eventName: 'SafetyCaseSubmitted', schemaVersion: 1,
          aggregateType: 'ModerationCase', aggregateId: ids.caseId,
          aggregateVersion: 1, transitionId: 'MC-02',
          payload: {
            caseId: ids.caseId, caseType: 'SAFETY', state: 'SUBMITTED',
            challengeId: challenge.challenge_id, bookingId: row.booking_id,
            sessionId: row.session_id, initialDueAt: initialDueAt.toISOString(),
            finalDueAt: finalDueAt.toISOString(),
          },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        {
          eventId: ids.bookingEventId, eventName: 'BookingCancelledNoFault', schemaVersion: 1,
          aggregateType: 'Booking', aggregateId: row.booking_id,
          aggregateVersion: cancelled.bookingVersion, transitionId: 'B-32',
          payload: { bookingId: row.booking_id, cause: 'SAFETY_CASE', noSportingSanction: true },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        {
          eventId: ids.slotEventId, eventName: 'SlotBookingCancelled', schemaVersion: 1,
          aggregateType: 'Slot', aggregateId: resource.slot_id,
          aggregateVersion: cancelled.slotVersion, transitionId: 'SL-06',
          payload: { slotId: resource.slot_id, cause: 'SAFETY_CASE' },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        {
          eventId: ids.challengeEventId, eventName: 'ChallengeSafetyHoldStarted', schemaVersion: 1,
          aggregateType: 'Challenge', aggregateId: challenge.challenge_id,
          aggregateVersion: challengeVersion, transitionId: 'MC-02',
          payload: { challengeId: challenge.challenge_id, holdId: ids.holdId, deadlinePaused: true },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        {
          eventId: ids.holdEventId, eventName: 'ProcessHoldStarted', schemaVersion: 1,
          aggregateType: 'ProcessHold', aggregateId: ids.holdId,
          aggregateVersion: 1, transitionId: 'MC-02',
          payload: {
            holdId: ids.holdId, aggregateType: 'CHALLENGE',
            aggregateId: challenge.challenge_id, reason: 'SAFETY', deadlinePolicy: 'PAUSE',
          },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
      ];
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId, eventName: 'SessionCancelledForSafetyReview',
          schemaVersion: 1, transitionId: 'MC-02',
          payload: {
            sessionId: row.session_id, bookingId: row.booking_id,
            challengeId: challenge.challenge_id, noFault: true,
          },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        relatedEvents,
        audit: {
          auditId: ids.auditId,
          action: isCoachRefusal ? 'REFUSE_UNSAFE_SESSION' : 'REPORT_SAFETY_AND_CANCEL',
          transitionId: 'MC-02',
          reasonCode, beforeState: row.state, afterState: 'CANCELLED',
          metadata: {
            caseId: ids.caseId, holdId: ids.holdId, reporterUserId,
            subjectUserId: command.payload.subjectUserId,
            challengeId: challenge.challenge_id, bookingId: row.booking_id,
            ...(isCoachRefusal ? { faultAttribution: 'EXTERNAL' } : {}),
          },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'scheduling.session.cancelled-for-safety-review.v1',
            payload: {
              sessionId: row.session_id, bookingId: row.booking_id,
              challengeId: challenge.challenge_id, noFault: true,
            },
          },
          {
            messageId: ids.caseOutboxMessageId,
            topic: 'governance.safety-case.submitted.v1',
            sourceEventId: ids.caseEventId,
            payload: {
              caseId: ids.caseId, challengeId: challenge.challenge_id,
              bookingId: row.booking_id, sessionId: row.session_id,
              initialDueAt: initialDueAt.toISOString(), finalDueAt: finalDueAt.toISOString(),
            },
          },
          {
            messageId: ids.holdOutboxMessageId,
            topic: 'competition.challenge.safety-hold-started.v1',
            sourceEventId: ids.holdEventId,
            payload: { challengeId: challenge.challenge_id, holdId: ids.holdId, deadlinePaused: true },
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: {
              notifications: recipients.map((recipientUserId, index) => ({
                notificationId: ids.notificationIds[index]!,
                recipientUserId,
                category: 'SERVICE',
                renderKey: 'session.cancelled-safety-review',
                actionTarget: { type: 'SESSION', sessionId: row.session_id },
                payload: {
                  sessionId: row.session_id, bookingId: row.booking_id,
                  challengeId: challenge.challenge_id, noFault: true,
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

interface SafetyCaseReviewRow {
  readonly case_id: string;
  readonly state: 'SUBMITTED' | 'UNDER_REVIEW' | 'CLOSED';
  readonly reporter_user_id: string;
  readonly subject_user_id: string;
  readonly reason_code: string;
  readonly assigned_reviewer_user_id: string | null;
  readonly challenge_id: string;
  readonly booking_id: string;
  readonly session_id: string;
  readonly pair_low_id: string;
  readonly pair_high_id: string;
  readonly coach_user_id: string;
  readonly venue_id: string;
  readonly community_id: string;
  readonly competition_id: string;
  readonly champion_user_id: string | null;
  readonly contender_user_id: string | null;
  readonly competition_status_version: string;
  readonly competition_version: string;
  readonly subject_account_state: 'ACTIVE' | 'RESTRICTED' | 'CLOSED';
  readonly subject_account_version: string;
  readonly challenge_state: ChallengeState;
  readonly scheduling_deadline_at: Date | null;
  readonly user_reschedule_count: number;
  readonly challenge_version: string;
  readonly active_obligation_count: string;
  readonly hold_id: string;
  readonly hold_state: 'ACTIVE' | 'RELEASED';
  readonly hold_started_at: Date;
  readonly hold_version: string;
  readonly version: string;
}

async function safetyCaseReviewRow(
  transaction: Transaction<Database>,
  caseId: string,
): Promise<SafetyCaseReviewRow | undefined> {
  const result = await sql<SafetyCaseReviewRow>`
    select moderation_case.case_id, moderation_case.state,
      moderation_case.reporter_user_id, moderation_case.subject_user_id,
      moderation_case.reason_code,
      moderation_case.assigned_reviewer_user_id,
      moderation_case.challenge_id, moderation_case.booking_id,
      moderation_case.session_id, moderation_case.version::text,
      session.pair_low_id, session.pair_high_id, session.coach_user_id,
      session.venue_id, competition.community_id, competition.competition_id,
      competition.champion_user_id, competition.contender_user_id,
      competition.status_version::text as competition_status_version,
      competition.version::text as competition_version,
      subject.account_state as subject_account_state,
      subject.version::text as subject_account_version,
      challenge.state as challenge_state, challenge.scheduling_deadline_at,
      challenge.user_reschedule_count, challenge.version::text as challenge_version,
      (select count(*)::text
       from competition.challenge_participant_obligations obligation
       where obligation.challenge_id = challenge.challenge_id
         and obligation.released_at is null) as active_obligation_count,
      process_hold.hold_id, process_hold.state as hold_state,
      process_hold.started_at as hold_started_at,
      process_hold.version::text as hold_version
    from governance.moderation_cases moderation_case
    join scheduling.sessions session
      on session.session_id = moderation_case.session_id
    join scheduling.bookings booking
      on booking.booking_id = moderation_case.booking_id
      and booking.booking_id = session.booking_id
    join competition.challenges challenge
      on challenge.challenge_id = moderation_case.challenge_id
      and challenge.challenge_id = session.challenge_id
    join competition.competitions competition
      on competition.competition_id = challenge.competition_id
    join identity.users subject
      on subject.user_id = moderation_case.subject_user_id
    join competition.process_holds process_hold
      on process_hold.moderation_case_id = moderation_case.case_id
      and process_hold.aggregate_type = 'CHALLENGE'
      and process_hold.aggregate_id = challenge.challenge_id
      and process_hold.reason = 'SAFETY'
    where moderation_case.case_id = ${caseId}::uuid
      and moderation_case.case_type = 'SAFETY'
    for update of moderation_case, session, booking, challenge, competition, subject, process_hold
  `.execute(transaction);
  return result.rows[0];
}

async function reviewerIsInterestedVenueAdmin(
  transaction: Transaction<Database>, reviewerUserId: string, venueId: string,
): Promise<boolean> {
  const result = await sql<{ readonly interested: boolean }>`select exists (
    select 1 from community.role_grants
    where user_id = ${reviewerUserId}::uuid
      and role in ('PRIMARY_ADMIN', 'GYM_ADMIN')
      and scope_type = 'VENUE' and scope_id = ${venueId}::uuid
      and state = 'ACTIVE'
      and (expires_at is null or expires_at > clock_timestamp())
  ) as interested`.execute(transaction);
  return result.rows[0]?.interested === true;
}

async function safetyReplacementAvailability(
  transaction: Transaction<Database>,
  row: SafetyCaseReviewRow,
  replacementCoachUserId: string | null,
  replacementVenueId: string | null,
): Promise<{ readonly coach: boolean; readonly venue: boolean }> {
  const venueResult = replacementVenueId === null
    ? { rows: [{ available: false }] }
    : await sql<{ readonly available: boolean }>`select exists (
        select 1 from community.venues venue
        join community.communities community on community.venue_id = venue.venue_id
        where venue.venue_id = ${replacementVenueId}::uuid
          and venue.venue_id <> ${row.venue_id}::uuid
          and venue.state = 'ACTIVE' and community.state = 'ACTIVE'
      ) as available`.execute(transaction);
  const targetVenueId = replacementVenueId ?? row.venue_id;
  const coachResult = replacementCoachUserId === null
    ? { rows: [{ available: false }] }
    : await sql<{ readonly available: boolean }>`select exists (
        select 1 from identity.users coach
        join community.role_grants role_grant on role_grant.user_id = coach.user_id
        join community.communities community
          on community.community_id = role_grant.scope_id
        join community.venues venue on venue.venue_id = community.venue_id
        where coach.user_id = ${replacementCoachUserId}::uuid
          and coach.user_id <> ${row.coach_user_id}::uuid
          and coach.user_id not in (${row.pair_low_id}::uuid, ${row.pair_high_id}::uuid)
          and coach.account_state = 'ACTIVE'
          and role_grant.role = 'COACH' and role_grant.scope_type = 'COMMUNITY'
          and role_grant.state = 'ACTIVE'
          and (role_grant.expires_at is null or role_grant.expires_at > clock_timestamp())
          and community.state = 'ACTIVE' and venue.state = 'ACTIVE'
          and venue.venue_id = ${targetVenueId}::uuid
      ) as available`.execute(transaction);
  return {
    coach: coachResult.rows[0]?.available === true,
    venue: venueResult.rows[0]?.available === true,
  };
}

async function safetyReleaseRecipients(
  transaction: Transaction<Database>, row: SafetyCaseReviewRow,
): Promise<readonly string[]> {
  const admin = await sql<{ readonly user_id: string }>`
    select user_id from community.role_grants
    where role in ('PRIMARY_ADMIN', 'GYM_ADMIN') and scope_type = 'VENUE'
      and scope_id = ${row.venue_id}::uuid and state = 'ACTIVE'
      and (expires_at is null or expires_at > clock_timestamp())
    order by authorized_at, user_id limit 1
  `.execute(transaction);
  return [...new Set([
    row.pair_low_id,
    row.pair_high_id,
    admin.rows[0]?.user_id ?? null,
  ].filter((userId): userId is string => userId !== null))];
}

function assertSafetyCaseCommand(
  command: CommandEnvelope<StartSafetyCaseReviewPayload | ResolveSafetyCasePayload>,
  commandType: 'START_SAFETY_CASE_REVIEW' | 'RESOLVE_SAFETY_CASE',
): asserts command is CommandEnvelope<StartSafetyCaseReviewPayload | ResolveSafetyCasePayload> & {
  readonly actor: { readonly id: string };
} {
  if (
    !command.actor.id
    || command.aggregateType !== 'ModerationCase'
    || command.commandType !== commandType
    || command.aggregateId !== command.payload.caseId
  ) throw new SchedulingPermissionDeniedError();
}

export async function startSafetyCaseReview(
  database: Kysely<Database>,
  command: CommandEnvelope<StartSafetyCaseReviewPayload>,
  ids: SafetyCaseReviewEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<SafetyCaseReviewProjection>> {
  assertSafetyCaseCommand(command, 'START_SAFETY_CASE_REVIEW');
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await safetyCaseReviewRow(transaction, command.aggregateId);
      if (!row) throw new SchedulingPermissionDeniedError();
      assertExpectedVersion(Number(row.version), command.expectedVersion);
      assertSafetyCaseReviewCanStart({
        state: row.state,
        actorIsCentral: await hasActiveCentralScope(transaction, command.actor.id),
        reviewerUserId: command.actor.id,
        reporterUserId: row.reporter_user_id,
        subjectUserId: row.subject_user_id,
        athleteUserIds: [row.pair_low_id, row.pair_high_id],
        assignedCoachUserId: row.coach_user_id,
        reviewerIsInterestedVenueAdmin: await reviewerIsInterestedVenueAdmin(
          transaction, command.actor.id, row.venue_id,
        ),
      });
      await sql`
        update governance.moderation_cases
        set state = 'UNDER_REVIEW', assigned_reviewer_user_id = ${command.actor.id}::uuid,
          review_started_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = ${context.nextVersion}
        where case_id = ${row.case_id}::uuid and state = 'SUBMITTED'
          and version = ${Number(row.version)}
      `.execute(transaction);
      const response: SafetyCaseReviewProjection = {
        action: 'SAFETY_REVIEW_STARTED', caseId: row.case_id, state: 'UNDER_REVIEW',
        assignedReviewerUserId: command.actor.id,
        reviewStartedAt: context.occurredAt.toISOString(),
        challengeId: row.challenge_id, challengeVersion: Number(row.challenge_version),
        holdId: row.hold_id, holdVersion: Number(row.hold_version),
        version: context.nextVersion,
      };
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId, eventName: 'CaseReviewStarted', schemaVersion: 1,
          transitionId: 'MC-03/MC-04',
          payload: { caseId: row.case_id, state: 'UNDER_REVIEW' },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId, action: 'START_SAFETY_CASE_REVIEW',
          transitionId: 'MC-03/MC-04', reasonCode: 'SAFETY_REVIEW',
          beforeState: row.state, afterState: 'UNDER_REVIEW',
          metadata: { reviewerUserId: command.actor.id, challengeId: row.challenge_id },
        },
        outbox: [{
          messageId: ids.outboxMessageId,
          topic: 'governance.safety-case.review-started.v1',
          payload: { caseId: row.case_id, state: 'UNDER_REVIEW' },
        }],
      };
    },
  });
}

function requiredSafetyEnforcementIds(
  ids: SafetyCaseResolutionEffectIds,
): AdministrativeForfeitEffectIds {
  if (
    !ids.resultId || !ids.resultEventId || !ids.statusTransitionId || !ids.statusEventId
    || !ids.cooldownId || !ids.cooldownEventId || !ids.resultOutboxMessageId
    || !ids.resultNotificationOutboxMessageId || !ids.resultNotificationIds
  ) throw new TypeError('Safety enforcement Result effect IDs are required');
  return {
    resultId: ids.resultId,
    resultEventId: ids.resultEventId,
    statusTransitionId: ids.statusTransitionId,
    statusEventId: ids.statusEventId,
    cooldownId: ids.cooldownId,
    cooldownEventId: ids.cooldownEventId,
    resultOutboxMessageId: ids.resultOutboxMessageId,
    notificationOutboxMessageId: ids.resultNotificationOutboxMessageId,
    notificationIds: ids.resultNotificationIds,
  };
}

type SafetyAccountRestrictionEffectIds = Required<Pick<
  SafetyCaseResolutionEffectIds,
  | 'enforcementId'
  | 'restrictionEventId'
  | 'restrictionOutboxMessageId'
  | 'restrictionNotificationOutboxMessageId'
  | 'restrictionNotificationId'
  | 'statusReviewHoldId'
  | 'statusReviewHoldEventId'
  | 'statusReviewHoldOutboxMessageId'
>>;

function requiredSafetyAccountRestrictionIds(
  ids: SafetyCaseResolutionEffectIds,
): SafetyAccountRestrictionEffectIds {
  if (
    !ids.enforcementId || !ids.restrictionEventId || !ids.restrictionOutboxMessageId
    || !ids.restrictionNotificationOutboxMessageId || !ids.restrictionNotificationId
    || !ids.statusReviewHoldId || !ids.statusReviewHoldEventId
    || !ids.statusReviewHoldOutboxMessageId
  ) throw new TypeError('Safety account restriction effect IDs are required');
  return ids as SafetyAccountRestrictionEffectIds;
}

export async function resolveSafetyCase(
  database: Kysely<Database>,
  command: CommandEnvelope<ResolveSafetyCasePayload>,
  ids: SafetyCaseResolutionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<SafetyCaseReviewProjection>> {
  assertSafetyCaseCommand(command, 'RESOLVE_SAFETY_CASE');
  return executeCriticalCommand<ResolveSafetyCasePayload, SafetyCaseReviewProjection>(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      if (!(await hasActiveCentralScope(transaction, command.actor.id))) {
        throw new SchedulingPermissionDeniedError();
      }
      const row = await safetyCaseReviewRow(transaction, command.aggregateId);
      if (!row) throw new SchedulingPermissionDeniedError();
      assertExpectedVersion(Number(row.version), command.expectedVersion);
      assertSafetyCaseReviewerIndependent({
        reviewerUserId: command.actor.id,
        reporterUserId: row.reporter_user_id,
        subjectUserId: row.subject_user_id,
        athleteUserIds: [row.pair_low_id, row.pair_high_id],
        assignedCoachUserId: row.coach_user_id,
        reviewerIsInterestedVenueAdmin: await reviewerIsInterestedVenueAdmin(
          transaction, command.actor.id, row.venue_id,
        ),
      });
      assertExpectedVersion(Number(row.challenge_version), command.payload.expectedChallengeVersion);
      assertExpectedVersion(Number(row.hold_version), command.payload.expectedHoldVersion);
      if (
        row.challenge_state !== 'BOOKED'
        || row.hold_state !== 'ACTIVE'
        || row.scheduling_deadline_at === null
        || Number(row.active_obligation_count) !== 2
      ) throw new SchedulingConflictError('SAFETY_CASE_NOT_UNDER_REVIEW');
      if (command.payload.remedyCode === 'ACCOUNT_RESTRICTION') {
        const restrictionIds = requiredSafetyAccountRestrictionIds(ids);
        if (
          command.payload.replacementCoachUserId !== null
          || command.payload.replacementVenueId !== null
        ) throw new SchedulingValidationError('replacement');
        const normalized = normalizeSafetyAccountRestrictionDecision({
          state: row.state,
          assignedReviewerUserId: row.assigned_reviewer_user_id,
          reviewerUserId: command.actor.id,
          subjectUserId: row.subject_user_id,
          athleteUserIds: [row.pair_low_id, row.pair_high_id],
          categoryCode: command.payload.restrictionCategoryCode ?? null,
          seriousCategoryConfirmed: command.payload.seriousCategoryConfirmed === true,
          consequencesConfirmed: command.payload.consequencesConfirmed === true,
          reason: command.payload.reason,
        });
        if (row.subject_account_state !== 'ACTIVE') {
          throw new SchedulingConflictError('SAFETY_CASE_SUBJECT_NOT_ACTIVE');
        }
        const subjectStatus = safetyRestrictionSubjectStatus({
          subjectUserId: normalized.subjectUserId,
          championUserId: row.champion_user_id,
          contenderUserId: row.contender_user_id,
        });
        const appealDeadlineAt = new Date(
          context.occurredAt.getTime() + 7 * 24 * 60 * 60 * 1000,
        );
        await sql`
          insert into governance.safety_case_decisions (
            decision_id, case_id, reviewer_user_id, remedy_code,
            replacement_coach_user_id, replacement_venue_id, decision_reason,
            restriction_category_code, decided_at
          ) values (
            ${ids.decisionId}::uuid, ${row.case_id}::uuid, ${command.actor.id}::uuid,
            ${normalized.remedyCode}, null, null, ${normalized.reason},
            ${normalized.categoryCode}, ${context.occurredAt.toISOString()}::timestamptz
          )
        `.execute(transaction);
        await sql`
          insert into governance.enforcements (
            enforcement_id, source_case_id, source_decision_id, subject_user_id,
            enforcement_type, state, category_code, applied_by_user_id,
            applied_at, appeal_deadline_at, version
          ) values (
            ${restrictionIds.enforcementId}::uuid, ${row.case_id}::uuid, ${ids.decisionId}::uuid,
            ${normalized.subjectUserId}::uuid, 'ACCOUNT_RESTRICTION', 'ACTIVE',
            ${normalized.categoryCode}, ${command.actor.id}::uuid,
            ${context.occurredAt.toISOString()}::timestamptz,
            ${appealDeadlineAt.toISOString()}::timestamptz, 1
          )
        `.execute(transaction);
        const subjectAccountVersion = Number(row.subject_account_version) + 1;
        await sql`
          update identity.users
          set account_state = 'RESTRICTED', version = ${subjectAccountVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where user_id = ${normalized.subjectUserId}::uuid
            and account_state = 'ACTIVE' and version = ${Number(row.subject_account_version)}
        `.execute(transaction);
        if (subjectStatus !== null) {
          await sql`
            insert into competition.process_holds (
              hold_id, aggregate_type, aggregate_id, reason, state, deadline_policy,
              moderation_case_id, created_by, created_by_type, started_at, version,
              created_at, updated_at
            ) values (
              ${restrictionIds.statusReviewHoldId}::uuid, 'COMPETITION', ${row.competition_id}::uuid,
              'STATUS_REVIEW', 'ACTIVE', 'CONTINUE', ${row.case_id}::uuid,
              ${command.actor.id}::uuid, 'USER',
              ${context.occurredAt.toISOString()}::timestamptz, 1,
              ${context.occurredAt.toISOString()}::timestamptz,
              ${context.occurredAt.toISOString()}::timestamptz
            )
          `.execute(transaction);
        }
        await sql`
          update governance.moderation_cases
          set state = 'CLOSED', closed_at = ${context.occurredAt.toISOString()}::timestamptz,
            version = ${context.nextVersion}
          where case_id = ${row.case_id}::uuid and state = 'UNDER_REVIEW'
            and assigned_reviewer_user_id = ${command.actor.id}::uuid
            and version = ${Number(row.version)}
        `.execute(transaction);
        const response: SafetyCaseReviewProjection = {
          action: 'SAFETY_ACCOUNT_RESTRICTION_APPLIED',
          caseId: row.case_id,
          state: 'CLOSED',
          decisionId: ids.decisionId,
          remedyCode: normalized.remedyCode,
          enforcementId: restrictionIds.enforcementId,
          subjectUserId: normalized.subjectUserId,
          categoryCode: normalized.categoryCode,
          accountState: 'RESTRICTED',
          appealDeadlineAt: appealDeadlineAt.toISOString(),
          challengeId: row.challenge_id,
          challengeState: 'BOOKED',
          challengeVersion: Number(row.challenge_version),
          holdId: row.hold_id,
          holdState: 'ACTIVE',
          holdVersion: Number(row.hold_version),
          competitionId: row.competition_id,
          subjectStatus,
          statusReviewHoldId: subjectStatus === null ? null : restrictionIds.statusReviewHoldId,
          version: context.nextVersion,
        };
        const publicDecision = {
          caseId: row.case_id,
          decisionId: ids.decisionId,
          remedyCode: normalized.remedyCode,
          enforcementId: restrictionIds.enforcementId,
        };
        const relatedEvents: RelatedDomainEventDraft[] = [
          {
            eventId: ids.decisionEventId, eventName: 'CaseDecided', schemaVersion: 1,
            transitionId: 'MC-05', aggregateType: 'SafetyCaseDecision',
            aggregateId: ids.decisionId, aggregateVersion: 1,
            payload: publicDecision,
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          },
          {
            eventId: restrictionIds.restrictionEventId, eventName: 'AccountRestrictionApplied',
            schemaVersion: 1, transitionId: 'U-02', aggregateType: 'Enforcement',
            aggregateId: restrictionIds.enforcementId, aggregateVersion: 1,
            payload: {
              enforcementId: restrictionIds.enforcementId, enforcementType: 'ACCOUNT_RESTRICTION',
              state: 'ACTIVE', appealDeadlineAt: appealDeadlineAt.toISOString(),
            },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          },
        ];
        const outbox: OutboxDraft[] = [
          {
            messageId: ids.outboxMessageId, topic: 'governance.safety-case.closed.v1',
            payload: { ...publicDecision, state: 'CLOSED' },
          },
          {
            messageId: restrictionIds.restrictionOutboxMessageId,
            topic: 'identity.account-restriction.applied.v1',
            sourceEventId: restrictionIds.restrictionEventId,
            payload: {
              enforcementId: restrictionIds.enforcementId, enforcementType: 'ACCOUNT_RESTRICTION',
              state: 'ACTIVE', appealDeadlineAt: appealDeadlineAt.toISOString(),
            },
          },
          {
            messageId: restrictionIds.restrictionNotificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: { notifications: [{
              notificationId: restrictionIds.restrictionNotificationId,
              recipientUserId: normalized.subjectUserId,
              category: 'SERVICE', renderKey: 'safety.account-restriction-applied',
              actionTarget: { type: 'ACCOUNT', userId: normalized.subjectUserId },
              payload: {
                accountState: 'RESTRICTED', appealDeadlineAt: appealDeadlineAt.toISOString(),
                appealWindowDays: 7, statusTransferred: false,
              },
            }] },
          },
        ];
        if (subjectStatus !== null) {
          relatedEvents.push({
            eventId: restrictionIds.statusReviewHoldEventId, eventName: 'ProcessHoldStarted',
            schemaVersion: 1, transitionId: 'U-02', aggregateType: 'ProcessHold',
            aggregateId: restrictionIds.statusReviewHoldId, aggregateVersion: 1,
            payload: {
              holdId: restrictionIds.statusReviewHoldId, competitionId: row.competition_id,
              reason: 'STATUS_REVIEW', state: 'ACTIVE',
            },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          });
          outbox.push({
            messageId: restrictionIds.statusReviewHoldOutboxMessageId,
            topic: 'competition.process-hold.started.v1',
            sourceEventId: restrictionIds.statusReviewHoldEventId,
            payload: {
              holdId: restrictionIds.statusReviewHoldId, competitionId: row.competition_id,
              reason: 'STATUS_REVIEW', state: 'ACTIVE',
            },
          });
        }
        return {
          responseStatus: 200,
          response,
          event: {
            eventId: ids.eventId, eventName: 'CaseClosed', schemaVersion: 1,
            transitionId: 'MC-05/MC-06',
            payload: { ...publicDecision, state: 'CLOSED' },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          },
          relatedEvents,
          audit: {
            auditId: ids.auditId, action: 'RESOLVE_SAFETY_CASE',
            transitionId: 'MC-05/MC-06/U-02', reasonCode: normalized.remedyCode,
            beforeState: row.state, afterState: 'CLOSED',
            metadata: {
              ...publicDecision, reviewerUserId: command.actor.id,
              reporterUserId: row.reporter_user_id,
              subjectUserId: normalized.subjectUserId,
              restrictionCategoryCode: normalized.categoryCode,
              decisionReason: normalized.reason,
              challengeId: row.challenge_id, bookingId: row.booking_id,
              sessionId: row.session_id, competitionId: row.competition_id,
              subjectStatus, statusReviewHoldId: response.statusReviewHoldId,
              beforeAccountState: row.subject_account_state,
              afterAccountState: 'RESTRICTED', subjectAccountVersion,
              competitionStatusVersion: Number(row.competition_status_version),
              competitionVersion: Number(row.competition_version),
            },
          },
          outbox,
        };
      }
      if (command.payload.remedyCode === 'FORFEIT_BY_ENFORCEMENT') {
        if (
          command.payload.replacementCoachUserId !== null
          || command.payload.replacementVenueId !== null
        ) throw new SchedulingValidationError('replacement');
        const normalized = normalizeSafetyEnforcementDecision({
          state: row.state,
          assignedReviewerUserId: row.assigned_reviewer_user_id,
          reviewerUserId: command.actor.id,
          subjectUserId: row.subject_user_id,
          athleteUserIds: [row.pair_low_id, row.pair_high_id],
          caseReasonCode: row.reason_code,
          causalLinkConfirmed: command.payload.causalLinkConfirmed === true,
          consequencesConfirmed: command.payload.consequencesConfirmed === true,
          reason: command.payload.reason,
        });
        const forfeit = await recordAdministrativeForfeit(transaction, {
          challengeId: row.challenge_id,
          loserUserId: normalized.loserUserId,
          recordedByUserId: command.actor.id,
          reasonCode: 'SAFETY_ENFORCEMENT_FORFEIT',
          comment: 'Independent Central safety enforcement decision',
          sourceSessionId: row.session_id,
          sourceCoachUserId: null,
          notificationRecipientUserIds: [row.pair_low_id, row.pair_high_id],
          occurredAt: context.occurredAt,
          expectedChallengeState: 'BOOKED',
        }, requiredSafetyEnforcementIds(ids));
        await sql`
          insert into governance.safety_case_decisions (
            decision_id, case_id, reviewer_user_id, remedy_code,
            replacement_coach_user_id, replacement_venue_id, decision_reason,
            source_result_id, enforcement_reason_code, causal_link_code, decided_at
          ) values (
            ${ids.decisionId}::uuid, ${row.case_id}::uuid, ${command.actor.id}::uuid,
            ${normalized.remedyCode}, null, null, ${normalized.reason},
            ${forfeit.resultId}::uuid, ${normalized.enforcementReasonCode},
            ${normalized.causalLinkCode},
            ${context.occurredAt.toISOString()}::timestamptz
          )
        `.execute(transaction);
        await sql`
          update governance.moderation_cases
          set state = 'CLOSED', closed_at = ${context.occurredAt.toISOString()}::timestamptz,
            version = ${context.nextVersion}
          where case_id = ${row.case_id}::uuid and state = 'UNDER_REVIEW'
            and assigned_reviewer_user_id = ${command.actor.id}::uuid
            and version = ${Number(row.version)}
        `.execute(transaction);
        const holdVersion = Number(row.hold_version) + 1;
        await sql`
          update competition.process_holds
          set state = 'RELEASED', released_by = ${command.actor.id}::uuid,
            released_at = ${context.occurredAt.toISOString()}::timestamptz,
            version = ${holdVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where hold_id = ${row.hold_id}::uuid and state = 'ACTIVE'
            and version = ${Number(row.hold_version)}
        `.execute(transaction);
        const response: SafetyCaseReviewProjection = {
          action: 'SAFETY_ENFORCEMENT_FORFEIT_APPLIED',
          caseId: row.case_id,
          state: 'CLOSED',
          decisionId: ids.decisionId,
          remedyCode: normalized.remedyCode,
          resultId: forfeit.resultId,
          challengeId: row.challenge_id,
          challengeState: 'RESULT_RECORDED',
          challengeVersion: forfeit.challengeVersion,
          loserUserId: normalized.loserUserId,
          winnerUserId: normalized.winnerUserId,
          appealDeadlineAt: forfeit.appealDeadlineAt.toISOString(),
          holdId: row.hold_id,
          holdState: 'RELEASED',
          holdVersion,
          releasedAt: context.occurredAt.toISOString(),
          version: context.nextVersion,
        };
        const publicDecision = {
          caseId: row.case_id,
          decisionId: ids.decisionId,
          remedyCode: normalized.remedyCode,
          resultId: forfeit.resultId,
          challengeId: row.challenge_id,
          outcomeCode: 'FORFEIT',
          winnerUserId: normalized.winnerUserId,
          loserUserId: normalized.loserUserId,
          appealDeadlineAt: forfeit.appealDeadlineAt.toISOString(),
        };
        return {
          responseStatus: 200,
          response,
          event: {
            eventId: ids.eventId, eventName: 'CaseClosed', schemaVersion: 1,
            transitionId: 'MC-05/MC-06',
            payload: { ...publicDecision, state: 'CLOSED' },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          },
          relatedEvents: [
            {
              eventId: ids.decisionEventId, eventName: 'CaseDecided', schemaVersion: 1,
              transitionId: 'MC-05', aggregateType: 'SafetyCaseDecision',
              aggregateId: ids.decisionId, aggregateVersion: 1,
              payload: publicDecision,
              metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
            },
            {
              eventId: ids.holdEventId, eventName: 'ProcessHoldReleased', schemaVersion: 1,
              transitionId: 'MC-06', aggregateType: 'ProcessHold', aggregateId: row.hold_id,
              aggregateVersion: holdVersion,
              payload: { holdId: row.hold_id, state: 'RELEASED' },
              metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
            },
            ...forfeit.relatedEvents,
          ],
          audit: {
            auditId: ids.auditId, action: 'RESOLVE_SAFETY_CASE',
            transitionId: 'MC-05/MC-06', reasonCode: normalized.remedyCode,
            beforeState: row.state, afterState: 'CLOSED',
            metadata: {
              ...publicDecision,
              reviewerUserId: command.actor.id,
              reporterUserId: row.reporter_user_id,
              subjectUserId: row.subject_user_id,
              enforcementReasonCode: normalized.enforcementReasonCode,
              causalLinkCode: normalized.causalLinkCode,
              decisionReason: normalized.reason,
              bookingId: row.booking_id,
              sessionId: row.session_id,
            },
          },
          outbox: [
            {
              messageId: ids.outboxMessageId, topic: 'governance.safety-case.closed.v1',
              payload: { ...publicDecision, state: 'CLOSED' },
            },
            {
              messageId: ids.holdOutboxMessageId,
              topic: 'competition.process-hold.released.v1',
              sourceEventId: ids.holdEventId,
              payload: { holdId: row.hold_id, state: 'RELEASED' },
            },
            ...forfeit.outbox,
          ],
        };
      }
      const availability = await safetyReplacementAvailability(
        transaction,
        row,
        command.payload.replacementCoachUserId,
        command.payload.replacementVenueId,
      );
      const normalized = normalizeSafetyCaseReleaseDecision({
        state: row.state,
        assignedReviewerUserId: row.assigned_reviewer_user_id,
        reviewerUserId: command.actor.id,
        remedyCode: command.payload.remedyCode,
        replacementCoachUserId: command.payload.replacementCoachUserId,
        replacementVenueId: command.payload.replacementVenueId,
        replacementCoachAvailable: availability.coach,
        replacementVenueAvailable: availability.venue,
        reason: command.payload.reason,
      });
      const extendedDeadline = extendSchedulingDeadlineForSafetyHold({
        schedulingDeadlineAt: row.scheduling_deadline_at.toISOString(),
        holdStartedAt: row.hold_started_at.toISOString(),
        releasedAt: context.occurredAt,
      });
      await sql`
        insert into governance.safety_case_decisions (
          decision_id, case_id, reviewer_user_id, remedy_code,
          replacement_coach_user_id, replacement_venue_id, decision_reason, decided_at
        ) values (
          ${ids.decisionId}::uuid, ${row.case_id}::uuid, ${command.actor.id}::uuid,
          ${normalized.remedyCode}, ${normalized.replacementCoachUserId}::uuid,
          ${normalized.replacementVenueId}::uuid, ${normalized.reason},
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        update governance.moderation_cases
        set state = 'CLOSED', closed_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = ${context.nextVersion}
        where case_id = ${row.case_id}::uuid and state = 'UNDER_REVIEW'
          and assigned_reviewer_user_id = ${command.actor.id}::uuid
          and version = ${Number(row.version)}
      `.execute(transaction);
      const holdVersion = Number(row.hold_version) + 1;
      await sql`
        update competition.process_holds
        set state = 'RELEASED', released_by = ${command.actor.id}::uuid,
          released_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = ${holdVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where hold_id = ${row.hold_id}::uuid and state = 'ACTIVE'
          and version = ${Number(row.hold_version)}
      `.execute(transaction);
      const challengeVersion = Number(row.challenge_version) + 1;
      await sql`
        update competition.challenges
        set state = 'ACCEPTED_UNSCHEDULED',
          scheduling_deadline_at = ${extendedDeadline.toISOString()}::timestamptz,
          version = ${challengeVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where challenge_id = ${row.challenge_id}::uuid and state = 'BOOKED'
          and version = ${Number(row.challenge_version)}
      `.execute(transaction);
      const recipients = await safetyReleaseRecipients(transaction, row);
      const response: SafetyCaseReviewProjection = {
        action: 'SAFETY_REPLACEMENT_APPLIED', caseId: row.case_id, state: 'CLOSED',
        decisionId: ids.decisionId, remedyCode: normalized.remedyCode,
        replacementCoachUserId: normalized.replacementCoachUserId,
        replacementVenueId: normalized.replacementVenueId,
        challengeId: row.challenge_id, challengeState: 'ACCEPTED_UNSCHEDULED',
        schedulingDeadlineAt: extendedDeadline.toISOString(), challengeVersion,
        holdId: row.hold_id, holdState: 'RELEASED', holdVersion,
        releasedAt: context.occurredAt.toISOString(), version: context.nextVersion,
      };
      const publicDecision = {
        caseId: row.case_id, decisionId: ids.decisionId,
        remedyCode: normalized.remedyCode,
        replacementCoachUserId: normalized.replacementCoachUserId,
        replacementVenueId: normalized.replacementVenueId,
      };
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId, eventName: 'CaseClosed', schemaVersion: 1,
          transitionId: 'MC-05/MC-06',
          payload: { ...publicDecision, state: 'CLOSED' },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        relatedEvents: [
          {
            eventId: ids.decisionEventId, eventName: 'CaseDecided', schemaVersion: 1,
            transitionId: 'MC-05', aggregateType: 'SafetyCaseDecision',
            aggregateId: ids.decisionId, aggregateVersion: 1, payload: publicDecision,
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          },
          {
            eventId: ids.challengeEventId, eventName: 'ChallengeReturnedToScheduling', schemaVersion: 1,
            transitionId: 'MC-06', aggregateType: 'Challenge', aggregateId: row.challenge_id,
            aggregateVersion: challengeVersion,
            payload: {
              challengeId: row.challenge_id, state: 'ACCEPTED_UNSCHEDULED',
              schedulingDeadlineAt: extendedDeadline.toISOString(),
            },
            metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
          },
          {
            eventId: ids.holdEventId, eventName: 'ProcessHoldReleased', schemaVersion: 1,
            transitionId: 'MC-06', aggregateType: 'ProcessHold', aggregateId: row.hold_id,
            aggregateVersion: holdVersion,
            payload: { holdId: row.hold_id, state: 'RELEASED' },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          },
        ],
        audit: {
          auditId: ids.auditId, action: 'RESOLVE_SAFETY_CASE',
          transitionId: 'MC-05/MC-06', reasonCode: normalized.remedyCode,
          beforeState: row.state, afterState: 'CLOSED',
          metadata: {
            ...publicDecision, reviewerUserId: command.actor.id,
            reporterUserId: row.reporter_user_id, subjectUserId: row.subject_user_id,
            decisionReason: normalized.reason, challengeId: row.challenge_id,
            bookingId: row.booking_id, sessionId: row.session_id,
          },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId, topic: 'governance.safety-case.closed.v1',
            payload: { ...publicDecision, state: 'CLOSED' },
          },
          {
            messageId: ids.challengeOutboxMessageId,
            topic: 'competition.challenge.safety-hold-released.v1',
            sourceEventId: ids.challengeEventId,
            payload: {
              challengeId: row.challenge_id, state: 'ACCEPTED_UNSCHEDULED',
              schedulingDeadlineAt: extendedDeadline.toISOString(),
            },
          },
          {
            messageId: ids.holdOutboxMessageId,
            topic: 'competition.process-hold.released.v1',
            sourceEventId: ids.holdEventId,
            payload: { holdId: row.hold_id, state: 'RELEASED' },
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: { notifications: recipients.map((recipientUserId, index) => ({
              notificationId: ids.notificationIds[index]!, recipientUserId,
              category: 'SERVICE', renderKey: 'safety.case-returned-to-scheduling',
              actionTarget: { type: 'CHALLENGE', challengeId: row.challenge_id },
              payload: {
                challengeId: row.challenge_id, state: 'ACCEPTED_UNSCHEDULED',
                automaticBooking: false, noSportingSanction: true,
              },
              deadlineAt: extendedDeadline.toISOString(),
            })) },
          },
        ],
      };
    },
  });
}

function requiredOfficialCancellationIds(ids: SessionEffectIds): {
  readonly bookingEventId: string;
  readonly slotEventId: string;
  readonly challengeEventId: string;
  readonly result: AdministrativeForfeitEffectIds;
} {
  if (
    !ids.bookingEventId || !ids.slotEventId || !ids.challengeEventId
    || !ids.resultId || !ids.resultEventId || !ids.statusTransitionId
    || !ids.statusEventId || !ids.cooldownId || !ids.cooldownEventId
    || !ids.resultOutboxMessageId || !ids.resultNotificationOutboxMessageId
    || !ids.resultNotificationIds
  ) {
    throw new TypeError('Official cancellation effect IDs are required');
  }
  return {
    bookingEventId: ids.bookingEventId,
    slotEventId: ids.slotEventId,
    challengeEventId: ids.challengeEventId,
    result: {
      resultId: ids.resultId,
      resultEventId: ids.resultEventId,
      statusTransitionId: ids.statusTransitionId,
      statusEventId: ids.statusEventId,
      cooldownId: ids.cooldownId,
      cooldownEventId: ids.cooldownEventId,
      resultOutboxMessageId: ids.resultOutboxMessageId,
      notificationOutboxMessageId: ids.resultNotificationOutboxMessageId,
      notificationIds: ids.resultNotificationIds,
    },
  };
}

export async function replaceSessionCoach(
  database: Kysely<Database>,
  command: CommandEnvelope<ReplaceSessionCoachPayload>,
  ids: SessionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<SessionLifecycleProjection>> {
  if (
    !command.actor.id || command.aggregateType !== 'Session'
    || command.payload.sessionId !== command.aggregateId
    || !ids.replacementId || !ids.assignmentRevisionId
    || !ids.bookingEventId || !ids.slotEventId
    || !ids.notificationOutboxMessageId || !ids.notificationIds
  ) {
    throw new SchedulingPermissionDeniedError();
  }
  try {
    return await executeCriticalCommand(database, {
      command,
      ...(now ? { now } : {}),
      mutate: async (transaction, context) => {
        const row = await readSessionRow(transaction, command.aggregateId, true);
        if (!row || !(await hasActiveVenueAdminScope(transaction, command.actor.id!, row.venue_id))) {
          throw new SchedulingPermissionDeniedError();
        }
        assertCoachReplacementCanBeCommitted({
          state: row.state,
          actualStartAt: row.actual_start_at?.toISOString() ?? null,
          currentCoachUserId: row.coach_user_id,
          replacementCoachUserId: command.payload.replacementCoachUserId,
          athleteUserIds: [row.pair_low_id, row.pair_high_id],
          scheduledStartAt: row.scheduled_start_at.toISOString(),
          operationalGraceMinutes: row.no_show_grace_minutes,
          occurredAt: context.occurredAt,
        });
        const candidate = (await replacementCoachOptions(transaction, row)).find(
          (item) => item.userId === command.payload.replacementCoachUserId,
        );
        if (!candidate) throw new SchedulingConflictError('COACH_REPLACEMENT_UNAVAILABLE');
        const resource = await readSessionResourcesForUpdate(transaction, row);
        const bookingVersion = Number(resource.booking_version) + 1;
        const slotVersion = Number(resource.slot_version) + 1;

        await sql`
          insert into scheduling.booking_coach_replacements (
            replacement_id, booking_id, session_id, venue_id,
            old_coach_user_id, new_coach_user_id, replaced_by,
            scheduled_start_at, scheduled_end_at, commercial_terms_snapshot, created_at
          ) values (
            ${ids.replacementId}::uuid, ${row.booking_id}::uuid, ${row.session_id}::uuid,
            ${row.venue_id}::uuid, ${row.coach_user_id}::uuid,
            ${candidate.userId}::uuid, ${command.actor.id}::uuid,
            ${row.scheduled_start_at.toISOString()}::timestamptz,
            ${row.scheduled_end_at.toISOString()}::timestamptz,
            ${JSON.stringify(resource.commercial_terms_snapshot)}::jsonb,
            ${context.occurredAt.toISOString()}::timestamptz
          )
        `.execute(transaction);
        await sql`
          insert into scheduling.session_coach_assignment_revisions (
            revision_id, session_id, booking_replacement_id, old_coach_user_id,
            new_coach_user_id, assigned_by, assigned_at
          ) values (
            ${ids.assignmentRevisionId}::uuid, ${row.session_id}::uuid,
            ${ids.replacementId}::uuid, ${row.coach_user_id}::uuid,
            ${candidate.userId}::uuid, ${command.actor.id}::uuid,
            ${context.occurredAt.toISOString()}::timestamptz
          )
        `.execute(transaction);
        await sql`
          update scheduling.sessions
          set coach_user_id = ${candidate.userId}::uuid, version = ${context.nextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where session_id = ${row.session_id}::uuid
            and state in ('SCHEDULED', 'READY_FOR_COACH') and actual_start_at is null
        `.execute(transaction);
        await sql`
          update scheduling.bookings
          set coach_replaced_at = ${context.occurredAt.toISOString()}::timestamptz,
            coach_replaced_by = ${command.actor.id}::uuid, version = ${bookingVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where booking_id = ${row.booking_id}::uuid
            and state in ('CONFIRMED_PAIR', 'CONFIRMED_SOLO')
        `.execute(transaction);
        await sql`
          update scheduling.slots
          set coach_user_id = ${candidate.userId}::uuid, version = ${slotVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where slot_id = ${resource.slot_id}::uuid and state = 'BOOKED'
        `.execute(transaction);

        const updated: SessionRow = {
          ...row,
          coach_user_id: candidate.userId,
          coach_display_name: candidate.displayName,
          latest_coach_replacement_at: context.occurredAt,
          version: String(context.nextVersion),
        };
        const response = await sessionProjection(transaction, updated, command.actor.id!);
        return {
          responseStatus: 200,
          response,
          event: {
            eventId: ids.eventId,
            eventName: 'SessionCoachReplaced',
            schemaVersion: 1,
            transitionId: 'S-08',
            payload: {
              sessionId: row.session_id,
              oldCoachUserId: row.coach_user_id,
              newCoachUserId: candidate.userId,
            },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          },
          relatedEvents: [
            {
              eventId: ids.bookingEventId!, eventName: 'BookingCoachReplaced', schemaVersion: 1,
              aggregateType: 'Booking', aggregateId: row.booking_id,
              aggregateVersion: bookingVersion, transitionId: 'B-31',
              payload: { bookingId: row.booking_id, replacementId: ids.replacementId },
              metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
            },
            {
              eventId: ids.slotEventId!, eventName: 'SlotCoachReassigned', schemaVersion: 1,
              aggregateType: 'Slot', aggregateId: resource.slot_id,
              aggregateVersion: slotVersion, transitionId: 'B-31',
              payload: { slotId: resource.slot_id, newCoachUserId: candidate.userId },
              metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
            },
          ],
          audit: {
            auditId: ids.auditId, action: 'REPLACE_SESSION_COACH', transitionId: 'S-08',
            reasonCode: 'EQUIVALENT_REPLACEMENT', beforeState: row.state, afterState: row.state,
            metadata: { oldCoachUserId: row.coach_user_id, newCoachUserId: candidate.userId },
          },
          outbox: [
            {
              messageId: ids.outboxMessageId,
              topic: 'scheduling.session.coach-replaced.v1',
              payload: {
                sessionId: row.session_id,
                replacementId: ids.replacementId,
                timer: {
                  commandType: 'OPEN_SESSION_WINDOW',
                  aggregateType: 'Session',
                  aggregateId: row.session_id,
                  expectedState: 'SCHEDULED',
                  expectedVersion: context.nextVersion,
                  deadlineAt: row.scheduled_start_at.toISOString(),
                  policyVersion: SCHEDULING_POLICY_VERSION,
                  idempotencyKey: `session:${row.session_id}:open-session-window:v${context.nextVersion}`,
                },
              },
            },
            {
              messageId: ids.notificationOutboxMessageId!,
              topic: 'notification.in_app.v1',
              payload: {
                notifications: [row.pair_low_id, row.pair_high_id].map(
                  (recipientUserId, index) => ({
                    notificationId: ids.notificationIds![index]!, recipientUserId,
                    category: 'MANDATORY', renderKey: 'booking.coach-replaced',
                    actionTarget: { type: 'SESSION', sessionId: row.session_id },
                    payload: {
                      sessionId: row.session_id, oldCoachUserId: row.coach_user_id,
                      newCoachUserId: candidate.userId,
                    },
                    deadlineAt: row.scheduled_start_at.toISOString(),
                  }),
                ),
              },
            },
          ],
        };
      },
    });
  } catch (error) {
    if ((error as { readonly code?: unknown }).code === '23P01') {
      throw new SchedulingConflictError('COACH_CONFLICT');
    }
    throw error;
  }
}

export async function cancelSessionAfterCoachReplacement(
  database: Kysely<Database>,
  command: CommandEnvelope<CancelAfterCoachReplacementPayload>,
  ids: SessionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<SessionLifecycleProjection>> {
  if (
    !command.actor.id || command.aggregateType !== 'Session'
    || command.payload.sessionId !== command.aggregateId
    || !ids.bookingEventId || !ids.slotEventId
    || !ids.notificationOutboxMessageId || !ids.notificationIds
  ) throw new SchedulingPermissionDeniedError();
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await readSessionRow(transaction, command.aggregateId, true);
      if (!row) throw new SchedulingConflictError('COACH_REPLACEMENT_NOT_REJECTABLE');
      assertCoachReplacementCanBeRejected({
        state: row.state,
        actualStartAt: row.actual_start_at?.toISOString() ?? null,
        latestCoachReplacementAt: row.latest_coach_replacement_at?.toISOString() ?? null,
        actorId: command.actor.id!,
        athleteUserIds: [row.pair_low_id, row.pair_high_id],
        occurredAt: context.occurredAt,
      });
      const resource = await readSessionResourcesForUpdate(transaction, row);
      const cancelled = await cancelConfirmedSessionResources(
        transaction, row, resource, context, command.actor.id!, 'COACH_REPLACEMENT_REJECTED',
      );
      const response = await sessionProjection(transaction, cancelled.updated, command.actor.id!);
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId, eventName: 'SessionCancelled', schemaVersion: 1,
          transitionId: 'S-04',
          payload: { sessionId: row.session_id, reasonCode: 'COACH_REPLACEMENT_REJECTED' },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        relatedEvents: [
          {
            eventId: ids.bookingEventId!, eventName: 'BookingCancelledNoFault', schemaVersion: 1,
            aggregateType: 'Booking', aggregateId: row.booking_id,
            aggregateVersion: cancelled.bookingVersion, transitionId: 'B-32',
            payload: { bookingId: row.booking_id, cause: 'EXTERNAL', userRescheduleCounted: false },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          },
          {
            eventId: ids.slotEventId!, eventName: 'SlotBookingCancelled', schemaVersion: 1,
            aggregateType: 'Slot', aggregateId: resource.slot_id,
            aggregateVersion: cancelled.slotVersion, transitionId: 'SL-06',
            payload: { slotId: resource.slot_id, cause: 'EXTERNAL' },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          },
        ],
        audit: {
          auditId: ids.auditId, action: 'REQUEST_RESCHEDULE_AFTER_COACH_REPLACEMENT',
          transitionId: 'B-32', reasonCode: 'COACH_REPLACEMENT_REJECTED',
          beforeState: row.state, afterState: 'CANCELLED',
          metadata: { fault: 'EXTERNAL', userRescheduleCounted: false },
        },
        outbox: noFaultCancellationOutbox(ids, row, 'COACH_REPLACEMENT_REJECTED'),
      };
    },
  });
}

export async function failSessionExternal(
  database: Kysely<Database>,
  command: CommandEnvelope<FailSessionExternalPayload>,
  ids: SessionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<SessionLifecycleProjection>> {
  if (
    !command.actor.id || command.aggregateType !== 'Session'
    || command.payload.sessionId !== command.aggregateId
    || !ids.bookingEventId || !ids.slotEventId
    || !ids.notificationOutboxMessageId || !ids.notificationIds
  ) throw new SchedulingPermissionDeniedError();
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await readSessionRow(transaction, command.aggregateId, true);
      if (!row) throw new SchedulingConflictError('EXTERNAL_FAILURE_NOT_ALLOWED');
      const authorized = await hasActiveCoachScope(transaction, row, command.actor.id!)
        || await hasActiveVenueAdminScope(
        transaction, command.actor.id!, row.venue_id,
        ) || await hasActiveCentralScope(transaction, command.actor.id!);
      if (!authorized) throw new SchedulingPermissionDeniedError();
      assertExternalSessionFailureCanBeCommitted({
        state: row.state,
        actualStartAt: row.actual_start_at?.toISOString() ?? null,
      });
      const resource = await readSessionResourcesForUpdate(transaction, row);
      const challenge = await officialChallengeForSession(transaction, row);
      const externalCount = challenge
        ? externalChallengeRescheduleCount({
            state: challenge.state,
            activeObligationCount: Number(challenge.active_obligation_count),
            userRescheduleCount: challenge.user_reschedule_count,
          })
        : null;
      const challengeIds = challenge ? requiredExternalChallengeRescheduleIds(ids) : null;
      if (challenge && !challenge.scheduling_deadline_at) {
        throw new ChallengeConflictError('CHALLENGE_RESCHEDULE_NOT_ALLOWED');
      }
      const cancelled = await cancelConfirmedSessionResources(
        transaction, row, resource, context, command.actor.id!, command.payload.reasonCode,
      );
      const challengeNextVersion = challenge ? Number(challenge.version) + 1 : null;
      if (challenge && challengeIds && externalCount !== null) {
        await sql`
          insert into competition.challenge_reschedules (
            reschedule_id, challenge_id, booking_id, initiated_by_user_id,
            fault_attribution, fault_user_id, reason_code, reason_note, created_at
          ) values (
            ${challengeIds.rescheduleId}::uuid, ${challenge.challenge_id}::uuid,
            ${row.booking_id}::uuid, ${command.actor.id}::uuid,
            'EXTERNAL', null, ${command.payload.reasonCode}, null,
            ${context.occurredAt.toISOString()}::timestamptz
          )
        `.execute(transaction);
        await sql`
          update competition.challenges
          set state = 'ACCEPTED_UNSCHEDULED', version = ${challengeNextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where challenge_id = ${challenge.challenge_id}::uuid and state = 'BOOKED'
        `.execute(transaction);
      }
      const updated = challenge
        ? {
            ...cancelled.updated,
            challenge_state: 'ACCEPTED_UNSCHEDULED' as const,
            challenge_version: String(challengeNextVersion),
          }
        : cancelled.updated;
      const response = await sessionProjection(transaction, updated, command.actor.id!);
      const relatedEvents = [
        {
          eventId: ids.bookingEventId!, eventName: 'BookingCancelledNoFault', schemaVersion: 1,
          aggregateType: 'Booking', aggregateId: row.booking_id,
          aggregateVersion: cancelled.bookingVersion, transitionId: 'B-15',
          payload: { bookingId: row.booking_id, cause: 'EXTERNAL', userRescheduleCounted: false },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        {
          eventId: ids.slotEventId!, eventName: 'SlotBookingCancelled', schemaVersion: 1,
          aggregateType: 'Slot', aggregateId: resource.slot_id,
          aggregateVersion: cancelled.slotVersion, transitionId: 'SL-06',
          payload: { slotId: resource.slot_id, cause: 'EXTERNAL' },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        ...(challenge && challengeIds && challengeNextVersion !== null && externalCount !== null
          ? [{
              eventId: challengeIds.eventId,
              eventName: 'ChallengeRescheduled',
              schemaVersion: 1,
              aggregateType: 'Challenge',
              aggregateId: challenge.challenge_id,
              aggregateVersion: challengeNextVersion,
              transitionId: 'CH-21',
              payload: {
                challengeId: challenge.challenge_id,
                rescheduleId: challengeIds.rescheduleId,
                bookingId: row.booking_id,
                sessionId: row.session_id,
                initiatedByUserId: command.actor.id,
                faultAttribution: 'EXTERNAL',
                reasonCode: command.payload.reasonCode,
                userRescheduleCount: externalCount,
                schedulingDeadlineAt: challenge.scheduling_deadline_at!.toISOString(),
              },
              metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
            }]
          : []),
      ];
      const outbox = [
        ...noFaultCancellationOutbox(ids, row, command.payload.reasonCode, challenge !== null),
        ...(challenge && challengeIds && challengeNextVersion !== null && externalCount !== null
          ? [{
              messageId: challengeIds.outboxMessageId,
              topic: 'competition.challenge.rescheduled.v1',
              sourceEventId: challengeIds.eventId,
              payload: {
                challengeId: challenge.challenge_id,
                rescheduleId: challengeIds.rescheduleId,
                bookingId: row.booking_id,
                sessionId: row.session_id,
                initiatedByUserId: command.actor.id,
                faultAttribution: 'EXTERNAL',
                reasonCode: command.payload.reasonCode,
                userRescheduleCount: externalCount,
                timer: {
                  commandType: 'EXPIRE_CHALLENGE_SCHEDULING',
                  aggregateType: 'Challenge',
                  aggregateId: challenge.challenge_id,
                  deadlineAt: challenge.scheduling_deadline_at!.toISOString(),
                  expectedState: 'ACCEPTED_UNSCHEDULED',
                  expectedVersion: challengeNextVersion,
                  policyVersion: CHALLENGE_POLICY_VERSION,
                  idempotencyKey:
                    `challenge:${challenge.challenge_id}:expire-scheduling:v${challengeNextVersion}`,
                },
              },
            }]
          : []),
      ];
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId, eventName: 'SessionFailedExternal', schemaVersion: 1,
          transitionId: row.state === 'READY_FOR_COACH' ? 'S-11' : 'S-04',
          payload: {
            sessionId: row.session_id,
            challengeId: challenge?.challenge_id ?? null,
            rescheduleId: challengeIds?.rescheduleId ?? null,
            reasonCode: command.payload.reasonCode,
          },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        relatedEvents,
        audit: {
          auditId: ids.auditId, action: 'FAIL_SESSION_EXTERNAL',
          transitionId: row.state === 'READY_FOR_COACH' ? 'S-11' : 'S-04',
          reasonCode: command.payload.reasonCode, beforeState: row.state,
          afterState: 'CANCELLED',
          metadata: {
            fault: 'EXTERNAL',
            challengeId: challenge?.challenge_id ?? null,
            rescheduleId: challengeIds?.rescheduleId ?? null,
            userRescheduleCounted: false,
            userRescheduleCount: externalCount,
          },
        },
        outbox,
      };
    },
  });
}

export async function cancelOfficialSessionByAthlete(
  database: Kysely<Database>,
  command: CommandEnvelope<CancelOfficialSessionByAthletePayload>,
  ids: SessionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<SessionLifecycleProjection>> {
  if (
    !command.actor.id
    || command.commandType !== 'CANCEL_OFFICIAL_BY_ATHLETE'
    || command.aggregateType !== 'Session'
    || command.payload.sessionId !== command.aggregateId
  ) {
    throw new SchedulingPermissionDeniedError();
  }
  const required = requiredOfficialCancellationIds(ids);
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await readSessionRow(transaction, command.aggregateId, true);
      if (!row || !row.challenge_id) {
        throw new SchedulingConflictError('OFFICIAL_CANCELLATION_NOT_ALLOWED');
      }
      const winnerUserId = officialCancellationWinner({
        bookingState: row.booking_state,
        bookingPurpose: row.purpose,
        challengeState: row.challenge_state,
        sessionState: row.state,
        actualStartAt: row.actual_start_at?.toISOString() ?? null,
        actorUserId: command.actor.id!,
        participantUserIds: [row.pair_low_id, row.pair_high_id],
        resultExists: row.result_id !== null,
      });
      const resource = await readSessionResourcesForUpdate(transaction, row);
      const cancelled = await cancelConfirmedSessionResources(
        transaction,
        row,
        resource,
        context,
        command.actor.id!,
        'ATHLETE_CANCELLED_OFFICIAL',
      );
      const forfeit = await recordAdministrativeForfeit(
        transaction,
        {
          challengeId: row.challenge_id,
          loserUserId: command.actor.id!,
          recordedByUserId: command.actor.id!,
          reasonCode: 'ATHLETE_CANCELLED_CONFIRMED_OFFICIAL',
          comment: 'The Athlete explicitly cancelled the confirmed Official Session before actual start.',
          sourceSessionId: row.session_id,
          sourceCoachUserId: row.coach_user_id,
          notificationRecipientUserIds: [row.pair_low_id, row.pair_high_id, row.coach_user_id],
          occurredAt: context.occurredAt,
          expectedChallengeState: 'BOOKED',
        },
        required.result,
      );
      const updated: SessionRow = {
        ...cancelled.updated,
        challenge_state: 'RESULT_RECORDED',
        challenge_version: String(forfeit.challengeVersion),
        result_id: forfeit.resultId,
      };
      const response = await sessionProjection(transaction, updated, command.actor.id!);
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'SessionCancelled',
          schemaVersion: 1,
          transitionId: 'S-04',
          payload: {
            sessionId: row.session_id,
            bookingId: row.booking_id,
            challengeId: row.challenge_id,
            resultId: forfeit.resultId,
            cause: 'ATHLETE_CANCELLED_OFFICIAL',
          },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        relatedEvents: [
          {
            eventId: required.bookingEventId,
            eventName: 'OfficialBookingCancelledByAthlete',
            schemaVersion: 1,
            aggregateType: 'Booking',
            aggregateId: row.booking_id,
            aggregateVersion: cancelled.bookingVersion,
            transitionId: 'B-14',
            payload: {
              bookingId: row.booking_id,
              sessionId: row.session_id,
              challengeId: row.challenge_id,
              resultId: forfeit.resultId,
              cancelledByUserId: command.actor.id,
            },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          },
          {
            eventId: required.slotEventId,
            eventName: 'SlotBookingCancelled',
            schemaVersion: 1,
            aggregateType: 'Slot',
            aggregateId: resource.slot_id,
            aggregateVersion: cancelled.slotVersion,
            transitionId: 'SL-06',
            payload: { slotId: resource.slot_id, cause: 'ATHLETE_CANCELLED_OFFICIAL' },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          },
          {
            eventId: required.challengeEventId,
            eventName: 'BookedChallengeCancelledByAthlete',
            schemaVersion: 1,
            aggregateType: 'Challenge',
            aggregateId: row.challenge_id,
            aggregateVersion: forfeit.challengeVersion,
            transitionId: 'CH-12',
            payload: {
              challengeId: row.challenge_id,
              bookingId: row.booking_id,
              sessionId: row.session_id,
              resultId: forfeit.resultId,
              winnerUserId,
              loserUserId: command.actor.id,
              appealDeadlineAt: forfeit.appealDeadlineAt.toISOString(),
            },
            metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
          },
          ...forfeit.relatedEvents,
        ],
        audit: {
          auditId: ids.auditId,
          action: 'CANCEL_OFFICIAL_BY_ATHLETE',
          transitionId: 'CH-12',
          reasonCode: 'ATHLETE_CANCELLED_CONFIRMED_OFFICIAL',
          beforeState: row.state,
          afterState: 'CANCELLED',
          metadata: {
            bookingId: row.booking_id,
            challengeId: row.challenge_id,
            resultId: forfeit.resultId,
            winnerUserId,
            loserUserId: command.actor.id,
            statusTransitionType: forfeit.statusTransitionType,
          },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'scheduling.official-session.cancelled-by-athlete.v1',
            payload: {
              sessionId: row.session_id,
              bookingId: row.booking_id,
              challengeId: row.challenge_id,
              resultId: forfeit.resultId,
              winnerUserId,
              loserUserId: command.actor.id,
              appealDeadlineAt: forfeit.appealDeadlineAt.toISOString(),
            },
          },
          ...forfeit.outbox,
        ],
      };
    },
  });
}

export async function listInvalidPlannedTitleSessions(
  database: Kysely<Database>,
  competitionId: string,
  limit = 100,
): Promise<readonly InvalidPlannedTitleSessionCandidate[]> {
  const result = await sql<{
    readonly session_id: string;
    readonly competition_id: string;
    readonly version: string;
  }>`
    select session.session_id, challenge.competition_id,
      session.version::text as version
    from scheduling.sessions as session
    join scheduling.bookings as booking on booking.booking_id = session.booking_id
    join scheduling.slots as slot on slot.slot_id = booking.slot_id
    join competition.challenges as challenge on challenge.challenge_id = session.challenge_id
    join competition.competitions as competitive
      on competitive.competition_id = challenge.competition_id
    where challenge.competition_id = ${competitionId}::uuid
      and challenge.stake = 'TITLE' and challenge.state = 'BOOKED'
      and session.purpose = 'OFFICIAL_CHALLENGE'
      and session.state = 'SCHEDULED' and session.actual_start_at is null
      and booking.state = 'CONFIRMED_PAIR' and slot.state = 'BOOKED'
      and not (
        competitive.champion_user_id is not null
        and competitive.contender_user_id is not null
        and competitive.champion_user_id in (session.pair_low_id, session.pair_high_id)
        and competitive.contender_user_id in (session.pair_low_id, session.pair_high_id)
      )
    order by session.scheduled_start_at, session.session_id
    limit ${limit}
  `.execute(database);
  return result.rows.map((row) => ({
    sessionId: row.session_id,
    competitionId: row.competition_id,
    version: Number(row.version),
  }));
}

export async function invalidateCompetitiveSession(
  database: Kysely<Database>,
  command: CommandEnvelope<InvalidateCompetitiveSessionPayload>,
  ids: CompetitiveSessionInvalidationEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<SessionLifecycleProjection>> {
  if (
    command.actor.type !== 'SYSTEM'
    || command.aggregateType !== 'Session'
    || command.aggregateId !== command.payload.sessionId
  ) {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await readSessionRow(transaction, command.aggregateId, true);
      if (
        !row
        || row.state !== 'SCHEDULED'
        || row.actual_start_at !== null
        || row.purpose !== 'OFFICIAL_CHALLENGE'
        || row.booking_state !== 'CONFIRMED_PAIR'
      ) {
        throw new SchedulingConflictError('COMPETITIVE_SESSION_NOT_INVALIDATABLE');
      }
      const challenge = await officialChallengeForSession(transaction, row);
      if (
        !challenge
        || challenge.state !== 'BOOKED'
        || challenge.stake !== 'TITLE'
        || Number(challenge.active_obligation_count) !== 2
      ) {
        throw new SchedulingConflictError('COMPETITIVE_SESSION_NOT_INVALIDATABLE');
      }
      if (!titleSessionRequiresCompetitiveInvalidation({
        actualStartAt: null,
        plannedStake: challenge.stake,
        participantUserIds: [row.pair_low_id, row.pair_high_id],
        championUserId: challenge.champion_user_id,
        contenderUserId: challenge.contender_user_id,
      })) {
        throw new SchedulingConflictError('COMPETITIVE_CONTEXT_CURRENT');
      }
      const resourcesResult = await sql<CompetitiveSessionResourceRow>`
        select booking.state as booking_state,
          booking.version::text as booking_version,
          slot.state as slot_state, slot.version::text as slot_version
        from scheduling.bookings as booking
        join scheduling.slots as slot on slot.slot_id = booking.slot_id
        where booking.booking_id = ${row.booking_id}::uuid
        for update of booking, slot
      `.execute(transaction);
      const resources = resourcesResult.rows[0];
      if (!resources || resources.booking_state !== 'CONFIRMED_PAIR'
        || resources.slot_state !== 'BOOKED') {
        throw new SchedulingConflictError('COMPETITIVE_SESSION_NOT_INVALIDATABLE');
      }

      const retainable = row.scheduled_start_at > context.occurredAt;
      const retention = retainable
        ? await openBookedOfficialTrainingRetention(transaction, {
            challengeId: challenge.challenge_id,
            cause: 'COMPETITIVE_CONTEXT_INVALIDATED',
            occurredAt: context.occurredAt,
            ids: { retentionId: ids.retentionId },
          })
        : null;
      const timestamp = context.occurredAt.toISOString();
      await sql`
        update competition.challenges
        set state = 'CANCELLED_NO_FAULT', decided_at = ${timestamp}::timestamptz,
          version = version + 1, updated_at = ${timestamp}::timestamptz
        where challenge_id = ${challenge.challenge_id}::uuid
          and state = 'BOOKED' and version = ${Number(challenge.version)}
      `.execute(transaction);
      await sql`
        update competition.challenge_participant_obligations
        set released_at = ${timestamp}::timestamptz,
          release_reason = 'COMPETITIVE_CONTEXT_INVALIDATED'
        where challenge_id = ${challenge.challenge_id}::uuid and released_at is null
      `.execute(transaction);
      if (retention) {
        await sql`
          update scheduling.sessions
          set version = ${context.nextVersion}, updated_at = ${timestamp}::timestamptz
          where session_id = ${row.session_id}::uuid and state = 'SCHEDULED'
        `.execute(transaction);
      } else {
        await sql`
          update scheduling.bookings
          set state = 'CANCELLED', cancelled_at = ${timestamp}::timestamptz,
            cancel_actor = null, cancel_reason = 'COMPETITIVE_CONTEXT_INVALIDATED',
            version = version + 1, updated_at = ${timestamp}::timestamptz
          where booking_id = ${row.booking_id}::uuid and state = 'CONFIRMED_PAIR'
        `.execute(transaction);
        await sql`
          update scheduling.sessions
          set state = 'CANCELLED', cancelled_at = ${timestamp}::timestamptz,
            cancelled_by = null,
            cancellation_reason_code = 'COMPETITIVE_CONTEXT_INVALIDATED',
            version = ${context.nextVersion}, updated_at = ${timestamp}::timestamptz
          where session_id = ${row.session_id}::uuid and state = 'SCHEDULED'
        `.execute(transaction);
        await sql`
          update scheduling.slots
          set state = 'CANCELLED', version = version + 1,
            updated_at = ${timestamp}::timestamptz
          where slot_id = ${row.slot_id}::uuid and state = 'BOOKED'
        `.execute(transaction);
      }

      const updated = await readSessionRow(transaction, row.session_id);
      if (!updated) throw new SchedulingConflictError('SESSION_NOT_READY');
      const response = await sessionProjection(transaction, updated, row.pair_low_id);
      const relatedEvents: RelatedDomainEventDraft[] = [{
        eventId: ids.challengeEventId,
        eventName: 'ChallengeCancelledNoFault',
        schemaVersion: 1,
        aggregateType: 'Challenge',
        aggregateId: challenge.challenge_id,
        aggregateVersion: Number(challenge.version) + 1,
        transitionId: 'CH-26',
        payload: {
          challengeId: challenge.challenge_id,
          competitionId: challenge.competition_id,
          reason: 'COMPETITIVE_CONTEXT_INVALIDATED',
          noForfeit: true,
        },
        metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
      }];
      if (retention) {
        relatedEvents.push({
          eventId: ids.retentionEventId,
          eventName: 'BookingTrainingRetentionRequested',
          schemaVersion: 1,
          aggregateType: 'BookingTrainingRetention',
          aggregateId: retention.retentionId,
          aggregateVersion: 1,
          transitionId: 'B-26',
          payload: {
            retentionId: retention.retentionId,
            bookingId: retention.bookingId,
            sessionId: retention.sessionId,
            sourceChallengeId: retention.challengeId,
            cause: 'COMPETITIVE_CONTEXT_INVALIDATED',
            deadlineAt: retention.deadlineAt,
          },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        }, {
          eventId: ids.bookingEventId,
          eventName: 'BookingOfficialReleasePending',
          schemaVersion: 1,
          aggregateType: 'Booking',
          aggregateId: retention.bookingId,
          aggregateVersion: retention.bookingVersion,
          transitionId: 'B-26',
          payload: {
            bookingId: retention.bookingId,
            retentionId: retention.retentionId,
            sourceChallengeId: retention.challengeId,
          },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        });
      } else {
        relatedEvents.push({
          eventId: ids.bookingEventId,
          eventName: 'BookingCancelledNoFault',
          schemaVersion: 1,
          aggregateType: 'Booking',
          aggregateId: row.booking_id,
          aggregateVersion: Number(resources.booking_version) + 1,
          transitionId: 'B-29',
          payload: {
            bookingId: row.booking_id,
            reason: 'COMPETITIVE_CONTEXT_INVALIDATED',
            noForfeit: true,
          },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        }, {
          eventId: ids.slotEventId,
          eventName: 'SlotBookingCancelled',
          schemaVersion: 1,
          aggregateType: 'Slot',
          aggregateId: row.slot_id,
          aggregateVersion: Number(resources.slot_version) + 1,
          transitionId: 'SL-06',
          payload: {
            slotId: row.slot_id,
            reasonCode: 'COMPETITIVE_CONTEXT_INVALIDATED',
          },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        });
      }

      const outbox: OutboxDraft[] = [{
        messageId: ids.outboxMessageId,
        topic: 'scheduling.session.competitive-context-invalidated.v1',
        payload: {
          sessionId: row.session_id,
          bookingId: row.booking_id,
          challengeId: challenge.challenge_id,
          competitionId: challenge.competition_id,
          physicalDisposition: retention ? 'RETENTION_PENDING' : 'CANCELLED',
          noForfeit: true,
        },
      }, {
        messageId: ids.challengeOutboxMessageId,
        topic: 'competition.challenge.cancelled-no-fault.v1',
        sourceEventId: ids.challengeEventId,
        payload: {
          challengeId: challenge.challenge_id,
          competitionId: challenge.competition_id,
          reason: 'COMPETITIVE_CONTEXT_INVALIDATED',
          noForfeit: true,
        },
      }];
      if (retention) {
        outbox.push({
          messageId: ids.retentionOutboxMessageId,
          topic: 'scheduling.booking.training-retention-requested.v1',
          sourceEventId: ids.retentionEventId,
          payload: {
            retentionId: retention.retentionId,
            bookingId: retention.bookingId,
            sessionId: retention.sessionId,
            sourceChallengeId: retention.challengeId,
            cause: 'COMPETITIVE_CONTEXT_INVALIDATED',
            deadlineAt: retention.deadlineAt,
          },
        }, {
          messageId: ids.retentionTimerOutboxMessageId,
          topic: 'scheduling.booking.training-retention-timer.v1',
          sourceEventId: ids.retentionEventId,
          payload: {
            retentionId: retention.retentionId,
            timer: {
              commandType: 'EXPIRE_BOOKING_TRAINING_RETENTION',
              aggregateType: 'BookingTrainingRetention',
              aggregateId: retention.retentionId,
              expectedState: 'PENDING',
              expectedVersion: 1,
              deadlineAt: retention.deadlineAt,
              policyVersion: SCHEDULING_POLICY_VERSION,
              idempotencyKey: `booking-training-retention:${retention.retentionId}:expire:v1`,
            },
          },
        }, {
          messageId: ids.notificationOutboxMessageId,
          topic: 'notification.in_app.v1',
          sourceEventId: ids.retentionEventId,
          payload: {
            notifications: [...retention.athleteUserIds, retention.coachUserId]
              .map((recipientUserId, index) => ({
                notificationId: ids.notificationIds[index]!,
                recipientUserId,
                category: 'MANDATORY',
                renderKey: 'booking.training-retention-required',
                actionTarget: { type: 'SESSION', sessionId: retention.sessionId },
                payload: {
                  retentionId: retention.retentionId,
                  cause: 'COMPETITIVE_CONTEXT_INVALIDATED',
                },
                deadlineAt: retention.deadlineAt,
              })),
          },
        });
      } else {
        outbox.push({
          messageId: ids.notificationOutboxMessageId,
          topic: 'notification.in_app.v1',
          sourceEventId: ids.eventId,
          payload: {
            notifications: [row.pair_low_id, row.pair_high_id, row.coach_user_id]
              .map((recipientUserId, index) => ({
                notificationId: ids.notificationIds[index]!,
                recipientUserId,
                category: 'MANDATORY',
                renderKey: 'session.competitive-context-invalidated',
                actionTarget: { type: 'SESSION', sessionId: row.session_id },
                payload: { reason: 'COMPETITIVE_CONTEXT_INVALIDATED', noForfeit: true },
                deadlineAt: null,
              })),
          },
        });
      }
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'CompetitiveSessionInvalidated',
          schemaVersion: 1,
          transitionId: 'S-03',
          payload: {
            sessionId: row.session_id,
            bookingId: row.booking_id,
            challengeId: challenge.challenge_id,
            competitionId: challenge.competition_id,
            physicalDisposition: retention ? 'RETENTION_PENDING' : 'CANCELLED',
            noForfeit: true,
          },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        relatedEvents,
        audit: {
          auditId: ids.auditId,
          action: 'INVALIDATE_COMPETITIVE_SESSION_CONTEXT',
          transitionId: 'S-03',
          reasonCode: 'COMPETITIVE_CONTEXT_INVALIDATED',
          beforeState: 'SCHEDULED_OFFICIAL',
          afterState: retention ? 'TRAINING_RETENTION_PENDING' : 'CANCELLED',
          metadata: {
            bookingId: row.booking_id,
            challengeId: challenge.challenge_id,
            competitionId: challenge.competition_id,
            noForfeit: true,
          },
        },
        outbox,
      };
    },
  });
}

export async function openSessionWindow(
  database: Kysely<Database>,
  command: CommandEnvelope<OpenSessionWindowPayload>,
  ids: SessionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<SessionLifecycleProjection>> {
  if (
    command.actor.type !== 'SYSTEM' ||
    command.aggregateType !== 'Session' ||
    command.payload.sessionId !== command.aggregateId
  ) {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await readSessionRow(transaction, command.aggregateId, true);
      if (!row) throw new SchedulingConflictError('SESSION_NOT_READY');
      if (!(await hasActiveCoachScope(transaction, row, row.coach_user_id))) {
        throw new SchedulingPermissionDeniedError();
      }
      if (!['CONFIRMED_PAIR', 'CONFIRMED_SOLO', 'OFFICIAL_CONVERSION_PENDING']
        .includes(row.booking_state)) {
        throw new SchedulingConflictError('SESSION_NOT_READY');
      }
      assertSessionWindowCanOpen({
        state: row.state,
        scheduledStartAt: row.scheduled_start_at.toISOString(),
        occurredAt: context.occurredAt,
      });
      const conversionResult = await sql<SessionStartConversionRow>`
        select conversion.conversion_id, conversion.competition_id, conversion.state,
          conversion.version::text as version, conversion.queue_entry_id,
          entry.version::text as queue_version, booking.version::text as booking_version
        from scheduling.booking_official_conversions conversion
        join scheduling.bookings booking on booking.booking_id = conversion.booking_id
        left join competition.challenge_queue_entries entry
          on entry.queue_entry_id = conversion.queue_entry_id
        where conversion.session_id = ${row.session_id}::uuid
          and conversion.state in ('WAITING_FIFO', 'PENDING_CONFIRMATION')
        order by conversion.created_at desc
        limit 1
        for update of conversion
      `.execute(transaction);
      const closingConversion = conversionResult.rows[0] ?? null;
      if (closingConversion) {
        if (
          !ids.conversionEventId || !ids.conversionOutboxMessageId
          || !ids.conversionNotificationOutboxMessageId || !ids.conversionNotificationIds
          || (closingConversion.state === 'PENDING_CONFIRMATION' && !ids.bookingEventId)
          || (closingConversion.state === 'WAITING_FIFO'
            && closingConversion.queue_entry_id !== null && !ids.conversionQueueEventId)
        ) throw new TypeError('Session-start conversion closure effect IDs are required');
        const terminalState = closingConversion.state === 'WAITING_FIFO'
          ? 'INVALIDATED'
          : 'EXPIRED';
        await sql`
          update scheduling.booking_official_conversions
          set state = ${terminalState}, terminal_reason = 'SOURCE_SESSION_STARTED',
            decided_at = ${context.occurredAt.toISOString()}::timestamptz,
            version = version + 1,
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where conversion_id = ${closingConversion.conversion_id}::uuid
            and state in ('WAITING_FIFO', 'PENDING_CONFIRMATION')
        `.execute(transaction);
        if (closingConversion.state === 'PENDING_CONFIRMATION') {
          await sql`
            update scheduling.bookings
            set state = 'CONFIRMED_PAIR', version = version + 1,
              updated_at = ${context.occurredAt.toISOString()}::timestamptz
            where booking_id = ${row.booking_id}::uuid
              and state = 'OFFICIAL_CONVERSION_PENDING'
          `.execute(transaction);
        }
        if (closingConversion.state === 'WAITING_FIFO'
          && closingConversion.queue_entry_id !== null) {
          await sql`
            update competition.challenge_queue_entries
            set state = 'INVALIDATED', decided_at = ${context.occurredAt.toISOString()}::timestamptz,
              terminal_reason = 'PREBOOKED_SOURCE_STARTED', version = version + 1,
              updated_at = ${context.occurredAt.toISOString()}::timestamptz
            where queue_entry_id = ${closingConversion.queue_entry_id}::uuid
              and state = 'WAITING'
          `.execute(transaction);
        }
      }
      const challenge = await officialChallengeForSession(transaction, row);
      let competitiveSnapshot: CompetitiveSnapshotRow | null = null;
      if (challenge) {
        assertChallengeSessionWindowCanOpen({
          state: challenge.state,
          activeObligationCount: Number(challenge.active_obligation_count),
        });
        if (!titleChallengeCompetitiveContextIsCurrent({
          plannedStake: challenge.stake,
          participantUserIds: [row.pair_low_id, row.pair_high_id],
          championUserId: challenge.champion_user_id,
          contenderUserId: challenge.contender_user_id,
        })) {
          throw new SchedulingConflictError('COMPETITIVE_CONTEXT_INVALID');
        }
        const snapshotId = requiredCompetitiveSnapshotId(ids);
        const effectiveStake = effectiveChallengeStakeAtSessionWindow({
          plannedStake: challenge.stake,
          participantUserIds: [row.pair_low_id, row.pair_high_id],
          championUserId: challenge.champion_user_id,
          contenderUserId: challenge.contender_user_id,
        });
        await sql`
          insert into scheduling.session_competitive_snapshots (
            snapshot_id, session_id, challenge_id, competition_id,
            ruleset_snapshot_id, community_configuration_id,
            planned_stake, effective_stake, champion_user_id,
            contender_user_id, competition_status_version, venue_id,
            coach_user_id, pair_low_id, pair_high_id,
            scheduled_start_at, scheduled_end_at, created_at
          ) values (
            ${snapshotId}::uuid, ${row.session_id}::uuid,
            ${challenge.challenge_id}::uuid, ${challenge.competition_id}::uuid,
            ${challenge.ruleset_snapshot_id}::uuid,
            ${challenge.community_configuration_id}::uuid,
            ${challenge.stake}, ${effectiveStake},
            ${challenge.champion_user_id}::uuid,
            ${challenge.contender_user_id}::uuid,
            ${Number(challenge.competition_status_version)},
            ${row.venue_id}::uuid, ${row.coach_user_id}::uuid,
            ${row.pair_low_id}::uuid, ${row.pair_high_id}::uuid,
            ${row.scheduled_start_at.toISOString()}::timestamptz,
            ${row.scheduled_end_at.toISOString()}::timestamptz,
            ${context.occurredAt.toISOString()}::timestamptz
          )
        `.execute(transaction);
        competitiveSnapshot = { snapshot_id: snapshotId, effective_stake: effectiveStake };
      }
      await sql`
        update scheduling.sessions
        set state = 'READY_FOR_COACH', window_opened_at = scheduled_start_at,
          version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where session_id = ${row.session_id}::uuid and state = 'SCHEDULED'
      `.execute(transaction);
      const updated: SessionRow = {
        ...row,
        booking_state: closingConversion?.state === 'PENDING_CONFIRMATION'
          ? 'CONFIRMED_PAIR'
          : row.booking_state,
        state: 'READY_FOR_COACH',
        window_opened_at: row.scheduled_start_at,
        version: String(context.nextVersion),
      };
      const response = await sessionProjection(transaction, updated, row.coach_user_id);
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'SessionWindowOpened',
          schemaVersion: 1,
          transitionId: 'S-02',
          payload: {
            sessionId: row.session_id,
            windowOpenedAt: row.scheduled_start_at.toISOString(),
            ...(challenge && competitiveSnapshot
              ? {
                  challengeId: challenge.challenge_id,
                  competitiveSnapshotId: competitiveSnapshot.snapshot_id,
                  effectiveStake: competitiveSnapshot.effective_stake,
                }
              : {}),
          },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        ...(closingConversion ? {
          relatedEvents: [
            {
              eventId: ids.conversionEventId!,
              eventName: 'TrainingOfficialConversionClosed', schemaVersion: 1,
              aggregateType: 'BookingOfficialConversion',
              aggregateId: closingConversion.conversion_id,
              aggregateVersion: Number(closingConversion.version) + 1,
              transitionId: closingConversion.state === 'WAITING_FIFO' ? 'Q-08' : 'B-20',
              payload: { conversionId: closingConversion.conversion_id,
                sessionId: row.session_id, reason: 'SOURCE_SESSION_STARTED',
                sourcePreservedAsTraining: true },
              metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
            },
            ...(closingConversion.state === 'PENDING_CONFIRMATION' ? [{
              eventId: ids.bookingEventId!, eventName: 'TrainingOfficialConversionClosed',
              schemaVersion: 1, aggregateType: 'Booking', aggregateId: row.booking_id,
              aggregateVersion: Number(closingConversion.booking_version) + 1,
              transitionId: 'B-20', payload: { bookingId: row.booking_id,
                conversionId: closingConversion.conversion_id,
                reason: 'SOURCE_SESSION_STARTED', sourcePreservedAsTraining: true },
              metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
            }] : []),
            ...(closingConversion.state === 'WAITING_FIFO'
              && closingConversion.queue_entry_id !== null ? [{
              eventId: ids.conversionQueueEventId!, eventName: 'QueueEntryInvalidated', schemaVersion: 1,
              aggregateType: 'ChallengeQueueEntry', aggregateId: closingConversion.queue_entry_id,
              aggregateVersion: Number(closingConversion.queue_version) + 1,
              transitionId: 'Q-08', payload: {
                queueEntryId: closingConversion.queue_entry_id,
                competitionId: closingConversion.competition_id,
                reasonCode: 'PREBOOKED_SOURCE_STARTED', noLoss: true,
              }, metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
            }] : []),
          ],
        } : {}),
        audit: {
          auditId: ids.auditId,
          action: 'OPEN_SESSION_WINDOW',
          transitionId: 'S-02',
          reasonCode: 'SCHEDULED_START_REACHED',
          beforeState: row.state,
          afterState: 'READY_FOR_COACH',
          metadata: {},
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'scheduling.session.window-opened.v1',
            payload: {
              sessionId: row.session_id,
              ...(challenge && competitiveSnapshot
                ? {
                    challengeId: challenge.challenge_id,
                    competitiveSnapshotId: competitiveSnapshot.snapshot_id,
                    effectiveStake: competitiveSnapshot.effective_stake,
                  }
                : {}),
            },
          },
          ...(closingConversion ? [
            {
              messageId: ids.conversionOutboxMessageId!,
              topic: 'scheduling.booking.official-conversion-closed.v1',
              sourceEventId: ids.conversionEventId!,
              payload: { conversionId: closingConversion.conversion_id,
                bookingId: row.booking_id, competitionId: closingConversion.competition_id,
                reason: 'SOURCE_SESSION_STARTED', sourcePreservedAsTraining: true },
            },
            {
              messageId: ids.conversionNotificationOutboxMessageId!,
              topic: 'notification.in_app.v1',
              sourceEventId: ids.conversionEventId!,
              payload: { notifications: [row.pair_low_id, row.pair_high_id, row.coach_user_id]
                .map((recipientUserId, index) => ({
                  notificationId: ids.conversionNotificationIds![index]!, recipientUserId,
                  category: 'SERVICE', renderKey: 'booking.official-conversion-expired',
                  actionTarget: { type: 'SESSION', sessionId: row.session_id },
                  payload: { conversionId: closingConversion.conversion_id,
                    reason: 'SOURCE_SESSION_STARTED' }, deadlineAt: null,
                })) },
            },
          ] : []),
        ],
      };
    },
  });
}

export async function startSession(
  database: Kysely<Database>,
  command: CommandEnvelope<StartSessionPayload>,
  ids: SessionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<SessionLifecycleProjection>> {
  if (
    !command.actor.id ||
    command.aggregateType !== 'Session' ||
    command.payload.sessionId !== command.aggregateId
  ) {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await readSessionRow(transaction, command.aggregateId, true);
      if (!row) throw new SchedulingConflictError('SESSION_NOT_READY');
      assertBookingReadyForSession(row);
      await assertActiveCoachScope(transaction, row, command.actor.id!);
      assertSessionCanStart({
        state: row.state,
        scheduledStartAt: row.scheduled_start_at.toISOString(),
        scheduledEndAt: row.scheduled_end_at.toISOString(),
        operationalGraceMinutes: row.no_show_grace_minutes,
        occurredAt: context.occurredAt,
      });
      const challenge = await officialChallengeForSession(transaction, row);
      const competitiveSnapshot = challenge
        ? await competitiveSnapshotForSession(transaction, row.session_id)
        : null;
      if (challenge) {
        await assertNoCompetitionStatusReviewHold(transaction, challenge.challenge_id);
        assertChallengeSessionCanStart({
          state: challenge.state,
          activeObligationCount: Number(challenge.active_obligation_count),
          competitiveSnapshotPresent: competitiveSnapshot !== null,
        });
      }
      await sql`
        update scheduling.sessions
        set state = 'IN_PROGRESS', actual_start_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where session_id = ${row.session_id}::uuid and state = 'READY_FOR_COACH'
      `.execute(transaction);
      const challengeNextVersion = challenge ? Number(challenge.version) + 1 : null;
      if (challenge && challengeNextVersion !== null) {
        await sql`
          update competition.challenges
          set state = 'IN_SESSION', version = ${challengeNextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where challenge_id = ${challenge.challenge_id}::uuid and state = 'BOOKED'
        `.execute(transaction);
      }
      const updated: SessionRow = {
        ...row,
        state: 'IN_PROGRESS',
        actual_start_at: context.occurredAt,
        version: String(context.nextVersion),
      };
      const response = await sessionProjection(transaction, updated, command.actor.id!);
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'SessionStarted',
          schemaVersion: 1,
          transitionId: 'S-09',
          payload: {
            sessionId: row.session_id,
            actualStartAt: context.occurredAt.toISOString(),
            causation: 'EXPLICIT_START',
            coachUserId: command.actor.id,
            ...(challenge && competitiveSnapshot
              ? {
                  challengeId: challenge.challenge_id,
                  competitiveSnapshotId: competitiveSnapshot.snapshot_id,
                  effectiveStake: competitiveSnapshot.effective_stake,
                }
              : {}),
          },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        ...(challenge && challengeNextVersion !== null && competitiveSnapshot
          ? {
              relatedEvents: [{
                eventId: requiredChallengeTransitionIds(ids).eventId,
                eventName: 'ChallengeSessionStarted',
                schemaVersion: 1,
                aggregateType: 'Challenge',
                aggregateId: challenge.challenge_id,
                aggregateVersion: challengeNextVersion,
                transitionId: 'CH-13',
                payload: {
                  challengeId: challenge.challenge_id,
                  sessionId: row.session_id,
                  actualStartAt: context.occurredAt.toISOString(),
                  competitiveSnapshotId: competitiveSnapshot.snapshot_id,
                  effectiveStake: competitiveSnapshot.effective_stake,
                },
                metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
              }],
            }
          : {}),
        audit: {
          auditId: ids.auditId,
          action: 'START_SESSION',
          transitionId: 'S-09',
          reasonCode: null,
          beforeState: row.state,
          afterState: 'IN_PROGRESS',
          metadata: {},
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'scheduling.session.started.v1',
            payload: { sessionId: row.session_id, challengeId: row.challenge_id },
          },
          ...(challenge && competitiveSnapshot
            ? [{
                messageId: requiredChallengeTransitionIds(ids).outboxMessageId,
                topic: 'competition.challenge.session-started.v1',
                sourceEventId: requiredChallengeTransitionIds(ids).eventId,
                payload: {
                  challengeId: challenge.challenge_id,
                  sessionId: row.session_id,
                  competitiveSnapshotId: competitiveSnapshot.snapshot_id,
                  effectiveStake: competitiveSnapshot.effective_stake,
                },
              }]
            : []),
        ],
      };
    },
  });
}

export async function recordSessionAttendance(
  database: Kysely<Database>,
  command: CommandEnvelope<RecordAttendancePayload>,
  ids: SessionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<SessionLifecycleProjection>> {
  if (
    !command.actor.id ||
    command.aggregateType !== 'Session' ||
    command.payload.sessionId !== command.aggregateId ||
    !ids.attendanceId ||
    !ids.attendanceEventId
  ) {
    throw new SchedulingPermissionDeniedError();
  }
  const attendanceId = ids.attendanceId;
  const attendanceEventId = ids.attendanceEventId;
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await readSessionRow(transaction, command.aggregateId, true);
      if (!row) throw new SchedulingConflictError('SESSION_NOT_IN_PROGRESS');
      assertBookingReadyForSession(row);
      await assertActiveCoachScope(transaction, row, command.actor.id!);
      assertAttendanceCanBeRecorded({
        state: row.state,
        status: command.payload.status,
        athleteId: command.payload.athleteUserId,
        athleteUserIds: activeSessionAthleteIds(row),
        scheduledStartAt: row.scheduled_start_at.toISOString(),
        noShowGraceMinutes: row.no_show_grace_minutes,
        occurredAt: context.occurredAt,
      });
      if (row.state === 'READY_FOR_COACH') {
        assertSessionCanStart({
          state: row.state,
          scheduledStartAt: row.scheduled_start_at.toISOString(),
          scheduledEndAt: row.scheduled_end_at.toISOString(),
          operationalGraceMinutes: row.no_show_grace_minutes,
          occurredAt: context.occurredAt,
        });
      }
      const startsSession = row.state === 'READY_FOR_COACH';
      const challenge = await officialChallengeForSession(transaction, row);
      const competitiveSnapshot = challenge
        ? await competitiveSnapshotForSession(transaction, row.session_id)
        : null;
      if (challenge) {
        if (startsSession) {
          await assertNoCompetitionStatusReviewHold(transaction, challenge.challenge_id);
          assertChallengeSessionCanStart({
            state: challenge.state,
            activeObligationCount: Number(challenge.active_obligation_count),
            competitiveSnapshotPresent: competitiveSnapshot !== null,
          });
        } else {
          assertChallengeSessionCanEnd({
            state: challenge.state,
            competitiveSnapshotPresent: competitiveSnapshot !== null,
          });
        }
      }
      const existing = await sql<{ readonly present: boolean }>`
        select true as present from scheduling.attendance
        where session_id = ${row.session_id}::uuid
          and athlete_user_id = ${command.payload.athleteUserId}::uuid
      `.execute(transaction);
      if (existing.rows[0]?.present) {
        throw new SchedulingConflictError('ATTENDANCE_ALREADY_RECORDED');
      }
      const comment = normalizeComment(command.payload.comment);
      const arrivalAt = command.payload.status === 'NO_SHOW' ? null : context.occurredAt;
      const reasonCode = command.payload.status === 'NO_SHOW'
        ? 'ABSENCE_PREVENTED_SESSION'
        : null;
      await sql`
        insert into scheduling.attendance (
          attendance_id, session_id, athlete_user_id, status, arrival_at,
          recorded_by, recorded_at, reason_code, comment, version
        ) values (
          ${attendanceId}::uuid, ${row.session_id}::uuid,
          ${command.payload.athleteUserId}::uuid, ${command.payload.status},
          ${arrivalAt?.toISOString() ?? null}::timestamptz,
          ${command.actor.id}::uuid, ${context.occurredAt.toISOString()}::timestamptz,
          ${reasonCode}, ${comment}, 1
        )
      `.execute(transaction);
      await sql`
        update scheduling.sessions
        set state = ${startsSession ? 'IN_PROGRESS' : row.state},
          actual_start_at = case
            when ${startsSession} then ${context.occurredAt.toISOString()}::timestamptz
            else actual_start_at
          end,
          version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where session_id = ${row.session_id}::uuid
      `.execute(transaction);
      const challengeNextVersion = challenge && startsSession
        ? Number(challenge.version) + 1
        : null;
      if (challenge && challengeNextVersion !== null) {
        await sql`
          update competition.challenges
          set state = 'IN_SESSION', version = ${challengeNextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where challenge_id = ${challenge.challenge_id}::uuid and state = 'BOOKED'
        `.execute(transaction);
      }
      const updated: SessionRow = {
        ...row,
        state: startsSession ? 'IN_PROGRESS' : row.state,
        actual_start_at: startsSession ? context.occurredAt : row.actual_start_at,
        version: String(context.nextVersion),
      };
      const response = await sessionProjection(transaction, updated, command.actor.id!);
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: startsSession ? 'SessionStarted' : 'AttendanceRecorded',
          schemaVersion: 1,
          transitionId: startsSession ? 'S-10' : 'S-05',
          payload: startsSession
            ? {
                sessionId: row.session_id,
                actualStartAt: context.occurredAt.toISOString(),
                causation: 'FIRST_ATTENDANCE',
                coachUserId: command.actor.id,
                ...(challenge && competitiveSnapshot
                  ? {
                      challengeId: challenge.challenge_id,
                      competitiveSnapshotId: competitiveSnapshot.snapshot_id,
                      effectiveStake: competitiveSnapshot.effective_stake,
                    }
                  : {}),
              }
            : {
                sessionId: row.session_id,
                athleteUserId: command.payload.athleteUserId,
                status: command.payload.status,
              },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        ...(startsSession
          ? { relatedEvents: [
              {
                eventId: attendanceEventId,
                eventName: 'AttendanceRecorded',
                schemaVersion: 1,
                aggregateType: 'Attendance',
                aggregateId: attendanceId,
                aggregateVersion: 1,
                transitionId: 'S-10',
                payload: {
                  sessionId: row.session_id,
                  athleteUserId: command.payload.athleteUserId,
                  status: command.payload.status,
                },
                metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
              },
              ...(challenge && challengeNextVersion !== null && competitiveSnapshot
                ? [{
                    eventId: requiredChallengeTransitionIds(ids).eventId,
                    eventName: 'ChallengeSessionStarted',
                    schemaVersion: 1,
                    aggregateType: 'Challenge',
                    aggregateId: challenge.challenge_id,
                    aggregateVersion: challengeNextVersion,
                    transitionId: 'CH-13',
                    payload: {
                      challengeId: challenge.challenge_id,
                      sessionId: row.session_id,
                      actualStartAt: context.occurredAt.toISOString(),
                      competitiveSnapshotId: competitiveSnapshot.snapshot_id,
                      effectiveStake: competitiveSnapshot.effective_stake,
                    },
                    metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
                  }]
                : []),
            ] }
          : {}),
        audit: {
          auditId: ids.auditId,
          action: 'RECORD_ATTENDANCE',
          transitionId: startsSession ? 'S-10' : 'S-05',
          reasonCode,
          beforeState: row.state,
          afterState: updated.state,
          metadata: {
            athleteUserId: command.payload.athleteUserId,
            attendanceStatus: command.payload.status,
          },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'scheduling.session.attendance-recorded.v1',
            payload: {
              sessionId: row.session_id,
              athleteUserId: command.payload.athleteUserId,
              status: command.payload.status,
              startedSession: startsSession,
              challengeId: row.challenge_id,
            },
          },
          ...(challenge && startsSession && competitiveSnapshot
            ? [{
                messageId: requiredChallengeTransitionIds(ids).outboxMessageId,
                topic: 'competition.challenge.session-started.v1',
                sourceEventId: requiredChallengeTransitionIds(ids).eventId,
                payload: {
                  challengeId: challenge.challenge_id,
                  sessionId: row.session_id,
                  competitiveSnapshotId: competitiveSnapshot.snapshot_id,
                  effectiveStake: competitiveSnapshot.effective_stake,
                },
              }]
            : []),
        ],
      };
    },
  });
}

export async function endSession(
  database: Kysely<Database>,
  command: CommandEnvelope<EndSessionPayload>,
  ids: SessionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<SessionLifecycleProjection>> {
  if (
    !command.actor.id ||
    command.aggregateType !== 'Session' ||
    command.payload.sessionId !== command.aggregateId ||
    !ids.bookingEventId ||
    !ids.slotEventId
  ) {
    throw new SchedulingPermissionDeniedError();
  }
  const bookingEventId = ids.bookingEventId;
  const slotEventId = ids.slotEventId;
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await readSessionRow(transaction, command.aggregateId, true);
      if (!row) throw new SchedulingConflictError('SESSION_NOT_IN_PROGRESS');
      await assertActiveCoachScope(transaction, row, command.actor.id!);
      const attendance = await attendanceForSession(transaction, row.session_id);
      assertSessionCanEnd({
        state: row.state,
        attendanceCount: attendance.length,
        athleteCount: activeSessionAthleteIds(row).length,
      });
      const challenge = await officialChallengeForSession(transaction, row);
      const competitiveSnapshot = challenge
        ? await competitiveSnapshotForSession(transaction, row.session_id)
        : null;
      if (challenge) {
        assertChallengeSessionCanEnd({
          state: challenge.state,
          competitiveSnapshotPresent: competitiveSnapshot !== null,
        });
      }
      const resources = await sql<{
        readonly booking_version: string;
        readonly slot_id: string;
        readonly slot_version: string;
      }>`
        select booking.version::text as booking_version,
          slot.slot_id, slot.version::text as slot_version
        from scheduling.bookings as booking
        join scheduling.slots as slot on slot.booking_id = booking.booking_id
        where booking.booking_id = ${row.booking_id}::uuid
          and booking.state in ('CONFIRMED_PAIR', 'CONFIRMED_SOLO')
          and slot.state = 'BOOKED'
        for update of booking, slot
      `.execute(transaction);
      const resource = resources.rows[0];
      if (!resource) throw new SchedulingConflictError('SESSION_NOT_IN_PROGRESS');
      const bookingVersion = Number(resource.booking_version) + 1;
      const slotVersion = Number(resource.slot_version) + 1;
      await sql`
        update scheduling.sessions
        set state = 'ENDED', actual_end_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where session_id = ${row.session_id}::uuid and state = 'IN_PROGRESS'
      `.execute(transaction);
      await sql`
        update scheduling.bookings
        set state = 'COMPLETED', version = ${bookingVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where booking_id = ${row.booking_id}::uuid
          and state in ('CONFIRMED_PAIR', 'CONFIRMED_SOLO')
      `.execute(transaction);
      await sql`
        update scheduling.slots
        set state = 'COMPLETED', version = ${slotVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where slot_id = ${resource.slot_id}::uuid and state = 'BOOKED'
      `.execute(transaction);
      const challengeNextVersion = challenge ? Number(challenge.version) + 1 : null;
      if (challenge && challengeNextVersion !== null) {
        await sql`
          update competition.challenges
          set state = 'RESULT_PENDING', version = ${challengeNextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where challenge_id = ${challenge.challenge_id}::uuid and state = 'IN_SESSION'
        `.execute(transaction);
      }
      const resultReminderDeadlines = challenge
        ? challengeResultReminderDeadlines(context.occurredAt).map((value) => value.toISOString())
        : [];
      const updated: SessionRow = {
        ...row,
        state: 'ENDED',
        actual_end_at: context.occurredAt,
        version: String(context.nextVersion),
      };
      const response = await sessionProjection(transaction, updated, command.actor.id!);
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'SessionEnded',
          schemaVersion: 1,
          transitionId: 'S-06',
          payload: {
            sessionId: row.session_id,
            actualEndAt: context.occurredAt.toISOString(),
            attendedAthleteUserIds: attendance
              .filter((item) => item.status === 'PRESENT' || item.status === 'LATE')
              .map((item) => item.athleteUserId),
            ...(challenge && competitiveSnapshot
              ? {
                  challengeId: challenge.challenge_id,
                  competitiveSnapshotId: competitiveSnapshot.snapshot_id,
                  effectiveStake: competitiveSnapshot.effective_stake,
                }
              : {}),
          },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        relatedEvents: [
          {
            eventId: bookingEventId,
            eventName: 'BookingCompleted',
            schemaVersion: 1,
            aggregateType: 'Booking',
            aggregateId: row.booking_id,
            aggregateVersion: bookingVersion,
            transitionId: 'B-16',
            payload: { bookingId: row.booking_id, sessionId: row.session_id },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          },
          {
            eventId: slotEventId,
            eventName: 'SlotCompleted',
            schemaVersion: 1,
            aggregateType: 'Slot',
            aggregateId: resource.slot_id,
            aggregateVersion: slotVersion,
            transitionId: 'SL-07',
            payload: { slotId: resource.slot_id, sessionId: row.session_id },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          },
          ...(challenge && challengeNextVersion !== null && competitiveSnapshot
            ? [{
                eventId: requiredChallengeTransitionIds(ids).eventId,
                eventName: 'ChallengeAwaitingResult',
                schemaVersion: 1,
                aggregateType: 'Challenge',
                aggregateId: challenge.challenge_id,
                aggregateVersion: challengeNextVersion,
                transitionId: 'CH-14',
                payload: {
                  challengeId: challenge.challenge_id,
                  sessionId: row.session_id,
                  actualEndAt: context.occurredAt.toISOString(),
                  competitiveSnapshotId: competitiveSnapshot.snapshot_id,
                  effectiveStake: competitiveSnapshot.effective_stake,
                  resultReminderDeadlines,
                  timer: {
                    commandType: 'REMIND_MISSING_RESULT_COACH',
                    aggregateType: 'Challenge',
                    aggregateId: challenge.challenge_id,
                    expectedState: 'RESULT_PENDING',
                    expectedVersion: challengeNextVersion,
                    deadlineAt: resultReminderDeadlines[0],
                    policyVersion: RESULT_POLICY_VERSION,
                    idempotencyKey: `challenge:${challenge.challenge_id}:remind-missing-result-coach:v${challengeNextVersion}`,
                  },
                },
                metadata: { policyVersion: CHALLENGE_POLICY_VERSION },
              }]
            : []),
        ],
        audit: {
          auditId: ids.auditId,
          action: 'END_SESSION',
          transitionId: 'S-06',
          reasonCode: null,
          beforeState: row.state,
          afterState: 'ENDED',
          metadata: { attendanceCount: attendance.length },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'scheduling.session.ended.v1',
            payload: {
              sessionId: row.session_id,
              bookingId: row.booking_id,
              challengeId: row.challenge_id,
            },
          },
          ...(challenge && competitiveSnapshot
            ? [{
                messageId: requiredChallengeTransitionIds(ids).outboxMessageId,
                topic: 'competition.challenge.result-required.v1',
                sourceEventId: requiredChallengeTransitionIds(ids).eventId,
                payload: {
                  challengeId: challenge.challenge_id,
                  sessionId: row.session_id,
                  coachUserId: row.coach_user_id,
                  competitiveSnapshotId: competitiveSnapshot.snapshot_id,
                  effectiveStake: competitiveSnapshot.effective_stake,
                  resultReminderDeadlines,
                },
              }]
            : []),
        ],
      };
    },
  });
}
