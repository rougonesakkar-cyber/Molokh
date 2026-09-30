import { describe, expect, it } from 'vitest';

import {
  ResultConflictError,
  ResultValidationError,
  assertAppealActionCanBeTaken,
  assertAppealCanBeWithdrawn,
  assertAppealReviewCanStart,
  assertResultMatchesAttendance,
  assertResultCanFinalize,
  deriveProvisionalStatusTransition,
  normalizeResultParticipants,
  normalizeAppealDecision,
  normalizeAppealResponse,
  normalizeAppealSlaExtension,
  resultAppealDeadline,
} from '../src/index.js';

const participants = ['athlete-a', 'athlete-b'] as const;

describe('Result and provisional status policy', () => {
  it('[AC-076] normalizes a decisive result and opens exactly 48 hours of Appeal', () => {
    expect(normalizeResultParticipants({
      outcomeCode: 'WIN_A', winnerUserId: null, participantUserIds: participants,
      reasonCode: null, comment: null,
    })).toMatchObject({ winnerUserId: 'athlete-a', loserUserId: 'athlete-b', decisive: true });
    expect(resultAppealDeadline(new Date('2026-09-09T10:00:00.000Z')).toISOString())
      .toBe('2026-09-11T10:00:00.000Z');
  });

  it('requires a winner and explanation for NO_SHOW or FORFEIT', () => {
    expect(() => normalizeResultParticipants({
      outcomeCode: 'NO_SHOW', winnerUserId: null, participantUserIds: participants,
      reasonCode: 'ABSENT', comment: 'Неявка подтверждена Coach',
    })).toThrowError(new ResultValidationError('winnerUserId'));
    expect(() => normalizeResultParticipants({
      outcomeCode: 'FORFEIT', winnerUserId: 'athlete-a', participantUserIds: participants,
      reasonCode: null, comment: null,
    })).toThrowError(new ResultValidationError('reasonCode'));
    expect(() => normalizeResultParticipants({
      outcomeCode: 'WIN_A', winnerUserId: null, participantUserIds: participants,
      reasonCode: 'x'.repeat(81), comment: null,
    })).toThrowError(new ResultValidationError('reasonCode'));
  });

  it('[AC-080] transfers Contender provisionally only from the frozen snapshot', () => {
    expect(deriveProvisionalStatusTransition({
      stake: 'CONTENDER', outcomeCode: 'WIN_B', winnerUserId: 'athlete-b',
      loserUserId: 'athlete-a',
      snapshot: { championUserId: 'champion', contenderUserId: 'athlete-a', statusVersion: 7 },
    })).toMatchObject({
      type: 'CONTENDER_TRANSFERRED', transitionId: 'ST-05', locksStatus: true,
      after: { championUserId: 'champion', contenderUserId: 'athlete-b', statusVersion: 8 },
    });
  });

  it('[AC-081] keeps a defending Contender in place while versioning the provisional defense', () => {
    expect(deriveProvisionalStatusTransition({
      stake: 'CONTENDER', outcomeCode: 'WIN_A', winnerUserId: 'athlete-a',
      loserUserId: 'athlete-b',
      snapshot: { championUserId: 'champion', contenderUserId: 'athlete-a', statusVersion: 7 },
    })).toMatchObject({
      type: 'CONTENDER_DEFENDED', transitionId: 'ST-06', locksStatus: true,
      after: { championUserId: 'champion', contenderUserId: 'athlete-a', statusVersion: 8 },
    });
  });

  it('[AC-082][AC-083][AC-084] swaps TITLE roles, records a defense and isolates OPEN', () => {
    const snapshot = { championUserId: 'athlete-a', contenderUserId: 'athlete-b', statusVersion: 3 };
    expect(deriveProvisionalStatusTransition({
      stake: 'TITLE', outcomeCode: 'WIN_B', winnerUserId: 'athlete-b', loserUserId: 'athlete-a', snapshot,
    })).toMatchObject({ type: 'TITLE_TRANSFERRED', after: { championUserId: 'athlete-b', contenderUserId: 'athlete-a' } });
    expect(deriveProvisionalStatusTransition({
      stake: 'TITLE', outcomeCode: 'WIN_A', winnerUserId: 'athlete-a', loserUserId: 'athlete-b', snapshot,
    })).toMatchObject({ type: 'TITLE_DEFENDED', after: { ...snapshot, statusVersion: 4 } });
    expect(deriveProvisionalStatusTransition({
      stake: 'NONE', outcomeCode: 'WIN_B', winnerUserId: 'athlete-b', loserUserId: 'athlete-a', snapshot,
    })).toMatchObject({ type: 'NONE', locksStatus: false, after: snapshot });
  });

  it('[AC-085][AC-086] keeps DRAW and NO_CONTEST outside status changes', () => {
    const snapshot = { championUserId: 'athlete-a', contenderUserId: 'athlete-b', statusVersion: 3 };
    for (const outcomeCode of ['DRAW', 'NO_CONTEST'] as const) {
      expect(deriveProvisionalStatusTransition({
        stake: 'TITLE', outcomeCode, winnerUserId: null, loserUserId: null, snapshot,
      })).toMatchObject({ type: 'NONE', locksStatus: false, after: snapshot });
    }
  });

  it('[AC-087] permits two recorded NO_SHOW facts only as explained NO_CONTEST', () => {
    expect(() => assertResultMatchesAttendance({
      outcomeCode: 'NO_CONTEST', winnerUserId: null,
      participantUserIds: participants, noShowUserIds: [...participants],
    })).not.toThrow();
    expect(() => assertResultMatchesAttendance({
      outcomeCode: 'WIN_A', winnerUserId: 'athlete-a',
      participantUserIds: participants, noShowUserIds: [...participants],
    })).toThrowError(new ResultValidationError('outcomeCode'));
  });

  it('[AC-088][AC-089] finalizes at 48h or when every eligible Athlete waived', () => {
    const base = {
      state: 'RECORDED' as const,
      appealDeadlineAt: new Date('2026-09-11T10:00:00.000Z'),
      eligibleUserIds: ['loser'],
      waivedOrWithdrawnUserIds: [] as readonly string[],
    };
    expect(() => assertResultCanFinalize({
      ...base, occurredAt: new Date('2026-09-11T10:00:00.000Z'),
    })).not.toThrow();
    expect(() => assertResultCanFinalize({
      ...base, occurredAt: new Date('2026-09-10T10:00:00.000Z'),
      waivedOrWithdrawnUserIds: ['loser'],
    })).not.toThrow();
    expect(() => assertResultCanFinalize({
      ...base, occurredAt: new Date('2026-09-10T10:00:00.000Z'),
    })).toThrowError(new ResultConflictError('RESULT_APPEAL_NOT_DUE'));
  });

  it('allows only an eligible non-waived Athlete to use the open Appeal window', () => {
    const base = {
      state: 'RECORDED' as const,
      actorUserId: 'loser', eligibleUserIds: ['loser'],
      appealDeadlineAt: new Date('2026-09-11T10:00:00.000Z'),
      occurredAt: new Date('2026-09-10T10:00:00.000Z'),
      alreadyWaived: false, alreadySubmitted: false,
    };
    expect(() => assertAppealActionCanBeTaken(base)).not.toThrow();
    expect(() => assertAppealActionCanBeTaken({ ...base, actorUserId: 'winner' }))
      .toThrowError(new ResultConflictError('RESULT_APPEAL_ACTOR_NOT_ELIGIBLE'));
    expect(() => assertAppealActionCanBeTaken({
      ...base, state: 'UNDER_APPEAL', alreadySubmitted: true,
    })).toThrowError(new ResultConflictError('RESULT_APPEAL_ALREADY_SUBMITTED'));
  });

  it('[AC-114][AC-117] starts review without waiting for responses and upholds the immutable outcome', () => {
    expect(() => assertAppealReviewCanStart({
      state: 'SUBMITTED', reviewerUserId: 'central',
      protectedUserIds: ['athlete-a', 'athlete-b', 'coach'],
    })).not.toThrow();
    expect(() => assertAppealReviewCanStart({
      state: 'SUBMITTED', reviewerUserId: 'coach',
      protectedUserIds: ['athlete-a', 'athlete-b', 'coach'],
    })).toThrowError(new ResultConflictError('APPEAL_REVIEWER_CONFLICT'));
    expect(normalizeAppealDecision({
      state: 'UNDER_REVIEW', assignedReviewerUserId: 'central', reviewerUserId: 'central',
      decision: 'UPHOLD', reason: 'Результат подтверждён.', originalOutcomeCode: 'WIN_A',
      originalWinnerUserId: 'athlete-a', originalLoserUserId: 'athlete-b',
      participantUserIds: participants,
    })).toMatchObject({
      resultState: 'FINAL', appealState: 'DECIDED_UPHELD',
      effectiveOutcomeCode: 'WIN_A', effectiveWinnerUserId: 'athlete-a',
      compensationMode: 'FINALIZE_ORIGINAL',
    });
  });

  it('[AC-118][AC-119][AC-120] derives transparent reverse, annul and repeat decisions', () => {
    const base = {
      state: 'UNDER_REVIEW' as const,
      assignedReviewerUserId: 'central', reviewerUserId: 'central',
      reason: 'Проверены сведения участников и Coach.', originalOutcomeCode: 'WIN_A' as const,
      originalWinnerUserId: 'athlete-a', originalLoserUserId: 'athlete-b',
      participantUserIds: participants,
    };
    expect(normalizeAppealDecision({ ...base, decision: 'REVERSE' })).toMatchObject({
      resultState: 'REVERSED', appealState: 'DECIDED_REVERSED',
      effectiveOutcomeCode: 'WIN_B', effectiveWinnerUserId: 'athlete-b',
      effectiveLoserUserId: 'athlete-a', compensationMode: 'REAPPLY_CORRECTED',
    });
    expect(normalizeAppealDecision({ ...base, decision: 'ANNUL' })).toMatchObject({
      resultState: 'ANNULLED', appealState: 'DECIDED_ANNULLED',
      effectiveWinnerUserId: null, effectiveLoserUserId: null,
      compensationMode: 'RESTORE_PRE_RESULT',
    });
    expect(normalizeAppealDecision({ ...base, decision: 'REPEAT' })).toMatchObject({
      resultState: 'REPEAT_ORDERED', appealState: 'DECIDED_REPEAT',
      compensationMode: 'RESTORE_AND_REPEAT',
    });
    expect(() => normalizeAppealDecision({
      ...base, decision: 'REVERSE', originalOutcomeCode: 'DRAW',
      originalWinnerUserId: null, originalLoserUserId: null,
    })).toThrowError(new ResultConflictError('APPEAL_DECISION_INVALID'));
  });

  it('accepts one timely non-blocking response from the opponent or Coach', () => {
    const base = {
      state: 'SUBMITTED' as const, appellantUserId: 'athlete-b',
      participantUserIds: participants, coachUserId: 'coach',
      responseDeadlineAt: new Date('2026-09-10T11:00:00.000Z'),
      occurredAt: new Date('2026-09-10T10:59:59.000Z'), alreadyResponded: false,
      statement: '  Факты со стороны участника.  ',
    };
    expect(normalizeAppealResponse({ ...base, responderUserId: 'athlete-a' }))
      .toEqual({ role: 'OPPONENT', statement: 'Факты со стороны участника.' });
    expect(normalizeAppealResponse({ ...base, responderUserId: 'coach' }))
      .toMatchObject({ role: 'COACH' });
    expect(() => normalizeAppealResponse({ ...base, responderUserId: 'athlete-a', alreadyResponded: true }))
      .toThrowError(new ResultConflictError('APPEAL_RESPONSE_ALREADY_SUBMITTED'));
    expect(() => normalizeAppealResponse({
      ...base, responderUserId: 'athlete-a', occurredAt: base.responseDeadlineAt,
    })).toThrowError(new ResultConflictError('APPEAL_RESPONSE_WINDOW_CLOSED'));
  });

  it('[AC-116] allows only the appellant to withdraw before a decision', () => {
    expect(() => assertAppealCanBeWithdrawn({
      state: 'UNDER_REVIEW', actorUserId: 'athlete-b', appellantUserId: 'athlete-b',
    })).not.toThrow();
    expect(() => assertAppealCanBeWithdrawn({
      state: 'DECIDED_UPHELD', actorUserId: 'athlete-b', appellantUserId: 'athlete-b',
    })).toThrowError(new ResultConflictError('APPEAL_WITHDRAWAL_NOT_ALLOWED'));
  });

  it('[AC-115] extends an assigned Central review once by a transparent 24 or 48 hours', () => {
    expect(normalizeAppealSlaExtension({
      state: 'UNDER_REVIEW', assignedReviewerUserId: 'central', reviewerUserId: 'central',
      alreadyExtended: false, currentDueAt: new Date('2026-09-12T11:00:00.000Z'),
      durationHours: 24, reason: 'Нужна дополнительная сверка.',
    })).toMatchObject({
      durationHours: 24, reason: 'Нужна дополнительная сверка.',
      extendedDueAt: new Date('2026-09-13T11:00:00.000Z'),
    });
    expect(() => normalizeAppealSlaExtension({
      state: 'UNDER_REVIEW', assignedReviewerUserId: 'central', reviewerUserId: 'central',
      alreadyExtended: true, currentDueAt: new Date(), durationHours: 48, reason: 'Причина',
    })).toThrowError(new ResultConflictError('APPEAL_SLA_ALREADY_EXTENDED'));
  });
});
