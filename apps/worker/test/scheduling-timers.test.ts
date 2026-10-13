import { describe, expect, it } from 'vitest';

import { schedulingTimerFromOutbox } from '../src/scheduling-timers.js';

describe('Scheduling timer projection', () => {
  it('accepts a versioned Slot expiry timer only from the Slot publication topic', () => {
    const timer = {
      commandType: 'EXPIRE_SLOT',
      aggregateType: 'Slot',
      aggregateId: '0199a1b2-1234-7000-8000-000000000701',
      expectedState: 'PUBLISHED',
      expectedVersion: 1,
      deadlineAt: '2026-09-10T14:00:00.000Z',
      policyVersion: 'scheduling-mvp-v1',
      idempotencyKey: 'slot:0199a1b2-1234-7000-8000-000000000701:expire:v1',
    };
    expect(
      schedulingTimerFromOutbox('scheduling.slot.published.v1', {
        slotId: timer.aggregateId,
        timer,
      }),
    ).toEqual(timer);
    expect(schedulingTimerFromOutbox('scheduling.slot.expired.v1', {})).toBeNull();
  });

  it('[AC-173] accepts GroupOffering expiry at its start and rejects mismatched payloads', () => {
    const timer = {
      commandType: 'EXPIRE_GROUP_OFFERING',
      aggregateType: 'GroupOffering',
      aggregateId: '0199a1b2-1234-7000-8000-000000000702',
      expectedState: 'PUBLISHED',
      expectedVersion: 1,
      deadlineAt: '2026-09-11T16:00:00.000Z',
      policyVersion: 'scheduling-mvp-v1',
      idempotencyKey:
        'groupoffering:0199a1b2-1234-7000-8000-000000000702:expire:v1',
    };
    expect(
      schedulingTimerFromOutbox('scheduling.group-offering.published.v1', { timer }),
    ).toEqual(timer);
    expect(() =>
      schedulingTimerFromOutbox('scheduling.group-offering.published.v1', {
        timer: { ...timer, aggregateType: 'Slot' },
      }),
    ).toThrow('does not match');
  });

  it('routes Booking selection and host deadlines without reserving the Slot', () => {
    const selection = {
      commandType: 'EXPIRE_BOOKING_SELECTION',
      aggregateType: 'Booking',
      aggregateId: '0199a1b2-1234-7000-8000-000000000703',
      expectedState: 'SELECTING',
      expectedVersion: 1,
      deadlineAt: '2026-09-07T11:00:00.000Z',
      policyVersion: 'scheduling-mvp-v1',
      idempotencyKey: 'booking:test:selection:v1',
    };
    expect(
      schedulingTimerFromOutbox('scheduling.booking.selection-started.v1', {
        timer: selection,
      }),
    ).toEqual(selection);
    const host = {
      ...selection,
      commandType: 'EXPIRE_HOST_CONFIRMATION',
      expectedState: 'HOST_CONFIRMATION_PENDING',
      expectedVersion: 2,
    };
    expect(
      schedulingTimerFromOutbox('scheduling.booking.mutually-selected.v1', { timer: host }),
    ).toEqual(host);
  });

  it('routes both GroupPlan lifecycle timer publications', () => {
    const timer = {
      commandType: 'EXPIRE_GROUP_PLAN',
      aggregateType: 'GroupPlan',
      aggregateId: '0199a1b2-1234-7000-8000-000000000704',
      expectedState: 'PROPOSED',
      expectedVersion: 1,
      deadlineAt: '2026-09-11T16:00:00.000Z',
      policyVersion: 'scheduling-mvp-v1',
      idempotencyKey: 'groupplan:test:expire:v1',
    };
    expect(schedulingTimerFromOutbox('scheduling.group-plan.proposed.v1', { timer })).toEqual(
      timer,
    );
    expect(
      schedulingTimerFromOutbox('scheduling.group-plan.mutually-confirmed.v1', {
        timer: { ...timer, expectedState: 'NOTIFIED', expectedVersion: 2 },
      }),
    ).toMatchObject({ expectedState: 'NOTIFIED', expectedVersion: 2 });
  });

  it('opens a confirmed Session only from its scheduled timer', () => {
    const timer = {
      commandType: 'OPEN_SESSION_WINDOW',
      aggregateType: 'Session',
      aggregateId: '0199a1b2-1234-7000-8000-000000000705',
      expectedState: 'SCHEDULED',
      expectedVersion: 1,
      deadlineAt: '2026-09-10T14:00:00.000Z',
      policyVersion: 'scheduling-mvp-v1',
      idempotencyKey: 'session:test:open-session-window:v1',
    };
    expect(
      schedulingTimerFromOutbox('scheduling.session.scheduled.v1', { timer }),
    ).toEqual(timer);
    expect(
      schedulingTimerFromOutbox('scheduling.session.coach-replaced.v1', {
        timer: {
          ...timer,
          expectedVersion: 2,
          idempotencyKey: 'session:test:open-session-window:v2',
        },
      }),
    ).toMatchObject({ expectedState: 'SCHEDULED', expectedVersion: 2 });
  });

  it('AC-157 routes the capped Training-to-Official confirmation timer', () => {
    const timer = {
      commandType: 'EXPIRE_BOOKING_OFFICIAL_CONVERSION',
      aggregateType: 'BookingOfficialConversion',
      aggregateId: '0199a1b2-1234-7000-8000-000000000706',
      expectedState: 'PENDING_CONFIRMATION',
      expectedVersion: 2,
      deadlineAt: '2026-09-10T14:00:00.000Z',
      policyVersion: 'scheduling-mvp-v1',
      idempotencyKey: 'booking-conversion:test:expire:v2',
    };
    expect(schedulingTimerFromOutbox(
      'scheduling.booking.official-conversion-timer.v1',
      { timer },
    )).toEqual(timer);
  });

  it('[AC-025][AC-026] routes the GroupPlan Official confirmation timer', () => {
    const timer = {
      commandType: 'EXPIRE_GROUP_PLAN_OFFICIAL_CONVERSION',
      aggregateType: 'GroupPlanOfficialConversion',
      aggregateId: '0199a1b2-1234-7000-8000-000000000709',
      expectedState: 'PENDING_CONFIRMATION',
      expectedVersion: 1,
      deadlineAt: '2026-09-10T14:00:00.000Z',
      policyVersion: 'scheduling-mvp-v1',
      idempotencyKey: 'group-plan-conversion:test:expire:v1',
    };
    expect(schedulingTimerFromOutbox(
      'scheduling.group-plan.official-conversion-timer.v1',
      { timer },
    )).toEqual(timer);
  });

  it('AC-037 routes the one-hour solo-continuation decision timer', () => {
    const timer = {
      commandType: 'EXPIRE_BOOKING_SOLO_CONTINUATION',
      aggregateType: 'BookingSoloContinuation',
      aggregateId: '0199a1b2-1234-7000-8000-000000000707',
      expectedState: 'PENDING',
      expectedVersion: 1,
      deadlineAt: '2026-09-10T15:00:00.000Z',
      policyVersion: 'scheduling-mvp-v1',
      idempotencyKey: 'booking-solo:test:expire:v1',
    };
    expect(schedulingTimerFromOutbox(
      'scheduling.booking.solo-continuation-timer.v1',
      { timer },
    )).toEqual(timer);
  });

  it('AC-170 routes the booked Official-to-Training retention timer', () => {
    const timer = {
      commandType: 'EXPIRE_BOOKING_TRAINING_RETENTION',
      aggregateType: 'BookingTrainingRetention',
      aggregateId: '0199a1b2-1234-7000-8000-000000000708',
      expectedState: 'PENDING',
      expectedVersion: 1,
      deadlineAt: '2026-09-10T15:00:00.000Z',
      policyVersion: 'scheduling-mvp-v1',
      idempotencyKey: 'booking-training-retention:test:expire:v1',
    };
    expect(schedulingTimerFromOutbox(
      'scheduling.booking.training-retention-timer.v1',
      { timer },
    )).toEqual(timer);
  });
});
