import { describe, expect, it } from 'vitest';

import {
  BOOKING_SELECTION_TTL_MILLISECONDS,
  SchedulingConflictError,
  SchedulingPermissionDeniedError,
  SchedulingValidationError,
  assertHostConfirmationWindow,
  assertBookingRequestCanBeWithdrawn,
  assertAthleteScheduleAvailable,
  assertFutureScheduleCanBeMutated,
  assertAttendanceCanBeRecorded,
  assertCoachReplacementCanBeCommitted,
  assertCoachReplacementCanBeRejected,
  assertExternalSessionFailureCanBeCommitted,
  assertSafetyCaseReviewCanStart,
  assertSafetyCaseReviewerIndependent,
  assertEnforcementAppealReviewCanStart,
  assertSafetyCancellationCanBeSubmitted,
  assertPublicationWindow,
  assertSessionCanEnd,
  assertSessionCanStart,
  assertSessionCoach,
  assertSessionWindowCanOpen,
  assertOfficialConversionCanExpire,
  assertOfficialConversionDecisionCanBeRecorded,
  assertSoloContinuationCanExpire,
  assertSoloContinuationDecisionCanBeRecorded,
  assertOfficialTrainingRetentionCanBeOffered,
  assertTrainingRetentionCanExpire,
  assertTrainingRetentionDecisionCanBeRecorded,
  assertTrainingParticipantCanCancel,
  officialCancellationWinner,
  assertGroupPlanOfficialConversionCanBeRequested,
  assertTrainingOfficialConversionCanBeRequested,
  attendanceCountsAsCompletedTraining,
  bookingSelectionExpiresAt,
  hostConfirmationDeadline,
  extendSchedulingDeadlineForSafetyHold,
  officialConversionDeadline,
  soloContinuationDeadline,
  trainingRetentionDeadline,
  normalizeCommercialPrice,
  normalizeOptionalScheduleText,
  normalizeScheduleMutationReason,
  normalizeSafetyAccountRestrictionDecision,
  normalizeEnforcementAppealSubmission,
  normalizeSafetyEnforcementDecision,
  normalizeSafetyCaseReleaseDecision,
  normalizeScheduleLabel,
  safetyRestrictionSubjectStatus,
} from '../src/scheduling.js';

describe('Scheduling publication policy', () => {
  const occurredAt = new Date('2026-09-07T09:00:00.000Z');

  it('[AC-027] accepts a future interval inside the Venue horizon', () => {
    expect(() =>
      assertPublicationWindow({
        startAt: '2026-09-14T09:00:00.000Z',
        endAt: '2026-09-14T10:00:00.000Z',
        occurredAt,
        horizonDays: 30,
      }),
    ).not.toThrow();
  });

  it.each([
    ['past start', '2026-09-07T08:59:59.999Z', '2026-09-07T10:00:00.000Z', 30],
    ['reversed interval', '2026-09-08T10:00:00.000Z', '2026-09-08T09:00:00.000Z', 30],
    ['outside horizon', '2026-10-08T09:00:00.001Z', '2026-10-08T10:00:00.000Z', 30],
    ['invalid horizon', '2026-09-08T09:00:00.000Z', '2026-09-08T10:00:00.000Z', 31],
  ])('[AC-028] rejects %s', (_name, startAt, endAt, horizonDays) => {
    expect(() => assertPublicationWindow({ startAt, endAt, occurredAt, horizonDays })).toThrow(
      SchedulingValidationError,
    );
  });

  it('normalizes user-visible labels and structured price without inventing payment', () => {
    expect(normalizeScheduleLabel('  Бокс для начинающих  ', 'classLabel')).toBe(
      'Бокс для начинающих',
    );
    expect(normalizeOptionalScheduleText('  Оплата в зале  ', 'priceText', 240)).toBe(
      'Оплата в зале',
    );
    expect(normalizeCommercialPrice({ amount: '1500.00', currency: 'rub' })).toEqual({
      amount: '1500.00',
      currency: 'RUB',
    });
  });

  it('[AC-066] lets either Athlete withdraw only an unconfirmed Booking request', () => {
    for (const state of ['SELECTING', 'HOST_CONFIRMATION_PENDING']) {
      expect(() => assertBookingRequestCanBeWithdrawn({
        state,
        actorUserId: 'athlete-a',
        participantUserIds: ['athlete-a', 'athlete-b'],
      })).not.toThrow();
      expect(() => assertBookingRequestCanBeWithdrawn({
        state,
        actorUserId: 'athlete-b',
        participantUserIds: ['athlete-a', 'athlete-b'],
      })).not.toThrow();
    }
    expect(() => assertBookingRequestCanBeWithdrawn({
      state: 'SELECTING',
      actorUserId: 'outsider',
      participantUserIds: ['athlete-a', 'athlete-b'],
    })).toThrow(SchedulingPermissionDeniedError);
    expect(() => assertBookingRequestCanBeWithdrawn({
      state: 'CONFIRMED_PAIR',
      actorUserId: 'athlete-a',
      participantUserIds: ['athlete-a', 'athlete-b'],
    })).toThrowError(expect.objectContaining({ reason: 'BOOKING_WITHDRAWAL_NOT_ALLOWED' }));
  });

  it('allows only reasoned future schedule mutations without active pair intent', () => {
    expect(normalizeScheduleMutationReason({
      reasonCode: 'SCHEDULE_CHANGED',
      reasonNote: '  Изменилось расписание Coach  ',
    })).toEqual({
      reasonCode: 'SCHEDULE_CHANGED',
      reasonNote: 'Изменилось расписание Coach',
    });
    expect(() => assertFutureScheduleCanBeMutated({
      state: 'PUBLISHED',
      startAt: '2026-09-08T09:00:00.000Z',
      activeIntentCount: 0,
      occurredAt,
    })).not.toThrow();
    expect(() => assertFutureScheduleCanBeMutated({
      state: 'PUBLISHED',
      startAt: '2026-09-08T09:00:00.000Z',
      activeIntentCount: 1,
      occurredAt,
    })).toThrowError(expect.objectContaining({ reason: 'SCHEDULE_HAS_ACTIVE_INTENT' }));
    expect(() => assertFutureScheduleCanBeMutated({
      state: 'WITHDRAWN',
      startAt: '2026-09-08T09:00:00.000Z',
      activeIntentCount: 0,
      occurredAt,
    })).toThrowError(expect.objectContaining({ reason: 'SCHEDULE_MUTATION_NOT_ALLOWED' }));
  });

  it('gives the pair one hour to align on a Slot', () => {
    expect(bookingSelectionExpiresAt(occurredAt).getTime() - occurredAt.getTime()).toBe(
      BOOKING_SELECTION_TTL_MILLISECONDS,
    );
  });

  it('derives the host boundary from the Venue notice and rejects a late choice', () => {
    expect(
      hostConfirmationDeadline({
        startAt: '2026-09-08T17:00:00.000Z',
        minimumBookingNoticeHours: 8,
        occurredAt,
      }).toISOString(),
    ).toBe('2026-09-08T09:00:00.000Z');
    expect(() =>
      hostConfirmationDeadline({
        startAt: '2026-09-07T17:00:00.000Z',
        minimumBookingNoticeHours: 8,
        occurredAt,
      }),
    ).toThrow(SchedulingConflictError);
  });

  it('allows host confirmation only for a mutually selected Slot before the deadline', () => {
    expect(() =>
      assertHostConfirmationWindow({
        state: 'HOST_CONFIRMATION_PENDING',
        selectedAthleteCount: 2,
        deadlineAt: '2026-09-08T09:00:00.000Z',
        occurredAt,
      }),
    ).not.toThrow();
    expect(() =>
      assertHostConfirmationWindow({
        state: 'SELECTING',
        selectedAthleteCount: 1,
        deadlineAt: '2026-09-08T09:00:00.000Z',
        occurredAt,
      }),
    ).toThrow(SchedulingConflictError);
    expect(() =>
      assertHostConfirmationWindow({
        state: 'HOST_CONFIRMATION_PENDING',
        selectedAthleteCount: 2,
        deadlineAt: occurredAt.toISOString(),
        occurredAt,
      }),
    ).toThrowError(expect.objectContaining({ reason: 'HOST_CONFIRMATION_EXPIRED' }));
  });

  it('[AC-153] rejects an overlapping confirmed Session for either Athlete', () => {
    expect(() => assertAthleteScheduleAvailable({
      hasOverlappingConfirmedSession: false,
    })).not.toThrow();
    expect(() => assertAthleteScheduleAvailable({
      hasOverlappingConfirmedSession: true,
    })).toThrowError(expect.objectContaining({ reason: 'ATHLETE_SCHEDULE_CONFLICT' }));
  });

  it('opens the Session window only at the scheduled boundary', () => {
    expect(() =>
      assertSessionWindowCanOpen({
        state: 'SCHEDULED',
        scheduledStartAt: occurredAt.toISOString(),
        occurredAt,
      }),
    ).not.toThrow();
    expect(() =>
      assertSessionWindowCanOpen({
        state: 'SCHEDULED',
        scheduledStartAt: '2026-09-07T09:00:00.001Z',
        occurredAt,
      }),
    ).toThrowError(expect.objectContaining({ reason: 'SESSION_NOT_READY' }));
  });

  it('[AC-020] keeps Session facts under the assigned non-participant Coach', () => {
    expect(() =>
      assertSessionCoach({
        actorId: 'coach',
        coachUserId: 'coach',
        athleteUserIds: ['athlete-a', 'athlete-b'],
      }),
    ).not.toThrow();
    expect(() =>
      assertSessionCoach({
        actorId: 'athlete-a',
        coachUserId: 'coach',
        athleteUserIds: ['athlete-a', 'athlete-b'],
      }),
    ).toThrow(SchedulingPermissionDeniedError);
    expect(() =>
      assertSessionCoach({
        actorId: 'athlete-a',
        coachUserId: 'athlete-a',
        athleteUserIds: ['athlete-a', 'athlete-b'],
      }),
    ).toThrow(SchedulingPermissionDeniedError);
  });

  it('starts READY Session only inside its operational window', () => {
    expect(() =>
      assertSessionCanStart({
        state: 'READY_FOR_COACH',
        scheduledStartAt: occurredAt.toISOString(),
        scheduledEndAt: '2026-09-07T10:00:00.000Z',
        operationalGraceMinutes: 15,
        occurredAt,
      }),
    ).not.toThrow();
    expect(() =>
      assertSessionCanStart({
        state: 'READY_FOR_COACH',
        scheduledStartAt: occurredAt.toISOString(),
        scheduledEndAt: '2026-09-07T10:00:00.000Z',
        operationalGraceMinutes: 15,
        occurredAt: new Date('2026-09-07T10:15:00.001Z'),
      }),
    ).toThrowError(expect.objectContaining({ reason: 'SESSION_OPERATION_WINDOW_CLOSED' }));
  });

  it('[AC-074][AC-202][AC-203] protects NO_SHOW grace and counts only attended Training', () => {
    expect(() =>
      assertAttendanceCanBeRecorded({
        state: 'IN_PROGRESS',
        status: 'NO_SHOW',
        athleteId: 'athlete-b',
        athleteUserIds: ['athlete-a', 'athlete-b'],
        scheduledStartAt: occurredAt.toISOString(),
        noShowGraceMinutes: 15,
        occurredAt: new Date('2026-09-07T09:14:59.999Z'),
      }),
    ).toThrowError(expect.objectContaining({ reason: 'NO_SHOW_TOO_EARLY' }));
    expect(() =>
      assertAttendanceCanBeRecorded({
        state: 'IN_PROGRESS',
        status: 'NO_SHOW',
        athleteId: 'athlete-b',
        athleteUserIds: ['athlete-a', 'athlete-b'],
        scheduledStartAt: occurredAt.toISOString(),
        noShowGraceMinutes: 15,
        occurredAt: new Date('2026-09-07T09:15:00.000Z'),
      }),
    ).not.toThrow();
    expect(attendanceCountsAsCompletedTraining('PRESENT')).toBe(true);
    expect(attendanceCountsAsCompletedTraining('LATE')).toBe(true);
    expect(attendanceCountsAsCompletedTraining('NO_SHOW')).toBe(false);
  });

  it('requires both athlete facts before Coach ends the MVP Session', () => {
    expect(() =>
      assertSessionCanEnd({ state: 'IN_PROGRESS', attendanceCount: 1, athleteCount: 2 }),
    ).toThrowError(expect.objectContaining({ reason: 'ATTENDANCE_INCOMPLETE' }));
    expect(() =>
      assertSessionCanEnd({ state: 'IN_PROGRESS', attendanceCount: 2, athleteCount: 2 }),
    ).not.toThrow();
  });

  it('allows an equivalent Coach replacement only before start and through the Venue grace', () => {
    expect(() => assertCoachReplacementCanBeCommitted({
      state: 'READY_FOR_COACH',
      actualStartAt: null,
      currentCoachUserId: 'coach-a',
      replacementCoachUserId: 'coach-b',
      athleteUserIds: ['athlete-a', 'athlete-b'],
      scheduledStartAt: occurredAt.toISOString(),
      operationalGraceMinutes: 15,
      occurredAt: new Date('2026-09-07T09:15:00.000Z'),
    })).not.toThrow();
    expect(() => assertCoachReplacementCanBeCommitted({
      state: 'READY_FOR_COACH',
      actualStartAt: null,
      currentCoachUserId: 'coach-a',
      replacementCoachUserId: 'coach-b',
      athleteUserIds: ['athlete-a', 'athlete-b'],
      scheduledStartAt: occurredAt.toISOString(),
      operationalGraceMinutes: 15,
      occurredAt: new Date('2026-09-07T09:15:00.001Z'),
    })).toThrowError(expect.objectContaining({ reason: 'COACH_REPLACEMENT_UNAVAILABLE' }));
  });

  it('lets either Athlete reject a recorded replacement before actual start', () => {
    expect(() => assertCoachReplacementCanBeRejected({
      state: 'SCHEDULED',
      actualStartAt: null,
      latestCoachReplacementAt: '2026-09-07T08:30:00.000Z',
      actorId: 'athlete-a',
      athleteUserIds: ['athlete-a', 'athlete-b'],
      occurredAt,
    })).not.toThrow();
    expect(() => assertCoachReplacementCanBeRejected({
      state: 'SCHEDULED',
      actualStartAt: null,
      latestCoachReplacementAt: null,
      actorId: 'athlete-a',
      athleteUserIds: ['athlete-a', 'athlete-b'],
      occurredAt,
    })).toThrowError(expect.objectContaining({ reason: 'COACH_REPLACEMENT_NOT_REJECTABLE' }));
  });

  it('[AC-063] closes an external failure only while the Session has not actually started', () => {
    expect(() => assertExternalSessionFailureCanBeCommitted({
      state: 'SCHEDULED', actualStartAt: null,
    })).not.toThrow();
    expect(() => assertExternalSessionFailureCanBeCommitted({
      state: 'IN_PROGRESS', actualStartAt: occurredAt.toISOString(),
    })).toThrowError(expect.objectContaining({ reason: 'EXTERNAL_FAILURE_NOT_ALLOWED' }));
  });

  it('[AC-124] requires an explicit pre-start safety cancellation against the frozen pair', () => {
    const input = {
      sessionState: 'SCHEDULED' as const,
      sessionPurpose: 'OFFICIAL_CHALLENGE',
      bookingState: 'CONFIRMED_PAIR',
      challengeState: 'BOOKED',
      actualStartAt: null,
      resultExists: false,
      explicitConfirmation: true,
      reporterUserId: 'athlete-a',
      subjectUserId: 'athlete-b',
      athleteUserIds: ['athlete-a', 'athlete-b'] as const,
      actorIsOperational: false,
      actorIsAssignedCoach: false,
      reporterPolicy: 'PARTICIPANT_OR_OPERATIONAL' as const,
      reasonCode: 'THREAT',
    };
    expect(assertSafetyCancellationCanBeSubmitted(input)).toBe('THREAT');
    expect(() => assertSafetyCancellationCanBeSubmitted({
      ...input, explicitConfirmation: false,
    })).toThrowError(expect.objectContaining({ reason: 'SAFETY_CANCELLATION_NOT_ALLOWED' }));
    expect(() => assertSafetyCancellationCanBeSubmitted({
      ...input, actualStartAt: occurredAt.toISOString(), sessionState: 'IN_PROGRESS',
    })).toThrowError(expect.objectContaining({ reason: 'SAFETY_CANCELLATION_NOT_ALLOWED' }));
    expect(() => assertSafetyCancellationCanBeSubmitted({
      ...input, subjectUserId: 'athlete-a',
    })).toThrowError(expect.objectContaining({ reason: 'SAFETY_CANCELLATION_NOT_ALLOWED' }));
  });

  it('[AC-125] permits only the assigned Coach to refuse a pre-start unsafe Session', () => {
    const input = {
      sessionState: 'READY_FOR_COACH' as const,
      sessionPurpose: 'OFFICIAL_CHALLENGE', bookingState: 'CONFIRMED_PAIR',
      challengeState: 'BOOKED', actualStartAt: null, resultExists: false,
      explicitConfirmation: true, reporterUserId: 'coach', subjectUserId: 'athlete-a',
      athleteUserIds: ['athlete-a', 'athlete-b'] as const,
      actorIsOperational: true, actorIsAssignedCoach: true,
      reporterPolicy: 'ASSIGNED_COACH_ONLY' as const, reasonCode: 'UNSAFE_CONDUCT',
    };
    expect(assertSafetyCancellationCanBeSubmitted(input)).toBe('UNSAFE_CONDUCT');
    expect(() => assertSafetyCancellationCanBeSubmitted({
      ...input, actorIsAssignedCoach: false,
    })).toThrowError(expect.objectContaining({ reason: 'SAFETY_CANCELLATION_NOT_ALLOWED' }));
    expect(() => assertSafetyCancellationCanBeSubmitted({
      ...input, subjectUserId: 'outsider',
    })).toThrowError(expect.objectContaining({ reason: 'SAFETY_CANCELLATION_NOT_ALLOWED' }));
  });

  it('[AC-126] releases a reviewed Safety hold with a normalized replacement and exact deadline extension', () => {
    expect(() => assertSafetyCaseReviewCanStart({
      state: 'SUBMITTED', actorIsCentral: true, reviewerUserId: 'central',
      reporterUserId: 'coach-a', subjectUserId: 'athlete-a',
      athleteUserIds: ['athlete-a', 'athlete-b'], assignedCoachUserId: 'coach-a',
      reviewerIsInterestedVenueAdmin: false,
    })).not.toThrow();
    expect(() => assertSafetyCaseReviewCanStart({
      state: 'SUBMITTED', actorIsCentral: true, reviewerUserId: 'coach-a',
      reporterUserId: 'coach-a', subjectUserId: 'athlete-a',
      athleteUserIds: ['athlete-a', 'athlete-b'], assignedCoachUserId: 'coach-a',
      reviewerIsInterestedVenueAdmin: false,
    })).toThrowError(expect.objectContaining({ reason: 'SAFETY_CASE_REVIEWER_CONFLICT' }));
    expect(normalizeSafetyCaseReleaseDecision({
      state: 'UNDER_REVIEW', assignedReviewerUserId: 'central', reviewerUserId: 'central',
      remedyCode: 'REPLACE_COACH', replacementCoachUserId: 'coach-b',
      replacementVenueId: null, replacementCoachAvailable: true,
      replacementVenueAvailable: false, reason: ' independent safe replacement ',
    })).toEqual({
      remedyCode: 'REPLACE_COACH', replacementCoachUserId: 'coach-b',
      replacementVenueId: null, reason: 'independent safe replacement',
    });
    expect(extendSchedulingDeadlineForSafetyHold({
      schedulingDeadlineAt: '2026-10-20T10:00:00.000Z',
      holdStartedAt: '2026-10-18T10:00:00.000Z',
      releasedAt: new Date('2026-10-18T13:30:00.000Z'),
    }).toISOString()).toBe('2026-10-20T13:30:00.000Z');
  });

  it('[AC-127] requires a direct causal link before Safety enforcement Forfeit', () => {
    const decision = {
      state: 'UNDER_REVIEW', assignedReviewerUserId: 'central', reviewerUserId: 'central',
      subjectUserId: 'athlete-a', athleteUserIds: ['athlete-a', 'athlete-b'] as const,
      caseReasonCode: 'UNSAFE_CONDUCT', causalLinkConfirmed: true,
      consequencesConfirmed: true, reason: ' direct conduct caused session failure ',
    };
    expect(normalizeSafetyEnforcementDecision(decision)).toEqual({
      remedyCode: 'FORFEIT_BY_ENFORCEMENT', loserUserId: 'athlete-a',
      winnerUserId: 'athlete-b', enforcementReasonCode: 'UNSAFE_CONDUCT',
      causalLinkCode: 'SUBJECT_CAUSED_SESSION_FAILURE',
      reason: 'direct conduct caused session failure',
    });
    expect(() => normalizeSafetyEnforcementDecision({
      ...decision, causalLinkConfirmed: false,
    })).toThrowError(expect.objectContaining({ reason: 'SAFETY_CASE_CAUSAL_LINK_REQUIRED' }));
    expect(() => normalizeSafetyEnforcementDecision({
      ...decision, consequencesConfirmed: false,
    })).toThrowError(expect.objectContaining({ reason: 'SAFETY_CASE_CONSEQUENCES_NOT_CONFIRMED' }));
  });

  it('[AC-128] permits account restriction only for a confirmed serious category', () => {
    const decision = {
      state: 'UNDER_REVIEW', assignedReviewerUserId: 'central', reviewerUserId: 'central',
      subjectUserId: 'athlete-a', athleteUserIds: ['athlete-a', 'athlete-b'] as const,
      categoryCode: 'VIOLENCE', seriousCategoryConfirmed: true,
      consequencesConfirmed: true, reason: ' confirmed serious safety violation ',
    };
    expect(normalizeSafetyAccountRestrictionDecision(decision)).toEqual({
      remedyCode: 'ACCOUNT_RESTRICTION', subjectUserId: 'athlete-a',
      categoryCode: 'VIOLENCE', reason: 'confirmed serious safety violation',
    });
    expect(() => normalizeSafetyAccountRestrictionDecision({
      ...decision, categoryCode: 'THREAT',
    })).toThrowError(expect.objectContaining({ field: 'restrictionCategoryCode' }));
    expect(() => normalizeSafetyAccountRestrictionDecision({
      ...decision, seriousCategoryConfirmed: false,
    })).toThrowError(expect.objectContaining({ reason: 'SAFETY_CASE_SERIOUS_CATEGORY_REQUIRED' }));
    expect(safetyRestrictionSubjectStatus({
      subjectUserId: 'athlete-a', championUserId: 'athlete-a', contenderUserId: 'athlete-b',
    })).toBe('CHAMPION');
    expect(safetyRestrictionSubjectStatus({
      subjectUserId: 'ordinary', championUserId: 'athlete-a', contenderUserId: 'athlete-b',
    })).toBeNull();
  });

  it('[AC-129] keeps an appealed restriction active and requires an independent reviewer', () => {
    const submission = {
      actorUserId: 'athlete-a', subjectUserId: 'athlete-a', accountState: 'RESTRICTED',
      enforcementType: 'ACCOUNT_RESTRICTION', enforcementState: 'ACTIVE',
      appealDeadlineAt: new Date('2026-10-07T10:00:00.000Z'),
      occurredAt: new Date('2026-10-06T10:00:00.000Z'), appealExists: false,
      statement: ' Прошу независимо пересмотреть ограничение аккаунта ',
    };
    expect(normalizeEnforcementAppealSubmission(submission))
      .toBe('Прошу независимо пересмотреть ограничение аккаунта');
    expect(() => normalizeEnforcementAppealSubmission({
      ...submission, occurredAt: new Date('2026-10-07T10:00:00.001Z'),
    })).toThrowError(expect.objectContaining({ reason: 'ENFORCEMENT_APPEAL_WINDOW_CLOSED' }));
    expect(() => assertEnforcementAppealReviewCanStart({
      state: 'SUBMITTED', actorIsCentral: true, reviewerUserId: 'original-central',
      subjectUserId: 'athlete-a', originalDecisionMakerUserId: 'original-central',
      reporterUserId: 'coach',
    })).toThrowError(expect.objectContaining({ reason: 'ENFORCEMENT_APPEAL_REVIEWER_CONFLICT' }));
    expect(() => assertEnforcementAppealReviewCanStart({
      state: 'SUBMITTED', actorIsCentral: true, reviewerUserId: 'independent-central',
      subjectUserId: 'athlete-a', originalDecisionMakerUserId: 'original-central',
      reporterUserId: 'coach',
    })).not.toThrow();
  });

  it('[AC-130] rejects a Safety reviewer who is the subject or interested Venue Admin', () => {
    const independent = {
      reviewerUserId: 'central-b', reporterUserId: 'coach-a', subjectUserId: 'athlete-a',
      athleteUserIds: ['athlete-a', 'athlete-b'] as const,
      assignedCoachUserId: 'coach-a', reviewerIsInterestedVenueAdmin: false,
    };
    expect(() => assertSafetyCaseReviewerIndependent(independent)).not.toThrow();
    expect(() => assertSafetyCaseReviewerIndependent({
      ...independent, reviewerUserId: 'athlete-a',
    })).toThrowError(expect.objectContaining({ reason: 'SAFETY_CASE_REVIEWER_CONFLICT' }));
    expect(() => assertSafetyCaseReviewerIndependent({
      ...independent, reviewerIsInterestedVenueAdmin: true,
    })).toThrowError(expect.objectContaining({ reason: 'SAFETY_CASE_REVIEWER_CONFLICT' }));
  });

  it('[AC-065] permits only a booked Official participant to cancel before actual start', () => {
    const input = {
      bookingState: 'CONFIRMED_PAIR', bookingPurpose: 'OFFICIAL_CHALLENGE',
      challengeState: 'BOOKED', sessionState: 'READY_FOR_COACH' as const,
      actualStartAt: null, actorUserId: 'athlete-a',
      participantUserIds: ['athlete-a', 'athlete-b'] as const, resultExists: false,
    };
    expect(officialCancellationWinner(input)).toBe('athlete-b');
    expect(() => officialCancellationWinner({ ...input, actorUserId: 'outsider' }))
      .toThrow(SchedulingPermissionDeniedError);
    expect(() => officialCancellationWinner({ ...input, actualStartAt: '2026-10-01T10:01:00.000Z' }))
      .toThrowError(new SchedulingConflictError('OFFICIAL_CANCELLATION_NOT_ALLOWED'));
  });

  it('AC-155 caps a Training-to-Official confirmation window at 72 hours or Session start', () => {
    expect(officialConversionDeadline({
      occurredAt,
      scheduledStartAt: '2026-09-12T09:00:00.000Z',
    }).toISOString()).toBe('2026-09-10T09:00:00.000Z');
    expect(officialConversionDeadline({
      occurredAt,
      scheduledStartAt: '2026-09-08T09:00:00.000Z',
    }).toISOString()).toBe('2026-09-08T09:00:00.000Z');
  });

  it('AC-155 accepts a conversion request only for a confirmed, not-started pair Training', () => {
    expect(assertTrainingOfficialConversionCanBeRequested({
      bookingState: 'CONFIRMED_PAIR',
      bookingPurpose: 'TRAINING',
      sessionState: 'SCHEDULED',
      windowOpenedAt: null,
      actualStartAt: null,
      scheduledStartAt: '2026-09-08T09:00:00.000Z',
      actorIsAthlete: true,
      hasLiveConversion: false,
      occurredAt,
    }).toISOString()).toBe('2026-09-08T09:00:00.000Z');
    expect(() => assertTrainingOfficialConversionCanBeRequested({
      bookingState: 'CONFIRMED_PAIR',
      bookingPurpose: 'TRAINING',
      sessionState: 'READY_FOR_COACH',
      windowOpenedAt: occurredAt.toISOString(),
      actualStartAt: null,
      scheduledStartAt: '2026-09-08T09:00:00.000Z',
      actorIsAthlete: true,
      hasLiveConversion: false,
      occurredAt,
    })).toThrowError(expect.objectContaining({ reason: 'OFFICIAL_CONVERSION_NOT_ALLOWED' }));
  });

  it('[AC-025][AC-026] opens GroupPlan confirmation only for a mutual plan with Coach', () => {
    expect(assertGroupPlanOfficialConversionCanBeRequested({
      groupPlanState: 'NOTIFIED', actorIsAthlete: true, coachAssigned: true,
      hasLiveConversion: false, scheduledStartAt: '2026-09-11T16:00:00.000Z', occurredAt,
    }).toISOString()).toBe('2026-09-10T09:00:00.000Z');
    expect(() => assertGroupPlanOfficialConversionCanBeRequested({
      groupPlanState: 'PROPOSED', actorIsAthlete: true, coachAssigned: true,
      hasLiveConversion: false, scheduledStartAt: '2026-09-11T16:00:00.000Z', occurredAt,
    })).toThrowError(expect.objectContaining({ reason: 'OFFICIAL_CONVERSION_NOT_ALLOWED' }));
  });

  it('AC-156 and AC-157 allow one required decision before the exact deadline', () => {
    const base = {
      state: 'PENDING_CONFIRMATION' as const,
      actorRequired: true,
      actorAlreadyDecided: false,
      confirmationDeadlineAt: '2026-09-08T09:00:00.000Z',
    };
    expect(() => assertOfficialConversionDecisionCanBeRecorded({
      ...base,
      occurredAt: new Date('2026-09-08T08:59:59.999Z'),
    })).not.toThrow();
    expect(() => assertOfficialConversionDecisionCanBeRecorded({
      ...base,
      occurredAt: new Date('2026-09-08T09:00:00.000Z'),
    })).toThrowError(expect.objectContaining({ reason: 'OFFICIAL_CONVERSION_EXPIRED' }));
    expect(() => assertOfficialConversionCanExpire({
      state: 'PENDING_CONFIRMATION',
      confirmationDeadlineAt: '2026-09-08T09:00:00.000Z',
      occurredAt: new Date('2026-09-08T09:00:00.000Z'),
    })).not.toThrow();
  });

  it('AC-035 and AC-163 cap solo continuation at one hour or Training start', () => {
    expect(soloContinuationDeadline({
      occurredAt,
      scheduledStartAt: '2026-09-07T12:00:00.000Z',
    }).toISOString()).toBe('2026-09-07T10:00:00.000Z');
    expect(assertTrainingParticipantCanCancel({
      bookingState: 'OFFICIAL_CONVERSION_PENDING',
      bookingPurpose: 'TRAINING',
      sessionState: 'SCHEDULED',
      actualStartAt: null,
      actorIsAthlete: true,
      hasLiveSoloContinuation: false,
      scheduledStartAt: '2026-09-07T09:30:00.000Z',
      occurredAt,
    }).toISOString()).toBe('2026-09-07T09:30:00.000Z');
  });

  it('AC-036 and AC-037 require remaining Athlete and Coach decisions before deadline', () => {
    expect(() => assertSoloContinuationDecisionCanBeRecorded({
      state: 'PENDING', actorRequired: true, actorAlreadyDecided: false,
      deadlineAt: '2026-09-07T10:00:00.000Z', occurredAt,
    })).not.toThrow();
    expect(() => assertSoloContinuationDecisionCanBeRecorded({
      state: 'PENDING', actorRequired: true, actorAlreadyDecided: false,
      deadlineAt: occurredAt.toISOString(), occurredAt,
    })).toThrowError(expect.objectContaining({ reason: 'SOLO_CONTINUATION_EXPIRED' }));
    expect(() => assertSoloContinuationCanExpire({
      state: 'PENDING', deadlineAt: occurredAt.toISOString(), occurredAt,
    })).not.toThrow();
  });

  it('AC-170 caps booked Official-to-Training retention at one hour or Session start', () => {
    expect(trainingRetentionDeadline({
      occurredAt,
      scheduledStartAt: '2026-09-07T12:00:00.000Z',
    }).toISOString()).toBe('2026-09-07T10:00:00.000Z');
    expect(assertOfficialTrainingRetentionCanBeOffered({
      bookingState: 'CONFIRMED_PAIR',
      bookingPurpose: 'OFFICIAL_CHALLENGE',
      sessionState: 'SCHEDULED',
      actualStartAt: null,
      slotState: 'BOOKED',
      scheduledStartAt: '2026-09-07T09:30:00.000Z',
      occurredAt,
    }).toISOString()).toBe('2026-09-07T09:30:00.000Z');
    expect(() => assertOfficialTrainingRetentionCanBeOffered({
      bookingState: 'CONFIRMED_PAIR', bookingPurpose: 'TRAINING',
      sessionState: 'SCHEDULED', actualStartAt: null, slotState: 'BOOKED',
      scheduledStartAt: '2026-09-07T09:30:00.000Z', occurredAt,
    })).toThrowError(expect.objectContaining({ reason: 'TRAINING_RETENTION_NOT_ALLOWED' }));
  });

  it('AC-170 accepts one decision per required party and expires at the exact deadline', () => {
    expect(() => assertTrainingRetentionDecisionCanBeRecorded({
      state: 'PENDING', actorRequired: true, actorAlreadyDecided: false,
      deadlineAt: '2026-09-07T10:00:00.000Z', occurredAt,
    })).not.toThrow();
    expect(() => assertTrainingRetentionDecisionCanBeRecorded({
      state: 'PENDING', actorRequired: true, actorAlreadyDecided: true,
      deadlineAt: '2026-09-07T10:00:00.000Z', occurredAt,
    })).toThrowError(expect.objectContaining({ reason: 'TRAINING_RETENTION_ALREADY_DECIDED' }));
    expect(() => assertTrainingRetentionCanExpire({
      state: 'PENDING', deadlineAt: occurredAt.toISOString(), occurredAt,
    })).not.toThrow();
  });
});
