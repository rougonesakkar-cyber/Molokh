export const CHALLENGE_POLICY_VERSION = 'challenge-mvp-v1' as const;
export const OPTIONAL_CHALLENGE_RESPONSE_HOURS = 48;
export const OPTIONAL_CHALLENGE_REMINDER_HOURS = [12, 24] as const;
export const MANDATORY_CHALLENGE_RESPONSE_HOURS = 72;
export const MANDATORY_CHALLENGE_REMINDER_HOURS = [48] as const;
export const OPTIONAL_CHALLENGE_PAIR_QUIET_HOURS = 48;
export const OPTIONAL_CHALLENGE_OUTGOING_LIMIT = 3;
export const ACCEPTED_CHALLENGE_SCHEDULING_DAYS = 14;
export const CHALLENGE_SCHEDULING_EXTENSION_DAYS = 7;
export const CHALLENGE_RESULT_REMINDER_HOURS = [2, 12, 24] as const;
export const MAX_USER_CHALLENGE_RESCHEDULES = 2;

export type ChallengeState =
  | 'AWAITING_RESPONSE'
  | 'ACCEPTED_UNSCHEDULED'
  | 'BOOKING_PENDING'
  | 'BOOKED'
  | 'IN_SESSION'
  | 'RESULT_PENDING'
  | 'RESULT_RECORDED'
  | 'UNDER_APPEAL'
  | 'COMPLETED'
  | 'DECLINED'
  | 'WITHDRAWN'
  | 'CANCELLED_NO_FAULT'
  | 'EXPIRED_NO_FAULT';

export type ChallengeStake =
  | 'NONE'
  | 'CONTENDER'
  | 'TITLE'
  | 'GENESIS_CHAMPION'
  | 'GENESIS_CONTENDER';

export type ChallengeConflictCode =
  | 'ACCOUNT_NOT_ACTIVE'
  | 'ACCOUNT_NOT_VERIFIED'
  | 'AGE_CONTOUR_MISMATCH'
  | 'COMMUNITY_NOT_ACTIVE'
  | 'MEMBERSHIP_NOT_ACTIVE'
  | 'COMPETITION_NOT_ACTIVE'
  | 'MATCH_REQUIRED'
  | 'PAIR_MATRIX_DENIED'
  | 'PAIR_CHALLENGE_EXISTS'
  | 'PAIR_BLOCKED'
  | 'PAIR_COOLDOWN_ACTIVE'
  | 'OPTIONAL_INVITATION_LIMIT'
  | 'OPTIONAL_PAIR_QUIET'
  | 'OFFICIAL_OBLIGATION_LIMIT'
  | 'YOUTH_OFFICIAL_DISABLED'
  | 'RULESET_ACK_REQUIRED'
  | 'CHALLENGE_NOT_AWAITING_RESPONSE'
  | 'CHALLENGE_INITIATOR_REQUIRED'
  | 'CHALLENGE_RECIPIENT_REQUIRED'
  | 'CHALLENGE_RESPONSE_EXPIRED'
  | 'CHALLENGE_RESPONSE_NOT_DUE'
  | 'CHALLENGE_NOT_ACCEPTED'
  | 'CHALLENGE_BOOKING_NOT_PENDING'
  | 'CHALLENGE_NOT_BOOKED'
  | 'CHALLENGE_NOT_IN_SESSION'
  | 'CHALLENGE_SESSION_MISMATCH'
  | 'CHALLENGE_COMPETITIVE_SNAPSHOT_MISSING'
  | 'CHALLENGE_SCHEDULING_DEADLINE_REACHED'
  | 'CHALLENGE_SCHEDULING_NOT_DUE'
  | 'CHALLENGE_PARTICIPANT_REQUIRED'
  | 'CHALLENGE_OBLIGATION_MISSING'
  | 'CHALLENGE_RESCHEDULE_NOT_ALLOWED'
  | 'CHALLENGE_RESCHEDULE_LIMIT_REACHED';

export class ChallengeConflictError extends Error {
  readonly code: ChallengeConflictCode;

  constructor(readonly reason: ChallengeConflictCode) {
    super(`Official Challenge action is not allowed: ${reason}`);
    this.name = 'ChallengeConflictError';
    this.code = reason;
  }
}

function assertValidDate(value: Date, field: string): void {
  if (!Number.isFinite(value.getTime())) throw new RangeError(`${field} must be a valid date`);
}

function plusHours(value: Date, hours: number): Date {
  assertValidDate(value, 'occurredAt');
  return new Date(value.getTime() + hours * 60 * 60 * 1_000);
}

export function optionalChallengeResponseDeadline(createdAt: Date): Date {
  return plusHours(createdAt, OPTIONAL_CHALLENGE_RESPONSE_HOURS);
}

export function optionalChallengeReminderDeadlines(createdAt: Date): readonly [Date, Date] {
  return OPTIONAL_CHALLENGE_REMINDER_HOURS.map((hours) => plusHours(createdAt, hours)) as unknown as readonly [Date, Date];
}

export function mandatoryChallengeResponseDeadline(createdAt: Date): Date {
  return plusHours(createdAt, MANDATORY_CHALLENGE_RESPONSE_HOURS);
}

export function mandatoryChallengeReminderDeadlines(createdAt: Date): readonly [Date] {
  return MANDATORY_CHALLENGE_REMINDER_HOURS.map(
    (hours) => plusHours(createdAt, hours),
  ) as unknown as readonly [Date];
}

export function optionalChallengePairQuietEndsAt(decidedAt: Date): Date {
  return plusHours(decidedAt, OPTIONAL_CHALLENGE_PAIR_QUIET_HOURS);
}

export function acceptedChallengeSchedulingDeadline(acceptedAt: Date): Date {
  assertValidDate(acceptedAt, 'acceptedAt');
  return new Date(acceptedAt.getTime() + ACCEPTED_CHALLENGE_SCHEDULING_DAYS * 24 * 60 * 60 * 1_000);
}

export function assertAcceptedChallengeSchedulingCanExpire(input: {
  readonly state: ChallengeState;
  readonly schedulingDeadlineAt: Date | null;
  readonly schedulingExtensionCount: number;
  readonly occurredAt: Date;
}): 'EXTEND' | 'EXPIRE_NO_CAPACITY' {
  if (!['ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING'].includes(input.state)) {
    throw new ChallengeConflictError('CHALLENGE_NOT_ACCEPTED');
  }
  if (
    input.schedulingDeadlineAt === null
    || !Number.isFinite(input.schedulingDeadlineAt.getTime())
    || !Number.isFinite(input.occurredAt.getTime())
    || input.occurredAt < input.schedulingDeadlineAt
  ) {
    throw new ChallengeConflictError('CHALLENGE_SCHEDULING_NOT_DUE');
  }
  if (!Number.isInteger(input.schedulingExtensionCount)
    || input.schedulingExtensionCount < 0 || input.schedulingExtensionCount > 1) {
    throw new RangeError('schedulingExtensionCount must be 0 or 1');
  }
  return input.schedulingExtensionCount === 0 ? 'EXTEND' : 'EXPIRE_NO_CAPACITY';
}

export function extendedChallengeSchedulingDeadline(currentDeadlineAt: Date): Date {
  assertValidDate(currentDeadlineAt, 'currentDeadlineAt');
  return new Date(currentDeadlineAt.getTime()
    + CHALLENGE_SCHEDULING_EXTENSION_DAYS * 24 * 60 * 60 * 1_000);
}

export function challengeResultReminderDeadlines(endedAt: Date): readonly [Date, Date, Date] {
  return CHALLENGE_RESULT_REMINDER_HOURS.map((hours) => plusHours(endedAt, hours)) as unknown as readonly [Date, Date, Date];
}

export function assertAcceptedChallengeCanStartBooking(input: {
  readonly state: ChallengeState;
  readonly actorUserId: string;
  readonly participantUserIds: readonly string[];
  readonly schedulingDeadlineAt: Date | null;
  readonly occurredAt: Date;
  readonly activeObligationCount: number;
}): void {
  if (input.state !== 'ACCEPTED_UNSCHEDULED') {
    throw new ChallengeConflictError('CHALLENGE_NOT_ACCEPTED');
  }
  if (!input.participantUserIds.includes(input.actorUserId)) {
    throw new ChallengeConflictError('CHALLENGE_PARTICIPANT_REQUIRED');
  }
  if (
    input.schedulingDeadlineAt === null
    || !Number.isFinite(input.schedulingDeadlineAt.getTime())
    || !Number.isFinite(input.occurredAt.getTime())
    || input.occurredAt >= input.schedulingDeadlineAt
  ) {
    throw new ChallengeConflictError('CHALLENGE_SCHEDULING_DEADLINE_REACHED');
  }
  if (input.activeObligationCount !== 2) {
    throw new ChallengeConflictError('CHALLENGE_OBLIGATION_MISSING');
  }
}

export function nextAthleteChallengeRescheduleCount(input: {
  readonly state: ChallengeState;
  readonly actorUserId: string;
  readonly participantUserIds: readonly [string, string];
  readonly userRescheduleCount: number;
}): number {
  if (!input.participantUserIds.includes(input.actorUserId)) {
    throw new ChallengeConflictError('CHALLENGE_PARTICIPANT_REQUIRED');
  }
  if (!['ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING'].includes(input.state)) {
    throw new ChallengeConflictError('CHALLENGE_RESCHEDULE_NOT_ALLOWED');
  }
  if (
    !Number.isSafeInteger(input.userRescheduleCount)
    || input.userRescheduleCount < 0
    || input.userRescheduleCount >= MAX_USER_CHALLENGE_RESCHEDULES
  ) {
    throw new ChallengeConflictError('CHALLENGE_RESCHEDULE_LIMIT_REACHED');
  }
  return input.userRescheduleCount + 1;
}

export function assertChallengeBookingCanBeConfirmed(input: {
  readonly state: ChallengeState;
  readonly activeObligationCount: number;
}): void {
  if (input.state !== 'BOOKING_PENDING') {
    throw new ChallengeConflictError('CHALLENGE_BOOKING_NOT_PENDING');
  }
  if (input.activeObligationCount !== 2) {
    throw new ChallengeConflictError('CHALLENGE_OBLIGATION_MISSING');
  }
}

export function effectiveChallengeStakeAtSessionWindow(input: {
  readonly plannedStake: ChallengeStake;
  readonly participantUserIds: readonly [string, string];
  readonly championUserId: string | null;
  readonly contenderUserId: string | null;
}): ChallengeStake {
  const participants = new Set(input.participantUserIds);
  if (
    input.championUserId !== null
    && input.contenderUserId !== null
    && participants.has(input.championUserId)
    && participants.has(input.contenderUserId)
  ) {
    return 'TITLE';
  }
  if (input.contenderUserId !== null && participants.has(input.contenderUserId)) {
    return 'CONTENDER';
  }
  if (
    input.plannedStake === 'GENESIS_CHAMPION'
    || input.plannedStake === 'GENESIS_CONTENDER'
  ) {
    return input.plannedStake;
  }
  return 'NONE';
}

export function assertChallengeSessionWindowCanOpen(input: {
  readonly state: ChallengeState;
  readonly activeObligationCount: number;
}): void {
  if (input.state !== 'BOOKED') {
    throw new ChallengeConflictError('CHALLENGE_NOT_BOOKED');
  }
  if (input.activeObligationCount !== 2) {
    throw new ChallengeConflictError('CHALLENGE_OBLIGATION_MISSING');
  }
}

export function assertChallengeSessionCanStart(input: {
  readonly state: ChallengeState;
  readonly activeObligationCount: number;
  readonly competitiveSnapshotPresent: boolean;
}): void {
  assertChallengeSessionWindowCanOpen(input);
  if (!input.competitiveSnapshotPresent) {
    throw new ChallengeConflictError('CHALLENGE_COMPETITIVE_SNAPSHOT_MISSING');
  }
}

export function assertChallengeSessionCanEnd(input: {
  readonly state: ChallengeState;
  readonly competitiveSnapshotPresent: boolean;
}): void {
  if (input.state !== 'IN_SESSION') {
    throw new ChallengeConflictError('CHALLENGE_NOT_IN_SESSION');
  }
  if (!input.competitiveSnapshotPresent) {
    throw new ChallengeConflictError('CHALLENGE_COMPETITIVE_SNAPSHOT_MISSING');
  }
}

export interface DirectOpenChallengeEligibility {
  readonly initiatorAccountActive: boolean;
  readonly recipientAccountActive: boolean;
  readonly initiatorVerified: boolean;
  readonly recipientVerified: boolean;
  readonly sameAgeContour: boolean;
  readonly communityActive: boolean;
  readonly competitionActive: boolean;
  readonly initiatorMembershipActive: boolean;
  readonly recipientMembershipActive: boolean;
  readonly activeMatch: boolean;
  readonly pairBlocked: boolean;
  readonly pairCooldownActive: boolean;
  readonly pairQuietActive: boolean;
  readonly livePairChallengeExists: boolean;
  readonly outgoingAwaitingResponseCount: number;
  readonly initiatorStatus: 'ORDINARY' | 'CHAMPION' | 'CONTENDER';
  readonly recipientStatus: 'ORDINARY' | 'CHAMPION' | 'CONTENDER';
}

export function assertDirectOpenChallengeCanBeCreated(
  eligibility: DirectOpenChallengeEligibility,
): void {
  if (!eligibility.initiatorAccountActive || !eligibility.recipientAccountActive) {
    throw new ChallengeConflictError('ACCOUNT_NOT_ACTIVE');
  }
  if (!eligibility.initiatorVerified || !eligibility.recipientVerified) {
    throw new ChallengeConflictError('ACCOUNT_NOT_VERIFIED');
  }
  if (!eligibility.sameAgeContour) throw new ChallengeConflictError('AGE_CONTOUR_MISMATCH');
  if (!eligibility.communityActive) throw new ChallengeConflictError('COMMUNITY_NOT_ACTIVE');
  if (!eligibility.competitionActive) throw new ChallengeConflictError('COMPETITION_NOT_ACTIVE');
  if (!eligibility.initiatorMembershipActive || !eligibility.recipientMembershipActive) {
    throw new ChallengeConflictError('MEMBERSHIP_NOT_ACTIVE');
  }
  if (!eligibility.activeMatch) throw new ChallengeConflictError('MATCH_REQUIRED');
  if (eligibility.pairBlocked) throw new ChallengeConflictError('PAIR_BLOCKED');
  if (eligibility.pairCooldownActive) throw new ChallengeConflictError('PAIR_COOLDOWN_ACTIVE');
  if (eligibility.pairQuietActive) throw new ChallengeConflictError('OPTIONAL_PAIR_QUIET');
  if (eligibility.livePairChallengeExists) {
    throw new ChallengeConflictError('PAIR_CHALLENGE_EXISTS');
  }
  if (eligibility.outgoingAwaitingResponseCount >= OPTIONAL_CHALLENGE_OUTGOING_LIMIT) {
    throw new ChallengeConflictError('OPTIONAL_INVITATION_LIMIT');
  }
  if (
    eligibility.recipientStatus !== 'ORDINARY'
    || (eligibility.initiatorStatus !== 'ORDINARY' && eligibility.initiatorStatus !== 'CHAMPION')
  ) {
    throw new ChallengeConflictError('PAIR_MATRIX_DENIED');
  }
}

export function assertOptionalChallengeCanBeAccepted(input: {
  readonly state: ChallengeState;
  readonly actorUserId: string;
  readonly recipientUserId: string;
  readonly responseDeadlineAt: Date;
  readonly occurredAt: Date;
  readonly rulesetAckMode: 'IMPLICIT_ON_ACCEPT' | 'EXPLICIT_ACK_REQUIRED';
  readonly explicitRulesetAcknowledged: boolean;
  readonly participantHasActiveObligation: boolean;
}): void {
  if (input.state !== 'AWAITING_RESPONSE') {
    throw new ChallengeConflictError('CHALLENGE_NOT_AWAITING_RESPONSE');
  }
  if (input.actorUserId !== input.recipientUserId) {
    throw new ChallengeConflictError('CHALLENGE_RECIPIENT_REQUIRED');
  }
  if (input.occurredAt >= input.responseDeadlineAt) {
    throw new ChallengeConflictError('CHALLENGE_RESPONSE_EXPIRED');
  }
  if (input.rulesetAckMode === 'EXPLICIT_ACK_REQUIRED' && !input.explicitRulesetAcknowledged) {
    throw new ChallengeConflictError('RULESET_ACK_REQUIRED');
  }
  if (input.participantHasActiveObligation) {
    throw new ChallengeConflictError('OFFICIAL_OBLIGATION_LIMIT');
  }
}

export function assertOptionalChallengeCanBeDeclined(
  state: ChallengeState,
  actorUserId: string,
  recipientUserId: string,
): void {
  if (state !== 'AWAITING_RESPONSE') {
    throw new ChallengeConflictError('CHALLENGE_NOT_AWAITING_RESPONSE');
  }
  if (actorUserId !== recipientUserId) {
    throw new ChallengeConflictError('CHALLENGE_RECIPIENT_REQUIRED');
  }
}

export function assertOptionalChallengeCanBeWithdrawn(
  state: ChallengeState,
  actorUserId: string,
  initiatorUserId: string,
): void {
  if (state !== 'AWAITING_RESPONSE') {
    throw new ChallengeConflictError('CHALLENGE_NOT_AWAITING_RESPONSE');
  }
  if (actorUserId !== initiatorUserId) {
    throw new ChallengeConflictError('CHALLENGE_INITIATOR_REQUIRED');
  }
}

export function assertMandatoryChallengeCanBeDeclined(input: {
  readonly state: ChallengeState;
  readonly actorUserId: string;
  readonly recipientUserId: string;
  readonly responseDeadlineAt: Date;
  readonly occurredAt: Date;
}): void {
  if (input.state !== 'AWAITING_RESPONSE') {
    throw new ChallengeConflictError('CHALLENGE_NOT_AWAITING_RESPONSE');
  }
  if (input.actorUserId !== input.recipientUserId) {
    throw new ChallengeConflictError('CHALLENGE_RECIPIENT_REQUIRED');
  }
  if (input.occurredAt >= input.responseDeadlineAt) {
    throw new ChallengeConflictError('CHALLENGE_RESPONSE_EXPIRED');
  }
}

export function assertMandatoryChallengeCanBeExpired(
  state: ChallengeState,
  responseDeadlineAt: Date,
  occurredAt: Date,
): void {
  if (state !== 'AWAITING_RESPONSE') {
    throw new ChallengeConflictError('CHALLENGE_NOT_AWAITING_RESPONSE');
  }
  if (occurredAt < responseDeadlineAt) {
    throw new ChallengeConflictError('CHALLENGE_RESPONSE_NOT_DUE');
  }
}

export function assertOptionalChallengeCanBeExpired(
  state: ChallengeState,
  responseDeadlineAt: Date,
  occurredAt: Date,
): void {
  if (state !== 'AWAITING_RESPONSE') {
    throw new ChallengeConflictError('CHALLENGE_NOT_AWAITING_RESPONSE');
  }
  if (occurredAt < responseDeadlineAt) {
    throw new ChallengeConflictError('CHALLENGE_RESPONSE_NOT_DUE');
  }
}
