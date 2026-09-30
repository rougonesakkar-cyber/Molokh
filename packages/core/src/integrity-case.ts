import {
  ResultConflictError,
  ResultValidationError,
  type ResultOutcomeCode,
  type ResultState,
} from './result.js';

export const INTEGRITY_POLICY_VERSION = 'integrity-mvp-v1' as const;
export const INTEGRITY_REVIEW_SLA_HOURS = 72;

export type IntegrityCategory = 'FRAUD' | 'SYSTEM_ERROR' | 'IDENTITY_ERROR';
export type IntegrityCaseState =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'DECIDED_UPHELD'
  | 'DECIDED_CORRECTED'
  | 'DECIDED_ANNULLED';
export type IntegrityDisposition = 'UPHOLD' | 'CORRECT' | 'ANNUL' | 'REPEAT';

function requiredText(value: string, field: string, maximum: number): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum) {
    throw new ResultValidationError(field);
  }
  return normalized;
}

export function integrityReviewSlaDeadline(openedAt: Date): Date {
  if (!Number.isFinite(openedAt.getTime())) throw new ResultValidationError('openedAt');
  return new Date(openedAt.getTime() + INTEGRITY_REVIEW_SLA_HOURS * 60 * 60 * 1_000);
}

export function normalizeIntegrityCaseOpening(input: {
  readonly resultState: ResultState;
  readonly existingOpenCase: boolean;
  readonly category: IntegrityCategory;
  readonly evidenceReference: string;
  readonly internalReason: string;
}): { readonly evidenceReference: string; readonly internalReason: string } {
  if (input.resultState !== 'FINAL') {
    throw new ResultConflictError('INTEGRITY_RESULT_NOT_FINAL');
  }
  if (input.existingOpenCase) {
    throw new ResultConflictError('INTEGRITY_CASE_ALREADY_OPEN');
  }
  return {
    evidenceReference: requiredText(input.evidenceReference, 'evidenceReference', 500),
    internalReason: requiredText(input.internalReason, 'internalReason', 2000),
  };
}

export function assertIntegrityReviewCanStart(input: {
  readonly state: IntegrityCaseState;
  readonly reviewerUserId: string;
  readonly protectedUserIds: readonly string[];
}): void {
  if (input.state !== 'OPEN') throw new ResultConflictError('INTEGRITY_CASE_NOT_OPEN');
  if (input.protectedUserIds.includes(input.reviewerUserId)) {
    throw new ResultConflictError('INTEGRITY_REVIEWER_CONFLICT');
  }
}

export function normalizeIntegrityDecision(input: {
  readonly state: IntegrityCaseState;
  readonly assignedReviewerUserId: string | null;
  readonly reviewerUserId: string;
  readonly disposition: IntegrityDisposition;
  readonly reason: string;
  readonly correctedOutcomeCode: ResultOutcomeCode | null;
  readonly participantUserIds: readonly [string, string];
  readonly repeatAllowed: boolean;
}): {
  readonly disposition: IntegrityDisposition;
  readonly terminalState: Extract<
    IntegrityCaseState,
    'DECIDED_UPHELD' | 'DECIDED_CORRECTED' | 'DECIDED_ANNULLED'
  >;
  readonly effectiveDisposition: IntegrityDisposition;
  readonly effectiveOutcomeCode: ResultOutcomeCode | null;
  readonly effectiveWinnerUserId: string | null;
  readonly effectiveLoserUserId: string | null;
  readonly reason: string;
} {
  if (input.state !== 'UNDER_REVIEW') {
    throw new ResultConflictError('INTEGRITY_CASE_NOT_UNDER_REVIEW');
  }
  if (input.assignedReviewerUserId !== input.reviewerUserId) {
    throw new ResultConflictError('INTEGRITY_REVIEWER_MISMATCH');
  }
  const reason = requiredText(input.reason, 'reason', 2000);
  const effectiveDisposition = input.disposition === 'REPEAT' && !input.repeatAllowed
    ? 'ANNUL'
    : input.disposition;
  if (input.disposition === 'CORRECT' && input.correctedOutcomeCode === null) {
    throw new ResultConflictError('INTEGRITY_DECISION_INVALID');
  }
  if (input.disposition !== 'CORRECT' && input.correctedOutcomeCode !== null) {
    throw new ResultConflictError('INTEGRITY_DECISION_INVALID');
  }
  const outcome = effectiveDisposition === 'CORRECT' ? input.correctedOutcomeCode : null;
  const winner = outcome === 'WIN_A'
    ? input.participantUserIds[0]
    : outcome === 'WIN_B'
      ? input.participantUserIds[1]
      : null;
  const loser = winner === null
    ? null
    : winner === input.participantUserIds[0]
      ? input.participantUserIds[1]
      : input.participantUserIds[0];
  return {
    disposition: input.disposition,
    terminalState: effectiveDisposition === 'UPHOLD'
      ? 'DECIDED_UPHELD'
      : effectiveDisposition === 'CORRECT'
        ? 'DECIDED_CORRECTED'
        : 'DECIDED_ANNULLED',
    effectiveDisposition,
    effectiveOutcomeCode: outcome,
    effectiveWinnerUserId: winner,
    effectiveLoserUserId: loser,
    reason,
  };
}
