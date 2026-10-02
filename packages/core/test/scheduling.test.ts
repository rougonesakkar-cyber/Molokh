import { describe, expect, it } from 'vitest';

import {
  BOOKING_SELECTION_TTL_MILLISECONDS,
  SchedulingConflictError,
  SchedulingPermissionDeniedError,
  SchedulingValidationError,
  assertHostConfirmationWindow,
  assertFutureScheduleCanBeMutated,
  assertAttendanceCanBeRecorded,
  assertCoachReplacementCanBeCommitted,
  assertCoachReplacementCanBeRejected,
  assertExternalSessionFailureCanBeCommitted,
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
  assertTrainingOfficialConversionCanBeRequested,
  attendanceCountsAsCompletedTraining,
  bookingSelectionExpiresAt,
  hostConfirmationDeadline,
  officialConversionDeadline,
  soloContinuationDeadline,
  trainingRetentionDeadline,
  normalizeCommercialPrice,
  normalizeOptionalScheduleText,
  normalizeScheduleMutationReason,
  normalizeScheduleLabel,
} from '../src/scheduling.js';

describe('Scheduling publication policy', () => {
  const occurredAt = new Date('2026-09-07T09:00:00.000Z');

  it('accepts a future interval inside the Venue horizon', () => {
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
  ])('rejects %s', (_name, startAt, endAt, horizonDays) => {
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

  it('keeps Session facts under the assigned non-participant Coach', () => {
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

  it('protects NO_SHOW grace and counts only attended ended Training', () => {
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

  it('closes an external failure only while the Session has not actually started', () => {
    expect(() => assertExternalSessionFailureCanBeCommitted({
      state: 'SCHEDULED', actualStartAt: null,
    })).not.toThrow();
    expect(() => assertExternalSessionFailureCanBeCommitted({
      state: 'IN_PROGRESS', actualStartAt: occurredAt.toISOString(),
    })).toThrowError(expect.objectContaining({ reason: 'EXTERNAL_FAILURE_NOT_ALLOWED' }));
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
