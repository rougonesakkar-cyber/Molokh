import {
  ResultConflictError,
  ResultValidationError,
  type ResultOutcomeCode,
} from './result.js';

export type MissingResultReviewState =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'REVIEWER_ASSIGNED'
  | 'RESOLVED'
  | 'REPEAT_ORDERED';

export type MissingResultClaimOutcome = Extract<
  ResultOutcomeCode,
  'WIN_A' | 'WIN_B' | 'DRAW' | 'NO_CONTEST'
>;

export interface NormalizedMissingResultClaim {
  readonly outcomeCode: MissingResultClaimOutcome;
  readonly winnerUserId: string | null;
  readonly statement: string;
}

function requiredText(value: string, field: string, maximum: number): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum) {
    throw new ResultValidationError(field);
  }
  return normalized;
}

export function normalizeMissingResultClaim(input: {
  readonly outcomeCode: MissingResultClaimOutcome;
  readonly participantUserIds: readonly [string, string];
  readonly statement: string;
}): NormalizedMissingResultClaim {
  return {
    outcomeCode: input.outcomeCode,
    winnerUserId: input.outcomeCode === 'WIN_A'
      ? input.participantUserIds[0]
      : input.outcomeCode === 'WIN_B'
        ? input.participantUserIds[1]
        : null,
    statement: requiredText(input.statement, 'statement', 2000),
  };
}

export function matchingMissingResultClaim(
  claims: readonly NormalizedMissingResultClaim[],
): NormalizedMissingResultClaim | null {
  if (claims.length !== 2) return null;
  const [first, second] = claims;
  if (!first || !second) return null;
  return first.outcomeCode === second.outcomeCode
    && first.winnerUserId === second.winnerUserId
    ? first
    : null;
}

export function assertMissingResultReviewCanStart(input: {
  readonly state: MissingResultReviewState;
  readonly reviewerUserId: string;
  readonly protectedUserIds: readonly string[];
}): void {
  if (input.state !== 'OPEN') {
    throw new ResultConflictError('MISSING_RESULT_REVIEW_NOT_OPEN');
  }
  if (input.protectedUserIds.includes(input.reviewerUserId)) {
    throw new ResultConflictError('MISSING_RESULT_REVIEWER_CONFLICT');
  }
}

export function normalizeMissingResultCoachAssignment(input: {
  readonly state: MissingResultReviewState;
  readonly assignedCentralUserId: string | null;
  readonly centralUserId: string;
  readonly reviewerCoachUserId: string;
  readonly protectedUserIds: readonly string[];
  readonly reviewerCoachAuthorized: boolean;
  readonly matchingClaim: NormalizedMissingResultClaim | null;
  readonly venueAttendanceConfirmed: boolean;
  readonly repeatObjectivelyImpossible: boolean;
  readonly reason: string;
}): {
  readonly allowedOutcomeCode: MissingResultClaimOutcome;
  readonly allowedWinnerUserId: string | null;
  readonly reason: string;
} {
  if (
    input.state !== 'UNDER_REVIEW'
    || input.assignedCentralUserId !== input.centralUserId
  ) throw new ResultConflictError('MISSING_RESULT_REVIEW_NOT_UNDER_REVIEW');
  if (
    !input.reviewerCoachAuthorized
    || input.protectedUserIds.includes(input.reviewerCoachUserId)
  ) throw new ResultConflictError('MISSING_RESULT_REVIEWER_COACH_CONFLICT');

  const reason = requiredText(input.reason, 'reason', 2000);
  if (input.matchingClaim && input.venueAttendanceConfirmed) {
    return {
      allowedOutcomeCode: input.matchingClaim.outcomeCode,
      allowedWinnerUserId: input.matchingClaim.winnerUserId,
      reason,
    };
  }
  if (!input.repeatObjectivelyImpossible) {
    throw new ResultConflictError('MISSING_RESULT_EVIDENCE_INCOMPLETE');
  }
  return { allowedOutcomeCode: 'NO_CONTEST', allowedWinnerUserId: null, reason };
}

export function assertMissingResultRepeatCanBeOrdered(input: {
  readonly state: MissingResultReviewState;
  readonly assignedCentralUserId: string | null;
  readonly centralUserId: string;
  readonly matchingClaim: NormalizedMissingResultClaim | null;
  readonly venueAttendanceConfirmed: boolean;
  readonly repeatObjectivelyPossible: boolean;
}): void {
  if (
    input.state !== 'UNDER_REVIEW'
    || input.assignedCentralUserId !== input.centralUserId
  ) throw new ResultConflictError('MISSING_RESULT_REVIEW_NOT_UNDER_REVIEW');
  if (!input.repeatObjectivelyPossible) {
    throw new ResultConflictError('MISSING_RESULT_REPEAT_NOT_ALLOWED');
  }
  if (input.matchingClaim && input.venueAttendanceConfirmed) {
    throw new ResultConflictError('MISSING_RESULT_REPEAT_NOT_ALLOWED');
  }
}

export function assertReviewedResultMatchesAssignment(input: {
  readonly state: MissingResultReviewState;
  readonly assignedReviewerCoachUserId: string | null;
  readonly actorUserId: string;
  readonly allowedOutcomeCode: MissingResultClaimOutcome | null;
  readonly allowedWinnerUserId: string | null;
  readonly outcomeCode: ResultOutcomeCode;
  readonly winnerUserId: string | null;
}): void {
  if (
    input.state !== 'REVIEWER_ASSIGNED'
    || input.assignedReviewerCoachUserId !== input.actorUserId
  ) throw new ResultConflictError('MISSING_RESULT_REVIEWER_COACH_CONFLICT');
  if (
    input.allowedOutcomeCode !== input.outcomeCode
    || input.allowedWinnerUserId !== input.winnerUserId
  ) throw new ResultConflictError('MISSING_RESULT_OUTCOME_MISMATCH');
}
