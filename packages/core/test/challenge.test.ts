import { describe, expect, it } from 'vitest';

import {
  ACCEPTED_CHALLENGE_SCHEDULING_DAYS,
  ChallengeConflictError,
  assertAcceptedChallengeCanStartBooking,
  assertChallengeBookingCanBeConfirmed,
  assertChallengeSessionCanEnd,
  assertChallengeSessionCanStart,
  assertChallengeSessionWindowCanOpen,
  assertDirectOpenChallengeCanBeCreated,
  assertMandatoryChallengeCanBeDeclined,
  assertMandatoryChallengeCanBeExpired,
  assertOptionalChallengeCanBeAccepted,
  assertOptionalChallengeCanBeDeclined,
  assertOptionalChallengeCanBeExpired,
  assertOptionalChallengeCanBeWithdrawn,
  challengeResultReminderDeadlines,
  effectiveChallengeStakeAtSessionWindow,
  mandatoryChallengeReminderDeadlines,
  mandatoryChallengeResponseDeadline,
  optionalChallengePairQuietEndsAt,
  optionalChallengeReminderDeadlines,
  optionalChallengeResponseDeadline,
} from '../src/index.js';

const eligible = {
  initiatorAccountActive: true,
  recipientAccountActive: true,
  initiatorVerified: true,
  recipientVerified: true,
  sameAgeContour: true,
  communityActive: true,
  competitionActive: true,
  initiatorMembershipActive: true,
  recipientMembershipActive: true,
  activeMatch: true,
  pairBlocked: false,
  pairCooldownActive: false,
  pairQuietActive: false,
  livePairChallengeExists: false,
  outgoingAwaitingResponseCount: 0,
  initiatorStatus: 'ORDINARY' as const,
  recipientStatus: 'ORDINARY' as const,
};

describe('Official Challenge policy', () => {
  it('uses transparent 12h/24h reminders, 48h response and 14d scheduling deadlines', () => {
    const startedAt = new Date('2026-09-08T10:00:00.000Z');
    expect(optionalChallengeReminderDeadlines(startedAt).map((value) => value.toISOString())).toEqual([
      '2026-09-08T22:00:00.000Z',
      '2026-09-09T10:00:00.000Z',
    ]);
    expect(optionalChallengeResponseDeadline(startedAt).toISOString()).toBe('2026-09-10T10:00:00.000Z');
    expect(optionalChallengePairQuietEndsAt(startedAt).toISOString()).toBe('2026-09-10T10:00:00.000Z');
    expect(ACCEPTED_CHALLENGE_SCHEDULING_DAYS).toBe(14);
    expect(challengeResultReminderDeadlines(startedAt).map((value) => value.toISOString())).toEqual([
      '2026-09-08T12:00:00.000Z',
      '2026-09-08T22:00:00.000Z',
      '2026-09-09T10:00:00.000Z',
    ]);
  });

  it('gives the current Contender 72 hours to answer a mandatory FIFO Challenge', () => {
    const createdAt = new Date('2026-09-08T10:00:00.000Z');
    expect(mandatoryChallengeReminderDeadlines(createdAt).map((value) => value.toISOString())).toEqual([
      '2026-09-10T10:00:00.000Z',
    ]);
    expect(mandatoryChallengeResponseDeadline(createdAt).toISOString()).toBe('2026-09-11T10:00:00.000Z');
  });

  it('allows an Ordinary or Champion to invite an Ordinary only through an active Match', () => {
    expect(() => assertDirectOpenChallengeCanBeCreated(eligible)).not.toThrow();
    expect(() => assertDirectOpenChallengeCanBeCreated({ ...eligible, initiatorStatus: 'CHAMPION' })).not.toThrow();
    expect(() => assertDirectOpenChallengeCanBeCreated({ ...eligible, activeMatch: false })).toThrowError(
      new ChallengeConflictError('MATCH_REQUIRED'),
    );
    expect(() => assertDirectOpenChallengeCanBeCreated({ ...eligible, recipientStatus: 'CHAMPION' })).toThrowError(
      new ChallengeConflictError('PAIR_MATRIX_DENIED'),
    );
  });

  it('caps unanswered optional invitations without treating them as accepted obligations', () => {
    expect(() => assertDirectOpenChallengeCanBeCreated({ ...eligible, outgoingAwaitingResponseCount: 3 })).toThrowError(
      new ChallengeConflictError('OPTIONAL_INVITATION_LIMIT'),
    );
  });

  it('accepts only a timely recipient response with required acknowledgement and no active obligation', () => {
    const base = {
      state: 'AWAITING_RESPONSE' as const,
      actorUserId: 'recipient',
      recipientUserId: 'recipient',
      responseDeadlineAt: new Date('2026-09-10T10:00:00.000Z'),
      occurredAt: new Date('2026-09-09T10:00:00.000Z'),
      rulesetAckMode: 'IMPLICIT_ON_ACCEPT' as const,
      explicitRulesetAcknowledged: false,
      participantHasActiveObligation: false,
    };
    expect(() => assertOptionalChallengeCanBeAccepted(base)).not.toThrow();
    expect(() => assertOptionalChallengeCanBeAccepted({ ...base, participantHasActiveObligation: true })).toThrowError(
      new ChallengeConflictError('OFFICIAL_OBLIGATION_LIMIT'),
    );
    expect(() => assertOptionalChallengeCanBeAccepted({ ...base, rulesetAckMode: 'EXPLICIT_ACK_REQUIRED' })).toThrowError(
      new ChallengeConflictError('RULESET_ACK_REQUIRED'),
    );
  });

  it('separates recipient decline from initiator withdrawal', () => {
    expect(() => assertOptionalChallengeCanBeDeclined('AWAITING_RESPONSE', 'b', 'b')).not.toThrow();
    expect(() => assertOptionalChallengeCanBeWithdrawn('AWAITING_RESPONSE', 'a', 'a')).not.toThrow();
    expect(() => assertOptionalChallengeCanBeDeclined('AWAITING_RESPONSE', 'a', 'b')).toThrowError(
      new ChallengeConflictError('CHALLENGE_RECIPIENT_REQUIRED'),
    );
    expect(() => assertOptionalChallengeCanBeWithdrawn('AWAITING_RESPONSE', 'b', 'a')).toThrowError(
      new ChallengeConflictError('CHALLENGE_INITIATOR_REQUIRED'),
    );
  });

  it('expires an unanswered optional invitation only at its deadline', () => {
    const deadline = new Date('2026-09-10T10:00:00.000Z');
    expect(() => assertOptionalChallengeCanBeExpired('AWAITING_RESPONSE', deadline, deadline)).not.toThrow();
    expect(() => assertOptionalChallengeCanBeExpired('AWAITING_RESPONSE', deadline, new Date('2026-09-10T09:59:59.999Z'))).toThrowError(
      new ChallengeConflictError('CHALLENGE_RESPONSE_NOT_DUE'),
    );
  });

  it('turns only a timely recipient refusal or a due timeout into a mandatory decision', () => {
    const deadline = new Date('2026-09-11T10:00:00.000Z');
    const response = {
      state: 'AWAITING_RESPONSE' as const,
      actorUserId: 'contender',
      recipientUserId: 'contender',
      responseDeadlineAt: deadline,
      occurredAt: new Date('2026-09-11T09:59:59.999Z'),
    };
    expect(() => assertMandatoryChallengeCanBeDeclined(response)).not.toThrow();
    expect(() => assertMandatoryChallengeCanBeDeclined({
      ...response,
      actorUserId: 'challenger',
    })).toThrowError(new ChallengeConflictError('CHALLENGE_RECIPIENT_REQUIRED'));
    expect(() => assertMandatoryChallengeCanBeDeclined({
      ...response,
      occurredAt: deadline,
    })).toThrowError(new ChallengeConflictError('CHALLENGE_RESPONSE_EXPIRED'));
    expect(() => assertMandatoryChallengeCanBeExpired('AWAITING_RESPONSE', deadline, deadline)).not.toThrow();
    expect(() => assertMandatoryChallengeCanBeExpired(
      'AWAITING_RESPONSE',
      deadline,
      new Date('2026-09-11T09:59:59.999Z'),
    )).toThrowError(new ChallengeConflictError('CHALLENGE_RESPONSE_NOT_DUE'));
  });

  it('starts Booking only for a timely accepted Challenge with both obligations', () => {
    const input = {
      state: 'ACCEPTED_UNSCHEDULED' as const,
      actorUserId: 'athlete-a',
      participantUserIds: ['athlete-a', 'athlete-b'],
      schedulingDeadlineAt: new Date('2026-09-22T11:00:00.000Z'),
      occurredAt: new Date('2026-09-09T11:00:00.000Z'),
      activeObligationCount: 2,
    };
    expect(() => assertAcceptedChallengeCanStartBooking(input)).not.toThrow();
    expect(() => assertAcceptedChallengeCanStartBooking({
      ...input,
      occurredAt: input.schedulingDeadlineAt,
    })).toThrowError(new ChallengeConflictError('CHALLENGE_SCHEDULING_DEADLINE_REACHED'));
    expect(() => assertAcceptedChallengeCanStartBooking({
      ...input,
      activeObligationCount: 1,
    })).toThrowError(new ChallengeConflictError('CHALLENGE_OBLIGATION_MISSING'));
  });

  it('confirms only the Booking currently owned by the accepted Challenge', () => {
    expect(() => assertChallengeBookingCanBeConfirmed({
      state: 'BOOKING_PENDING',
      activeObligationCount: 2,
    })).not.toThrow();
    expect(() => assertChallengeBookingCanBeConfirmed({
      state: 'ACCEPTED_UNSCHEDULED',
      activeObligationCount: 2,
    })).toThrowError(new ChallengeConflictError('CHALLENGE_BOOKING_NOT_PENDING'));
  });

  it('freezes the effective stake from status holders at the Session window', () => {
    const base = {
      plannedStake: 'NONE' as const,
      participantUserIds: ['athlete-a', 'athlete-b'] as const,
      championUserId: null,
      contenderUserId: null,
    };
    expect(effectiveChallengeStakeAtSessionWindow(base)).toBe('NONE');
    expect(effectiveChallengeStakeAtSessionWindow({
      ...base,
      championUserId: 'athlete-a',
      contenderUserId: 'athlete-b',
    })).toBe('TITLE');
    expect(effectiveChallengeStakeAtSessionWindow({
      ...base,
      championUserId: 'someone-else',
      contenderUserId: 'athlete-a',
    })).toBe('CONTENDER');
    expect(effectiveChallengeStakeAtSessionWindow({
      ...base,
      championUserId: 'athlete-a',
      contenderUserId: 'someone-else',
    })).toBe('NONE');
  });

  it('requires a booked obligated Challenge and its immutable snapshot before actual Start', () => {
    const booked = { state: 'BOOKED' as const, activeObligationCount: 2 };
    expect(() => assertChallengeSessionWindowCanOpen(booked)).not.toThrow();
    expect(() => assertChallengeSessionCanStart({
      ...booked,
      competitiveSnapshotPresent: true,
    })).not.toThrow();
    expect(() => assertChallengeSessionCanStart({
      ...booked,
      competitiveSnapshotPresent: false,
    })).toThrowError(new ChallengeConflictError('CHALLENGE_COMPETITIVE_SNAPSHOT_MISSING'));
    expect(() => assertChallengeSessionWindowCanOpen({
      state: 'BOOKING_PENDING',
      activeObligationCount: 2,
    })).toThrowError(new ChallengeConflictError('CHALLENGE_NOT_BOOKED'));
  });

  it('moves to result collection only from an actually started Challenge', () => {
    expect(() => assertChallengeSessionCanEnd({
      state: 'IN_SESSION',
      competitiveSnapshotPresent: true,
    })).not.toThrow();
    expect(() => assertChallengeSessionCanEnd({
      state: 'BOOKED',
      competitiveSnapshotPresent: true,
    })).toThrowError(new ChallengeConflictError('CHALLENGE_NOT_IN_SESSION'));
  });
});
