import type { ChallengeStake } from './challenge.js';

export const RESULT_POLICY_VERSION = 'result-mvp-v1' as const;
export const RESULT_APPEAL_HOURS = 48;
export const APPEAL_RESPONSE_HOURS = 24;
export const APPEAL_REVIEW_SLA_HOURS = 72;

export type ResultOutcomeCode =
  | 'WIN_A'
  | 'WIN_B'
  | 'DRAW'
  | 'NO_CONTEST'
  | 'FORFEIT'
  | 'NO_SHOW';

export type ResultState =
  | 'RECORDED'
  | 'UNDER_APPEAL'
  | 'FINAL'
  | 'REVERSED'
  | 'ANNULLED'
  | 'REPEAT_ORDERED';

export type AppealState =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'WITHDRAWN'
  | 'DECIDED_UPHELD'
  | 'DECIDED_REVERSED'
  | 'DECIDED_ANNULLED'
  | 'DECIDED_REPEAT';

export type AppealDecision = 'UPHOLD' | 'REVERSE' | 'ANNUL' | 'REPEAT';
export type AppealResponseRole = 'OPPONENT' | 'COACH';
export type AppealSlaExtensionHours = 24 | 48;

export type TechnicalCorrectionCategory =
  | 'OUTCOME_OR_WINNER_ERROR'
  | 'LATE_RESULT_CORRECTION';

export type TechnicalCorrectionState =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN';

export type StatusTransitionType =
  | 'NONE'
  | 'GENESIS_APPLIED'
  | 'GENESIS_APPLIED_WITH_VACANCY'
  | 'CONTENDER_ASSIGNED'
  | 'CONTENDER_TRANSFERRED'
  | 'CONTENDER_DEFENDED'
  | 'TITLE_TRANSFERRED'
  | 'TITLE_DEFENDED';

export type ResultConflictCode =
  | 'CHALLENGE_NOT_AWAITING_RESULT'
  | 'SESSION_NOT_ENDED'
  | 'RESULT_ALREADY_RECORDED'
  | 'RESULT_NOT_RECORDED'
  | 'RESULT_APPEAL_WINDOW_CLOSED'
  | 'RESULT_APPEAL_NOT_DUE'
  | 'RESULT_APPEAL_ACTOR_NOT_ELIGIBLE'
  | 'RESULT_APPEAL_ALREADY_DECIDED'
  | 'RESULT_APPEAL_ALREADY_WAIVED'
  | 'RESULT_APPEAL_ALREADY_SUBMITTED'
  | 'APPEAL_NOT_SUBMITTED'
  | 'APPEAL_NOT_UNDER_REVIEW'
  | 'APPEAL_REVIEWER_CONFLICT'
  | 'APPEAL_REVIEWER_MISMATCH'
  | 'APPEAL_DECISION_INVALID'
  | 'APPEAL_RESPONSE_WINDOW_CLOSED'
  | 'APPEAL_RESPONSE_ACTOR_NOT_ELIGIBLE'
  | 'APPEAL_RESPONSE_ALREADY_SUBMITTED'
  | 'APPEAL_WITHDRAWAL_NOT_ALLOWED'
  | 'APPEAL_SLA_EXTENSION_NOT_ALLOWED'
  | 'APPEAL_SLA_ALREADY_EXTENDED'
  | 'MISSING_RESULT_REVIEW_NOT_OPEN'
  | 'MISSING_RESULT_REVIEW_NOT_UNDER_REVIEW'
  | 'MISSING_RESULT_REVIEWER_CONFLICT'
  | 'MISSING_RESULT_EVIDENCE_INCOMPLETE'
  | 'MISSING_RESULT_REVIEWER_COACH_CONFLICT'
  | 'MISSING_RESULT_OUTCOME_MISMATCH'
  | 'MISSING_RESULT_REPEAT_NOT_ALLOWED'
  | 'INTEGRITY_RESULT_NOT_FINAL'
  | 'INTEGRITY_CASE_ALREADY_OPEN'
  | 'INTEGRITY_CASE_NOT_OPEN'
  | 'INTEGRITY_CASE_NOT_UNDER_REVIEW'
  | 'INTEGRITY_REVIEWER_CONFLICT'
  | 'INTEGRITY_REVIEWER_MISMATCH'
  | 'INTEGRITY_DECISION_INVALID'
  | 'INTEGRITY_REPEAT_NOT_ALLOWED'
  | 'TECHNICAL_CORRECTION_RESULT_NOT_PROVISIONAL'
  | 'TECHNICAL_CORRECTION_ALREADY_OPEN'
  | 'TECHNICAL_CORRECTION_NO_CHANGE'
  | 'TECHNICAL_CORRECTION_CENTRAL_UNAVAILABLE'
  | 'TECHNICAL_CORRECTION_NOT_SUBMITTED'
  | 'TECHNICAL_CORRECTION_REVIEWER_CONFLICT'
  | 'TECHNICAL_CORRECTION_NOT_UNDER_REVIEW'
  | 'TECHNICAL_CORRECTION_REVIEWER_MISMATCH'
  | 'COMPETITION_INTEGRITY_HOLD'
  | 'COMPETITION_STATUS_SNAPSHOT_STALE'
  | 'COMPETITION_STATUS_LOCKED';

export class ResultConflictError extends Error {
  readonly code: ResultConflictCode;

  constructor(readonly reason: ResultConflictCode) {
    super(`Result action is not allowed: ${reason}`);
    this.name = 'ResultConflictError';
    this.code = reason;
  }
}

export class ResultPermissionDeniedError extends Error {
  readonly code = 'RESULT_PERMISSION_DENIED' as const;

  constructor() {
    super('Result action is outside the actor scope');
    this.name = 'ResultPermissionDeniedError';
  }
}

export class ResultValidationError extends Error {
  readonly code = 'RESULT_INPUT_INVALID' as const;

  constructor(readonly field: string) {
    super(`Result input is invalid: ${field}`);
    this.name = 'ResultValidationError';
  }
}

function validDate(value: Date, field: string): void {
  if (!Number.isFinite(value.getTime())) throw new ResultValidationError(field);
}

function plusHours(value: Date, hours: number): Date {
  validDate(value, 'recordedAt');
  return new Date(value.getTime() + hours * 60 * 60 * 1_000);
}

export function resultAppealDeadline(recordedAt: Date): Date {
  return plusHours(recordedAt, RESULT_APPEAL_HOURS);
}

export function appealResponseDeadline(submittedAt: Date): Date {
  return plusHours(submittedAt, APPEAL_RESPONSE_HOURS);
}

export function appealReviewSlaDeadline(submittedAt: Date): Date {
  return plusHours(submittedAt, APPEAL_REVIEW_SLA_HOURS);
}

function requiredText(value: string | null, field: string, maximum: number): string {
  const normalized = value?.trim() ?? '';
  if (normalized.length === 0 || normalized.length > maximum) {
    throw new ResultValidationError(field);
  }
  return normalized;
}

export interface NormalizedResultParticipants {
  readonly winnerUserId: string | null;
  readonly loserUserId: string | null;
  readonly decisive: boolean;
}

export function normalizeResultParticipants(input: {
  readonly outcomeCode: ResultOutcomeCode;
  readonly winnerUserId: string | null;
  readonly participantUserIds: readonly [string, string];
  readonly reasonCode: string | null;
  readonly comment: string | null;
}): NormalizedResultParticipants & {
  readonly reasonCode: string | null;
  readonly comment: string | null;
} {
  const [athleteA, athleteB] = input.participantUserIds;
  let winnerUserId: string | null = null;
  if (input.outcomeCode === 'WIN_A') winnerUserId = athleteA;
  if (input.outcomeCode === 'WIN_B') winnerUserId = athleteB;
  if (input.outcomeCode === 'FORFEIT' || input.outcomeCode === 'NO_SHOW') {
    if (!input.winnerUserId || !input.participantUserIds.includes(input.winnerUserId)) {
      throw new ResultValidationError('winnerUserId');
    }
    winnerUserId = input.winnerUserId;
  }
  if (
    (input.outcomeCode === 'WIN_A' || input.outcomeCode === 'WIN_B')
    && input.winnerUserId !== null
    && input.winnerUserId !== winnerUserId
  ) {
    throw new ResultValidationError('winnerUserId');
  }
  if (
    (input.outcomeCode === 'DRAW' || input.outcomeCode === 'NO_CONTEST')
    && input.winnerUserId !== null
  ) {
    throw new ResultValidationError('winnerUserId');
  }
  const requiresExplanation = ['FORFEIT', 'NO_SHOW', 'NO_CONTEST'].includes(
    input.outcomeCode,
  );
  const reasonCode = requiresExplanation
    ? requiredText(input.reasonCode, 'reasonCode', 80)
    : input.reasonCode === null
      ? null
      : requiredText(input.reasonCode, 'reasonCode', 80);
  const comment = requiresExplanation
    ? requiredText(input.comment, 'comment', 500)
    : input.comment === null
      ? null
      : requiredText(input.comment, 'comment', 500);
  const decisive = winnerUserId !== null;
  return {
    winnerUserId,
    loserUserId: winnerUserId === null ? null : winnerUserId === athleteA ? athleteB : athleteA,
    decisive,
    reasonCode,
    comment,
  };
}

export function normalizeTechnicalCorrectionRequest(input: {
  readonly resultState: ResultState;
  readonly existingOpenRequest: boolean;
  readonly originalOutcomeCode: ResultOutcomeCode;
  readonly originalWinnerUserId: string | null;
  readonly proposedOutcomeCode: ResultOutcomeCode;
  readonly proposedWinnerUserId: string | null;
  readonly participantUserIds: readonly [string, string];
  readonly category: TechnicalCorrectionCategory;
  readonly internalReason: string;
  readonly evidenceReference: string;
}): {
  readonly proposedOutcomeCode: ResultOutcomeCode;
  readonly proposedWinnerUserId: string | null;
  readonly category: TechnicalCorrectionCategory;
  readonly internalReason: string;
  readonly evidenceReference: string;
} {
  if (input.resultState !== 'RECORDED' && input.resultState !== 'UNDER_APPEAL') {
    throw new ResultConflictError('TECHNICAL_CORRECTION_RESULT_NOT_PROVISIONAL');
  }
  if (input.existingOpenRequest) {
    throw new ResultConflictError('TECHNICAL_CORRECTION_ALREADY_OPEN');
  }
  const normalized = normalizeResultParticipants({
    outcomeCode: input.proposedOutcomeCode,
    winnerUserId: input.proposedWinnerUserId,
    participantUserIds: input.participantUserIds,
    reasonCode: ['FORFEIT', 'NO_SHOW', 'NO_CONTEST'].includes(input.proposedOutcomeCode)
      ? input.category
      : null,
    comment: ['FORFEIT', 'NO_SHOW', 'NO_CONTEST'].includes(input.proposedOutcomeCode)
      ? input.internalReason
      : null,
  });
  if (
    input.originalOutcomeCode === input.proposedOutcomeCode
    && input.originalWinnerUserId === normalized.winnerUserId
  ) {
    throw new ResultConflictError('TECHNICAL_CORRECTION_NO_CHANGE');
  }
  return {
    proposedOutcomeCode: input.proposedOutcomeCode,
    proposedWinnerUserId: normalized.winnerUserId,
    category: input.category,
    internalReason: requiredText(input.internalReason, 'internalReason', 2000),
    evidenceReference: requiredText(input.evidenceReference, 'evidenceReference', 500),
  };
}

export function assertTechnicalCorrectionReviewCanStart(input: {
  readonly state: TechnicalCorrectionState;
  readonly reviewerUserId: string;
  readonly protectedUserIds: readonly string[];
}): void {
  if (input.state !== 'SUBMITTED') {
    throw new ResultConflictError('TECHNICAL_CORRECTION_NOT_SUBMITTED');
  }
  if (input.protectedUserIds.includes(input.reviewerUserId)) {
    throw new ResultConflictError('TECHNICAL_CORRECTION_REVIEWER_CONFLICT');
  }
}

export function normalizeTechnicalCorrectionRejection(input: {
  readonly state: TechnicalCorrectionState;
  readonly assignedReviewerUserId: string | null;
  readonly reviewerUserId: string;
  readonly reason: string;
}): string {
  if (input.state !== 'UNDER_REVIEW') {
    throw new ResultConflictError('TECHNICAL_CORRECTION_NOT_UNDER_REVIEW');
  }
  if (input.assignedReviewerUserId !== input.reviewerUserId) {
    throw new ResultConflictError('TECHNICAL_CORRECTION_REVIEWER_MISMATCH');
  }
  return requiredText(input.reason, 'decisionReason', 2000);
}

export function assertResultMatchesAttendance(input: {
  readonly outcomeCode: ResultOutcomeCode;
  readonly winnerUserId: string | null;
  readonly participantUserIds: readonly [string, string];
  readonly noShowUserIds: readonly string[];
}): void {
  if (input.noShowUserIds.length === 2 && input.outcomeCode !== 'NO_CONTEST') {
    throw new ResultValidationError('outcomeCode');
  }
  if (input.noShowUserIds.length === 1) {
    const absent = input.noShowUserIds[0]!;
    const expectedWinner = input.participantUserIds.find((userId) => userId !== absent)!;
    if (input.outcomeCode !== 'NO_SHOW' || input.winnerUserId !== expectedWinner) {
      throw new ResultValidationError('outcomeCode');
    }
  }
  if (input.noShowUserIds.length === 0 && input.outcomeCode === 'NO_SHOW') {
    throw new ResultValidationError('outcomeCode');
  }
}

export interface CompetitionStatusSnapshot {
  readonly championUserId: string | null;
  readonly contenderUserId: string | null;
  readonly statusVersion: number;
}

export interface ProvisionalStatusTransition {
  readonly type: StatusTransitionType;
  readonly eventName: string | null;
  readonly transitionId: string | null;
  readonly before: CompetitionStatusSnapshot;
  readonly after: CompetitionStatusSnapshot;
  readonly locksStatus: boolean;
}

export function deriveProvisionalStatusTransition(input: {
  readonly stake: ChallengeStake;
  readonly outcomeCode: ResultOutcomeCode;
  readonly winnerUserId: string | null;
  readonly loserUserId: string | null;
  readonly snapshot: CompetitionStatusSnapshot;
}): ProvisionalStatusTransition {
  const unchanged = (type: StatusTransitionType = 'NONE'): ProvisionalStatusTransition => {
    const locksStatus = type !== 'NONE';
    return {
      type,
      eventName:
        type === 'CONTENDER_DEFENDED'
          ? 'ContenderDefended'
          : type === 'TITLE_DEFENDED'
            ? 'TitleDefended'
            : null,
      transitionId:
        type === 'CONTENDER_DEFENDED' ? 'ST-06' : type === 'TITLE_DEFENDED' ? 'ST-08' : null,
      before: input.snapshot,
      after: locksStatus
        ? { ...input.snapshot, statusVersion: input.snapshot.statusVersion + 1 }
        : input.snapshot,
      locksStatus,
    };
  };
  if (!input.winnerUserId || !input.loserUserId) return unchanged();
  const nextVersion = input.snapshot.statusVersion + 1;
  if (input.stake === 'NONE') return unchanged();
  if (input.stake === 'CONTENDER') {
    if (input.winnerUserId === input.snapshot.contenderUserId) {
      return unchanged('CONTENDER_DEFENDED');
    }
    return {
      type: 'CONTENDER_TRANSFERRED',
      eventName: 'ContenderTransferred',
      transitionId: 'ST-05',
      before: input.snapshot,
      after: { ...input.snapshot, contenderUserId: input.winnerUserId, statusVersion: nextVersion },
      locksStatus: true,
    };
  }
  if (input.stake === 'TITLE') {
    if (input.winnerUserId === input.snapshot.championUserId) {
      return unchanged('TITLE_DEFENDED');
    }
    return {
      type: 'TITLE_TRANSFERRED',
      eventName: 'TitleTransferred',
      transitionId: 'ST-07',
      before: input.snapshot,
      after: {
        championUserId: input.winnerUserId,
        contenderUserId: input.loserUserId,
        statusVersion: nextVersion,
      },
      locksStatus: true,
    };
  }
  if (input.stake === 'GENESIS_CHAMPION') {
    const vacancy = input.outcomeCode === 'FORFEIT' || input.outcomeCode === 'NO_SHOW';
    return {
      type: vacancy ? 'GENESIS_APPLIED_WITH_VACANCY' : 'GENESIS_APPLIED',
      eventName: vacancy ? 'GenesisStatusAppliedWithVacancy' : 'GenesisStatusApplied',
      transitionId: vacancy ? 'ST-02' : 'ST-01',
      before: input.snapshot,
      after: {
        championUserId: input.winnerUserId,
        contenderUserId: vacancy ? null : input.loserUserId,
        statusVersion: nextVersion,
      },
      locksStatus: true,
    };
  }
  return {
    type: 'CONTENDER_ASSIGNED',
    eventName: 'ContenderAssigned',
    transitionId: 'ST-04',
    before: input.snapshot,
    after: { ...input.snapshot, contenderUserId: input.winnerUserId, statusVersion: nextVersion },
    locksStatus: true,
  };
}

export function eligibleAppealUserIds(input: {
  readonly outcomeCode: ResultOutcomeCode;
  readonly loserUserId: string | null;
  readonly participantUserIds: readonly [string, string];
}): readonly string[] {
  return input.loserUserId ? [input.loserUserId] : [...input.participantUserIds];
}

export function assertAppealActionCanBeTaken(input: {
  readonly state: ResultState;
  readonly actorUserId: string;
  readonly eligibleUserIds: readonly string[];
  readonly appealDeadlineAt: Date;
  readonly occurredAt: Date;
  readonly alreadyWaived: boolean;
  readonly alreadySubmitted: boolean;
}): void {
  if (input.alreadyWaived) throw new ResultConflictError('RESULT_APPEAL_ALREADY_WAIVED');
  if (input.alreadySubmitted) {
    throw new ResultConflictError('RESULT_APPEAL_ALREADY_SUBMITTED');
  }
  if (input.state !== 'RECORDED') throw new ResultConflictError('RESULT_NOT_RECORDED');
  if (input.occurredAt >= input.appealDeadlineAt) {
    throw new ResultConflictError('RESULT_APPEAL_WINDOW_CLOSED');
  }
  if (!input.eligibleUserIds.includes(input.actorUserId)) {
    throw new ResultConflictError('RESULT_APPEAL_ACTOR_NOT_ELIGIBLE');
  }
}

export function resultCanFinalize(input: {
  readonly state: ResultState;
  readonly appealDeadlineAt: Date;
  readonly occurredAt: Date;
  readonly eligibleUserIds: readonly string[];
  readonly waivedOrWithdrawnUserIds: readonly string[];
}): boolean {
  if (input.state !== 'RECORDED') return false;
  if (input.occurredAt >= input.appealDeadlineAt) return true;
  const satisfied = new Set(input.waivedOrWithdrawnUserIds);
  return input.eligibleUserIds.every((userId) => satisfied.has(userId));
}

export function assertResultCanFinalize(input: Parameters<typeof resultCanFinalize>[0]): void {
  if (input.state !== 'RECORDED') throw new ResultConflictError('RESULT_NOT_RECORDED');
  if (!resultCanFinalize(input)) throw new ResultConflictError('RESULT_APPEAL_NOT_DUE');
}

export function assertAppealReviewCanStart(input: {
  readonly state: AppealState;
  readonly reviewerUserId: string;
  readonly protectedUserIds: readonly string[];
}): void {
  if (input.state !== 'SUBMITTED') throw new ResultConflictError('APPEAL_NOT_SUBMITTED');
  if (input.protectedUserIds.includes(input.reviewerUserId)) {
    throw new ResultConflictError('APPEAL_REVIEWER_CONFLICT');
  }
}

export function normalizeAppealResponse(input: {
  readonly state: AppealState;
  readonly responderUserId: string;
  readonly appellantUserId: string;
  readonly participantUserIds: readonly [string, string];
  readonly coachUserId: string | null;
  readonly responseDeadlineAt: Date;
  readonly occurredAt: Date;
  readonly alreadyResponded: boolean;
  readonly statement: string;
}): { readonly role: AppealResponseRole; readonly statement: string } {
  if (input.state !== 'SUBMITTED' && input.state !== 'UNDER_REVIEW') {
    throw new ResultConflictError('APPEAL_RESPONSE_WINDOW_CLOSED');
  }
  if (input.occurredAt >= input.responseDeadlineAt) {
    throw new ResultConflictError('APPEAL_RESPONSE_WINDOW_CLOSED');
  }
  if (input.alreadyResponded) {
    throw new ResultConflictError('APPEAL_RESPONSE_ALREADY_SUBMITTED');
  }
  const isCoach = input.coachUserId === input.responderUserId;
  const isOpponent = input.participantUserIds.includes(input.responderUserId)
    && input.appellantUserId !== input.responderUserId;
  if (!isCoach && !isOpponent) {
    throw new ResultConflictError('APPEAL_RESPONSE_ACTOR_NOT_ELIGIBLE');
  }
  return {
    role: isCoach ? 'COACH' : 'OPPONENT',
    statement: requiredText(input.statement, 'statement', 2000),
  };
}

export function assertAppealCanBeWithdrawn(input: {
  readonly state: AppealState;
  readonly actorUserId: string;
  readonly appellantUserId: string;
}): void {
  if (
    (input.state !== 'SUBMITTED' && input.state !== 'UNDER_REVIEW')
    || input.actorUserId !== input.appellantUserId
  ) {
    throw new ResultConflictError('APPEAL_WITHDRAWAL_NOT_ALLOWED');
  }
}

export function normalizeAppealSlaExtension(input: {
  readonly state: AppealState;
  readonly assignedReviewerUserId: string | null;
  readonly reviewerUserId: string;
  readonly alreadyExtended: boolean;
  readonly currentDueAt: Date;
  readonly durationHours: number;
  readonly reason: string;
}): {
  readonly durationHours: AppealSlaExtensionHours;
  readonly reason: string;
  readonly extendedDueAt: Date;
} {
  if (
    input.state !== 'UNDER_REVIEW'
    || input.assignedReviewerUserId !== input.reviewerUserId
  ) {
    throw new ResultConflictError('APPEAL_SLA_EXTENSION_NOT_ALLOWED');
  }
  if (input.alreadyExtended) {
    throw new ResultConflictError('APPEAL_SLA_ALREADY_EXTENDED');
  }
  if (input.durationHours !== 24 && input.durationHours !== 48) {
    throw new ResultValidationError('durationHours');
  }
  return {
    durationHours: input.durationHours,
    reason: requiredText(input.reason, 'reason', 2000),
    extendedDueAt: plusHours(input.currentDueAt, input.durationHours),
  };
}

export interface NormalizedAppealDecision {
  readonly decision: AppealDecision;
  readonly reason: string;
  readonly resultState: Extract<ResultState, 'FINAL' | 'REVERSED' | 'ANNULLED' | 'REPEAT_ORDERED'>;
  readonly appealState: Extract<
    AppealState,
    'DECIDED_UPHELD' | 'DECIDED_REVERSED' | 'DECIDED_ANNULLED' | 'DECIDED_REPEAT'
  >;
  readonly effectiveOutcomeCode: ResultOutcomeCode;
  readonly effectiveWinnerUserId: string | null;
  readonly effectiveLoserUserId: string | null;
  readonly compensationMode:
    | 'FINALIZE_ORIGINAL'
    | 'REAPPLY_CORRECTED'
    | 'RESTORE_PRE_RESULT'
    | 'RESTORE_AND_REPEAT';
}

function reverseOutcomeCode(
  originalOutcomeCode: ResultOutcomeCode,
  originalWinnerUserId: string,
  participantUserIds: readonly [string, string],
): ResultOutcomeCode {
  if (originalOutcomeCode === 'WIN_A' || originalOutcomeCode === 'WIN_B') {
    const correctedWinnerUserId = participantUserIds.find((id) => id !== originalWinnerUserId)!;
    return correctedWinnerUserId === participantUserIds[0] ? 'WIN_A' : 'WIN_B';
  }
  return originalOutcomeCode;
}

export function normalizeAppealDecision(input: {
  readonly state: AppealState;
  readonly assignedReviewerUserId: string | null;
  readonly reviewerUserId: string;
  readonly decision: AppealDecision;
  readonly reason: string;
  readonly originalOutcomeCode: ResultOutcomeCode;
  readonly originalWinnerUserId: string | null;
  readonly originalLoserUserId: string | null;
  readonly participantUserIds: readonly [string, string];
}): NormalizedAppealDecision {
  if (input.state !== 'UNDER_REVIEW') {
    throw new ResultConflictError('APPEAL_NOT_UNDER_REVIEW');
  }
  if (input.assignedReviewerUserId !== input.reviewerUserId) {
    throw new ResultConflictError('APPEAL_REVIEWER_MISMATCH');
  }
  const reason = requiredText(input.reason, 'decisionReason', 2000);
  if (input.decision === 'UPHOLD') {
    return {
      decision: input.decision,
      reason,
      resultState: 'FINAL',
      appealState: 'DECIDED_UPHELD',
      effectiveOutcomeCode: input.originalOutcomeCode,
      effectiveWinnerUserId: input.originalWinnerUserId,
      effectiveLoserUserId: input.originalLoserUserId,
      compensationMode: 'FINALIZE_ORIGINAL',
    };
  }
  if (input.decision === 'REVERSE') {
    if (!input.originalWinnerUserId || !input.originalLoserUserId) {
      throw new ResultConflictError('APPEAL_DECISION_INVALID');
    }
    return {
      decision: input.decision,
      reason,
      resultState: 'REVERSED',
      appealState: 'DECIDED_REVERSED',
      effectiveOutcomeCode: reverseOutcomeCode(
        input.originalOutcomeCode,
        input.originalWinnerUserId,
        input.participantUserIds,
      ),
      effectiveWinnerUserId: input.originalLoserUserId,
      effectiveLoserUserId: input.originalWinnerUserId,
      compensationMode: 'REAPPLY_CORRECTED',
    };
  }
  return {
    decision: input.decision,
    reason,
    resultState: input.decision === 'ANNUL' ? 'ANNULLED' : 'REPEAT_ORDERED',
    appealState: input.decision === 'ANNUL' ? 'DECIDED_ANNULLED' : 'DECIDED_REPEAT',
    effectiveOutcomeCode: input.originalOutcomeCode,
    effectiveWinnerUserId: null,
    effectiveLoserUserId: null,
    compensationMode: input.decision === 'ANNUL' ? 'RESTORE_PRE_RESULT' : 'RESTORE_AND_REPEAT',
  };
}
