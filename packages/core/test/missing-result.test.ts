import { describe, expect, it } from 'vitest';

import {
  ResultConflictError,
  assertMissingResultRepeatCanBeOrdered,
  assertMissingResultReviewCanStart,
  assertReviewedResultMatchesAssignment,
  matchingMissingResultClaim,
  normalizeMissingResultClaim,
  normalizeMissingResultCoachAssignment,
} from '../src/index.js';

const participants = ['athlete-a', 'athlete-b'] as const;

describe('Missing Result governance', () => {
  it('[AC-179] requires matching private claims, Venue attendance and an independent Coach', () => {
    const claims = participants.map((_, index) => normalizeMissingResultClaim({
      outcomeCode: 'WIN_A', participantUserIds: participants,
      statement: index === 0 ? 'Я выиграл.' : 'Первый спортсмен выиграл.',
    }));
    const matchingClaim = matchingMissingResultClaim(claims);
    expect(matchingClaim).toMatchObject({ outcomeCode: 'WIN_A', winnerUserId: 'athlete-a' });
    expect(() => assertMissingResultReviewCanStart({
      state: 'OPEN', reviewerUserId: 'central',
      protectedUserIds: [...participants, 'original-coach'],
    })).not.toThrow();
    const assignment = normalizeMissingResultCoachAssignment({
      state: 'UNDER_REVIEW', assignedCentralUserId: 'central', centralUserId: 'central',
      reviewerCoachUserId: 'reviewer-coach', reviewerCoachAuthorized: true,
      protectedUserIds: [...participants, 'original-coach'], matchingClaim,
      venueAttendanceConfirmed: true, repeatObjectivelyImpossible: false,
      reason: 'Показания совпадают, присутствие подтверждено.',
    });
    expect(assignment).toMatchObject({ allowedOutcomeCode: 'WIN_A', allowedWinnerUserId: 'athlete-a' });
    expect(() => assertReviewedResultMatchesAssignment({
      state: 'REVIEWER_ASSIGNED', assignedReviewerCoachUserId: 'reviewer-coach',
      actorUserId: 'reviewer-coach', allowedOutcomeCode: assignment.allowedOutcomeCode,
      allowedWinnerUserId: assignment.allowedWinnerUserId,
      outcomeCode: 'WIN_A', winnerUserId: 'athlete-a',
    })).not.toThrow();
  });

  it('[AC-180] routes conflicting evidence to repeat or Coach-only NO_CONTEST', () => {
    const claims = [
      normalizeMissingResultClaim({ outcomeCode: 'WIN_A', participantUserIds: participants, statement: 'Я выиграл.' }),
      normalizeMissingResultClaim({ outcomeCode: 'WIN_B', participantUserIds: participants, statement: 'Я выиграл.' }),
    ];
    expect(matchingMissingResultClaim(claims)).toBeNull();
    expect(() => assertMissingResultRepeatCanBeOrdered({
      state: 'UNDER_REVIEW', assignedCentralUserId: 'central', centralUserId: 'central',
      matchingClaim: null, venueAttendanceConfirmed: true, repeatObjectivelyPossible: true,
    })).not.toThrow();
    expect(normalizeMissingResultCoachAssignment({
      state: 'UNDER_REVIEW', assignedCentralUserId: 'central', centralUserId: 'central',
      reviewerCoachUserId: 'reviewer-coach', reviewerCoachAuthorized: true,
      protectedUserIds: [...participants, 'original-coach'], matchingClaim: null,
      venueAttendanceConfirmed: true, repeatObjectivelyImpossible: true,
      reason: 'Повтор объективно невозможен.',
    })).toMatchObject({ allowedOutcomeCode: 'NO_CONTEST', allowedWinnerUserId: null });
    expect(() => normalizeMissingResultCoachAssignment({
      state: 'UNDER_REVIEW', assignedCentralUserId: 'central', centralUserId: 'central',
      reviewerCoachUserId: 'original-coach', reviewerCoachAuthorized: true,
      protectedUserIds: [...participants, 'original-coach'], matchingClaim: claims[0]!,
      venueAttendanceConfirmed: true, repeatObjectivelyImpossible: false, reason: 'Конфликт.',
    })).toThrowError(new ResultConflictError('MISSING_RESULT_REVIEWER_COACH_CONFLICT'));
  });
});
