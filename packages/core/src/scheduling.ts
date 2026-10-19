export const SCHEDULING_POLICY_VERSION = 'scheduling-mvp-v1' as const;
export const MAX_SLOT_HORIZON_DAYS = 30;
export const BOOKING_SELECTION_TTL_MILLISECONDS = 60 * 60 * 1_000;
export const OFFICIAL_CONVERSION_TTL_HOURS = 72;
export const SOLO_CONTINUATION_TTL_MINUTES = 60;
export const TRAINING_RETENTION_TTL_MINUTES = 60;

export type SchedulingConflictCode =
  | 'COACH_CONFLICT'
  | 'ATHLETE_SCHEDULE_CONFLICT'
  | 'SLOT_UNAVAILABLE'
  | 'OFFERING_UNAVAILABLE'
  | 'PAIR_REQUEST_EXISTS'
  | 'PAIR_PLAN_EXISTS'
  | 'ACTOR_ALREADY_SELECTED'
  | 'SELECTION_EXPIRED'
  | 'HOST_CONFIRMATION_EXPIRED'
  | 'BOOKING_WITHDRAWAL_NOT_ALLOWED'
  | 'COMMERCIAL_TERMS_CHANGED'
  | 'SESSION_NOT_READY'
  | 'SESSION_NOT_IN_PROGRESS'
  | 'SESSION_OPERATION_WINDOW_CLOSED'
  | 'COMPETITION_STATUS_REVIEW_HOLD'
  | 'ATTENDANCE_ALREADY_RECORDED'
  | 'ATTENDANCE_INCOMPLETE'
  | 'NO_SHOW_TOO_EARLY'
  | 'COACH_REPLACEMENT_UNAVAILABLE'
  | 'COACH_REPLACEMENT_NOT_REJECTABLE'
  | 'EXTERNAL_FAILURE_NOT_ALLOWED'
  | 'SAFETY_CANCELLATION_NOT_ALLOWED'
  | 'SAFETY_CASE_NOT_SUBMITTED'
  | 'SAFETY_CASE_NOT_UNDER_REVIEW'
  | 'SAFETY_CASE_REVIEWER_CONFLICT'
  | 'SAFETY_CASE_REVIEWER_MISMATCH'
  | 'SAFETY_CASE_REPLACEMENT_UNAVAILABLE'
  | 'SAFETY_CASE_CAUSAL_LINK_REQUIRED'
  | 'SAFETY_CASE_CONSEQUENCES_NOT_CONFIRMED'
  | 'SAFETY_CASE_SUBJECT_INVALID'
  | 'OFFICIAL_CANCELLATION_NOT_ALLOWED'
  | 'SCHEDULE_HAS_ACTIVE_INTENT'
  | 'SCHEDULE_MUTATION_NOT_ALLOWED'
  | 'OFFICIAL_CONVERSION_NOT_ALLOWED'
  | 'OFFICIAL_CONVERSION_ALREADY_EXISTS'
  | 'OFFICIAL_CONVERSION_NOT_PENDING'
  | 'OFFICIAL_CONVERSION_ACTOR_NOT_REQUIRED'
  | 'OFFICIAL_CONVERSION_ALREADY_DECIDED'
  | 'OFFICIAL_CONVERSION_EXPIRED'
  | 'OFFICIAL_CONVERSION_FIFO_REQUIRED'
  | 'SOLO_CONTINUATION_NOT_ALLOWED'
  | 'SOLO_CONTINUATION_ALREADY_EXISTS'
  | 'SOLO_CONTINUATION_NOT_PENDING'
  | 'SOLO_CONTINUATION_ACTOR_NOT_REQUIRED'
  | 'SOLO_CONTINUATION_ALREADY_DECIDED'
  | 'SOLO_CONTINUATION_EXPIRED'
  | 'TRAINING_RETENTION_NOT_ALLOWED'
  | 'TRAINING_RETENTION_NOT_PENDING'
  | 'TRAINING_RETENTION_ACTOR_NOT_REQUIRED'
  | 'TRAINING_RETENTION_ALREADY_DECIDED'
  | 'TRAINING_RETENTION_EXPIRED'
  | 'COMPETITIVE_SESSION_NOT_INVALIDATABLE'
  | 'COMPETITIVE_CONTEXT_CURRENT'
  | 'COMPETITIVE_CONTEXT_INVALID';

export type ScheduleMutationReasonCode =
  | 'COACH_UNAVAILABLE'
  | 'VENUE_UNAVAILABLE'
  | 'SCHEDULE_CHANGED'
  | 'OTHER';

const scheduleMutationReasonCodes = new Set<ScheduleMutationReasonCode>([
  'COACH_UNAVAILABLE',
  'VENUE_UNAVAILABLE',
  'SCHEDULE_CHANGED',
  'OTHER',
]);

export class SchedulingValidationError extends Error {
  readonly code = 'SCHEDULING_VALIDATION_ERROR';

  constructor(readonly field: string) {
    super(`Scheduling field ${field} is invalid`);
    this.name = 'SchedulingValidationError';
  }
}

export class SchedulingPermissionDeniedError extends Error {
  readonly code = 'PERMISSION_DENIED';

  constructor() {
    super('Scheduling action is not permitted for this actor');
    this.name = 'SchedulingPermissionDeniedError';
  }
}

export class SchedulingConflictError extends Error {
  readonly code: SchedulingConflictCode;

  constructor(readonly reason: SchedulingConflictCode) {
    super(`Scheduling action conflicts with current resources: ${reason}`);
    this.name = 'SchedulingConflictError';
    this.code = reason;
  }
}

function validDate(value: string, field: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new SchedulingValidationError(field);
  return parsed;
}

export interface PublicationWindowInput {
  readonly startAt: string;
  readonly endAt: string;
  readonly occurredAt: Date;
  readonly horizonDays: number;
}

export function assertPublicationWindow(input: PublicationWindowInput): void {
  if (!Number.isFinite(input.occurredAt.getTime())) {
    throw new SchedulingValidationError('occurredAt');
  }
  if (
    !Number.isSafeInteger(input.horizonDays) ||
    input.horizonDays < 1 ||
    input.horizonDays > MAX_SLOT_HORIZON_DAYS
  ) {
    throw new SchedulingValidationError('horizonDays');
  }
  const startAt = validDate(input.startAt, 'startAt');
  const endAt = validDate(input.endAt, 'endAt');
  if (startAt <= input.occurredAt) throw new SchedulingValidationError('startAt');
  if (endAt <= startAt) throw new SchedulingValidationError('endAt');
  const horizonAt = new Date(
    input.occurredAt.getTime() + input.horizonDays * 24 * 60 * 60 * 1_000,
  );
  if (startAt > horizonAt) throw new SchedulingValidationError('startAt');
}

export function normalizeScheduleLabel(value: string, field: string, maxLength = 120): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new SchedulingValidationError(field);
  }
  return normalized;
}

export function normalizeOptionalScheduleText(
  value: string | null,
  field: string,
  maxLength: number,
): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new SchedulingValidationError(field);
  }
  return normalized;
}

export function normalizeCommercialPrice(input: {
  readonly amount: string | null;
  readonly currency: string | null;
}): { readonly amount: string | null; readonly currency: string | null } {
  if (input.amount === null && input.currency === null) return input;
  if (input.amount === null || input.currency === null) {
    throw new SchedulingValidationError('price');
  }
  const amount = input.amount.trim();
  const currency = input.currency.trim().toUpperCase();
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(amount)) {
    throw new SchedulingValidationError('priceAmount');
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new SchedulingValidationError('priceCurrency');
  }
  return { amount, currency };
}

export function normalizeScheduleMutationReason(input: {
  readonly reasonCode: string;
  readonly reasonNote: string | null;
}): { readonly reasonCode: ScheduleMutationReasonCode; readonly reasonNote: string | null } {
  if (!scheduleMutationReasonCodes.has(input.reasonCode as ScheduleMutationReasonCode)) {
    throw new SchedulingValidationError('reasonCode');
  }
  return {
    reasonCode: input.reasonCode as ScheduleMutationReasonCode,
    reasonNote: normalizeOptionalScheduleText(input.reasonNote, 'reasonNote', 500),
  };
}

export function assertFutureScheduleCanBeMutated(input: {
  readonly state: string;
  readonly startAt: string;
  readonly activeIntentCount: number;
  readonly occurredAt: Date;
}): void {
  if (!Number.isFinite(input.occurredAt.getTime())) {
    throw new SchedulingValidationError('occurredAt');
  }
  if (!Number.isSafeInteger(input.activeIntentCount) || input.activeIntentCount < 0) {
    throw new SchedulingValidationError('activeIntentCount');
  }
  if (input.state !== 'PUBLISHED' || validDate(input.startAt, 'startAt') <= input.occurredAt) {
    throw new SchedulingConflictError('SCHEDULE_MUTATION_NOT_ALLOWED');
  }
  if (input.activeIntentCount > 0) {
    throw new SchedulingConflictError('SCHEDULE_HAS_ACTIVE_INTENT');
  }
}

export function bookingSelectionExpiresAt(occurredAt: Date): Date {
  if (!Number.isFinite(occurredAt.getTime())) {
    throw new SchedulingValidationError('occurredAt');
  }
  return new Date(occurredAt.getTime() + BOOKING_SELECTION_TTL_MILLISECONDS);
}

export function hostConfirmationDeadline(input: {
  readonly startAt: string;
  readonly minimumBookingNoticeHours: number;
  readonly occurredAt: Date;
}): Date {
  if (!Number.isFinite(input.occurredAt.getTime())) {
    throw new SchedulingValidationError('occurredAt');
  }
  if (
    !Number.isSafeInteger(input.minimumBookingNoticeHours) ||
    input.minimumBookingNoticeHours < 1
  ) {
    throw new SchedulingValidationError('minimumBookingNoticeHours');
  }
  const startAt = validDate(input.startAt, 'startAt');
  const deadline = new Date(
    startAt.getTime() - input.minimumBookingNoticeHours * 60 * 60 * 1_000,
  );
  if (input.occurredAt >= deadline) {
    throw new SchedulingConflictError('SLOT_UNAVAILABLE');
  }
  return deadline;
}

export function assertHostConfirmationWindow(input: {
  readonly state: string;
  readonly selectedAthleteCount: number;
  readonly deadlineAt: string;
  readonly occurredAt: Date;
}): void {
  if (input.state !== 'HOST_CONFIRMATION_PENDING' || input.selectedAthleteCount !== 2) {
    throw new SchedulingConflictError('SLOT_UNAVAILABLE');
  }
  const deadline = validDate(input.deadlineAt, 'hostConfirmationDeadlineAt');
  if (!Number.isFinite(input.occurredAt.getTime())) {
    throw new SchedulingValidationError('occurredAt');
  }
  if (input.occurredAt >= deadline) {
    throw new SchedulingConflictError('HOST_CONFIRMATION_EXPIRED');
  }
}

export function assertBookingRequestCanBeWithdrawn(input: {
  readonly state: string;
  readonly actorUserId: string;
  readonly participantUserIds: readonly [string, string];
}): void {
  if (!input.participantUserIds.includes(input.actorUserId)) {
    throw new SchedulingPermissionDeniedError();
  }
  if (!['SELECTING', 'HOST_CONFIRMATION_PENDING'].includes(input.state)) {
    throw new SchedulingConflictError('BOOKING_WITHDRAWAL_NOT_ALLOWED');
  }
}

export function assertAthleteScheduleAvailable(input: {
  readonly hasOverlappingConfirmedSession: boolean;
}): void {
  if (input.hasOverlappingConfirmedSession) {
    throw new SchedulingConflictError('ATHLETE_SCHEDULE_CONFLICT');
  }
}

export type OfficialConversionState =
  | 'WAITING_FIFO'
  | 'PENDING_CONFIRMATION'
  | 'CONVERTED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'INVALIDATED';

export type OfficialConversionRequiredRole = 'ATHLETE_LOW' | 'ATHLETE_HIGH' | 'COACH';

export function officialConversionDeadline(input: {
  readonly occurredAt: Date;
  readonly scheduledStartAt: string;
}): Date {
  if (!Number.isFinite(input.occurredAt.getTime())) {
    throw new SchedulingValidationError('occurredAt');
  }
  const scheduledStartAt = validDate(input.scheduledStartAt, 'scheduledStartAt');
  if (input.occurredAt >= scheduledStartAt) {
    throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
  }
  return new Date(Math.min(
    scheduledStartAt.getTime(),
    input.occurredAt.getTime() + OFFICIAL_CONVERSION_TTL_HOURS * 60 * 60 * 1_000,
  ));
}

export function assertTrainingOfficialConversionCanBeRequested(input: {
  readonly bookingState: string;
  readonly bookingPurpose: string;
  readonly sessionState: SessionState;
  readonly windowOpenedAt: string | null;
  readonly actualStartAt: string | null;
  readonly scheduledStartAt: string;
  readonly actorIsAthlete: boolean;
  readonly hasLiveConversion: boolean;
  readonly occurredAt: Date;
}): Date {
  if (
    input.bookingState !== 'CONFIRMED_PAIR'
    || input.bookingPurpose !== 'TRAINING'
    || input.sessionState !== 'SCHEDULED'
    || input.windowOpenedAt !== null
    || input.actualStartAt !== null
    || !input.actorIsAthlete
  ) {
    throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
  }
  if (input.hasLiveConversion) {
    throw new SchedulingConflictError('OFFICIAL_CONVERSION_ALREADY_EXISTS');
  }
  return officialConversionDeadline({
    occurredAt: input.occurredAt,
    scheduledStartAt: input.scheduledStartAt,
  });
}

export function assertGroupPlanOfficialConversionCanBeRequested(input: {
  readonly groupPlanState: string;
  readonly actorIsAthlete: boolean;
  readonly coachAssigned: boolean;
  readonly hasLiveConversion: boolean;
  readonly scheduledStartAt: string;
  readonly occurredAt: Date;
}): Date {
  if (
    input.groupPlanState !== 'NOTIFIED'
    || !input.actorIsAthlete
    || !input.coachAssigned
  ) {
    throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_ALLOWED');
  }
  if (input.hasLiveConversion) {
    throw new SchedulingConflictError('OFFICIAL_CONVERSION_ALREADY_EXISTS');
  }
  return officialConversionDeadline({
    occurredAt: input.occurredAt,
    scheduledStartAt: input.scheduledStartAt,
  });
}

export function assertOfficialConversionDecisionCanBeRecorded(input: {
  readonly state: OfficialConversionState;
  readonly actorRequired: boolean;
  readonly actorAlreadyDecided: boolean;
  readonly confirmationDeadlineAt: string;
  readonly occurredAt: Date;
}): void {
  if (input.state !== 'PENDING_CONFIRMATION') {
    throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_PENDING');
  }
  if (!input.actorRequired) {
    throw new SchedulingConflictError('OFFICIAL_CONVERSION_ACTOR_NOT_REQUIRED');
  }
  if (input.actorAlreadyDecided) {
    throw new SchedulingConflictError('OFFICIAL_CONVERSION_ALREADY_DECIDED');
  }
  const deadline = validDate(input.confirmationDeadlineAt, 'confirmationDeadlineAt');
  if (!Number.isFinite(input.occurredAt.getTime()) || input.occurredAt >= deadline) {
    throw new SchedulingConflictError('OFFICIAL_CONVERSION_EXPIRED');
  }
}

export function assertOfficialConversionCanExpire(input: {
  readonly state: OfficialConversionState;
  readonly confirmationDeadlineAt: string;
  readonly occurredAt: Date;
}): void {
  if (input.state !== 'PENDING_CONFIRMATION') {
    throw new SchedulingConflictError('OFFICIAL_CONVERSION_NOT_PENDING');
  }
  const deadline = validDate(input.confirmationDeadlineAt, 'confirmationDeadlineAt');
  if (!Number.isFinite(input.occurredAt.getTime()) || input.occurredAt < deadline) {
    throw new SchedulingConflictError('OFFICIAL_CONVERSION_EXPIRED');
  }
}

export type SoloContinuationState = 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'EXPIRED';
export type SoloContinuationRequiredRole = 'REMAINING_ATHLETE' | 'COACH';

export function soloContinuationDeadline(input: {
  readonly occurredAt: Date;
  readonly scheduledStartAt: string;
}): Date {
  const scheduledStartAt = validDate(input.scheduledStartAt, 'scheduledStartAt');
  if (!Number.isFinite(input.occurredAt.getTime()) || scheduledStartAt <= input.occurredAt) {
    throw new SchedulingConflictError('SOLO_CONTINUATION_NOT_ALLOWED');
  }
  return new Date(Math.min(
    scheduledStartAt.getTime(),
    input.occurredAt.getTime() + SOLO_CONTINUATION_TTL_MINUTES * 60 * 1_000,
  ));
}

export function assertTrainingParticipantCanCancel(input: {
  readonly bookingState: string;
  readonly bookingPurpose: string;
  readonly sessionState: SessionState;
  readonly actualStartAt: string | null;
  readonly actorIsAthlete: boolean;
  readonly hasLiveSoloContinuation: boolean;
  readonly scheduledStartAt: string;
  readonly occurredAt: Date;
}): Date {
  if (!input.actorIsAthlete) throw new SchedulingPermissionDeniedError();
  if (
    input.bookingPurpose !== 'TRAINING'
    || !['CONFIRMED_PAIR', 'OFFICIAL_CONVERSION_PENDING'].includes(input.bookingState)
    || input.sessionState !== 'SCHEDULED'
    || input.actualStartAt !== null
  ) throw new SchedulingConflictError('SOLO_CONTINUATION_NOT_ALLOWED');
  if (input.hasLiveSoloContinuation) {
    throw new SchedulingConflictError('SOLO_CONTINUATION_ALREADY_EXISTS');
  }
  return soloContinuationDeadline({
    occurredAt: input.occurredAt,
    scheduledStartAt: input.scheduledStartAt,
  });
}

export function officialCancellationWinner(input: {
  readonly bookingState: string;
  readonly bookingPurpose: string;
  readonly challengeState: string | null;
  readonly sessionState: SessionState;
  readonly actualStartAt: string | null;
  readonly actorUserId: string;
  readonly participantUserIds: readonly [string, string];
  readonly resultExists: boolean;
}): string {
  if (!input.participantUserIds.includes(input.actorUserId)) {
    throw new SchedulingPermissionDeniedError();
  }
  if (
    input.bookingState !== 'CONFIRMED_PAIR'
    || input.bookingPurpose !== 'OFFICIAL_CHALLENGE'
    || input.challengeState !== 'BOOKED'
    || !['SCHEDULED', 'READY_FOR_COACH'].includes(input.sessionState)
    || input.actualStartAt !== null
    || input.resultExists
  ) {
    throw new SchedulingConflictError('OFFICIAL_CANCELLATION_NOT_ALLOWED');
  }
  return input.participantUserIds.find((userId) => userId !== input.actorUserId)!;
}

export function assertSoloContinuationDecisionCanBeRecorded(input: {
  readonly state: SoloContinuationState;
  readonly actorRequired: boolean;
  readonly actorAlreadyDecided: boolean;
  readonly deadlineAt: string;
  readonly occurredAt: Date;
}): void {
  if (input.state !== 'PENDING') {
    throw new SchedulingConflictError('SOLO_CONTINUATION_NOT_PENDING');
  }
  if (!input.actorRequired) {
    throw new SchedulingConflictError('SOLO_CONTINUATION_ACTOR_NOT_REQUIRED');
  }
  if (input.actorAlreadyDecided) {
    throw new SchedulingConflictError('SOLO_CONTINUATION_ALREADY_DECIDED');
  }
  const deadline = validDate(input.deadlineAt, 'deadlineAt');
  if (!Number.isFinite(input.occurredAt.getTime()) || input.occurredAt >= deadline) {
    throw new SchedulingConflictError('SOLO_CONTINUATION_EXPIRED');
  }
}

export function assertSoloContinuationCanExpire(input: {
  readonly state: SoloContinuationState;
  readonly deadlineAt: string;
  readonly occurredAt: Date;
}): void {
  if (input.state !== 'PENDING') {
    throw new SchedulingConflictError('SOLO_CONTINUATION_NOT_PENDING');
  }
  const deadline = validDate(input.deadlineAt, 'deadlineAt');
  if (!Number.isFinite(input.occurredAt.getTime()) || input.occurredAt < deadline) {
    throw new SchedulingConflictError('SOLO_CONTINUATION_EXPIRED');
  }
}

export type TrainingRetentionState = 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'EXPIRED';
export type TrainingRetentionRequiredRole = 'ATHLETE_LOW' | 'ATHLETE_HIGH' | 'COACH_OR_HOST';

export function trainingRetentionDeadline(input: {
  readonly occurredAt: Date;
  readonly scheduledStartAt: string;
}): Date {
  const scheduledStartAt = validDate(input.scheduledStartAt, 'scheduledStartAt');
  if (!Number.isFinite(input.occurredAt.getTime()) || scheduledStartAt <= input.occurredAt) {
    throw new SchedulingConflictError('TRAINING_RETENTION_NOT_ALLOWED');
  }
  return new Date(Math.min(
    scheduledStartAt.getTime(),
    input.occurredAt.getTime() + TRAINING_RETENTION_TTL_MINUTES * 60 * 1_000,
  ));
}

export function assertOfficialTrainingRetentionCanBeOffered(input: {
  readonly bookingState: string;
  readonly bookingPurpose: string;
  readonly sessionState: SessionState;
  readonly actualStartAt: string | null;
  readonly slotState: string;
  readonly scheduledStartAt: string;
  readonly occurredAt: Date;
}): Date {
  if (
    input.bookingState !== 'CONFIRMED_PAIR'
    || input.bookingPurpose !== 'OFFICIAL_CHALLENGE'
    || input.sessionState !== 'SCHEDULED'
    || input.actualStartAt !== null
    || input.slotState !== 'BOOKED'
  ) {
    throw new SchedulingConflictError('TRAINING_RETENTION_NOT_ALLOWED');
  }
  return trainingRetentionDeadline({
    occurredAt: input.occurredAt,
    scheduledStartAt: input.scheduledStartAt,
  });
}

export function assertTrainingRetentionDecisionCanBeRecorded(input: {
  readonly state: TrainingRetentionState;
  readonly actorRequired: boolean;
  readonly actorAlreadyDecided: boolean;
  readonly deadlineAt: string;
  readonly occurredAt: Date;
}): void {
  if (input.state !== 'PENDING') {
    throw new SchedulingConflictError('TRAINING_RETENTION_NOT_PENDING');
  }
  if (!input.actorRequired) {
    throw new SchedulingConflictError('TRAINING_RETENTION_ACTOR_NOT_REQUIRED');
  }
  if (input.actorAlreadyDecided) {
    throw new SchedulingConflictError('TRAINING_RETENTION_ALREADY_DECIDED');
  }
  const deadline = validDate(input.deadlineAt, 'deadlineAt');
  if (!Number.isFinite(input.occurredAt.getTime()) || input.occurredAt >= deadline) {
    throw new SchedulingConflictError('TRAINING_RETENTION_EXPIRED');
  }
}

export function assertTrainingRetentionCanExpire(input: {
  readonly state: TrainingRetentionState;
  readonly deadlineAt: string;
  readonly occurredAt: Date;
}): void {
  if (input.state !== 'PENDING') {
    throw new SchedulingConflictError('TRAINING_RETENTION_NOT_PENDING');
  }
  const deadline = validDate(input.deadlineAt, 'deadlineAt');
  if (!Number.isFinite(input.occurredAt.getTime()) || input.occurredAt < deadline) {
    throw new SchedulingConflictError('TRAINING_RETENTION_EXPIRED');
  }
}

export type SessionState =
  | 'SCHEDULED'
  | 'READY_FOR_COACH'
  | 'IN_PROGRESS'
  | 'ENDED'
  | 'CANCELLED';

export type AttendanceStatus = 'PRESENT' | 'LATE' | 'NO_SHOW';

export function assertSessionWindowCanOpen(input: {
  readonly state: SessionState;
  readonly scheduledStartAt: string;
  readonly occurredAt: Date;
}): void {
  if (input.state !== 'SCHEDULED') {
    throw new SchedulingConflictError('SESSION_NOT_READY');
  }
  const scheduledStartAt = validDate(input.scheduledStartAt, 'scheduledStartAt');
  if (!Number.isFinite(input.occurredAt.getTime())) {
    throw new SchedulingValidationError('occurredAt');
  }
  if (input.occurredAt < scheduledStartAt) {
    throw new SchedulingConflictError('SESSION_NOT_READY');
  }
}

export function assertSessionCoach(input: {
  readonly actorId: string;
  readonly coachUserId: string;
  readonly athleteUserIds: readonly string[];
}): void {
  if (
    input.actorId !== input.coachUserId ||
    input.athleteUserIds.includes(input.actorId)
  ) {
    throw new SchedulingPermissionDeniedError();
  }
}

export function assertSessionCanStart(input: {
  readonly state: SessionState;
  readonly scheduledStartAt: string;
  readonly scheduledEndAt: string;
  readonly operationalGraceMinutes: number;
  readonly occurredAt: Date;
}): void {
  if (input.state !== 'READY_FOR_COACH') {
    throw new SchedulingConflictError('SESSION_NOT_READY');
  }
  if (
    !Number.isSafeInteger(input.operationalGraceMinutes) ||
    input.operationalGraceMinutes < 5 ||
    input.operationalGraceMinutes > 30
  ) {
    throw new SchedulingValidationError('operationalGraceMinutes');
  }
  const scheduledStartAt = validDate(input.scheduledStartAt, 'scheduledStartAt');
  const scheduledEndAt = validDate(input.scheduledEndAt, 'scheduledEndAt');
  if (!Number.isFinite(input.occurredAt.getTime())) {
    throw new SchedulingValidationError('occurredAt');
  }
  if (input.occurredAt < scheduledStartAt) {
    throw new SchedulingConflictError('SESSION_NOT_READY');
  }
  const closesAt = new Date(
    scheduledEndAt.getTime() + input.operationalGraceMinutes * 60 * 1_000,
  );
  if (input.occurredAt > closesAt) {
    throw new SchedulingConflictError('SESSION_OPERATION_WINDOW_CLOSED');
  }
}

export function assertAttendanceCanBeRecorded(input: {
  readonly state: SessionState;
  readonly status: AttendanceStatus;
  readonly athleteId: string;
  readonly athleteUserIds: readonly string[];
  readonly scheduledStartAt: string;
  readonly noShowGraceMinutes: number;
  readonly occurredAt: Date;
}): void {
  if (input.state !== 'READY_FOR_COACH' && input.state !== 'IN_PROGRESS') {
    throw new SchedulingConflictError('SESSION_NOT_IN_PROGRESS');
  }
  if (!input.athleteUserIds.includes(input.athleteId)) {
    throw new SchedulingValidationError('athleteUserId');
  }
  if (
    !Number.isSafeInteger(input.noShowGraceMinutes) ||
    input.noShowGraceMinutes < 5 ||
    input.noShowGraceMinutes > 30
  ) {
    throw new SchedulingValidationError('noShowGraceMinutes');
  }
  if (input.status === 'NO_SHOW') {
    const scheduledStartAt = validDate(input.scheduledStartAt, 'scheduledStartAt');
    const allowedAt = new Date(
      scheduledStartAt.getTime() + input.noShowGraceMinutes * 60 * 1_000,
    );
    if (input.occurredAt < allowedAt) {
      throw new SchedulingConflictError('NO_SHOW_TOO_EARLY');
    }
  }
}

export function assertSessionCanEnd(input: {
  readonly state: SessionState;
  readonly attendanceCount: number;
  readonly athleteCount: number;
}): void {
  if (input.state !== 'IN_PROGRESS') {
    throw new SchedulingConflictError('SESSION_NOT_IN_PROGRESS');
  }
  if (input.attendanceCount !== input.athleteCount) {
    throw new SchedulingConflictError('ATTENDANCE_INCOMPLETE');
  }
}

export function assertCoachReplacementCanBeCommitted(input: {
  readonly state: SessionState;
  readonly actualStartAt: string | null;
  readonly currentCoachUserId: string;
  readonly replacementCoachUserId: string;
  readonly athleteUserIds: readonly string[];
  readonly scheduledStartAt: string;
  readonly operationalGraceMinutes: number;
  readonly occurredAt: Date;
}): void {
  if (
    (input.state !== 'SCHEDULED' && input.state !== 'READY_FOR_COACH') ||
    input.actualStartAt !== null ||
    input.currentCoachUserId === input.replacementCoachUserId ||
    input.athleteUserIds.includes(input.replacementCoachUserId)
  ) {
    throw new SchedulingConflictError('COACH_REPLACEMENT_UNAVAILABLE');
  }
  if (
    !Number.isSafeInteger(input.operationalGraceMinutes) ||
    input.operationalGraceMinutes < 5 ||
    input.operationalGraceMinutes > 30
  ) {
    throw new SchedulingValidationError('operationalGraceMinutes');
  }
  if (!Number.isFinite(input.occurredAt.getTime())) {
    throw new SchedulingValidationError('occurredAt');
  }
  const scheduledStartAt = validDate(input.scheduledStartAt, 'scheduledStartAt');
  const replacementClosesAt = new Date(
    scheduledStartAt.getTime() + input.operationalGraceMinutes * 60 * 1_000,
  );
  if (input.occurredAt > replacementClosesAt) {
    throw new SchedulingConflictError('COACH_REPLACEMENT_UNAVAILABLE');
  }
}

export function assertCoachReplacementCanBeRejected(input: {
  readonly state: SessionState;
  readonly actualStartAt: string | null;
  readonly latestCoachReplacementAt: string | null;
  readonly actorId: string;
  readonly athleteUserIds: readonly string[];
  readonly occurredAt: Date;
}): void {
  if (
    (input.state !== 'SCHEDULED' && input.state !== 'READY_FOR_COACH') ||
    input.actualStartAt !== null ||
    input.latestCoachReplacementAt === null ||
    !input.athleteUserIds.includes(input.actorId)
  ) {
    throw new SchedulingConflictError('COACH_REPLACEMENT_NOT_REJECTABLE');
  }
  const replacementAt = validDate(input.latestCoachReplacementAt, 'latestCoachReplacementAt');
  if (!Number.isFinite(input.occurredAt.getTime()) || input.occurredAt < replacementAt) {
    throw new SchedulingValidationError('occurredAt');
  }
}

export function assertExternalSessionFailureCanBeCommitted(input: {
  readonly state: SessionState;
  readonly actualStartAt: string | null;
}): void {
  if (
    (input.state !== 'SCHEDULED' && input.state !== 'READY_FOR_COACH') ||
    input.actualStartAt !== null
  ) {
    throw new SchedulingConflictError('EXTERNAL_FAILURE_NOT_ALLOWED');
  }
}

export type SafetyCancellationReasonCode =
  | 'THREAT'
  | 'HARASSMENT'
  | 'UNSAFE_CONDUCT'
  | 'OTHER_SAFETY';

const safetyCancellationReasonCodes = new Set<SafetyCancellationReasonCode>([
  'THREAT',
  'HARASSMENT',
  'UNSAFE_CONDUCT',
  'OTHER_SAFETY',
]);

export function assertSafetyCancellationCanBeSubmitted(input: {
  readonly sessionState: SessionState;
  readonly sessionPurpose: string;
  readonly bookingState: string;
  readonly challengeState: string | null;
  readonly actualStartAt: string | null;
  readonly resultExists: boolean;
  readonly explicitConfirmation: boolean;
  readonly reporterUserId: string;
  readonly subjectUserId: string;
  readonly athleteUserIds: readonly [string, string];
  readonly actorIsOperational: boolean;
  readonly actorIsAssignedCoach: boolean;
  readonly reporterPolicy: 'PARTICIPANT_OR_OPERATIONAL' | 'ASSIGNED_COACH_ONLY';
  readonly reasonCode: string;
}): SafetyCancellationReasonCode {
  const reporterIsAthlete = input.athleteUserIds.includes(input.reporterUserId);
  if (
    !input.explicitConfirmation
    || input.sessionPurpose !== 'OFFICIAL_CHALLENGE'
    || input.bookingState !== 'CONFIRMED_PAIR'
    || input.challengeState !== 'BOOKED'
    || !['SCHEDULED', 'READY_FOR_COACH'].includes(input.sessionState)
    || input.actualStartAt !== null
    || input.resultExists
    || (!reporterIsAthlete && !input.actorIsOperational)
    || (input.reporterPolicy === 'ASSIGNED_COACH_ONLY' && !input.actorIsAssignedCoach)
    || !input.athleteUserIds.includes(input.subjectUserId)
    || input.reporterUserId === input.subjectUserId
    || (reporterIsAthlete
      && input.subjectUserId === input.reporterUserId)
  ) {
    throw new SchedulingConflictError('SAFETY_CANCELLATION_NOT_ALLOWED');
  }
  if (!safetyCancellationReasonCodes.has(input.reasonCode as SafetyCancellationReasonCode)) {
    throw new SchedulingValidationError('reasonCode');
  }
  return input.reasonCode as SafetyCancellationReasonCode;
}

export type SafetyReplacementRemedy =
  | 'REPLACE_COACH'
  | 'REPLACE_VENUE'
  | 'REPLACE_COACH_AND_VENUE';

export type SafetyCaseRemedy = SafetyReplacementRemedy | 'FORFEIT_BY_ENFORCEMENT';

export function assertSafetyCaseReviewCanStart(input: {
  readonly state: string;
  readonly actorIsCentral: boolean;
  readonly reviewerUserId: string;
  readonly reporterUserId: string;
  readonly subjectUserId: string;
  readonly athleteUserIds: readonly [string, string];
  readonly assignedCoachUserId: string;
  readonly reviewerIsInterestedVenueAdmin: boolean;
}): void {
  if (!input.actorIsCentral) throw new SchedulingPermissionDeniedError();
  if (input.state !== 'SUBMITTED') {
    throw new SchedulingConflictError('SAFETY_CASE_NOT_SUBMITTED');
  }
  if (
    input.reviewerUserId === input.reporterUserId
    || input.reviewerUserId === input.subjectUserId
    || input.athleteUserIds.includes(input.reviewerUserId)
    || input.reviewerUserId === input.assignedCoachUserId
    || input.reviewerIsInterestedVenueAdmin
  ) {
    throw new SchedulingConflictError('SAFETY_CASE_REVIEWER_CONFLICT');
  }
}

export function normalizeSafetyCaseReleaseDecision(input: {
  readonly state: string;
  readonly assignedReviewerUserId: string | null;
  readonly reviewerUserId: string;
  readonly remedyCode: string;
  readonly replacementCoachUserId: string | null;
  readonly replacementVenueId: string | null;
  readonly replacementCoachAvailable: boolean;
  readonly replacementVenueAvailable: boolean;
  readonly reason: string;
}): {
  readonly remedyCode: SafetyReplacementRemedy;
  readonly replacementCoachUserId: string | null;
  readonly replacementVenueId: string | null;
  readonly reason: string;
} {
  if (input.state !== 'UNDER_REVIEW') {
    throw new SchedulingConflictError('SAFETY_CASE_NOT_UNDER_REVIEW');
  }
  if (input.assignedReviewerUserId !== input.reviewerUserId) {
    throw new SchedulingConflictError('SAFETY_CASE_REVIEWER_MISMATCH');
  }
  const remedyCodes = new Set<SafetyReplacementRemedy>([
    'REPLACE_COACH', 'REPLACE_VENUE', 'REPLACE_COACH_AND_VENUE',
  ]);
  if (!remedyCodes.has(input.remedyCode as SafetyReplacementRemedy)) {
    throw new SchedulingValidationError('remedyCode');
  }
  const remedyCode = input.remedyCode as SafetyReplacementRemedy;
  const needsCoach = remedyCode === 'REPLACE_COACH' || remedyCode === 'REPLACE_COACH_AND_VENUE';
  const needsVenue = remedyCode === 'REPLACE_VENUE' || remedyCode === 'REPLACE_COACH_AND_VENUE';
  if (
    needsCoach !== (input.replacementCoachUserId !== null)
    || needsVenue !== (input.replacementVenueId !== null)
    || (needsCoach && !input.replacementCoachAvailable)
    || (needsVenue && !input.replacementVenueAvailable)
  ) {
    throw new SchedulingConflictError('SAFETY_CASE_REPLACEMENT_UNAVAILABLE');
  }
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 1000) {
    throw new SchedulingValidationError('reason');
  }
  return {
    remedyCode,
    replacementCoachUserId: input.replacementCoachUserId,
    replacementVenueId: input.replacementVenueId,
    reason,
  };
}

export function normalizeSafetyEnforcementDecision(input: {
  readonly state: string;
  readonly assignedReviewerUserId: string | null;
  readonly reviewerUserId: string;
  readonly subjectUserId: string;
  readonly athleteUserIds: readonly [string, string];
  readonly caseReasonCode: string;
  readonly causalLinkConfirmed: boolean;
  readonly consequencesConfirmed: boolean;
  readonly reason: string;
}): {
  readonly remedyCode: 'FORFEIT_BY_ENFORCEMENT';
  readonly loserUserId: string;
  readonly winnerUserId: string;
  readonly enforcementReasonCode: SafetyCancellationReasonCode;
  readonly causalLinkCode: 'SUBJECT_CAUSED_SESSION_FAILURE';
  readonly reason: string;
} {
  if (input.state !== 'UNDER_REVIEW') {
    throw new SchedulingConflictError('SAFETY_CASE_NOT_UNDER_REVIEW');
  }
  if (input.assignedReviewerUserId !== input.reviewerUserId) {
    throw new SchedulingConflictError('SAFETY_CASE_REVIEWER_MISMATCH');
  }
  if (!input.athleteUserIds.includes(input.subjectUserId)) {
    throw new SchedulingConflictError('SAFETY_CASE_SUBJECT_INVALID');
  }
  if (!safetyCancellationReasonCodes.has(input.caseReasonCode as SafetyCancellationReasonCode)) {
    throw new SchedulingValidationError('caseReasonCode');
  }
  if (!input.causalLinkConfirmed) {
    throw new SchedulingConflictError('SAFETY_CASE_CAUSAL_LINK_REQUIRED');
  }
  if (!input.consequencesConfirmed) {
    throw new SchedulingConflictError('SAFETY_CASE_CONSEQUENCES_NOT_CONFIRMED');
  }
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 1000) {
    throw new SchedulingValidationError('reason');
  }
  return {
    remedyCode: 'FORFEIT_BY_ENFORCEMENT',
    loserUserId: input.subjectUserId,
    winnerUserId: input.athleteUserIds[0] === input.subjectUserId
      ? input.athleteUserIds[1]
      : input.athleteUserIds[0],
    enforcementReasonCode: input.caseReasonCode as SafetyCancellationReasonCode,
    causalLinkCode: 'SUBJECT_CAUSED_SESSION_FAILURE',
    reason,
  };
}

export function extendSchedulingDeadlineForSafetyHold(input: {
  readonly schedulingDeadlineAt: string;
  readonly holdStartedAt: string;
  readonly releasedAt: Date;
}): Date {
  const deadline = validDate(input.schedulingDeadlineAt, 'schedulingDeadlineAt');
  const startedAt = validDate(input.holdStartedAt, 'holdStartedAt');
  if (!Number.isFinite(input.releasedAt.getTime()) || input.releasedAt < startedAt) {
    throw new SchedulingValidationError('releasedAt');
  }
  return new Date(deadline.getTime() + input.releasedAt.getTime() - startedAt.getTime());
}

export function attendanceCountsAsCompletedTraining(status: AttendanceStatus): boolean {
  return status === 'PRESENT' || status === 'LATE';
}
