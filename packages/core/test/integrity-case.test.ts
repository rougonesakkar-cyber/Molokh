import { describe, expect, it } from 'vitest';

import {
  ResultConflictError,
  assertIntegrityReviewCanStart,
  normalizeIntegrityCaseOpening,
  normalizeIntegrityDecision,
} from '../src/index.js';

describe('Final Result IntegrityCase policy', () => {
  it('[AC-211] opens only for a Final Result and keeps the reviewer independent', () => {
    expect(normalizeIntegrityCaseOpening({
      resultState: 'FINAL', existingOpenCase: false, category: 'SYSTEM_ERROR',
      evidenceReference: 'incident:clock-drift-17', internalReason: 'Confirmed timestamp defect.',
    })).toEqual({
      evidenceReference: 'incident:clock-drift-17', internalReason: 'Confirmed timestamp defect.',
    });
    expect(() => normalizeIntegrityCaseOpening({
      resultState: 'RECORDED', existingOpenCase: false, category: 'SYSTEM_ERROR',
      evidenceReference: 'incident:17', internalReason: 'Defect.',
    })).toThrowError(expect.objectContaining<Partial<ResultConflictError>>({
      code: 'INTEGRITY_RESULT_NOT_FINAL',
    }));
    expect(() => assertIntegrityReviewCanStart({
      state: 'OPEN', reviewerUserId: 'coach', protectedUserIds: ['athlete-a', 'coach'],
    })).toThrowError(expect.objectContaining<Partial<ResultConflictError>>({
      code: 'INTEGRITY_REVIEWER_CONFLICT',
    }));
  });

  it('[AC-212] normalizes correction and safely degrades an ineligible repeat to annul', () => {
    expect(normalizeIntegrityDecision({
      state: 'UNDER_REVIEW', assignedReviewerUserId: 'central', reviewerUserId: 'central',
      disposition: 'CORRECT', correctedOutcomeCode: 'WIN_B', reason: 'System mapping error.',
      participantUserIds: ['athlete-a', 'athlete-b'], repeatAllowed: true,
    })).toMatchObject({
      terminalState: 'DECIDED_CORRECTED', effectiveDisposition: 'CORRECT',
      effectiveOutcomeCode: 'WIN_B', effectiveWinnerUserId: 'athlete-b',
      effectiveLoserUserId: 'athlete-a',
    });
    expect(normalizeIntegrityDecision({
      state: 'UNDER_REVIEW', assignedReviewerUserId: 'central', reviewerUserId: 'central',
      disposition: 'REPEAT', correctedOutcomeCode: null, reason: 'A repeat is no longer eligible.',
      participantUserIds: ['athlete-a', 'athlete-b'], repeatAllowed: false,
    })).toMatchObject({
      terminalState: 'DECIDED_ANNULLED', disposition: 'REPEAT', effectiveDisposition: 'ANNUL',
    });
  });
});
